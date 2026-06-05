from datetime import datetime, timezone

from app.schemas.simulation import SimulationStateRead, SimulationStateUpdate


class SimulationService:
    """In-memory simulation state store for PFE demo."""

    def __init__(self) -> None:
        self._states: dict[int, SimulationStateRead] = {}

    def get_state(self, machine_id: int) -> SimulationStateRead:
        if machine_id not in self._states:
            self._states[machine_id] = SimulationStateRead(
                machine_id=machine_id,
                status="stopped",
                progress_pct=0,
                current_step=0,
                current_layer=0,
                gcode_file_name=None,
                estimated_time_min=0,
                updated_at=datetime.now(timezone.utc),
            )
        return self._states[machine_id]

    def update_state(self, machine_id: int, payload: SimulationStateUpdate) -> SimulationStateRead:
        state = self.get_state(machine_id)
        data = payload.model_dump(exclude_unset=True)

        updated = state.model_copy(
            update={
                **data,
                "updated_at": datetime.now(timezone.utc),
            }
        )
        self._states[machine_id] = updated
        return updated
