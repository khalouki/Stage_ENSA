import random
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.models.machine import Machine, MachineType
from app.schemas.machine import MachineCreate, MachineRead, MachineTypeRead, MachineUpdate


def list_machine_types(session: Session) -> list[MachineType]:
    return list(session.exec(select(MachineType).order_by(MachineType.id)).all())


def get_machine_type(machine_type_id: int, session: Session) -> MachineType:
    machine_type = session.get(MachineType, machine_type_id)
    if machine_type is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Machine type not found")
    return machine_type


def list_machines(session: Session) -> list[Machine]:
    return list(session.exec(select(Machine).order_by(Machine.id)).all())


def get_machine(machine_id: int, session: Session) -> Machine:
    machine = session.get(Machine, machine_id)
    if machine is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Machine not found")
    return machine


def _resolve_scale(payload: MachineCreate, machine_type: MachineType) -> tuple[float, float, float]:
    default_scale = machine_type.default_scale
    return (
        payload.scale_x if payload.scale_x is not None else default_scale,
        payload.scale_y if payload.scale_y is not None else default_scale,
        payload.scale_z if payload.scale_z is not None else default_scale,
    )


def _generate_random_position(session: Session) -> tuple[float, float, float]:
    bounds = {
        "x_min": -9.0,
        "x_max": 9.0,
        "z_min": -7.0,
        "z_max": 7.0,
    }
    min_distance = 2.2
    existing = list(session.exec(select(Machine)).all())
    for _ in range(80):
        x = round(random.uniform(bounds["x_min"], bounds["x_max"]), 2)
        z = round(random.uniform(bounds["z_min"], bounds["z_max"]), 2)
        y = 0.0
        too_close = False
        for machine in existing:
            ex = machine.position_x or 0.0
            ez = machine.position_z or 0.0
            if ((x - ex) ** 2 + (z - ez) ** 2) ** 0.5 < min_distance:
                too_close = True
                break
        if not too_close:
            return (x, y, z)
    return (
        round(random.uniform(bounds["x_min"], bounds["x_max"]), 2),
        0.0,
        round(random.uniform(bounds["z_min"], bounds["z_max"]), 2),
    )


def create_machine(payload: MachineCreate, session: Session) -> Machine:
    machine_type = get_machine_type(payload.machine_type_id, session)
    scale_x, scale_y, scale_z = _resolve_scale(payload, machine_type)
    if payload.position_x is None or payload.position_y is None or payload.position_z is None:
        pos_x, pos_y, pos_z = _generate_random_position(session)
    else:
        pos_x, pos_y, pos_z = payload.position_x, payload.position_y, payload.position_z
    machine = Machine(
        name=payload.name,
        machine_type_id=payload.machine_type_id,
        status=payload.status,
        notes=payload.notes,
        position_x=pos_x,
        position_y=pos_y,
        position_z=pos_z,
        rotation_x=payload.rotation_x,
        rotation_y=payload.rotation_y,
        rotation_z=payload.rotation_z,
        scale_x=scale_x,
        scale_y=scale_y,
        scale_z=scale_z,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    session.add(machine)
    session.commit()
    session.refresh(machine)
    return machine


def update_machine(machine_id: int, payload: MachineUpdate, session: Session) -> Machine:
    machine = get_machine(machine_id, session)
    changes = payload.model_dump(exclude_unset=True)
    if "machine_type_id" in changes:
        get_machine_type(changes["machine_type_id"], session)
    for key, value in changes.items():
        setattr(machine, key, value)
    machine.updated_at = datetime.now(timezone.utc)
    session.add(machine)
    session.commit()
    session.refresh(machine)
    return machine


def delete_machine(machine_id: int, session: Session) -> None:
    machine = get_machine(machine_id, session)
    session.delete(machine)
    session.commit()


def to_machine_read(machine: Machine) -> MachineRead:
    machine_type = machine.machine_type
    if machine_type is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Machine type relation is missing")
    now = datetime.now(timezone.utc)
    pos_x = machine.position_x if machine.position_x is not None else 0.0
    pos_y = machine.position_y if machine.position_y is not None else 0.0
    pos_z = machine.position_z if machine.position_z is not None else 0.0
    rot_x = machine.rotation_x if machine.rotation_x is not None else 0.0
    rot_y = machine.rotation_y if machine.rotation_y is not None else 0.0
    rot_z = machine.rotation_z if machine.rotation_z is not None else 0.0
    scl_x = machine.scale_x if machine.scale_x is not None else machine_type.default_scale
    scl_y = machine.scale_y if machine.scale_y is not None else machine_type.default_scale
    scl_z = machine.scale_z if machine.scale_z is not None else machine_type.default_scale
    return MachineRead(
        id=machine.id,  # type: ignore[arg-type]
        name=machine.name,
        machine_type_id=machine.machine_type_id,  # type: ignore[arg-type]
        machine_type_code=machine_type.code,
        machine_type_name=machine_type.name,
        model_path=machine_type.model_path,
        status=machine.status,
        notes=machine.notes,
        position_x=pos_x,
        position_y=pos_y,
        position_z=pos_z,
        rotation_x=rot_x,
        rotation_y=rot_y,
        rotation_z=rot_z,
        scale_x=scl_x,
        scale_y=scl_y,
        scale_z=scl_z,
        created_at=machine.created_at or now,
        updated_at=machine.updated_at or now,
    )


def to_machine_type_read(machine_type: MachineType) -> MachineTypeRead:
    return MachineTypeRead.model_validate(machine_type)
