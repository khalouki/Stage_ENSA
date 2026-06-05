from datetime import datetime, timezone
from enum import Enum

from sqlmodel import Field, SQLModel


class NotificationType(str, Enum):
    RESERVATION_STATUS = "reservation_status"


class Notification(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    reservation_id: int | None = Field(default=None, foreign_key="reservation.id", index=True)
    machine_id: int | None = Field(default=None, foreign_key="machine.id", index=True)
    title: str
    message: str
    type: NotificationType = Field(default=NotificationType.RESERVATION_STATUS)
    is_read: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)
