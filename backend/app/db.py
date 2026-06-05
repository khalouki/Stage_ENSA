from __future__ import annotations

from collections.abc import Generator
from datetime import datetime, timezone
from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine, select

from app import models as _models  # noqa: F401
from app.core.config import settings
from app.core.security import get_password_hash
from app.models.machine import Machine, MachineStatus, MachineType
from app.models.user import User, UserRole

engine = create_engine(settings.database_url, echo=False, connect_args={"check_same_thread": False})


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


def _table_columns(session: Session, table_name: str) -> set[str]:
    rows = session.exec(text(f"PRAGMA table_info({table_name})")).all()
    return {row[1] for row in rows}


def _column_expr(columns: set[str], column: str, fallback: str) -> str:
    if column in columns:
        return f"COALESCE({column}, {fallback})"
    return fallback


def _add_column_if_missing(session: Session, table: str, column: str, declaration: str) -> None:
    columns = _table_columns(session, table)
    if column not in columns:
        session.exec(text(f"ALTER TABLE {table} ADD COLUMN {column} {declaration}"))


def migrate_legacy_schema(session: Session) -> dict[int, str]:
    legacy_type_map: dict[int, str] = {}
    if "machine" not in _existing_tables(session):
        return legacy_type_map

    columns = _table_columns(session, "machine")
    if "type" in columns:
        rows = session.exec(text("SELECT id, type FROM machine")).all()
        legacy_type_map = {int(row[0]): str(row[1] or "") for row in rows}

    # If old columns exist, rebuild to the new architecture schema.
    needs_rebuild = "type" in columns or "description" in columns
    if needs_rebuild:
        session.exec(text("PRAGMA foreign_keys=OFF"))
        session.exec(text("DROP TABLE IF EXISTS machine_v2"))
        session.exec(
            text(
                """
                CREATE TABLE IF NOT EXISTS machine_v2 (
                  id INTEGER PRIMARY KEY,
                  name TEXT NOT NULL UNIQUE,
                  machine_type_id INTEGER,
                  status TEXT NOT NULL DEFAULT 'available',
                  notes TEXT,
                  position_x REAL NOT NULL DEFAULT 0,
                  position_y REAL NOT NULL DEFAULT 0,
                  position_z REAL NOT NULL DEFAULT 0,
                  rotation_x REAL NOT NULL DEFAULT 0,
                  rotation_y REAL NOT NULL DEFAULT 0,
                  rotation_z REAL NOT NULL DEFAULT 0,
                  scale_x REAL NOT NULL DEFAULT 1,
                  scale_y REAL NOT NULL DEFAULT 1,
                  scale_z REAL NOT NULL DEFAULT 1,
                  created_at TEXT,
                  updated_at TEXT,
                  FOREIGN KEY(machine_type_id) REFERENCES machinetype(id)
                )
                """
            )
        )

        notes_expr = "notes"
        if "notes" not in columns and "description" in columns:
            notes_expr = "description"
        if "notes" in columns and "description" in columns:
            notes_expr = "COALESCE(notes, description)"

        insert_sql = f"""
            INSERT INTO machine_v2 (
                id, name, machine_type_id, status, notes,
                position_x, position_y, position_z,
                rotation_x, rotation_y, rotation_z,
                scale_x, scale_y, scale_z,
                created_at, updated_at
            )
            SELECT
                id,
                name,
                {"machine_type_id" if "machine_type_id" in columns else "NULL"},
                {_column_expr(columns, "status", "'available'")},
                {notes_expr if ("notes" in columns or "description" in columns) else "NULL"},
                {_column_expr(columns, "position_x", "0")},
                {_column_expr(columns, "position_y", "0")},
                {_column_expr(columns, "position_z", "0")},
                {_column_expr(columns, "rotation_x", "0")},
                {_column_expr(columns, "rotation_y", "0")},
                {_column_expr(columns, "rotation_z", "0")},
                {_column_expr(columns, "scale_x", "1")},
                {_column_expr(columns, "scale_y", "1")},
                {_column_expr(columns, "scale_z", "1")},
                {"created_at" if "created_at" in columns else "NULL"},
                {"updated_at" if "updated_at" in columns else "NULL"}
            FROM machine
        """
        session.exec(text(insert_sql))
        session.exec(text("DROP TABLE machine"))
        session.exec(text("ALTER TABLE machine_v2 RENAME TO machine"))
        session.exec(text("PRAGMA foreign_keys=ON"))
        session.commit()

    # Ensure required modern columns exist.
    _add_column_if_missing(session, "machine", "machine_type_id", "INTEGER")
    _add_column_if_missing(session, "machine", "notes", "TEXT")
    _add_column_if_missing(session, "machine", "position_x", "REAL DEFAULT 0")
    _add_column_if_missing(session, "machine", "position_y", "REAL DEFAULT 0")
    _add_column_if_missing(session, "machine", "position_z", "REAL DEFAULT 0")
    _add_column_if_missing(session, "machine", "rotation_x", "REAL DEFAULT 0")
    _add_column_if_missing(session, "machine", "rotation_y", "REAL DEFAULT 0")
    _add_column_if_missing(session, "machine", "rotation_z", "REAL DEFAULT 0")
    _add_column_if_missing(session, "machine", "scale_x", "REAL DEFAULT 1")
    _add_column_if_missing(session, "machine", "scale_y", "REAL DEFAULT 1")
    _add_column_if_missing(session, "machine", "scale_z", "REAL DEFAULT 1")
    _add_column_if_missing(session, "machine", "created_at", "TEXT")
    _add_column_if_missing(session, "machine", "updated_at", "TEXT")
    session.commit()
    return legacy_type_map


