from contextlib import asynccontextmanager

from fastapi import FastAPI # type: ignore
from fastapi.middleware.cors import CORSMiddleware # type: ignore

from app.core.config import settings
from app.db import init_db
from app.routes.admin import router as admin_router
from app.routes.ai import router as ai_router
from app.routes.auth import router as auth_router
from app.routes.machines import (
    lab_machines_router,
    router as machines_router,
    types_router as machine_types_router,
)
from app.routes.monitoring import router as monitoring_router
from app.routes.notifications import router as notifications_router
from app.routes.reservations import router as reservations_router
from app.routes.simulation import router as simulation_router
from app.services.mqtt_runtime import mqtt_subscriber


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    mqtt_subscriber.start()
    yield
    mqtt_subscriber.stop()


app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(lab_machines_router)
app.include_router(machines_router)
app.include_router(machine_types_router)
app.include_router(reservations_router)
app.include_router(admin_router)
app.include_router(monitoring_router)
app.include_router(notifications_router)
app.include_router(simulation_router)
app.include_router(ai_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
