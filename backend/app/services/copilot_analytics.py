from __future__ import annotations

from dataclasses import dataclass
from statistics import mean, pstdev

from app.models.sensor import MachineSensorReading
from app.services.copilot_config import copilot_settings


@dataclass(frozen=True)
class MetricSummary:
    latest: float | None
    rolling_mean: float | None
    minimum: float | None
    maximum: float | None
    recent_change: float | None


@dataclass(frozen=True)
class TelemetryAnalysis:
    temperature: MetricSummary
    vibration: MetricSummary
    motor_speed: MetricSummary
    usage_duration_latest: int | None
    temperature_trend: str
    vibration_trend: str
    motor_speed_stability: str
    recent_error_count: int


def _values(history: list[MachineSensorReading], metric: str) -> list[float]:
    chronological = list(reversed(history))
    return [float(getattr(item, metric)) for item in chronological]


def summarize_metric(history: list[MachineSensorReading], metric: str) -> MetricSummary:
    values = _values(history, metric)
    if not values:
        return MetricSummary(None, None, None, None, None)

    midpoint = max(1, len(values) // 2)
    earlier = values[:midpoint]
    recent = values[midpoint:] or values
    return MetricSummary(
        latest=values[-1],
        rolling_mean=round(mean(values), 3),
        minimum=round(min(values), 3),
        maximum=round(max(values), 3),
        recent_change=round(mean(recent) - mean(earlier), 3),
    )


def _trend(change: float | None, warning_threshold: float) -> str:
    if change is None:
        return "unknown"
    if change >= warning_threshold:
        return "rising"
    if change <= -warning_threshold:
        return "falling"
    return "stable"


def _motor_speed_stability(history: list[MachineSensorReading]) -> str:
    values = _values(history, "motor_speed")
    if len(values) < 4:
        return "unknown"

    avg = mean(values)
    if abs(avg) < 1e-6:
        return "stable"

    coefficient_of_variation = pstdev(values) / abs(avg)
    if coefficient_of_variation >= copilot_settings.motor_speed_cv_warning:
        return "unstable"
    return "stable"


def analyze_telemetry(history: list[MachineSensorReading]) -> TelemetryAnalysis:
    latest = history[0] if history else None
    temperature = summarize_metric(history, "temperature")
    vibration = summarize_metric(history, "vibration")
    return TelemetryAnalysis(
        temperature=temperature,
        vibration=vibration,
        motor_speed=summarize_metric(history, "motor_speed"),
        usage_duration_latest=latest.usage_duration if latest else None,
        temperature_trend=_trend(temperature.recent_change, copilot_settings.temperature_trend_warning),
        vibration_trend=_trend(vibration.recent_change, copilot_settings.vibration_trend_warning),
        motor_speed_stability=_motor_speed_stability(history),
        recent_error_count=sum(1 for item in history if item.error),
    )
