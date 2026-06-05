from datetime import date, datetime, time, timedelta

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.models.machine import Machine
from app.models.notification import Notification
from app.models.reservation import Reservation, ReservationStatus
from app.models.user import User
from app.schemas.reservation import ReservationAvailabilityRead, ReservationCreate
from app.services.notification_service import has_conflict

SLOT_DURATION_MIN = 60
WORKDAY_START = time(hour=8, minute=0)
WORKDAY_END = time(hour=20, minute=0)


def _time_add(base: time, minutes: int) -> time:
    dt = datetime.combine(date.today(), base) + timedelta(minutes=minutes)
    return dt.time()


def build_daily_slots(machine_id: int, on_date: date, session: Session) -> list[ReservationAvailabilityRead]:
    slots: list[ReservationAvailabilityRead] = []
    slot_start = WORKDAY_START
    while slot_start < WORKDAY_END:
        slot_end = _time_add(slot_start, SLOT_DURATION_MIN)
        if slot_end > WORKDAY_END:
            break
        available = not has_conflict(machine_id, on_date, slot_start, slot_end, session)
        slots.append(
            ReservationAvailabilityRead(
                date=on_date,
                slot_start=slot_start,
                slot_end=slot_end,
                available=available,
            )
        )
        slot_start = slot_end
    return slots


def create_reservation(payload: ReservationCreate, user: User, session: Session) -> Reservation:
    machine = session.get(Machine, payload.machine_id)
    if machine is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Machine not found")

    if payload.start_time >= payload.end_time:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="start_time must be before end_time",
        )

    if has_conflict(
        machine_id=payload.machine_id,
        date_value=payload.date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        session=session,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This time slot is not available for the selected machine",
        )

    reservation = Reservation(
        user_id=user.id,  # type: ignore[arg-type]
        machine_id=payload.machine_id,
        date=payload.date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        note=payload.note,
        status=ReservationStatus.PENDING,
    )
    session.add(reservation)
    session.commit()
    session.refresh(reservation)
    return reservation


def list_my_reservations(user: User, session: Session) -> list[Reservation]:
    return list(
        session.exec(
            select(Reservation)
            .where(Reservation.user_id == user.id)
            .order_by(Reservation.created_at.desc())
        ).all()
    )


def cancel_pending_reservation(reservation_id: int, user: User, session: Session) -> Reservation:
    reservation = session.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")
    if reservation.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    if reservation.status != ReservationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending reservations can be cancelled",
        )

    reservation.status = ReservationStatus.CANCELLED
    session.add(reservation)
    session.commit()
    session.refresh(reservation)
    return reservation


def list_all_reservations(session: Session) -> list[tuple[Reservation, User, Machine]]:
    rows = session.exec(
        select(Reservation, User, Machine)
        .join(User, Reservation.user_id == User.id)
        .join(Machine, Reservation.machine_id == Machine.id)
        .order_by(Reservation.created_at.desc())
    ).all()
    return list(rows)


def set_reservation_status(
    reservation_id: int,
    new_status: ReservationStatus,
    note: str | None,
    session: Session,
) -> Reservation:
    reservation = session.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")
    if reservation.status != ReservationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending reservations can be updated",
        )

    reservation.status = new_status
    if note is not None:
        reservation.note = note

    session.add(reservation)
    session.commit()
    session.refresh(reservation)
    return reservation


def delete_reservation(reservation_id: int, session: Session) -> None:
    reservation = session.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")

    notifications = session.exec(
        select(Notification).where(Notification.reservation_id == reservation_id)
    ).all()
    for notification in notifications:
        notification.reservation_id = None
        session.add(notification)

    session.delete(reservation)
    session.commit()
