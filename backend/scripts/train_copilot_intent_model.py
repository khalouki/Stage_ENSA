from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, precision_recall_fscore_support
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline


BASE_DIR = Path(__file__).resolve().parents[1]
DATASET_PATH = BASE_DIR / "data" / "copilot_intent_training.jsonl"
MODEL_PATH = BASE_DIR / "ml_models" / "copilot_intent_classifier.joblib"
REPORT_PATH = BASE_DIR / "ml_models" / "copilot_intent_classifier_report.json"
RANDOM_STATE = 42


def load_dataset(path: Path) -> tuple[list[str], list[str]]:
    texts: list[str] = []
    labels: list[str] = []
    with path.open("r", encoding="utf-8") as file:
        for line_number, line in enumerate(file, start=1):
            if not line.strip():
                continue
            item = json.loads(line)
            text = str(item["text"]).strip()
            intent = str(item["intent"]).strip()
            if not text or not intent:
                raise ValueError(f"Invalid row at line {line_number}")
            texts.append(text)
            labels.append(intent)
    return texts, labels


def build_pipeline() -> Pipeline:
    return Pipeline(
        steps=[
            (
                "tfidf",
                TfidfVectorizer(
                    strip_accents="unicode",
                    lowercase=True,
                    ngram_range=(1, 2),
                    min_df=1,
                    sublinear_tf=True,
                    token_pattern=r"(?u)\b[#\w][#\w]+\b",
                ),
            ),
            (
                "classifier",
                LogisticRegression(
                    max_iter=1000,
                    class_weight="balanced",
                    solver="lbfgs",
                    C=4.0,
                    random_state=RANDOM_STATE,
                ),
            ),
        ]
    )


def evaluate(model: Pipeline, texts: list[str], labels: list[str]) -> dict[str, Any]:
    predictions = model.predict(texts)
    accuracy = accuracy_score(labels, predictions)
    precision, recall, macro_f1, _ = precision_recall_fscore_support(
        labels,
        predictions,
        average="macro",
        zero_division=0,
    )
    class_names = sorted(set(labels) | set(predictions))
    return {
        "accuracy": round(float(accuracy), 4),
        "precision_macro": round(float(precision), 4),
        "recall_macro": round(float(recall), 4),
        "macro_f1": round(float(macro_f1), 4),
        "labels": class_names,
        "confusion_matrix": confusion_matrix(labels, predictions, labels=class_names).tolist(),
        "classification_report": classification_report(labels, predictions, labels=class_names, zero_division=0, output_dict=True),
    }


def main() -> None:
    texts, labels = load_dataset(DATASET_PATH)
    train_texts, holdout_texts, train_labels, holdout_labels = train_test_split(
        texts,
        labels,
        test_size=0.30,
        random_state=RANDOM_STATE,
        stratify=labels,
    )
    validation_texts, test_texts, validation_labels, test_labels = train_test_split(
        holdout_texts,
        holdout_labels,
        test_size=0.50,
        random_state=RANDOM_STATE,
        stratify=holdout_labels,
    )

    pipeline = build_pipeline()
    pipeline.fit(train_texts, train_labels)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset_path": str(DATASET_PATH),
        "model_path": str(MODEL_PATH),
        "random_state": RANDOM_STATE,
        "split_sizes": {
            "train": len(train_texts),
            "validation": len(validation_texts),
            "test": len(test_texts),
        },
        "validation": evaluate(pipeline, validation_texts, validation_labels),
        "test": evaluate(pipeline, test_texts, test_labels),
    }

    artifact = {
        "pipeline": pipeline,
        "labels": sorted(set(labels)),
        "acceptance_threshold": 0.20,
        "unknown_intent": "unknown",
        "normalizer": "tfidf_strip_accents_unicode_lowercase_word_ngrams",
        "report": report,
    }

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, MODEL_PATH)
    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
