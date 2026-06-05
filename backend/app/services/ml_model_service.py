from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.models.sensor import MachineSensorReading
from app.schemas.telemetry import MachineStateRead

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parents[2]
MODEL_DIR = BASE_DIR / "ml_models"
ANOMALY_MODEL_PATH = MODEL_DIR / "anomaly_isolation_forest.joblib"
MAINTENANCE_MODEL_PATH = MODEL_DIR / "maintenance_random_forest.joblib"
METADATA_PATH = MODEL_DIR / "metadata.json"

DEFAULT_FEATURE_NAMES = ["temperature", "vibration", "usage_hours", "motor_speed", "has_error"]
DEFAULT_LABELS = ["normal", "monitor", "maintenance_soon", "critical"]


@dataclass(frozen=True)
class MLPrediction:
    anomaly: bool
    anomaly_score: float
    maintenance_status: str
    failure_probability: float
    health_score: int
    recommendation: str
    model_used: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "anomaly": self.anomaly,
            "anomaly_score": self.anomaly_score,
            "maintenance_status": self.maintenance_status,
            "failure_probability": self.failure_probability,
            "health_score": self.health_score,
            "recommendation": self.recommendation,
            "model_used": self.model_used,
        }


class MLModelService:
    def __init__(self) -> None:
        self._anomaly_model: Any | None = None
        self._maintenance_model: Any | None = None
        self._metadata: dict[str, Any] = {}
        self._loaded = False
        self._load_error: str | None = None

    def load_models(self, force: bool = False) -> bool:
        if self._loaded and not force:
            return self.is_available

        self._loaded = True
        self._load_error = None
        self._anomaly_model = None
        self._maintenance_model = None
        self._metadata = {}

        if not ANOMALY_MODEL_PATH.exists() or not MAINTENANCE_MODEL_PATH.exists():
            self._load_error = "ML model files are missing. Run scripts/train_ml_models.py."
            return False

        try:
            import joblib

            self._anomaly_model = joblib.load(ANOMALY_MODEL_PATH)
            self._maintenance_model = joblib.load(MAINTENANCE_MODEL_PATH)
            if METADATA_PATH.exists():
                self._metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
            return True
        except Exception as exc:  # pragma: no cover - depends on local model files
            self._load_error = str(exc)
            logger.warning("Could not load ML models: %s", exc)
            self._anomaly_model = None
            self._maintenance_model = None
            return False

    @property
    def is_available(self) -> bool:
        return self._anomaly_model is not None and self._maintenance_model is not None

    def status(self) -> dict[str, Any]:
        self.load_models()
        return {
            "available": self.is_available,
            "model_dir": str(MODEL_DIR),
            "anomaly_model_exists": ANOMALY_MODEL_PATH.exists(),
            "maintenance_model_exists": MAINTENANCE_MODEL_PATH.exists(),
            "metadata_exists": METADATA_PATH.exists(),
            "feature_names": self._metadata.get("feature_names", DEFAULT_FEATURE_NAMES),
            "labels": self._metadata.get("labels", DEFAULT_LABELS),
            "last_error": self._load_error,
        }

    def predict_from_reading(self, reading: MachineSensorReading) -> MLPrediction:
        features = self._features(
            temperature=reading.temperature,
            vibration=reading.vibration,
            usage_duration=reading.usage_duration,
            motor_speed=reading.motor_speed,
            error=reading.error,
        )
        return self._predict(features)

    def predict_from_state(self, state: MachineStateRead) -> MLPrediction:
        features = self._features(
            temperature=state.temperature,
            vibration=state.vibration,
            usage_duration=state.usage_duration,
            motor_speed=state.motor_speed,
            error=state.error,
        )
        return self._predict(features)

    def predict_sample(self, payload: dict[str, Any]) -> MLPrediction:
        features = self._features(
            temperature=float(payload.get("temperature", 0.0)),
            vibration=float(payload.get("vibration", 0.0)),
            usage_duration=int(payload.get("usage_duration", 0)),
            motor_speed=float(payload.get("motor_speed", 0.0)),
            error=payload.get("error"),
        )
        return self._predict(features)

    def _predict(self, features: dict[str, float]) -> MLPrediction:
        if not self.load_models():
            return self.fallback_rule_prediction(features)

        feature_names = self._feature_names
        try:
            import pandas as pd

            row = pd.DataFrame([[features[name] for name in feature_names]], columns=feature_names)
            anomaly_raw = int(self._anomaly_model.predict(row)[0])
            anomaly_score = float(self._anomaly_model.decision_function(row)[0])
            proba = self._maintenance_model.predict_proba(row)[0]
            classes = list(self._maintenance_model.classes_)
            best_index = max(range(len(proba)), key=lambda index: proba[index])
            maintenance_status = str(classes[best_index])
            failure_probability = self._failure_probability(classes, proba)
            health_score = max(0, min(100, int(round(100 - (failure_probability * 100)))))
            return MLPrediction(
                anomaly=anomaly_raw == -1,
                anomaly_score=round(anomaly_score, 4),
                maintenance_status=maintenance_status,
                failure_probability=round(failure_probability, 2),
                health_score=health_score,
                recommendation=self._recommendation(maintenance_status, anomaly_raw == -1),
                model_used="ml",
            )
        except Exception as exc:  # pragma: no cover - defensive runtime fallback
            logger.warning("ML prediction failed, using fallback: %s", exc)
            return self.fallback_rule_prediction(features)

    def fallback_rule_prediction(self, features: dict[str, float]) -> MLPrediction:
        score = 0
        score += self._range_score(features["temperature"], normal=60, critical=90, weight=28)
        score += self._range_score(features["vibration"], normal=1.2, critical=4.0, weight=28)
        score += self._range_score(features["usage_hours"], normal=200, critical=520, weight=22)
        score += self._range_score(features["motor_speed"], normal=2200, critical=3600, weight=12)
        score += 10 if features["has_error"] else 0
        score = min(100, score)

        if score >= 75:
            status = "critical"
        elif score >= 52:
            status = "maintenance_soon"
        elif score >= 28:
            status = "monitor"
        else:
            status = "normal"

        return MLPrediction(
            anomaly=score >= 52,
            anomaly_score=round(score / 100.0, 4),
            maintenance_status=status,
            failure_probability=round(score / 100.0, 2),
            health_score=max(0, 100 - score),
            recommendation=self._recommendation(status, score >= 52),
            model_used="fallback",
        )

    @property
    def _feature_names(self) -> list[str]:
        return list(self._metadata.get("feature_names", DEFAULT_FEATURE_NAMES))

    @staticmethod
    def _features(
        temperature: float,
        vibration: float,
        usage_duration: int,
        motor_speed: float,
        error: str | None,
    ) -> dict[str, float]:
        return {
            "temperature": float(temperature),
            "vibration": float(vibration),
            "usage_hours": float(usage_duration) / 60.0,
            "motor_speed": float(motor_speed),
            "has_error": 1.0 if error else 0.0,
        }

    @staticmethod
    def _range_score(current: float, normal: float, critical: float, weight: int) -> int:
        if current <= normal:
            return 0
        ratio = min(1.0, (current - normal) / max(critical - normal, 1.0))
        return int(round(ratio * weight))

    @staticmethod
    def _failure_probability(classes: list[Any], probabilities: list[float]) -> float:
        weights = {
            "normal": 0.05,
            "monitor": 0.3,
            "maintenance_soon": 0.68,
            "critical": 0.95,
        }
        return sum(float(probability) * weights.get(str(label), 0.5) for label, probability in zip(classes, probabilities))

    @staticmethod
    def _recommendation(status: str, anomaly: bool) -> str:
        if status == "critical":
            return "Stop or isolate the machine and schedule immediate inspection before the next FabLab session."
        if status == "maintenance_soon":
            return "Plan preventive maintenance soon and watch the next telemetry updates closely."
        if status == "monitor" or anomaly:
            return "Machine can remain available, but keep it under monitoring and review sensor trends."
        return "Machine appears healthy. Continue normal operation and routine inspection."


ml_model_service = MLModelService()


def load_models() -> bool:
    return ml_model_service.load_models(force=True)


def predict_from_reading(reading: MachineSensorReading) -> MLPrediction:
    return ml_model_service.predict_from_reading(reading)


def predict_from_state(state: MachineStateRead) -> MLPrediction:
    return ml_model_service.predict_from_state(state)


def fallback_rule_prediction(features: dict[str, float]) -> MLPrediction:
    return ml_model_service.fallback_rule_prediction(features)
