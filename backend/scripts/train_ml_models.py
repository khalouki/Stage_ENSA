from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
MODEL_DIR = BASE_DIR / "ml_models"
EXISTING_CSV = DATA_DIR / "machine_telemetry_demo.csv"
GENERATED_CSV = DATA_DIR / "generated_machine_telemetry.csv"
ANOMALY_MODEL_PATH = MODEL_DIR / "anomaly_isolation_forest.joblib"
MAINTENANCE_MODEL_PATH = MODEL_DIR / "maintenance_random_forest.joblib"
METADATA_PATH = MODEL_DIR / "metadata.json"

FEATURE_NAMES = ["temperature", "vibration", "usage_hours", "motor_speed", "has_error"]
LABELS = ["normal", "monitor", "maintenance_soon", "critical"]


def generate_synthetic_data(rows_per_label: int = 450) -> pd.DataFrame:
    rng = np.random.default_rng(42)
    frames: list[pd.DataFrame] = []
    specs = {
        "normal": {
            "temperature": (38, 8),
            "vibration": (0.45, 0.18),
            "usage_hours": (90, 55),
            "motor_speed": (1350, 420),
            "has_error": 0.03,
        },
        "monitor": {
            "temperature": (58, 9),
            "vibration": (1.05, 0.35),
            "usage_hours": (230, 75),
            "motor_speed": (2100, 450),
            "has_error": 0.1,
        },
        "maintenance_soon": {
            "temperature": (72, 8),
            "vibration": (1.9, 0.45),
            "usage_hours": (390, 80),
            "motor_speed": (2800, 440),
            "has_error": 0.28,
        },
        "critical": {
            "temperature": (88, 9),
            "vibration": (3.2, 0.75),
            "usage_hours": (560, 120),
            "motor_speed": (3550, 520),
            "has_error": 0.55,
        },
    }

    for label, spec in specs.items():
        frame = pd.DataFrame(
            {
                "temperature": np.clip(rng.normal(spec["temperature"][0], spec["temperature"][1], rows_per_label), 15, 120),
                "vibration": np.clip(rng.normal(spec["vibration"][0], spec["vibration"][1], rows_per_label), 0, 8),
                "usage_hours": np.clip(rng.normal(spec["usage_hours"][0], spec["usage_hours"][1], rows_per_label), 0, 900),
                "motor_speed": np.clip(rng.normal(spec["motor_speed"][0], spec["motor_speed"][1], rows_per_label), 0, 5000),
                "has_error": (rng.random(rows_per_label) < spec["has_error"]).astype(int),
                "maintenance_label": label,
            }
        )
        frame["usage_duration"] = (frame["usage_hours"] * 60).round().astype(int)
        frame["error"] = np.where(frame["has_error"] == 1, "synthetic_warning", "")
        frames.append(frame)

    return pd.concat(frames, ignore_index=True)


def load_existing_data() -> pd.DataFrame:
    if not EXISTING_CSV.exists():
        return pd.DataFrame()
    existing = pd.read_csv(EXISTING_CSV)
    rename_map = {"speed": "motor_speed"}
    existing = existing.rename(columns=rename_map)
    if "usage_duration" not in existing.columns:
        existing["usage_duration"] = np.linspace(30, 720, len(existing)).astype(int)
    if "error" not in existing.columns:
        status = existing.get("status", pd.Series(["available"] * len(existing)))
        existing["error"] = np.where(status.astype(str).isin(["maintenance", "offline"]), "status_warning", "")
    return normalize_frame(existing)


def normalize_frame(frame: pd.DataFrame) -> pd.DataFrame:
    data = frame.copy()
    for column in ["temperature", "vibration", "motor_speed", "usage_duration"]:
        if column not in data.columns:
            data[column] = 0
        data[column] = pd.to_numeric(data[column], errors="coerce").fillna(0)

    data["has_error"] = data.get("error", "").fillna("").astype(str).str.len().gt(0).astype(int)
    data["usage_hours"] = data["usage_duration"] / 60.0
    if "maintenance_label" not in data.columns:
        data["maintenance_label"] = data.apply(label_from_row, axis=1)
    return data[FEATURE_NAMES + ["usage_duration", "error", "maintenance_label"]]


def label_from_row(row: pd.Series) -> str:
    score = 0
    score += 1 if row["temperature"] >= 58 else 0
    score += 1 if row["temperature"] >= 72 else 0
    score += 1 if row["vibration"] >= 1.2 else 0
    score += 1 if row["vibration"] >= 2.2 else 0
    score += 1 if row["usage_hours"] >= 320 else 0
    score += 1 if row["motor_speed"] >= 2800 else 0
    score += 1 if row["has_error"] else 0
    if score >= 5:
        return "critical"
    if score >= 3:
        return "maintenance_soon"
    if score >= 1:
        return "monitor"
    return "normal"


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    synthetic = generate_synthetic_data()
    existing = load_existing_data()
    training_data = pd.concat([synthetic, existing], ignore_index=True)
    training_data = normalize_frame(training_data)
    training_data.to_csv(GENERATED_CSV, index=False)

    x = training_data[FEATURE_NAMES]
    y = training_data["maintenance_label"]
    x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.22, random_state=42, stratify=y)

    normal_x = x_train[y_train == "normal"]
    anomaly_model = IsolationForest(n_estimators=180, contamination=0.18, random_state=42)
    anomaly_model.fit(normal_x)

    maintenance_model = RandomForestClassifier(n_estimators=220, class_weight="balanced", random_state=42)
    maintenance_model.fit(x_train, y_train)

    predictions = maintenance_model.predict(x_test)
    report = classification_report(y_test, predictions, labels=LABELS, zero_division=0)

    joblib.dump(anomaly_model, ANOMALY_MODEL_PATH)
    joblib.dump(maintenance_model, MAINTENANCE_MODEL_PATH)
    METADATA_PATH.write_text(
        json.dumps(
            {
                "trained_at": datetime.now(timezone.utc).isoformat(),
                "feature_names": FEATURE_NAMES,
                "labels": LABELS,
                "rows": int(len(training_data)),
                "source_files": [str(EXISTING_CSV), str(GENERATED_CSV)],
                "models": {
                    "anomaly": "IsolationForest",
                    "maintenance": "RandomForestClassifier",
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print("Saved generated dataset:", GENERATED_CSV)
    print("Saved anomaly model:", ANOMALY_MODEL_PATH)
    print("Saved maintenance model:", MAINTENANCE_MODEL_PATH)
    print("Saved metadata:", METADATA_PATH)
    print("\nRandomForest classification report:\n")
    print(report)


if __name__ == "__main__":
    main()
