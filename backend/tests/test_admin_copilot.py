from __future__ import annotations

import unittest
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.core.security import create_access_token
from app.db import get_session
from app.models.machine import Machine, MachineStatus, MachineType
from app.models.reservation import Reservation, ReservationStatus
from app.models.sensor import MachineSensorReading
from app.models.user import User, UserRole
from app.services.auth_service import get_current_user, require_admin
from app.services.copilot_entity_extraction import extract_entities
from app.services.copilot_intent_classifier import CopilotIntentClassifier, DEFAULT_MODEL_PATH
from app.services.copilot_service import answer_copilot_query
from app.routes.ai import router as ai_router


class AdminCopilotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(cls.engine)

        cls._seed_database()

    @classmethod
    def tearDownClass(cls) -> None:
        pass

    @classmethod
    def _seed_database(cls) -> None:
        with Session(cls.engine) as session:
            printer_type = MachineType(code="3D_PRINTER", name="3D Printer", model_path="/printer.glb")
            cnc_type = MachineType(code="CNC", name="CNC Router", model_path="/cnc.glb")
            session.add(printer_type)
            session.add(cnc_type)
            session.commit()
            session.refresh(printer_type)
            session.refresh(cnc_type)

            admin = User(
                full_name="Admin",
                email="admin@example.com",
                hashed_password="not-used-in-copilot-tests",
                role=UserRole.ADMIN,
            )
            student = User(
                full_name="Student",
                email="student@example.com",
                hashed_password="not-used-in-copilot-tests",
                role=UserRole.STUDENT,
            )
            cnc = Machine(
                name="CNC_1",
                machine_type_id=cnc_type.id,
                status=MachineStatus.AVAILABLE,
            )
            printer = Machine(
                name="Printer_1",
                machine_type_id=printer_type.id,
                status=MachineStatus.AVAILABLE,
            )
            session.add(admin)
            session.add(student)
            session.add(cnc)
            session.add(printer)
            session.commit()
            session.refresh(admin)
            session.refresh(student)
            session.refresh(cnc)
            session.refresh(printer)
            cls.admin_token = create_access_token(str(admin.id))
            cls.student_token = create_access_token(str(student.id))
            cls.cnc_id = cnc.id
            cls.printer_id = printer.id
            now = datetime.now(timezone.utc)

            for index in range(12):
                session.add(
                    MachineSensorReading(
                        machine_id=cnc.id,  # type: ignore[arg-type]
                        temperature=58 + index * 1.5,
                        vibration=1.2 + index * 0.18,
                        motor_speed=2500 + (index % 3) * 220,
                        usage_duration=300 + index * 12,
                        error="E_STOP" if index in {9, 11} else None,
                        sensor_timestamp=now - timedelta(minutes=12 - index),
                    )
                )
                session.add(
                    MachineSensorReading(
                        machine_id=printer.id,  # type: ignore[arg-type]
                        temperature=205 + index * 0.4,
                        vibration=0.35 + index * 0.01,
                        motor_speed=1500 + (index % 2) * 10,
                        usage_duration=90 + index,
                        error=None,
                        sensor_timestamp=now - timedelta(minutes=12 - index),
                    )
                )

            session.add(
                Reservation(
                    user_id=student.id,  # type: ignore[arg-type]
                    machine_id=cnc.id,  # type: ignore[arg-type]
                    date=date.today(),
                    start_time=time(9, 0),
                    end_time=time(10, 0),
                    status=ReservationStatus.PENDING,
                )
            )
            session.commit()

    def _query(self, message: str):
        with Session(self.engine) as session:
            return answer_copilot_query(message, session)

    def test_route_is_registered(self) -> None:
        paths = {route.path for route in ai_router.routes}
        self.assertIn("/admin/ai/copilot/query", paths)
        self.assertIn("/admin/ai/copilot", paths)

    def test_unauthorized_request(self) -> None:
        with Session(self.engine) as session:
            with self.assertRaises(HTTPException) as exc:
                get_current_user(token="invalid-token", session=session)
        self.assertEqual(exc.exception.status_code, 401)

    def test_student_receives_403(self) -> None:
        with Session(self.engine) as session:
            student = get_current_user(token=self.student_token, session=session)
            with self.assertRaises(HTTPException) as exc:
                require_admin(student)
        self.assertEqual(exc.exception.status_code, 403)

    def test_admin_successful_request(self) -> None:
        with Session(self.engine) as session:
            admin = get_current_user(token=self.admin_token, session=session)
            self.assertEqual(require_admin(admin).role, UserRole.ADMIN)
            response = answer_copilot_query("Summarize the FabLab", session)
        self.assertEqual(response.intent, "fablab_summary")

    def test_empty_question(self) -> None:
        with Session(self.engine) as session:
            with self.assertRaises(HTTPException) as exc:
                answer_copilot_query("", session)
        self.assertEqual(exc.exception.status_code, 422)

    def test_unsupported_question_falls_back_to_help(self) -> None:
        response = self._query("Tell me a joke")
        self.assertEqual(response.intent, "unknown")

    def test_machine_not_found(self) -> None:
        response = self._query("Explain CNC-99 health")
        self.assertEqual(response.severity, "warning")
        self.assertIn("je n'ai pas trouvé", response.answer.lower())

    def test_health_explanation(self) -> None:
        response = self._query("Why is CNC_1 unhealthy?")
        self.assertEqual(response.intent, "explain_machine_health")
        self.assertEqual(response.machine_id, self.cnc_id)
        self.assertTrue(response.data_points)

    def test_highest_risk_machine(self) -> None:
        response = self._query("Which machine has the highest risk?")
        self.assertEqual(response.intent, "highest_risk_machine")

    def test_machine_comparison(self) -> None:
        response = self._query("Compare CNC_1 and Printer_1")
        self.assertEqual(response.intent, "compare_machines")
        self.assertGreaterEqual(len(response.data_points), 4)

    def test_recent_anomaly_summary(self) -> None:
        response = self._query("Show recent anomalies")
        self.assertEqual(response.intent, "recent_anomalies")

    def test_maintenance_recommendation(self) -> None:
        response = self._query("What maintenance action is recommended for CNC_1?")
        self.assertEqual(response.intent, "maintenance_recommendation")
        self.assertTrue(response.recommendations)

    def test_classifier_predicts_each_supported_intent(self) -> None:
        classifier = CopilotIntentClassifier()
        examples = {
            "fablab_summary": "Quel est l etat global du FabLab",
            "machine_status": "What is the status of CNC_1?",
            "explain_machine_health": "Why is CNC_1 unhealthy?",
            "highest_risk_machine": "Which machine has the highest risk?",
            "compare_machines": "Compare CNC_1 and Printer_1",
            "recent_anomalies": "Show recent anomalies",
            "maintenance_recommendation": "What maintenance action is recommended?",
            "reservation_summary": "Summarize pending reservations",
            "help": "What can you do?",
            "unknown": "Tell me a joke",
        }
        for expected_intent, question in examples.items():
            with self.subTest(intent=expected_intent):
                prediction = classifier.predict(question)
                self.assertEqual(prediction.predicted_intent, expected_intent)
                self.assertTrue(prediction.model_available)

    def test_french_questions(self) -> None:
        classifier = CopilotIntentClassifier()
        self.assertEqual(
            classifier.predict("Quel est l etat global du FabLab").predicted_intent,
            "fablab_summary",
        )
        self.assertEqual(
            classifier.predict("Y a-t-il des alertes anormales ?").predicted_intent,
            "recent_anomalies",
        )

    def test_low_confidence_unknown_question(self) -> None:
        prediction = CopilotIntentClassifier().predict("asdf qwer zxcv unrelated")
        self.assertEqual(prediction.predicted_intent, "unknown")
        self.assertTrue(prediction.below_threshold)

    def test_model_artifact_loading(self) -> None:
        classifier = CopilotIntentClassifier(DEFAULT_MODEL_PATH)
        self.assertTrue(classifier.load(force=True))
        self.assertIsNone(classifier.last_error)

    def test_missing_artifact_behavior(self) -> None:
        classifier = CopilotIntentClassifier(Path("/tmp/missing-copilot-intent-model.joblib"))
        prediction = classifier.predict("Summarize the FabLab")
        self.assertEqual(prediction.predicted_intent, "unknown")
        self.assertFalse(prediction.model_available)
        self.assertTrue(prediction.below_threshold)

    def test_machine_name_extraction(self) -> None:
        with Session(self.engine) as session:
            machines = list(session.exec(select(Machine)).all())
        result = extract_entities("Compare CNC_1 and Printer_1", machines)
        self.assertEqual([machine.name for machine in result.machines], ["CNC_1", "Printer_1"])

    def test_no_unsupported_diagnosis_generation(self) -> None:
        response = self._query("Is the spindle broken on CNC_1?")
        answer_text = " ".join([response.answer, *response.recommendations]).lower()
        forbidden_claims = [
            "bearing is defective",
            "motor is defective",
            "spindle is defective",
            "nozzle is defective",
            "sensor is defective",
            "spindle broken",
        ]
        for claim in forbidden_claims:
            self.assertNotIn(claim, answer_text)


if __name__ == "__main__":
    unittest.main()
