from __future__ import annotations

import unittest

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.models.user import User, UserRole
from app.schemas.user import UserCreate
from app.services.auth_service import login_user, register_user


class AuthRegistrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)

    def _register(self, email: str, **extra: object) -> User:
        payload = UserCreate.model_validate(
            {
                "full_name": "Student User",
                "email": email,
                "password": "secret123",
                **extra,
            }
        )
        with Session(self.engine) as session:
            return register_user(payload, session)

    def _saved_user(self, email: str) -> User | None:
        with Session(self.engine) as session:
            return session.exec(select(User).where(User.email == email)).first()

    def _assert_registration_rejected(self, email: str, expected_status: int = 422) -> None:
        payload = UserCreate.model_validate(
            {
                "full_name": "Student User",
                "email": email,
                "password": "secret123",
            }
        )
        with Session(self.engine) as session:
            with self.assertRaises(HTTPException) as exc:
                register_user(payload, session)
        self.assertEqual(exc.exception.status_code, expected_status)

    def test_institutional_student_email_succeeds(self) -> None:
        user = self._register("student@usms.ac.ma")

        self.assertEqual(user.email, "student@usms.ac.ma")
        self.assertEqual(user.role, UserRole.STUDENT)

    def test_uppercase_institutional_email_is_normalized_and_accepted(self) -> None:
        user = self._register("STUDENT@USMS.AC.MA")

        self.assertEqual(user.email, "student@usms.ac.ma")
        self.assertIsNotNone(self._saved_user("student@usms.ac.ma"))

    def test_surrounding_spaces_are_normalized(self) -> None:
        user = self._register("  spaced@usms.ac.ma  ")

        self.assertEqual(user.email, "spaced@usms.ac.ma")
        self.assertIsNotNone(self._saved_user("spaced@usms.ac.ma"))

    def test_gmail_address_is_rejected(self) -> None:
        self._assert_registration_rejected("student@gmail.com")

    def test_similar_suffix_domain_is_rejected(self) -> None:
        self._assert_registration_rejected("student@usms.ac.ma.fake.org")

    def test_fake_usms_domain_is_rejected(self) -> None:
        self._assert_registration_rejected("student@fakeusms.ac.ma")

    def test_invalid_email_format_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            UserCreate.model_validate(
                {
                    "full_name": "Student User",
                    "email": "not-an-email",
                    "password": "secret123",
                }
            )

    def test_duplicate_institutional_email_is_rejected(self) -> None:
        self._register("duplicate@usms.ac.ma")

        self._assert_registration_rejected("DUPLICATE@USMS.AC.MA", expected_status=400)

    def test_public_registration_cannot_assign_admin_role(self) -> None:
        user = self._register("role-check@usms.ac.ma", role="admin")

        self.assertEqual(user.role, UserRole.STUDENT)

    def test_login_works_after_registration_with_normalized_email(self) -> None:
        self._register("  LOGIN@USMS.AC.MA  ")
        with Session(self.engine) as session:
            token_response = login_user("login@usms.ac.ma", "secret123", session)

        self.assertEqual(token_response.token_type, "bearer")
        self.assertTrue(token_response.access_token)


if __name__ == "__main__":
    unittest.main()
