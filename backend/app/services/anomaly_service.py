from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from statistics import mean, pstdev

from app.models.machine import Machine
from app.models.sensor import MachineSensorReading
from app.schemas.ai import AIAnomalyDetailRead
from app.schemas.telemetry import MachineStateRead
from app.services.copilot_localization import copilot_text


@dataclass(frozen=True)
class MonitoringProfile:
    temp_warning: float
    temp_critical: float
    vibration_warning: float
    vibration_critical: float
    speed_warning: float
    speed_critical: float
    maintenance_interval_hours: float


DEFAULT_PROFILE = MonitoringProfile(
    temp_warning=70.0,
    temp_critical=85.0,
    vibration_warning=1.4,
    vibration_critical=2.2,
    speed_warning=2600.0,
    speed_critical=3600.0,
    maintenance_interval_hours=400.0,
)

PRINTER_PROFILE = MonitoringProfile(
    temp_warning=235.0,
    temp_critical=255.0,
    vibration_warning=1.0,
    vibration_critical=1.8,
    speed_warning=1800.0,
    speed_critical=2600.0,
    maintenance_interval_hours=480.0,
)

CNC_PROFILE = MonitoringProfile(
    temp_warning=55.0,
    temp_critical=70.0,
    vibration_warning=1.5,
    vibration_critical=2.4,
    speed_warning=2400.0,
    speed_critical=3200.0,
    maintenance_interval_hours=420.0,
)


def resolve_monitoring_profile(machine: Machine) -> MonitoringProfile:
    code = (machine.machine_type.code if machine.machine_type else machine.name).upper()
    if "PRINTER" in code or "FDM" in code:
        return PRINTER_PROFILE
    if "CNC" in code:
        return CNC_PROFILE
    return DEFAULT_PROFILE


def _metric_stats(history: list[MachineSensorReading], metric: str) -> tuple[float, float]:
    values = [float(getattr(item, metric)) for item in history]
    if not values:
        return (0.0, 0.0)
    if len(values) == 1:
        return (values[0], 0.0)
    return (mean(values), pstdev(values))


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class AnomalyDetectionService:
    def detect(
        self,
        machine: Machine,
        state: MachineStateRead,
        history: list[MachineSensorReading],
    ) -> tuple[str, list[AIAnomalyDetailRead]]:
        if not history:
            return ("no_data", [])

        profile = resolve_monitoring_profile(machine)
        anomalies: list[AIAnomalyDetailRead] = []
        latest = history[0]
        temp_mean, temp_std = _metric_stats(history, "temperature")
        vib_mean, vib_std = _metric_stats(history, "vibration")
        recent_error_count = sum(1 for item in history if item.error)

        dynamic_temp_warning = max(profile.temp_warning, temp_mean + (temp_std * 2.2))
        dynamic_vibration_warning = max(profile.vibration_warning, vib_mean + (vib_std * 2.0))

        if state.temperature >= profile.temp_critical:
            anomalies.append(
                AIAnomalyDetailRead(
                    code="temperature_critical",
                    metric="temperature",
                    severity="high",
                    reason=copilot_text("anomaly_reason_temperature_critical"),
                    current_value=round(state.temperature, 2),
                    threshold=profile.temp_critical,
                    unit="C",
                )
            )
        elif state.temperature >= dynamic_temp_warning:
            anomalies.append(
                AIAnomalyDetailRead(
                    code="temperature_drift",
                    metric="temperature",
                    severity="medium",
                    reason=copilot_text("anomaly_reason_temperature_drift"),
                    current_value=round(state.temperature, 2),
                    threshold=round(dynamic_temp_warning, 2),
                    unit="C",
                )
            )

        if state.vibration >= profile.vibration_critical:
            anomalies.append(
                AIAnomalyDetailRead(
                    code="vibration_critical",
                    metric="vibration",
                    severity="high",
                    reason=copilot_text("anomaly_reason_vibration_critical"),
                    current_value=round(state.vibration, 3),
                    threshold=profile.vibration_critical,
                    unit="mm/s",
                )
            )
        elif state.vibration >= dynamic_vibration_warning:
            anomalies.append(
                AIAnomalyDetailRead(
                    code="vibration_drift",
                    metric="vibration",
                    severity="medium",
                    reason=copilot_text("anomaly_reason_vibration_drift"),
                    current_value=round(state.vibration, 3),
                    threshold=round(dynamic_vibration_warning, 3),
                    unit="mm/s",
                )
            )

        if state.status in {"offline", "maintenance"} and state.motor_speed > 0:
            anomalies.append(
                AIAnomalyDetailRead(
                    code="status_conflict",
                    metric="motor_speed",
                    severity="high",
                    reason=copilot_text("anomaly_reason_status_conflict"),
                    current_value=round(state.motor_speed, 1),
                    threshold=0.0,
                    unit="rpm",
                )
            )
        elif state.motor_speed >= profile.speed_critical:
            anomalies.append(
                AIAnomalyDetailRead(
                    code="overspeed",
                    metric="motor_speed",
                    severity="medium",
                    reason=copilot_text("anomaly_reason_overspeed"),
                    current_value=round(state.motor_speed, 1),
                    threshold=profile.speed_critical,
                    unit="rpm",
                )
            )

        recent_window_start = datetime.now(timezone.utc) - timedelta(hours=6)
        recent_window_errors = sum(
            1 for item in history if item.error and _to_utc(item.sensor_timestamp) >= recent_window_start
        )
        if recent_window_errors >= 2 or recent_error_count >= 3:
            anomalies.append(
                AIAnomalyDetailRead(
                    code="repeated_errors",
                    metric="error",
                    severity="medium" if recent_window_errors < 3 else "high",
                    reason=copilot_text("anomaly_reason_repeated_errors"),
                )
            )

        age_minutes = (datetime.now(timezone.utc) - _to_utc(latest.sensor_timestamp)).total_seconds() / 60.0
        if age_minutes > 90:
            anomalies.append(
                AIAnomalyDetailRead(
                    code="stale_telemetry",
                    metric="telemetry",
                    severity="low",
                    reason=copilot_text("anomaly_reason_stale_telemetry"),
                )
            )

        if any(item.severity == "high" for item in anomalies):
            return ("critical", anomalies)
        if anomalies:
            return ("warning", anomalies)
        return ("normal", anomalies)
