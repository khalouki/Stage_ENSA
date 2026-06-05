from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.machine import MachineStatus


class MachineTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    model_path: str
    default_scale: float
    specs_schema: str | None = None
    sensors_schema: str | None = None


class MachineInstanceBase(BaseModel):
    name: str
    machine_type_id: int
    status: MachineStatus = MachineStatus.AVAILABLE
    notes: str | None = None
    position_x: float | None = None
    position_y: float | None = None
    position_z: float | None = None
    rotation_x: float = 0.0
    rotation_y: float = 0.0
    rotation_z: float = 0.0
    scale_x: float | None = None
    scale_y: float | None = None
    scale_z: float | None = None


class MachineCreate(MachineInstanceBase):
    pass


class MachineUpdate(BaseModel):
    name: str | None = None
    machine_type_id: int | None = None
    status: MachineStatus | None = None
    notes: str | None = None
    position_x: float | None = None
    position_y: float | None = None
    position_z: float | None = None
    rotation_x: float | None = None
    rotation_y: float | None = None
    rotation_z: float | None = None
    scale_x: float | None = None
    scale_y: float | None = None
    scale_z: float | None = None


class MachineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    machine_type_id: int
    machine_type_code: str
    machine_type_name: str
    model_path: str
    status: MachineStatus
    notes: str | None = None
    position_x: float
    position_y: float
    position_z: float
    rotation_x: float
    rotation_y: float
    rotation_z: float
    scale_x: float
    scale_y: float
    scale_z: float
    created_at: datetime
    updated_at: datetime
