from pydantic import EmailStr, TypeAdapter

from app.core.config import settings

email_adapter = TypeAdapter(EmailStr)


def normalize_email(value: str) -> str:
    return str(email_adapter.validate_python(value.strip().lower()))


def normalize_email_for_lookup(value: str) -> str:
    return value.strip().lower()


def is_institutional_student_email(email: str) -> bool:
    domain = normalize_email_for_lookup(email).rsplit("@", 1)[-1]
    return domain == settings.student_email_domain.lower()
