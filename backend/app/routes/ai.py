import subprocess
import sys
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlmodel import Session

from app.db import get_session
from app.schemas.ai import CopilotQueryRequest, CopilotQueryResponse, FleetMonitoringAIRead, MachineMonitoringAIRead
from app.services.auth_service import require_admin
from app.services.copilot_service import answer_copilot_query
from app.services.ml_model_service import ml_model_service
from app.services.predictive_service import PredictiveMaintenanceService

router = APIRouter(prefix="/admin/ai", tags=["admin-ai"], dependencies=[Depends(require_admin)])
predictive_service = PredictiveMaintenanceService()


@router.get("/monitoring/overview", response_model=FleetMonitoringAIRead)
def get_monitoring_overview(session: Session = Depends(get_session)) -> FleetMonitoringAIRead:
    return predictive_service.get_fleet_assessment(session)


@router.get("/monitoring/machines/{machine_id}", response_model=MachineMonitoringAIRead)
def get_machine_monitoring(machine_id: int, session: Session = Depends(get_session)) -> MachineMonitoringAIRead:
    return predictive_service.get_machine_assessment(machine_id, session)


@router.post("/copilot/query", response_model=CopilotQueryResponse)
def query_copilot(
    payload: CopilotQueryRequest,
    session: Session = Depends(get_session),
) -> CopilotQueryResponse:
    return answer_copilot_query(payload.message, session)


@router.post("/copilot", response_model=CopilotQueryResponse)
def query_copilot_alias(
    payload: CopilotQueryRequest,
    session: Session = Depends(get_session),
) -> CopilotQueryResponse:
    return answer_copilot_query(payload.message, session)


def _run_training_script() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    script_path = backend_dir / "scripts" / "train_ml_models.py"
    try:
        subprocess.run([sys.executable, str(script_path)], cwd=backend_dir, check=False)
        ml_model_service.load_models(force=True)
    except Exception:
        # Training is launched as a convenience endpoint; status remains visible via /model-status.
        return


@router.get("/model-status")
def get_model_status() -> dict[str, Any]:
    return ml_model_service.status()


@router.post("/predict-sample")
def predict_sample(payload: dict[str, Any]) -> dict[str, Any]:
    return ml_model_service.predict_sample(payload).as_dict()


@router.post("/train")
def train_models(background_tasks: BackgroundTasks) -> dict[str, str]:
    background_tasks.add_task(_run_training_script)
    return {"status": "training_started", "detail": "Check /admin/ai/model-status after the task finishes."}
