from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Protocol

from fastapi import HTTPException, status
from sqlmodel import Session

from app.schemas.ai import (
    CopilotDataPoint,
    CopilotExtractedMachine,
    CopilotIntent,
    CopilotQueryResponse,
    CopilotSeverity,
)
from app.services.copilot_context import CopilotContext, MachineCopilotContext, build_copilot_context
from app.services.copilot_intents import DetectedIntent, detect_intent
from app.services.copilot_localization import (
    copilot_text,
    localize_anomaly_status,
    localize_risk_level,
    localize_status,
    localize_trend,
)
from app.services.copilot_recommendations import build_recommendations

logger = logging.getLogger(__name__)


class OptionalLLMProvider(Protocol):
    def refine_answer(self, answer: str, context: dict[str, object]) -> str:
        """Optional future extension point. The MVP does not call external LLM APIs."""


def _severity_for_machine(machine_context: MachineCopilotContext) -> CopilotSeverity:
    status_value = machine_context.assessment.anomaly_status
    risk_level = machine_context.assessment.maintenance_risk_level
    if status_value == "critical" or risk_level == "high":
        return "critical"
    if status_value == "warning" or risk_level == "medium":
        return "warning"
    return "info"


def _health_point(machine_context: MachineCopilotContext) -> CopilotDataPoint:
    return CopilotDataPoint(label=copilot_text("label_health_score"), value=machine_context.assessment.health_score, unit="%")


def _machine_data_points(machine_context: MachineCopilotContext) -> list[CopilotDataPoint]:
    telemetry = machine_context.assessment.telemetry
    points = [
        _health_point(machine_context),
        CopilotDataPoint(label=copilot_text("label_risk_score"), value=machine_context.assessment.maintenance_risk_score, unit="/100"),
        CopilotDataPoint(label=copilot_text("label_anomalies"), value=machine_context.assessment.anomaly_count, unit=copilot_text("unit_events")),
    ]
    if telemetry:
        points.extend(
            [
                CopilotDataPoint(label=copilot_text("label_latest_temperature"), value=round(telemetry.temperature, 1), unit="C"),
                CopilotDataPoint(label=copilot_text("label_latest_vibration"), value=round(telemetry.vibration, 3), unit="mm/s"),
                CopilotDataPoint(label=copilot_text("label_motor_speed"), value=round(telemetry.motor_speed), unit="tr/min"),
            ]
        )
    return points


def _format_machine_observations(machine_context: MachineCopilotContext) -> str:
    assessment = machine_context.assessment
    analysis = machine_context.telemetry_analysis
    facts: list[str] = [
        copilot_text("observed_status", machine=assessment.machine_name, status=localize_status(assessment.status)),
        copilot_text("observed_anomaly", status=localize_anomaly_status(assessment.anomaly_status)),
    ]
    if assessment.health_score is not None:
        facts.append(copilot_text("observed_health", score=assessment.health_score))
    if assessment.maintenance_risk_score is not None:
        facts.append(copilot_text("observed_risk", score=assessment.maintenance_risk_score))
    if assessment.telemetry:
        facts.append(
            copilot_text(
                "observed_telemetry",
                temperature=assessment.telemetry.temperature,
                vibration=assessment.telemetry.vibration,
                speed=assessment.telemetry.motor_speed,
            )
        )
    if analysis.temperature_trend != "unknown" or analysis.vibration_trend != "unknown":
        facts.append(
            copilot_text(
                "observed_trends",
                temperature_trend=localize_trend(analysis.temperature_trend),
                vibration_trend=localize_trend(analysis.vibration_trend),
            )
        )
    return "; ".join(facts)


def _machine_not_found_response(reference: str | None, intent: CopilotIntent) -> CopilotQueryResponse:
    label = reference or copilot_text("machine_not_found_label")
    return CopilotQueryResponse(
        answer=copilot_text("machine_not_found_answer", label=label),
        intent=intent,
        severity="warning",
        recommendations=[copilot_text("machine_not_found_recommendation")],
        generated_at=datetime.now(timezone.utc),
    )


def _top_risk_machine(context: CopilotContext) -> MachineCopilotContext | None:
    candidates = [
        item
        for item in context.machine_contexts.values()
        if item.assessment.maintenance_risk_score is not None
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda item: item.assessment.maintenance_risk_score or 0)


