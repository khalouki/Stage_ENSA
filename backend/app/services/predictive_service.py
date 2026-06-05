from __future__ import annotations

from datetime import datetime, timezone
from statistics import mean

from sqlmodel import Session

from app.models.machine import Machine
from app.models.sensor import MachineSensorReading
from app.schemas.ai import AIMetricFactorRead, FleetMonitoringAIRead, MachineMonitoringAIRead, TelemetrySnapshotRead
from app.schemas.telemetry import MachineStateRead
from app.services.anomaly_service import AnomalyDetectionService, MonitoringProfile, resolve_monitoring_profile
from app.services.machine_service import get_machine, list_machines
from app.services.ml_model_service import ml_model_service
from app.services.telemetry_service import latest_state, telemetry_history


class PredictiveMaintenanceService:
    def __init__(self) -> None:
        self.anomaly_service = AnomalyDetectionService()

    def get_machine_assessment(self, machine_id: int, session: Session) -> MachineMonitoringAIRead:
        machine = get_machine(machine_id, session)
        return self._build_machine_assessment(machine, session)

    def get_fleet_assessment(self, session: Session) -> FleetMonitoringAIRead:
        assessments = [
            self._build_machine_assessment(machine, session)
            for machine in list_machines(session)
            if machine.id is not None
        ]
        health_scores = [item.health_score for item in assessments if item.health_score is not None]
        return FleetMonitoringAIRead(
            generated_at=datetime.now(timezone.utc),
            total_machines=len(assessments),
            with_telemetry=sum(1 for item in assessments if item.has_telemetry),
            normal_count=sum(1 for item in assessments if item.anomaly_status == "normal"),
            warning_count=sum(1 for item in assessments if item.anomaly_status == "warning"),
            critical_count=sum(1 for item in assessments if item.anomaly_status == "critical"),
            average_health_score=round(mean(health_scores), 1) if health_scores else None,
            machines=assessments,
        )

    def _build_machine_assessment(self, machine: Machine, session: Session) -> MachineMonitoringAIRead:
        if machine.id is None:
            raise ValueError("Machine id is required for AI monitoring")

        state = latest_state(machine.id, session)
        history = telemetry_history(session, machine.id, limit=48)
        if not history:
            return MachineMonitoringAIRead(
                machine_id=machine.id,
                machine_name=machine.name,
                machine_type=machine.machine_type.name if machine.machine_type else None,
                status=machine.status.value,
                has_telemetry=False,
                anomaly_status="no_data",
                recommendation="No telemetry has been received yet. Publish sensor data or MQTT updates to enable AI monitoring.",
                telemetry_points=0,
                assessed_at=datetime.now(timezone.utc),
                model_used="fallback",
            )

        profile = resolve_monitoring_profile(machine)
        anomaly_status, anomalies = self.anomaly_service.detect(machine, state, history)
        risk_score, factors, recent_error_count = self._score_machine(state, history, profile, anomaly_status)
        heuristic_health_score = max(0, 100 - risk_score)
        risk_level = self._risk_level(risk_score)
        ml_prediction = ml_model_service.predict_from_state(state)
        health_score = ml_prediction.health_score if ml_prediction.model_used == "ml" else heuristic_health_score
        failure_probability = (
            ml_prediction.failure_probability
            if ml_prediction.model_used == "ml"
            else round(risk_score / 100.0, 2)
        )
        recommendation = (
            ml_prediction.recommendation
            if ml_prediction.model_used == "ml"
            else self._build_recommendation(machine.name, risk_level, anomalies, factors)
        )
        if ml_prediction.model_used == "ml":
            risk_score = max(0, min(100, int(round(ml_prediction.failure_probability * 100))))
            risk_level = self._risk_level(risk_score)
            anomaly_status = self._status_from_ml(ml_prediction.maintenance_status, ml_prediction.anomaly)

        return MachineMonitoringAIRead(
            machine_id=machine.id,
            machine_name=machine.name,
            machine_type=machine.machine_type.name if machine.machine_type else None,
            status=machine.status.value,
            has_telemetry=True,
            anomaly_status=anomaly_status,
            health_score=health_score,
            maintenance_risk_score=risk_score,
            maintenance_risk_level=risk_level,
            failure_probability=failure_probability,
            recommendation=recommendation,
            anomaly_count=len(anomalies),
            anomaly_details=anomalies,
            factors=factors,
            telemetry=TelemetrySnapshotRead(
                temperature=state.temperature,
                vibration=state.vibration,
                motor_speed=state.motor_speed,
                usage_duration=state.usage_duration,
                error=state.error,
                updated_at=state.updated_at,
            ),
            recent_error_count=recent_error_count,
            telemetry_points=len(history),
            assessed_at=datetime.now(timezone.utc),
            last_telemetry_at=history[0].sensor_timestamp,
            model_used=ml_prediction.model_used,
            maintenance_status=ml_prediction.maintenance_status,
            anomaly_score=ml_prediction.anomaly_score,
        )

    def _score_machine(
        self,
        state: MachineStateRead,
        history: list[MachineSensorReading],
        profile: MonitoringProfile,
        anomaly_status: str,
    ) -> tuple[int, list[AIMetricFactorRead], int]:
        recent_error_count = sum(1 for item in history if item.error)
        runtime_hours = max((item.usage_duration for item in history), default=state.usage_duration) / 60.0
        trend_score, trend_label = self._trend_score(history)

        temperature_score = self._weighted_score(
            current=state.temperature,
            nominal=profile.temp_warning * 0.72,
            critical=profile.temp_critical,
            weight=28,
        )
        vibration_score = self._weighted_score(
            current=state.vibration,
            nominal=profile.vibration_warning * 0.7,
            critical=profile.vibration_critical,
            weight=28,
        )
        runtime_score = self._weighted_score(
            current=runtime_hours,
            nominal=profile.maintenance_interval_hours * 0.55,
            critical=profile.maintenance_interval_hours * 1.15,
            weight=22,
        )
        error_score = self._weighted_score(
            current=float(recent_error_count),
            nominal=1.0,
            critical=5.0,
            weight=12,
        )
        anomaly_boost = 0 if anomaly_status == "normal" else 5 if anomaly_status == "warning" else 10

        factors = [
            AIMetricFactorRead(
                key="temperature",
                label="Temperature load",
                score=temperature_score,
                weight=28,
                current_value=round(state.temperature, 2),
                unit="C",
                detail=f"Normal operating band stays below {profile.temp_warning:.0f} C for this machine family.",
            ),
            AIMetricFactorRead(
                key="vibration",
                label="Mechanical vibration",
                score=vibration_score,
                weight=28,
                current_value=round(state.vibration, 3),
                unit="mm/s",
                detail=f"Persistent vibration above {profile.vibration_warning:.1f} mm/s increases maintenance risk.",
            ),
            AIMetricFactorRead(
                key="runtime",
                label="Accumulated usage",
                score=runtime_score,
                weight=22,
                current_value=round(runtime_hours, 1),
                unit="h",
                detail=f"Preventive maintenance is usually scheduled around {profile.maintenance_interval_hours:.0f} h.",
            ),
            AIMetricFactorRead(
                key="errors",
                label="Recent error history",
                score=error_score,
                weight=12,
                current_value=float(recent_error_count),
                unit="events",
                detail="Repeated error flags in recent telemetry strongly increase the failure risk.",
            ),
            AIMetricFactorRead(
                key="trend",
                label="Telemetry trend",
                score=trend_score,
                weight=10,
                detail=trend_label,
                trend="rising" if trend_score >= 6 else "stable",
            ),
        ]

        total_score = min(100, temperature_score + vibration_score + runtime_score + error_score + trend_score + anomaly_boost)
        return (int(round(total_score)), factors, recent_error_count)

    @staticmethod
    def _weighted_score(current: float, nominal: float, critical: float, weight: int) -> int:
        if current <= nominal:
            return 0
        if critical <= nominal:
            return weight
        ratio = min(1.0, (current - nominal) / (critical - nominal))
        return int(round(weight * ratio))

    @staticmethod
    def _trend_score(history: list[MachineSensorReading]) -> tuple[int, str]:
        if len(history) < 6:
            return (0, "Not enough telemetry history yet to evaluate the recent trend.")

        chronological = list(reversed(history))
        midpoint = len(chronological) // 2
        earlier = chronological[:midpoint]
        recent = chronological[midpoint:]
        earlier_temp = mean(item.temperature for item in earlier)
        recent_temp = mean(item.temperature for item in recent)
        earlier_vibration = mean(item.vibration for item in earlier)
        recent_vibration = mean(item.vibration for item in recent)

        temp_increase = max(0.0, recent_temp - earlier_temp)
        vibration_increase = max(0.0, recent_vibration - earlier_vibration)
        trend_score = min(10, int(round((temp_increase * 0.3) + (vibration_increase * 6.0))))

        if trend_score == 0:
            return (0, "Recent telemetry remains stable compared with the previous readings.")
        return (
            trend_score,
            f"Temperature and vibration are rising versus the previous window (+{temp_increase:.1f} C, +{vibration_increase:.2f} mm/s).",
        )

    @staticmethod
    def _risk_level(score: int) -> str:
        if score >= 70:
            return "high"
        if score >= 40:
            return "medium"
        return "low"

    @staticmethod
    def _status_from_ml(maintenance_status: str, anomaly: bool) -> str:
        if maintenance_status == "critical":
            return "critical"
        if maintenance_status in {"maintenance_soon", "monitor"} or anomaly:
            return "warning"
        return "normal"

    @staticmethod
    def _build_recommendation(
        machine_name: str,
        risk_level: str,
        anomalies: list,
        factors: list[AIMetricFactorRead],
    ) -> str:
        if not anomalies and risk_level == "low":
            return f"{machine_name} is operating normally. Keep routine inspection and continue collecting telemetry."

        top_factor = max(factors, key=lambda item: item.score, default=None)
        if risk_level == "high":
            if top_factor:
                return f"{machine_name} should be inspected before the next student session. Prioritize {top_factor.label.lower()} and verify critical components."
            return f"{machine_name} should be inspected before the next student session."
        if risk_level == "medium":
            if top_factor:
                return f"Plan preventive maintenance soon for {machine_name}. Focus on {top_factor.label.lower()} and monitor the next telemetry updates."
            return f"Plan preventive maintenance soon for {machine_name}."
        return f"{machine_name} remains usable, but keep it under observation and review the next telemetry cycle."
