from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone

from sqlmodel import Session

from app.core.config import settings
from app.db import engine
from app.services.ml_model_service import ml_model_service
from app.services.telemetry_service import ingest_sensor_payload, parse_sensor_payload

try:
    import paho.mqtt.client as mqtt
except Exception:  # pragma: no cover
    mqtt = None

logger = logging.getLogger(__name__)


class MQTTSubscriberService:
    def __init__(self) -> None:
        self._client: mqtt.Client | None = None  # type: ignore[valid-type]
        self._thread: threading.Thread | None = None
        self._started = False
        self._connected = False
        self._last_error: str | None = None
        self._last_message_at: datetime | None = None
        self._message_count = 0

    def start(self) -> None:
        if self._started or not settings.mqtt_enabled or mqtt is None:
            if mqtt is None:
                self._last_error = "paho-mqtt is not installed"
            return
        self._started = True

        client = mqtt.Client()
        self._client = client
        client.on_connect = self._on_connect
        client.on_message = self._on_message

        try:
            client.connect(settings.mqtt_host, settings.mqtt_port, keepalive=60)
        except Exception as exc:  # pragma: no cover
            self._connected = False
            self._last_error = str(exc)
            logger.warning("MQTT connection failed: %s", exc)
            return

        self._thread = threading.Thread(target=client.loop_forever, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        if self._client is not None:
            self._client.disconnect()
        self._started = False
        self._connected = False

    def status(self) -> dict:
        return {
            "enabled": settings.mqtt_enabled,
            "started": self._started,
            "connected": self._connected,
            "broker_host": settings.mqtt_host,
            "broker_port": settings.mqtt_port,
            "topic_pattern": settings.mqtt_topic_pattern,
            "last_error": self._last_error,
            "last_message_at": self._last_message_at,
            "message_count": self._message_count,
        }

    def _on_connect(self, client, _userdata, _flags, rc) -> None:  # type: ignore[no-untyped-def]
        if rc == 0:
            self._connected = True
            self._last_error = None
            client.subscribe(settings.mqtt_topic_pattern)
        else:  # pragma: no cover
            self._connected = False
            self._last_error = f"MQTT connect returned code {rc}"
            logger.warning("MQTT connect returned code %s", rc)

    def _on_message(self, _client, _userdata, msg) -> None:  # type: ignore[no-untyped-def]
        payload_text = msg.payload.decode("utf-8", errors="ignore")
        payload = parse_sensor_payload(payload_text)
        if payload is None:
            logger.debug("Invalid MQTT payload ignored: %s", payload_text)
            return
        with Session(engine) as session:
            reading = ingest_sensor_payload(payload, session)
            if reading is not None:
                try:
                    prediction = ml_model_service.predict_from_reading(reading)
                    logger.info("MQTT ML prediction for %s: %s", payload.machine_id, prediction.as_dict())
                except Exception as exc:  # pragma: no cover - MQTT must stay resilient
                    logger.debug("MQTT ML prediction skipped: %s", exc)
        self._last_message_at = datetime.now(timezone.utc)
        self._message_count += 1
