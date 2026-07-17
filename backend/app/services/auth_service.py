from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session, select

from app.core.security import create_access_token, get_password_hash, safe_decode_token, verify_password
from app.db import get_session
from app.models.user import User, UserRole
from app.schemas.auth import AuthUser, PasswordChangeRequest, ProfileUpdateRequest, TokenResponse
from app.schemas.user import UserCreate

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def register_user(payload: UserCreate, session: Session) -> User:
    existing = session.exec(select(User).where(User.email == payload.email)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")

    user = User(
        full_name=payload.full_name,
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        role=UserRole.STUDENT,
        is_active=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def login_user(email: str, password: str, session: Session) -> TokenResponse:
    user = session.exec(select(User).where(User.email == email)).first()
    if user is None or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")

    token = create_access_token(subject=str(user.id))
    return TokenResponse(access_token=token)


def update_current_user_profile(current_user: User, payload: ProfileUpdateRequest, session: Session) -> User:
    normalized_email = payload.email.strip().lower()
    existing = session.exec(select(User).where(User.email == normalized_email, User.id != current_user.id)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")

    current_user.full_name = payload.full_name.strip()
    current_user.email = normalized_email
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user


def change_current_user_password(current_user: User, payload: PasswordChangeRequest, session: Session) -> None:
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    if payload.new_password != payload.confirm_new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New passwords do not match")
    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password",
        )

    current_user.hashed_password = get_password_hash(payload.new_password)
    session.add(current_user)
    session.commit()


def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )

    payload = safe_decode_token(token)
    if payload is None:
        raise credentials_exception

    user_id_raw = payload.get("sub")
    if user_id_raw is None:
        raise credentials_exception

    try:
        user_id = int(user_id_raw)
    except ValueError as exc:
        raise credentials_exception from exc

    user = session.get(User, user_id)
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return current_user


def to_auth_user(user: User) -> AuthUser:
    return AuthUser(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
    )
