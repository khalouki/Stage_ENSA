from datetime import datetime, timezone
from enum import Enum

from sqlmodel import Field, Relationship, SQLModel


class MachineStatus(str, Enum):
    AVAILABLE = "available"
    BUSY = "busy"
    OFFLINE = "offline"
    MAINTENANCE = "maintenance"


class MachineType(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)
    name: str
    model_path: str
    default_scale: float = Field(default=1.0)
    specs_schema: str | None = None
    sensors_schema: str | None = None

    machines: list["Machine"] = Relationship(back_populates="machine_type")


class Machine(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    machine_type_id: int | None = Field(default=None, foreign_key="machinetype.id", index=True)
    status: MachineStatus = Field(default=MachineStatus.AVAILABLE)
    notes: str | None = None
    position_x: float | None = Field(default=0.0)
    position_y: float | None = Field(default=0.0)
    position_z: float | None = Field(default=0.0)
    rotation_x: float | None = Field(default=0.0)
    rotation_y: float | None = Field(default=0.0)
    rotation_z: float | None = Field(default=0.0)
    scale_x: float | None = Field(default=1.0)
    scale_y: float | None = Field(default=1.0)
    scale_z: float | None = Field(default=1.0)
    created_at: datetime | None = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime | None = Field(default_factory=lambda: datetime.now(timezone.utc))

    machine_type: MachineType | None = Relationship(back_populates="machines")
    reservations: list["Reservation"] = Relationship(back_populates="machine")
    sensor_readings: list["MachineSensorReading"] = Relationship(back_populates="machine")
