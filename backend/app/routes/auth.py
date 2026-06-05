from fastapi import APIRouter, Depends, Response, status
from sqlmodel import Session

from app.db import get_session
from app.schemas.auth import AuthUser, LoginRequest, PasswordChangeRequest, ProfileUpdateRequest, TokenResponse
from app.schemas.user import UserCreate
from app.services.auth_service import (
    change_current_user_password,
    get_current_user,
    login_user,
    register_user,
    to_auth_user,
    update_current_user_profile,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthUser)
def register(payload: UserCreate, session: Session = Depends(get_session)) -> AuthUser:
    user = register_user(payload, session)
    return to_auth_user(user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, session: Session = Depends(get_session)) -> TokenResponse:
    return login_user(payload.email, payload.password, session)


@router.get("/me", response_model=AuthUser)
def me(current_user=Depends(get_current_user)) -> AuthUser:
    return to_auth_user(current_user)


@router.put("/me", response_model=AuthUser)
def update_me(
    payload: ProfileUpdateRequest,
    current_user=Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AuthUser:
    user = update_current_user_profile(current_user, payload, session)
    return to_auth_user(user)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: PasswordChangeRequest,
    current_user=Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    change_current_user_password(current_user, payload, session)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
