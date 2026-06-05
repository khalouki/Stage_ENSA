from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


SimulationStatus = Literal["running", "paused", "stopped"]


class SimulationStateRead(BaseModel):
    machine_id: int
    status: SimulationStatus
    progress_pct: float = Field(ge=0, le=100)
    current_step: int = Field(ge=0)
    current_layer: int = Field(ge=0)
    gcode_file_name: str | None = None
    estimated_time_min: int = Field(ge=0)
    updated_at: datetime


class SimulationStateUpdate(BaseModel):
    status: SimulationStatus | None = None
    progress_pct: float | None = Field(default=None, ge=0, le=100)
    current_step: int | None = Field(default=None, ge=0)
    current_layer: int | None = Field(default=None, ge=0)
    gcode_file_name: str | None = None
    estimated_time_min: int | None = Field(default=None, ge=0)
