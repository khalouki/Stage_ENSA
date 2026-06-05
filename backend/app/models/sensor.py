from datetime import datetime, timezone

from sqlmodel import Field, Relationship, SQLModel


class MachineSensorReading(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    machine_id: int = Field(foreign_key="machine.id", index=True)
    temperature: float
    vibration: float
    usage_duration: int
    motor_speed: float
    error: str | None = None
    sensor_timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    machine: "Machine" = Relationship(back_populates="sensor_readings")
