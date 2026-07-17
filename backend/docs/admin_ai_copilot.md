# Admin AI Maintenance Copilot

## Purpose

The Admin AI Maintenance Copilot is an MVP decision-support assistant for the Virtual FabLab admin dashboard. It answers questions about machine telemetry, anomaly status, health scores, maintenance risk, and reservation activity.

Telemetry in this project may be simulated. Copilot recommendations are decision-support outputs, not validated industrial diagnoses.

## Endpoint

`POST /admin/ai/copilot/query`

Request:

```json
{
  "message": "Why is CNC_1 unhealthy?"
}
```

Response:

```json
{
  "answer": "Observed facts...",
  "intent": "explain_machine_health",
  "machine_id": 2,
  "severity": "warning",
  "confidence": 0.73,
  "low_confidence": false,
  "extracted_machines": [{ "id": 2, "name": "CNC_1" }],
  "data_points": [{ "label": "Health score", "value": 64, "unit": "%" }],
  "recommendations": ["Plan a preventive inspection before extended student use."],
  "generated_at": "2026-07-15T12:00:00Z"
}
```

## Supported Questions

- Summarize the FabLab.
- Summarize today's activity.
- Which machine has the highest risk?
- Which machine is unhealthy?
- Why is CNC_1 unhealthy?
- What happened to Printer_1?
- Compare CNC_1 and Printer_1.
- Show recent anomalies.
- What maintenance action is recommended?
- Summarize pending reservations.
- What can you do?

## Architecture

- `app.schemas.ai`: request and response contracts.
- `app.routes.ai`: admin-only copilot API route.
- `app.services.copilot_intent_classifier`: supervised NLP intent classification.
- `app.services.copilot_entity_extraction`: deterministic machine-name/entity extraction from database machines.
- `app.services.copilot_intents`: combines model prediction and extracted entities.
- `app.services.copilot_context`: bounded database context retrieval.
- `app.services.copilot_analytics`: reusable telemetry summaries and trends.
- `app.services.copilot_recommendations`: conservative rule-based recommendations.
- `app.services.copilot_service`: answer generation and optional LLM interface.

The copilot reuses `PredictiveMaintenanceService` for existing health scores, anomaly status, risk scores, and model/fallback recommendations. It does not duplicate the core health-score implementation.

The Copilot combines:

1. Isolation Forest and existing predictive services for machine anomaly detection.
2. Supervised NLP classification for understanding admin questions.
3. Telemetry analytics for contextual evidence.
4. Deterministic grounded generation for reliable answers.

## NLP Intent Model

The intent classifier is trained from `backend/data/copilot_intent_training.jsonl`. The training script is:

```bash
cd backend
.venv/bin/python scripts/train_copilot_intent_model.py
```

The script uses:

- Unicode-aware text normalization through `TfidfVectorizer`.
- TF-IDF word n-grams.
- Logistic Regression.
- Stratified train/validation/test splitting.
- Metrics: accuracy, macro precision, macro recall, macro F1-score, confusion matrix, and per-class classification report.
- Joblib persistence of the full TF-IDF + classifier pipeline.

Artifacts:

- `backend/ml_models/copilot_intent_classifier.joblib`
- `backend/ml_models/copilot_intent_classifier_report.json`

The current model report is generated from a small MVP dataset, so metrics are useful as a smoke evaluation rather than a production-quality NLP benchmark. The model uses a confidence threshold; low-confidence questions become `unknown` and return supported examples instead of guessing.

## Security

The route is mounted under `/admin/ai` and uses the existing `require_admin` dependency. The user role is loaded from the validated JWT subject and database user record. Frontend-sent role values are ignored.

Messages are validated with a 500-character limit. Copilot messages are treated only as analytical questions; they cannot execute SQL, shell commands, Python code, file access, or arbitrary API calls.

## Deterministic Grounding

Intent detection uses the supervised NLP model. Regular expressions are used only for entity extraction, such as matching machine names or identifiers against machines loaded from the database. No paid external LLM API is required.

An optional future LLM provider can be added by implementing the `OptionalLLMProvider` interface in `copilot_service.py` to refine already-grounded answers. Any future provider should receive only sanitized, minimal context and must not replace backend authorization or database grounding.

## Limitations

- No permanent conversation memory is stored.
- Responses are independent per request.
- The copilot does not diagnose specific defective parts unless such diagnosis exists in the database.
- Recommendations are conservative and should be verified by a human admin.
