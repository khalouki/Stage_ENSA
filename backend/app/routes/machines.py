from fastapi import APIRouter, Depends, Response, status
from sqlmodel import Session

from app.db import get_session
from app.schemas.machine import MachineCreate, MachineRead, MachineTypeRead, MachineUpdate
from app.schemas.telemetry import MachineStateRead
from app.services.auth_service import require_admin
from app.services.machine_service import (
    create_machine,
    delete_machine,
    get_machine,
    list_machine_types,
    list_machines,
    to_machine_read,
    to_machine_type_read,
    update_machine,
)
from app.services.telemetry_service import latest_state

router = APIRouter(prefix="/machines", tags=["machines"])
types_router = APIRouter(prefix="/machine-types", tags=["machine-types"])
lab_machines_router = APIRouter(prefix="/lab/machines", tags=["lab-machines"])


@lab_machines_router.get("", response_model=list[MachineRead])
def get_lab_machines(session: Session = Depends(get_session)) -> list[MachineRead]:
    return [to_machine_read(machine) for machine in list_machines(session)]


@router.get("", response_model=list[MachineRead], dependencies=[Depends(require_admin)])
def get_machines(session: Session = Depends(get_session)) -> list[MachineRead]:
    return [to_machine_read(machine) for machine in list_machines(session)]


@router.get("/{machine_id}", response_model=MachineRead, dependencies=[Depends(require_admin)])
def get_machine_by_id(machine_id: int, session: Session = Depends(get_session)) -> MachineRead:
    machine = get_machine(machine_id, session)
    return to_machine_read(machine)


@router.get("/{machine_id}/state", response_model=MachineStateRead)
def get_machine_state(machine_id: int, session: Session = Depends(get_session)) -> MachineStateRead:
    return latest_state(machine_id, session)


@router.post("", response_model=MachineRead, dependencies=[Depends(require_admin)])
def create_machine_endpoint(
    payload: MachineCreate,
    session: Session = Depends(get_session),
) -> MachineRead:
    machine = create_machine(payload, session)
    return to_machine_read(machine)


@router.put("/{machine_id}", response_model=MachineRead, dependencies=[Depends(require_admin)])
def update_machine_endpoint(
    machine_id: int,
    payload: MachineUpdate,
    session: Session = Depends(get_session),
) -> MachineRead:
    machine = update_machine(machine_id, payload, session)
    return to_machine_read(machine)


@router.delete("/{machine_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def delete_machine_endpoint(machine_id: int, session: Session = Depends(get_session)) -> Response:
    delete_machine(machine_id, session)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@types_router.get("", response_model=list[MachineTypeRead], dependencies=[Depends(require_admin)])
def get_machine_types(session: Session = Depends(get_session)) -> list[MachineTypeRead]:
    return [to_machine_type_read(item) for item in list_machine_types(session)]
