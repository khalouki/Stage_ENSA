from __future__ import annotations

from app.services.copilot_config import copilot_settings
from app.services.copilot_context import MachineCopilotContext
from app.services.copilot_localization import copilot_text


def build_recommendations(machine_context: MachineCopilotContext) -> list[str]:
    assessment = machine_context.assessment
    analysis = machine_context.telemetry_analysis
    recommendations: list[str] = []

    if assessment.health_score is not None and assessment.health_score <= copilot_settings.low_health_critical:
        recommendations.append(copilot_text("rec_pause"))
    elif assessment.health_score is not None and assessment.health_score <= copilot_settings.low_health_warning:
        recommendations.append(copilot_text("rec_preventive"))

    if analysis.temperature_trend == "rising":
        recommendations.append(copilot_text("rec_temperature"))

    if analysis.vibration_trend == "rising":
        recommendations.append(copilot_text("rec_vibration"))

    if analysis.motor_speed_stability == "unstable":
        recommendations.append(copilot_text("rec_motor"))

    if assessment.anomaly_count >= copilot_settings.repeated_anomaly_warning:
        recommendations.append(copilot_text("rec_anomalies"))

    if analysis.usage_duration_latest is not None and analysis.usage_duration_latest >= copilot_settings.usage_duration_warning_minutes:
        recommendations.append(copilot_text("rec_runtime"))

    if assessment.telemetry and assessment.telemetry.error:
        recommendations.append(copilot_text("rec_error"))

    if not recommendations:
        recommendations.append(assessment.recommendation)

    return recommendations[:4]