def _recent_anomaly_contexts(context: CopilotContext) -> list[MachineCopilotContext]:
    return sorted(
        [
            item
            for item in context.machine_contexts.values()
            if item.assessment.anomaly_status in {"warning", "critical"} or item.assessment.anomaly_count > 0
        ],
        key=lambda item: (
            item.assessment.anomaly_status == "critical",
            item.assessment.anomaly_count,
            item.assessment.maintenance_risk_score or 0,
        ),
        reverse=True,
    )


def _target_machines(detected: DetectedIntent, context: CopilotContext) -> list[MachineCopilotContext]:
    return [
        context.machine_contexts[machine_id]
        for machine_id in detected.machine_ids
        if machine_id in context.machine_contexts
    ]


def _supported_examples() -> list[str]:
    return [
        copilot_text("example_summary"),
        copilot_text("example_highest_risk"),
        copilot_text("example_anomalies"),
        copilot_text("example_health"),
        copilot_text("example_compare"),
    ]


def _with_detection_metadata(response: CopilotQueryResponse, detected: DetectedIntent) -> CopilotQueryResponse:
    response.confidence = detected.confidence
    response.low_confidence = detected.below_threshold
    response.extracted_machines = [
        CopilotExtractedMachine(id=machine_id, name=name)
        for machine_id, name in zip(detected.machine_ids, detected.machine_names)
    ]
    return response


def _answer_help() -> CopilotQueryResponse:
    return CopilotQueryResponse(
        answer=copilot_text("help_answer"),
        intent="help",
        severity="info",
        recommendations=[copilot_text("try_example", example=example) for example in _supported_examples()[:3]],
        generated_at=datetime.now(timezone.utc),
    )


def _answer_unknown(detected: DetectedIntent) -> CopilotQueryResponse:
    detail = copilot_text("unknown_low_confidence")
    if not detected.model_available:
        detail = copilot_text("unknown_no_model")
    return CopilotQueryResponse(
        answer=f"{detail} {copilot_text('unknown_suffix')}",
        intent="unknown",
        severity="info",
        confidence=detected.confidence,
        low_confidence=True,
        recommendations=[copilot_text("try_example", example=example) for example in _supported_examples()],
        generated_at=datetime.now(timezone.utc),
    )


def _answer_fablab_summary(context: CopilotContext) -> CopilotQueryResponse:
    fleet = context.fleet
    reservations = context.reservations
    answer = copilot_text(
        "summary_answer",
        total=fleet.total_machines,
        with_telemetry=fleet.with_telemetry,
        normal=fleet.normal_count,
        warning=fleet.warning_count,
        critical=fleet.critical_count,
        pending=reservations.pending,
        today=reservations.today,
    )
    return CopilotQueryResponse(
        answer=answer,
        intent="fablab_summary",
        severity="critical" if fleet.critical_count else "warning" if fleet.warning_count else "info",
        data_points=[
            CopilotDataPoint(label=copilot_text("label_machines"), value=fleet.total_machines, unit=None),
            CopilotDataPoint(label=copilot_text("label_with_telemetry"), value=fleet.with_telemetry, unit=None),
            CopilotDataPoint(label=copilot_text("label_average_health"), value=fleet.average_health_score, unit="%"),
            CopilotDataPoint(label=copilot_text("label_pending_reservations"), value=reservations.pending, unit=None),
        ],
        recommendations=[copilot_text("summary_review_risky")]
        if fleet.warning_count or fleet.critical_count
        else [copilot_text("summary_continue")],
        generated_at=datetime.now(timezone.utc),
    )


def _answer_machine_status(machine_context: MachineCopilotContext) -> CopilotQueryResponse:
    assessment = machine_context.assessment
    answer = copilot_text(
        "machine_status_answer",
        facts=_format_machine_observations(machine_context),
        risk_level=localize_risk_level(assessment.maintenance_risk_level),
    )
    return CopilotQueryResponse(
        answer=answer,
        intent="machine_status",
        machine_id=assessment.machine_id,
        severity=_severity_for_machine(machine_context),
        data_points=_machine_data_points(machine_context),
        recommendations=build_recommendations(machine_context),
        generated_at=datetime.now(timezone.utc),
    )


