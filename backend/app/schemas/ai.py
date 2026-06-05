from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class TelemetrySnapshotRead(BaseModel):
    temperature: float
    vibration: float
    motor_speed: float
    usage_duration: int
    error: str | None = None
    updated_at: datetime


class AIMetricFactorRead(BaseModel):
    key: str
    label: str
    score: int = Field(ge=0, le=100)
    weight: int = Field(ge=0, le=100)
    current_value: float | None = None
    unit: str | None = None
    detail: str
    trend: str | None = None


class AIAnomalyDetailRead(BaseModel):
    code: str
    metric: str
    severity: Literal["low", "medium", "high"]
    reason: str
    current_value: float | None = None
    threshold: float | None = None
    unit: str | None = None


class MachineMonitoringAIRead(BaseModel):
    machine_id: int
    machine_name: str
    machine_type: str | None = None
    status: str
    has_telemetry: bool
    anomaly_status: Literal["normal", "warning", "critical", "no_data"]
    health_score: int | None = Field(default=None, ge=0, le=100)
    maintenance_risk_score: int | None = Field(default=None, ge=0, le=100)
    maintenance_risk_level: Literal["low", "medium", "high", "unknown"] = "unknown"
    failure_probability: float | None = Field(default=None, ge=0, le=1)
    recommendation: str
    anomaly_count: int = 0
    anomaly_details: list[AIAnomalyDetailRead] = Field(default_factory=list)
    factors: list[AIMetricFactorRead] = Field(default_factory=list)
    telemetry: TelemetrySnapshotRead | None = None
    recent_error_count: int = 0
    telemetry_points: int = 0
    assessed_at: datetime
    last_telemetry_at: datetime | None = None
    model_used: str | None = None
    maintenance_status: str | None = None
    anomaly_score: float | None = None


class FleetMonitoringAIRead(BaseModel):
    generated_at: datetime
    total_machines: int
    with_telemetry: int
    normal_count: int
    warning_count: int
    critical_count: int
    average_health_score: float | None = None
    machines: list[MachineMonitoringAIRead]