def _existing_tables(session: Session) -> set[str]:
    rows = session.exec(
        text("SELECT name FROM sqlite_master WHERE type='table'")
    ).all()
    return {row[0] for row in rows}


def seed_machine_types(session: Session) -> None:
    defaults = [
        {
            "code": "3D_PRINTER",
            "name": "3D Printer",
            "model_path": "/models/3d_printer.glb",
            "default_scale": 1.0,
            "specs_schema": '{"technology":"FDM","build_volume":"220x220x250"}',
            "sensors_schema": '{"temperature":"C","vibration":"mm/s2","usage_duration":"min","motor_speed":"rpm"}',
        },
        {
            "code": "CNC",
            "name": "CNC Router",
            "model_path": "/models/CNC.glb",
            "default_scale": 1.0,
            "specs_schema": '{"axes":"4","work_area":"600x600"}',
            "sensors_schema": '{"temperature":"C","vibration":"mm/s2","usage_duration":"min","motor_speed":"rpm"}',
        },
        {
            "code": "LASER_CUTTER",
            "name": "Laser Cutter",
            "model_path": "/models/laser_cnc_machine.glb",
            "default_scale": 1.0,
            "specs_schema": '{"laser_power":"60W","bed_size":"600x400"}',
            "sensors_schema": '{"temperature":"C","vibration":"mm/s2","usage_duration":"min","motor_speed":"rpm"}',
        },
    ]
    for item in defaults:
        existing = session.exec(select(MachineType).where(MachineType.code == item["code"])).first()
        if existing is None:
            session.add(MachineType(**item))
    session.commit()


def seed_data(session: Session, legacy_type_map: dict[int, str] | None = None) -> None:
    seed_machine_types(session)

    now = datetime.now(timezone.utc)
    machine_types = {item.code: item for item in session.exec(select(MachineType)).all()}
    legacy_type_map = legacy_type_map or {}

    # Backfill legacy machine rows.
    machines = session.exec(select(Machine)).all()
    for machine in machines:
        if machine.machine_type_id is None:
            legacy_type = legacy_type_map.get(machine.id or -1, "")
            normalized = legacy_type.lower()
            if "cnc" in normalized or "subtractive" in normalized:
                machine.machine_type_id = machine_types["CNC"].id
            elif "laser" in normalized:
                machine.machine_type_id = machine_types["LASER_CUTTER"].id
            elif "printer" in (machine.name or "").lower():
                machine.machine_type_id = machine_types["3D_PRINTER"].id
            else:
                machine.machine_type_id = machine_types["3D_PRINTER"].id
        if machine.scale_x in (None, 0):
            machine.scale_x = 1.0
        if machine.scale_y in (None, 0):
            machine.scale_y = 1.0
        if machine.scale_z in (None, 0):
            machine.scale_z = 1.0
        if machine.created_at is None:
            machine.created_at = now
        if machine.updated_at is None:
            machine.updated_at = now
        session.add(machine)
    session.commit()

    if session.exec(select(Machine)).first() is None:
        session.add_all(
            [
                Machine(
                    name="3D_Printer_1",
                    machine_type_id=machine_types["3D_PRINTER"].id,
                    status=MachineStatus.AVAILABLE,
                    notes="Default seeded printer",
                    position_x=-2.0,
                    position_y=0.0,
                    position_z=-4.0,
                    rotation_y=1.57,
                    created_at=now,
                    updated_at=now,
                ),
                Machine(
                    name="CNC_1",
                    machine_type_id=machine_types["CNC"].id,
                    status=MachineStatus.AVAILABLE,
                    notes="Default seeded CNC",
                    position_x=5.0,
                    position_y=0.0,
                    position_z=4.0,
                    rotation_y=1.57,
                    created_at=now,
                    updated_at=now,
                ),
            ]
        )

    legacy_admin_email = "admin@fablab.local"
    admin_email = "admin@fablab.ma"
    legacy_admin = session.exec(select(User).where(User.email == legacy_admin_email)).first()
    if legacy_admin is not None:
        legacy_admin.email = admin_email
        session.add(legacy_admin)
        session.commit()

    existing_admin = session.exec(select(User).where(User.email == admin_email)).first()
    if existing_admin is None:
        session.add(
            User(
                full_name="Platform Admin",
                email=admin_email,
                hashed_password=get_password_hash("Admin@123"),
                role=UserRole.ADMIN,
                is_active=True,
            )
        )

    session.commit()


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        legacy_type_map = migrate_legacy_schema(session)
        SQLModel.metadata.create_all(engine)
        seed_data(session, legacy_type_map=legacy_type_map)
