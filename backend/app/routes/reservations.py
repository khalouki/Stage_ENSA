from datetime import date

from fastapi import APIRouter, Depends, Query, Response, status
from sqlmodel import Session

from app.db import get_session
from app.models.user import User
from app.schemas.reservation import ReservationAvailabilityRead, ReservationCreate, ReservationRead
from app.services.auth_service import get_current_user
from app.services.reservation_service import (
    build_daily_slots,
    cancel_pending_reservation,
    create_reservation,
    list_my_reservations,
)

router = APIRouter(prefix="/reservations", tags=["reservations"])


@router.post("", response_model=ReservationRead)
def create_reservation_endpoint(
    payload: ReservationCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ReservationRead:
    reservation = create_reservation(payload, current_user, session)
    return ReservationRead.model_validate(reservation)


@router.get("/my", response_model=list[ReservationRead])
def get_my_reservations(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[ReservationRead]:
    reservations = list_my_reservations(current_user, session)
    return [ReservationRead.model_validate(item) for item in reservations]


@router.get("/availability", response_model=list[ReservationAvailabilityRead])
def get_machine_daily_availability(
    machine_id: int = Query(..., ge=1),
    reservation_date: date = Query(..., alias="date"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[ReservationAvailabilityRead]:
    return build_daily_slots(machine_id=machine_id, on_date=reservation_date, session=session)


@router.delete("/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_reservation(
    reservation_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Response:
    cancel_pending_reservation(reservation_id, current_user, session)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
