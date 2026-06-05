from fastapi import APIRouter, Depends, Response, status
from sqlmodel import Session

from app.db import get_session
from app.models.user import User
from app.schemas.notification import NotificationListRead, NotificationRead
from app.services.auth_service import get_current_user
from app.services.notification_service import (
    list_my_notifications,
    mark_all_as_read,
    mark_as_read,
    unread_count,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/my", response_model=NotificationListRead)
def get_my_notifications(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> NotificationListRead:
    items = list_my_notifications(current_user.id, session)  # type: ignore[arg-type]
    unread = unread_count(current_user.id, session)  # type: ignore[arg-type]
    return NotificationListRead(
        unread_count=unread,
        notifications=[NotificationRead.model_validate(item) for item in items],
    )


@router.put("/{notification_id}/read", response_model=NotificationRead)
def set_notification_as_read(
    notification_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> NotificationRead:
    notification = mark_as_read(notification_id, current_user.id, session)  # type: ignore[arg-type]
    if notification is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return NotificationRead.model_validate(notification)


@router.put("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def read_all_notifications(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Response:
    mark_all_as_read(current_user.id, session)  # type: ignore[arg-type]
    return Response(status_code=status.HTTP_204_NO_CONTENT)
