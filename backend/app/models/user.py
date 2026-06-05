from datetime import datetime, timezone
from enum import Enum

from sqlmodel import Field, Relationship, SQLModel


class UserRole(str, Enum):
    STUDENT = "student"
    ADMIN = "admin"


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    full_name: str
    email: str = Field(index=True, unique=True)
    hashed_password: str
    role: UserRole = Field(default=UserRole.STUDENT)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    reservations: list["Reservation"] = Relationship(back_populates="user")
