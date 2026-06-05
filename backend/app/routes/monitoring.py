from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.db import get_session
from app.schemas.telemetry import MQTTStatusRead, MachineStateRead, MachineTelemetryRead
from app.services.mqtt_runtime import mqtt_subscriber
from app.services.telemetry_service import all_machine_states, latest_state, telemetry_rows

router = APIRouter(prefix="/monitoring", tags=["monitoring"])


@router.get("/telemetry", response_model=list[MachineTelemetryRead])
def get_telemetry(
    machine_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    session: Session = Depends(get_session),
) -> list[MachineTelemetryRead]:
    return telemetry_rows(session=session, machine_id=machine_id, limit=limit)


@router.get("/machines/{machine_id}/state", response_model=MachineStateRead)
def get_machine_state(machine_id: int, session: Session = Depends(get_session)) -> MachineStateRead:
    return latest_state(machine_id, session)


@router.get("/machines/states", response_model=list[MachineStateRead])
def get_all_machine_states(session: Session = Depends(get_session)) -> list[MachineStateRead]:
    return all_machine_states(session)


@router.get("/mqtt/status", response_model=MQTTStatusRead)
def get_mqtt_status() -> MQTTStatusRead:
    return MQTTStatusRead.model_validate(mqtt_subscriber.status())