def _answer_health(machine_context: MachineCopilotContext) -> CopilotQueryResponse:
    assessment = machine_context.assessment
    factors = sorted(assessment.factors, key=lambda item: item.score, reverse=True)
    factor_text = "; ".join(
        copilot_text("health_factor", label=factor.label, score=factor.score, weight=factor.weight)
        for factor in factors[:3]
        if factor.score > 0
    )
    if not factor_text:
        factor_text = copilot_text("health_no_factor")
    answer = copilot_text(
        "health_answer",
        facts=_format_machine_observations(machine_context),
        machine=assessment.machine_name,
        factors=factor_text,
    )
    return CopilotQueryResponse(
        answer=answer,
        intent="explain_machine_health",
        machine_id=assessment.machine_id,
        severity=_severity_for_machine(machine_context),
        data_points=_machine_data_points(machine_context),
        recommendations=build_recommendations(machine_context),
        generated_at=datetime.now(timezone.utc),
    )


def _answer_highest_risk(context: CopilotContext) -> CopilotQueryResponse:
    machine_context = _top_risk_machine(context)
    if machine_context is None:
        return CopilotQueryResponse(
            answer=copilot_text("no_risk_ranking"),
            intent="highest_risk_machine",
            recommendations=[copilot_text("publish_telemetry")],
            generated_at=datetime.now(timezone.utc),
        )

    assessment = machine_context.assessment
    answer = copilot_text(
        "highest_risk_answer",
        machine=assessment.machine_name,
        score=assessment.maintenance_risk_score,
        risk_level=localize_risk_level(assessment.maintenance_risk_level),
        facts=_format_machine_observations(machine_context),
    )
    return CopilotQueryResponse(
        answer=answer,
        intent="highest_risk_machine",
        machine_id=assessment.machine_id,
        severity=_severity_for_machine(machine_context),
        data_points=_machine_data_points(machine_context),
        recommendations=build_recommendations(machine_context),
        generated_at=datetime.now(timezone.utc),
    )


def _answer_compare(targets: list[MachineCopilotContext], context: CopilotContext) -> CopilotQueryResponse:
    if len(targets) < 2:
        ranked = sorted(
            context.machine_contexts.values(),
            key=lambda item: item.assessment.maintenance_risk_score or -1,
            reverse=True,
        )
        targets = ranked[:2]
    if len(targets) < 2:
        return CopilotQueryResponse(
            answer=copilot_text("compare_need_two"),
            intent="compare_machines",
            recommendations=[copilot_text("compare_add_machine")],
            generated_at=datetime.now(timezone.utc),
        )

    first, second = targets[:2]
    answer = copilot_text(
        "compare_answer",
        first=first.assessment.machine_name,
        first_health=first.assessment.health_score,
        first_risk=first.assessment.maintenance_risk_score,
        second=second.assessment.machine_name,
        second_health=second.assessment.health_score,
        second_risk=second.assessment.maintenance_risk_score,
    )
    more_severe = max([first, second], key=lambda item: item.assessment.maintenance_risk_score or 0)
    return CopilotQueryResponse(
        answer=answer,
        intent="compare_machines",
        machine_id=more_severe.assessment.machine_id,
        severity=_severity_for_machine(more_severe),
        data_points=[
            CopilotDataPoint(label=copilot_text("label_machine_health", machine=first.assessment.machine_name), value=first.assessment.health_score, unit="%"),
            CopilotDataPoint(label=copilot_text("label_machine_health", machine=second.assessment.machine_name), value=second.assessment.health_score, unit="%"),
            CopilotDataPoint(label=copilot_text("label_machine_risk", machine=first.assessment.machine_name), value=first.assessment.maintenance_risk_score, unit="/100"),
            CopilotDataPoint(label=copilot_text("label_machine_risk", machine=second.assessment.machine_name), value=second.assessment.maintenance_risk_score, unit="/100"),
        ],
        recommendations=build_recommendations(more_severe),
        generated_at=datetime.now(timezone.utc),
    )


def _answer_recent_anomalies(context: CopilotContext) -> CopilotQueryResponse:
    anomaly_contexts = _recent_anomaly_contexts(context)
    if not anomaly_contexts:
        return CopilotQueryResponse(
            answer=copilot_text("no_recent_anomalies"),
            intent="recent_anomalies",
            recommendations=[copilot_text("continue_collecting")],
            generated_at=datetime.now(timezone.utc),
        )

    names = ", ".join(item.assessment.machine_name for item in anomaly_contexts[:4])
    answer = copilot_text("recent_anomalies_answer", names=names)
    return CopilotQueryResponse(
        answer=answer,
        intent="recent_anomalies",
        machine_id=anomaly_contexts[0].assessment.machine_id,
        severity=_severity_for_machine(anomaly_contexts[0]),
        data_points=[
            CopilotDataPoint(label=item.assessment.machine_name, value=item.assessment.anomaly_count, unit=copilot_text("unit_anomalies"))
            for item in anomaly_contexts[:5]
        ],
        recommendations=build_recommendations(anomaly_contexts[0]),
        generated_at=datetime.now(timezone.utc),
    )


