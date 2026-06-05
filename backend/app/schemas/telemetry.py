from datetime import datetime

from pydantic import BaseModel


class MachineTelemetryRead(BaseModel):
    id: int
    machine_id: int
    machine_name: str
    timestamp: datetime
    temperature: float
    motor_speed: float
    vibration: float
    usage_duration: int
    error: str | None = None


class MachineStateRead(BaseModel):
    machine_id: int
    machine_name: str
    status: str
    temperature: float
    motor_speed: float
    vibration: float
    usage_duration: int
    error: str | None = None
    updated_at: datetime


class SensorPayloadCreate(BaseModel):
    machine_id: str
    temperature: float
    vibration: float
    usage_duration: int
    motor_speed: float
    error: str | None = None
    timestamp: datetime


class MQTTStatusRead(BaseModel):
    enabled: bool
    started: bool
    connected: bool
    broker_host: str
    broker_port: int
    topic_pattern: str
    last_error: str | None = None
    last_message_at: datetime | None = None
    message_count: int
