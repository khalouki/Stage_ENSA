from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.reservation import ReservationStatus


class ReservationCreate(BaseModel):
    machine_id: int
    date: date
    start_time: time
    end_time: time
    note: str | None = None

    @field_validator("end_time")
    @classmethod
    def validate_time_range(cls, value: time, info):  # type: ignore[no-untyped-def]
        start_time = info.data.get("start_time")
        if start_time and start_time >= value:
            raise ValueError("start_time must be before end_time")
        return value


class ReservationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    machine_id: int
    date: date
    start_time: time
    end_time: time
    status: ReservationStatus
    note: str | None = None
    created_at: datetime


class ReservationWithDetails(ReservationRead):
    user_name: str
    user_email: str
    machine_name: str


class ReservationPendingCountRead(BaseModel):
    pending_count: int


class ReservationDecision(BaseModel):
    note: str | None = None


class ReservationAvailabilityRead(BaseModel):
    date: date
    slot_start: time
    slot_end: time
    available: bool