def _answer_maintenance(targets: list[MachineCopilotContext], context: CopilotContext) -> CopilotQueryResponse:
    machine_context = targets[0] if targets else _top_risk_machine(context)
    if machine_context is None:
        return CopilotQueryResponse(
            answer=copilot_text("no_maintenance_recommendation"),
            intent="maintenance_recommendation",
            recommendations=[copilot_text("collect_telemetry")],
            generated_at=datetime.now(timezone.utc),
        )

    recommendations = build_recommendations(machine_context)
    return CopilotQueryResponse(
        answer=copilot_text(
            "maintenance_answer",
            facts=_format_machine_observations(machine_context),
            action=recommendations[0],
        ),
        intent="maintenance_recommendation",
        machine_id=machine_context.assessment.machine_id,
        severity=_severity_for_machine(machine_context),
        data_points=_machine_data_points(machine_context),
        recommendations=recommendations,
        generated_at=datetime.now(timezone.utc),
    )


def _answer_reservations(context: CopilotContext) -> CopilotQueryResponse:
    reservations = context.reservations
    return CopilotQueryResponse(
        answer=copilot_text(
            "reservation_answer",
            total=reservations.total,
            pending=reservations.pending,
            approved=reservations.approved,
            today=reservations.today,
        ),
        intent="reservation_summary",
        severity="warning" if reservations.pending else "info",
        data_points=[
            CopilotDataPoint(label=copilot_text("label_pending"), value=reservations.pending, unit=None),
            CopilotDataPoint(label=copilot_text("label_approved"), value=reservations.approved, unit=None),
            CopilotDataPoint(label=copilot_text("label_rejected"), value=reservations.rejected, unit=None),
            CopilotDataPoint(label=copilot_text("label_today"), value=reservations.today, unit=None),
        ],
        recommendations=[copilot_text("review_pending")]
        if reservations.pending
        else [copilot_text("no_pending_action")],
        generated_at=datetime.now(timezone.utc),
    )


def answer_copilot_query(message: str, session: Session) -> CopilotQueryResponse:
    normalized = message.strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=copilot_text("empty_message"))

    context = build_copilot_context(session)
    detected = detect_intent(normalized, context.machines)
    targets = _target_machines(detected, context)

    logger.info("Admin copilot query intent=%s machine_count=%s", detected.intent, len(targets))

    if detected.intent == "unknown":
        return _with_detection_metadata(_answer_unknown(detected), detected)

    if detected.unknown_machine_reference and not targets:
        return _with_detection_metadata(
            _machine_not_found_response(detected.unknown_machine_reference, detected.intent),
            detected,
        )

    if detected.intent == "fablab_summary":
        return _with_detection_metadata(_answer_fablab_summary(context), detected)
    if detected.intent == "machine_status":
        if not targets:
            return _with_detection_metadata(_answer_highest_risk(context), detected)
        return _with_detection_metadata(_answer_machine_status(targets[0]), detected)
    if detected.intent == "explain_machine_health":
        if not targets:
            return _with_detection_metadata(_machine_not_found_response(None, detected.intent), detected)
        return _with_detection_metadata(_answer_health(targets[0]), detected)
    if detected.intent == "highest_risk_machine":
        return _with_detection_metadata(_answer_highest_risk(context), detected)
    if detected.intent == "compare_machines":
        return _with_detection_metadata(_answer_compare(targets, context), detected)
    if detected.intent == "recent_anomalies":
        return _with_detection_metadata(_answer_recent_anomalies(context), detected)
    if detected.intent == "maintenance_recommendation":
        return _with_detection_metadata(_answer_maintenance(targets, context), detected)
    if detected.intent == "reservation_summary":
        return _with_detection_metadata(_answer_reservations(context), detected)
    return _with_detection_metadata(_answer_help(), detected)
