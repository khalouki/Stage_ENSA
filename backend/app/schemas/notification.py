from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reservation_id: int | None = None
    machine_id: int | None = None
    title: str
    message: str
    type: str
    is_read: bool
    created_at: datetime


class NotificationListRead(BaseModel):
    unread_count: int
    notifications: list[NotificationRead]
