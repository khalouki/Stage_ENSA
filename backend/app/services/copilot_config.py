from dataclasses import dataclass


@dataclass(frozen=True)
class CopilotAnalysisSettings:
    telemetry_window: int = 48
    recent_anomaly_window: int = 12
    temperature_trend_warning: float = 3.0
    vibration_trend_warning: float = 0.25
    motor_speed_cv_warning: float = 0.18
    usage_duration_warning_minutes: int = 360
    low_health_warning: int = 70
    low_health_critical: int = 45
    repeated_anomaly_warning: int = 2


copilot_settings = CopilotAnalysisSettings()
