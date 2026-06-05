from fastapi import APIRouter

from app.schemas.simulation import SimulationStateRead, SimulationStateUpdate
from app.services.simulation_service import SimulationService

router = APIRouter(prefix="/simulation", tags=["simulation"])
simulation_service = SimulationService()


@router.get("/state/{machine_id}", response_model=SimulationStateRead)
def get_simulation_state(machine_id: int) -> SimulationStateRead:
    return simulation_service.get_state(machine_id)


@router.put("/state/{machine_id}", response_model=SimulationStateRead)
def update_simulation_state(machine_id: int, payload: SimulationStateUpdate) -> SimulationStateRead:
    return simulation_service.update_state(machine_id, payload)
