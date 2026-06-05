from sqlmodel import Session, func, select

from app.models.notification import Notification, NotificationType
from app.models.reservation import Reservation, ReservationStatus


def create_reservation_status_notification(
    reservation: Reservation,
    machine_name: str,
    session: Session,
) -> Notification:
    status_label = reservation.status.value.capitalize()
    title = f"Reservation {status_label}"
    message = (
        f"{machine_name} - {reservation.date} "
        f"{reservation.start_time.strftime('%H:%M')} to {reservation.end_time.strftime('%H:%M')}: "
        f"{reservation.status.value}"
    )
    notification = Notification(
        user_id=reservation.user_id,
        reservation_id=reservation.id,
        machine_id=reservation.machine_id,
        title=title,
        message=message,
        type=NotificationType.RESERVATION_STATUS,
        is_read=False,
    )
    session.add(notification)
    session.commit()
    session.refresh(notification)
    return notification


def list_my_notifications(user_id: int, session: Session, limit: int = 30) -> list[Notification]:
    query = (
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    return list(session.exec(query).all())


def unread_count(user_id: int, session: Session) -> int:
    query = select(func.count(Notification.id)).where(
        Notification.user_id == user_id,
        Notification.is_read.is_(False),
    )
    return int(session.exec(query).one())


def mark_as_read(notification_id: int, user_id: int, session: Session) -> Notification | None:
    notification = session.get(Notification, notification_id)
    if notification is None or notification.user_id != user_id:
        return None
    notification.is_read = True
    session.add(notification)
    session.commit()
    session.refresh(notification)
    return notification


def mark_all_as_read(user_id: int, session: Session) -> int:
    notifications = list(
        session.exec(
            select(Notification).where(Notification.user_id == user_id, Notification.is_read.is_(False))
        ).all()
    )
    for item in notifications:
        item.is_read = True
        session.add(item)
    session.commit()
    return len(notifications)


def has_conflict(
    machine_id: int,
    date_value,
    start_time,
    end_time,
    session: Session,
) -> bool:
    active_statuses = [ReservationStatus.PENDING, ReservationStatus.APPROVED]
    rows = session.exec(
        select(Reservation).where(
            Reservation.machine_id == machine_id,
            Reservation.date == date_value,
            Reservation.status.in_(active_statuses),
        )
    ).all()
    for row in rows:
        if row.start_time < end_time and row.end_time > start_time:
            return True
    return False
