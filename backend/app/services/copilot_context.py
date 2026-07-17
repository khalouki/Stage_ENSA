from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlmodel import Session, func, select

from app.models.machine import Machine
from app.models.reservation import Reservation, ReservationStatus
from app.models.sensor import MachineSensorReading
from app.schemas.ai import FleetMonitoringAIRead, MachineMonitoringAIRead
from app.services.copilot_analytics import TelemetryAnalysis, analyze_telemetry
from app.services.copilot_config import copilot_settings
from app.services.machine_service import list_machines
from app.services.predictive_service import PredictiveMaintenanceService
from app.services.telemetry_service import telemetry_history


@dataclass(frozen=True)
class MachineCopilotContext:
    machine: Machine
    assessment: MachineMonitoringAIRead
    history: list[MachineSensorReading]
    telemetry_analysis: TelemetryAnalysis


@dataclass(frozen=True)
class ReservationSummary:
    total: int
    pending: int
    approved: int
    rejected: int
    cancelled: int
    today: int


@dataclass(frozen=True)
class CopilotContext:
    machines: list[Machine]
    fleet: FleetMonitoringAIRead
    machine_contexts: dict[int, MachineCopilotContext]
    reservations: ReservationSummary


def _reservation_summary(session: Session) -> ReservationSummary:
    rows = session.exec(select(Reservation.status, func.count(Reservation.id)).group_by(Reservation.status)).all()
    counts = {str(status): int(count) for status, count in rows}
    today_count = int(
        session.exec(select(func.count(Reservation.id)).where(Reservation.date == date.today())).one()
    )
    return ReservationSummary(
        total=sum(counts.values()),
        pending=counts.get(ReservationStatus.PENDING.value, 0),
        approved=counts.get(ReservationStatus.APPROVED.value, 0),
        rejected=counts.get(ReservationStatus.REJECTED.value, 0),
        cancelled=counts.get(ReservationStatus.CANCELLED.value, 0),
        today=today_count,
    )


def build_copilot_context(session: Session) -> CopilotContext:
    predictive_service = PredictiveMaintenanceService()
    machines = list_machines(session)
    fleet = predictive_service.get_fleet_assessment(session)
    assessments = {item.machine_id: item for item in fleet.machines}
    machine_contexts: dict[int, MachineCopilotContext] = {}

    for machine in machines:
        if machine.id is None:
            continue
        history = telemetry_history(session, machine.id, limit=copilot_settings.telemetry_window)
        assessment = assessments.get(machine.id)
        if assessment is None:
            assessment = predictive_service.get_machine_assessment(machine.id, session)
        machine_contexts[machine.id] = MachineCopilotContext(
            machine=machine,
            assessment=assessment,
            history=history,
            telemetry_analysis=analyze_telemetry(history),
        )

    return CopilotContext(
        machines=machines,
        fleet=fleet,
        machine_contexts=machine_contexts,
        reservations=_reservation_summary(session),
    )
