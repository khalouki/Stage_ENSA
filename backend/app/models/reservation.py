from datetime import date, datetime, time, timezone
from enum import Enum

from sqlmodel import Field, Relationship, SQLModel


class ReservationStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class Reservation(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    machine_id: int = Field(foreign_key="machine.id", index=True)
    date: date
    start_time: time
    end_time: time
    status: ReservationStatus = Field(default=ReservationStatus.PENDING)
    note: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    user: "User" = Relationship(back_populates="reservations")
    machine: "Machine" = Relationship(back_populates="reservations")
