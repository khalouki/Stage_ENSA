import json
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.models.machine import Machine
from app.models.sensor import MachineSensorReading
from app.schemas.telemetry import MachineStateRead, MachineTelemetryRead, SensorPayloadCreate


def telemetry_rows(session: Session, machine_id: int | None = None, limit: int = 50) -> list[MachineTelemetryRead]:
    query = select(MachineSensorReading, Machine).join(Machine, MachineSensorReading.machine_id == Machine.id)
    if machine_id is not None:
        query = query.where(MachineSensorReading.machine_id == machine_id)
    rows = session.exec(query.order_by(MachineSensorReading.sensor_timestamp.desc()).limit(limit)).all()
    return [
        MachineTelemetryRead(
            id=reading.id,  # type: ignore[arg-type]
            machine_id=reading.machine_id,
            machine_name=machine.name,
            timestamp=reading.sensor_timestamp,
            temperature=reading.temperature,
            motor_speed=reading.motor_speed,
            vibration=reading.vibration,
            usage_duration=reading.usage_duration,
            error=reading.error,
        )
        for reading, machine in rows
    ]


def latest_state(machine_id: int, session: Session) -> MachineStateRead:
    machine = session.get(Machine, machine_id)
    if machine is None:
        return MachineStateRead(
            machine_id=machine_id,
            machine_name=f"Machine {machine_id}",
            status="offline",
            temperature=0.0,
            motor_speed=0.0,
            vibration=0.0,
            usage_duration=0,
            error=None,
            updated_at=datetime.now(timezone.utc),
        )

    latest = session.exec(
        select(MachineSensorReading)
        .where(MachineSensorReading.machine_id == machine_id)
        .order_by(MachineSensorReading.sensor_timestamp.desc())
        .limit(1)
    ).first()

    if latest is None:
        return MachineStateRead(
            machine_id=machine_id,
            machine_name=machine.name,
            status=machine.status.value,
            temperature=0.0,
            motor_speed=0.0,
            vibration=0.0,
            usage_duration=0,
            error=None,
            updated_at=datetime.now(timezone.utc),
        )

    return MachineStateRead(
        machine_id=machine_id,
        machine_name=machine.name,
        status=machine.status.value,
        temperature=latest.temperature,
        motor_speed=latest.motor_speed,
        vibration=latest.vibration,
        usage_duration=latest.usage_duration,
        error=latest.error,
        updated_at=latest.sensor_timestamp,
    )


def all_machine_states(session: Session) -> list[MachineStateRead]:
    machines = list(session.exec(select(Machine).order_by(Machine.id)).all())
    return [latest_state(machine.id, session) for machine in machines if machine.id is not None]


def telemetry_history(session: Session, machine_id: int, limit: int = 48) -> list[MachineSensorReading]:
    return list(
        session.exec(
            select(MachineSensorReading)
            .where(MachineSensorReading.machine_id == machine_id)
            .order_by(MachineSensorReading.sensor_timestamp.desc())
            .limit(limit)
        ).all()
    )


def ingest_sensor_payload(payload: SensorPayloadCreate, session: Session) -> MachineSensorReading | None:
    machine = session.exec(select(Machine).where(Machine.name == payload.machine_id)).first()
    if machine is None:
        return None
    reading = MachineSensorReading(
        machine_id=machine.id,  # type: ignore[arg-type]
        temperature=payload.temperature,
        vibration=payload.vibration,
        usage_duration=payload.usage_duration,
        motor_speed=payload.motor_speed,
        error=payload.error,
        sensor_timestamp=payload.timestamp,
    )
    session.add(reading)
    session.commit()
    session.refresh(reading)
    return reading


def parse_sensor_payload(raw_payload: str) -> SensorPayloadCreate | None:
    try:
        parsed = json.loads(raw_payload)
        return SensorPayloadCreate.model_validate(parsed)
    except Exception:
        return None
