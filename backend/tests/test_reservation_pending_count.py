from __future__ import annotations

import unittest
from datetime import date, time

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.models.machine import Machine, MachineStatus, MachineType
from app.models.reservation import Reservation, ReservationStatus
from app.models.user import User, UserRole
from app.routes.admin import get_pending_reservation_count
from app.services.reservation_service import count_pending_reservations, set_reservation_status


class ReservationPendingCountTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)

        with Session(self.engine) as session:
            machine_type = MachineType(code="CNC", name="CNC Router", model_path="/cnc.glb")
            admin = User(
                full_name="Admin",
                email="admin@example.com",
                hashed_password="not-used",
                role=UserRole.ADMIN,
            )
            student = User(
                full_name="Student",
                email="student@example.com",
                hashed_password="not-used",
                role=UserRole.STUDENT,
            )
            session.add(machine_type)
            session.add(admin)
            session.add(student)
            session.commit()
            session.refresh(machine_type)
            session.refresh(admin)
            session.refresh(student)

            machine = Machine(
                name="CNC_1",
                machine_type_id=machine_type.id,
                status=MachineStatus.AVAILABLE,
            )
            session.add(machine)
            session.commit()
            session.refresh(machine)

            self.student_id = student.id
            self.machine_id = machine.id

    def _add_reservation(self, session: Session, status: ReservationStatus) -> Reservation:
        reservation = Reservation(
            user_id=self.student_id,  # type: ignore[arg-type]
            machine_id=self.machine_id,  # type: ignore[arg-type]
            date=date.today(),
            start_time=time(9, 0),
            end_time=time(10, 0),
            status=status,
        )
        session.add(reservation)
        session.commit()
        session.refresh(reservation)
        return reservation

    def test_two_pending_reservations_count_is_two(self) -> None:
        with Session(self.engine) as session:
            self._add_reservation(session, ReservationStatus.PENDING)
            self._add_reservation(session, ReservationStatus.PENDING)

            self.assertEqual(count_pending_reservations(session), 2)
            self.assertEqual(get_pending_reservation_count(session).pending_count, 2)

    def test_two_approved_reservations_and_zero_pending_count_is_zero(self) -> None:
        with Session(self.engine) as session:
            self._add_reservation(session, ReservationStatus.APPROVED)
            self._add_reservation(session, ReservationStatus.APPROVED)

            self.assertEqual(count_pending_reservations(session), 0)
            self.assertEqual(get_pending_reservation_count(session).pending_count, 0)

    def test_one_pending_and_one_approved_count_is_one(self) -> None:
        with Session(self.engine) as session:
            self._add_reservation(session, ReservationStatus.PENDING)
            self._add_reservation(session, ReservationStatus.APPROVED)

            self.assertEqual(count_pending_reservations(session), 1)
            self.assertEqual(get_pending_reservation_count(session).pending_count, 1)

    def test_approving_last_pending_reservation_clears_count(self) -> None:
        with Session(self.engine) as session:
            reservation = self._add_reservation(session, ReservationStatus.PENDING)
            self.assertEqual(count_pending_reservations(session), 1)

            set_reservation_status(
                reservation_id=reservation.id,  # type: ignore[arg-type]
                new_status=ReservationStatus.APPROVED,
                note=None,
                session=session,
            )

            self.assertEqual(count_pending_reservations(session), 0)
            self.assertEqual(get_pending_reservation_count(session).pending_count, 0)


if __name__ == "__main__":
    unittest.main()
