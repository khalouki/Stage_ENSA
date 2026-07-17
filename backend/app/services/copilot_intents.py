from __future__ import annotations

from dataclasses import dataclass

from app.models.machine import Machine
from app.schemas.ai import CopilotIntent
from app.services.copilot_entity_extraction import extract_entities
from app.services.copilot_intent_classifier import IntentPrediction, copilot_intent_classifier


@dataclass(frozen=True)
class DetectedIntent:
    intent: CopilotIntent
    machine_ids: list[int]
    machine_names: list[str]
    unknown_machine_reference: str | None
    confidence: float
    raw_intent: str
    below_threshold: bool
    model_available: bool


def detect_intent(message: str, machines: list[Machine]) -> DetectedIntent:
    prediction: IntentPrediction = copilot_intent_classifier.predict(message)
    entities = extract_entities(message, machines)
    return DetectedIntent(
        intent=prediction.predicted_intent,
        machine_ids=[machine.id for machine in entities.machines],
        machine_names=[machine.name for machine in entities.machines],
        unknown_machine_reference=entities.unknown_machine_reference,
        confidence=prediction.confidence,
        raw_intent=prediction.raw_intent,
        below_threshold=prediction.below_threshold,
        model_available=prediction.model_available,
    )
