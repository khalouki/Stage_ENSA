from fastapi import APIRouter, Depends, Query, Response, status
from sqlmodel import Session, func, select

from app.db import get_session
from app.models.machine import Machine
from app.models.reservation import ReservationStatus
from app.models.user import User
from app.schemas.reservation import (
    ReservationDecision,
    ReservationPendingCountRead,
    ReservationRead,
    ReservationWithDetails,
)
from app.schemas.user import UserListRead, UserRead, UserUpdate
from app.services.auth_service import require_admin
from app.services.notification_service import create_reservation_status_notification
from app.services.reservation_service import (
    count_pending_reservations,
    delete_reservation,
    list_all_reservations,
    set_reservation_status,
)

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/reservations", response_model=list[ReservationWithDetails])
def get_all_reservations(session: Session = Depends(get_session)) -> list[ReservationWithDetails]:
    rows = list_all_reservations(session)
    response: list[ReservationWithDetails] = []
    for reservation, user, machine in rows:
        response.append(
            ReservationWithDetails(
                **ReservationRead.model_validate(reservation).model_dump(),
                user_name=user.full_name,
                user_email=user.email,
                machine_name=machine.name,
            )
        )
    return response


@router.get("/reservation-stats/pending-count", response_model=ReservationPendingCountRead)
def get_pending_reservation_count(session: Session = Depends(get_session)) -> ReservationPendingCountRead:
    return ReservationPendingCountRead(pending_count=count_pending_reservations(session))


@router.get("/reservations/pending-count", response_model=ReservationPendingCountRead)
def get_pending_reservation_count_legacy(session: Session = Depends(get_session)) -> ReservationPendingCountRead:
    return ReservationPendingCountRead(pending_count=count_pending_reservations(session))


@router.put("/reservations/{reservation_id}/approve", response_model=ReservationRead)
def approve_reservation(
    reservation_id: int,
    payload: ReservationDecision,
    session: Session = Depends(get_session),
) -> ReservationRead:
    reservation = set_reservation_status(
        reservation_id=reservation_id,
        new_status=ReservationStatus.APPROVED,
        note=payload.note,
        session=session,
    )
    machine = session.get(Machine, reservation.machine_id)
    if machine is not None:
        create_reservation_status_notification(reservation, machine.name, session)
    return ReservationRead.model_validate(reservation)


@router.put("/reservations/{reservation_id}/reject", response_model=ReservationRead)
def reject_reservation(
    reservation_id: int,
    payload: ReservationDecision,
    session: Session = Depends(get_session),
) -> ReservationRead:
    reservation = set_reservation_status(
        reservation_id=reservation_id,
        new_status=ReservationStatus.REJECTED,
        note=payload.note,
        session=session,
    )
    machine = session.get(Machine, reservation.machine_id)
    if machine is not None:
        create_reservation_status_notification(reservation, machine.name, session)
    return ReservationRead.model_validate(reservation)


@router.delete("/reservations/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reservation_endpoint(reservation_id: int, session: Session = Depends(get_session)) -> Response:
    delete_reservation(reservation_id, session)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users", response_model=UserListRead)
def list_users(
    search: str | None = Query(default=None),
    role: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    session: Session = Depends(get_session),
) -> UserListRead:
    query = select(User)
    count_query = select(func.count(User.id))
    if search:
        token = f"%{search.strip()}%"
        query = query.where((User.full_name.like(token)) | (User.email.like(token)))
        count_query = count_query.where((User.full_name.like(token)) | (User.email.like(token)))
    if role:
        query = query.where(User.role == role)
        count_query = count_query.where(User.role == role)
    if is_active is not None:
        query = query.where(User.is_active == is_active)
        count_query = count_query.where(User.is_active == is_active)

    total = int(session.exec(count_query).one())
    rows = session.exec(
        query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return UserListRead(total=total, page=page, page_size=page_size, items=[UserRead.model_validate(user) for user in rows])


@router.put("/users/{user_id}", response_model=UserRead)
def update_user(user_id: int, payload: UserUpdate, session: Session = Depends(get_session)) -> UserRead:
    user = session.get(User, user_id)
    if user is None:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(user, key, value)
    session.add(user)
    session.commit()
    session.refresh(user)
    return UserRead.model_validate(user)
