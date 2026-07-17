from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib

from app.schemas.ai import CopilotIntent

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_MODEL_PATH = BASE_DIR / "ml_models" / "copilot_intent_classifier.joblib"
DEFAULT_ACCEPTANCE_THRESHOLD = 0.20


@dataclass(frozen=True)
class IntentPrediction:
    predicted_intent: CopilotIntent
    raw_intent: str
    confidence: float
    below_threshold: bool
    model_available: bool


class CopilotIntentClassifier:
    def __init__(
        self,
        model_path: Path = DEFAULT_MODEL_PATH,
        acceptance_threshold: float = DEFAULT_ACCEPTANCE_THRESHOLD,
    ) -> None:
        self.model_path = model_path
        self.acceptance_threshold = acceptance_threshold
        self._artifact: dict[str, Any] | None = None
        self._load_error: str | None = None

    def load(self, force: bool = False) -> bool:
        if self._artifact is not None and not force:
            return True
        self._artifact = None
        self._load_error = None
        if not self.model_path.exists():
            self._load_error = f"Copilot intent model artifact not found: {self.model_path}"
            logger.warning(self._load_error)
            return False
        try:
            artifact = joblib.load(self.model_path)
        except Exception as exc:  # pragma: no cover - defensive artifact loading
            self._load_error = str(exc)
            logger.warning("Could not load copilot intent model: %s", exc)
            return False
        if not isinstance(artifact, dict) or "pipeline" not in artifact:
            self._load_error = "Copilot intent artifact is invalid"
            logger.warning(self._load_error)
            return False
        self._artifact = artifact
        self.acceptance_threshold = float(artifact.get("acceptance_threshold", self.acceptance_threshold))
        return True

    @property
    def last_error(self) -> str | None:
        return self._load_error

    def predict(self, message: str) -> IntentPrediction:
        if not self.load():
            return IntentPrediction(
                predicted_intent="unknown",
                raw_intent="unknown",
                confidence=0.0,
                below_threshold=True,
                model_available=False,
            )

        assert self._artifact is not None
        pipeline = self._artifact["pipeline"]
        raw_intent = str(pipeline.predict([message])[0])
        confidence = self._confidence(pipeline, message, raw_intent)
        below_threshold = confidence < self.acceptance_threshold
        predicted_intent = "unknown" if below_threshold else raw_intent
        return IntentPrediction(
            predicted_intent=predicted_intent,  # type: ignore[arg-type]
            raw_intent=raw_intent,
            confidence=round(confidence, 4),
            below_threshold=below_threshold,
            model_available=True,
        )

    @staticmethod
    def _confidence(pipeline: Any, message: str, raw_intent: str) -> float:
        classifier = pipeline.named_steps.get("classifier")
        if hasattr(classifier, "predict_proba"):
            probabilities = pipeline.predict_proba([message])[0]
            classes = list(classifier.classes_)
            if raw_intent in classes:
                return float(probabilities[classes.index(raw_intent)])
            return float(max(probabilities))

        if hasattr(pipeline, "decision_function"):
            scores = pipeline.decision_function([message])
            if scores.ndim == 1:
                return 1.0
            best_score = float(max(scores[0]))
            return 1.0 / (1.0 + pow(2.718281828, -best_score))
        return 0.0


copilot_intent_classifier = CopilotIntentClassifier()
