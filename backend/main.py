import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger(__name__)

try:
    from backend.api import (
        SimulationState,
        report_router,
        residents_router,
        saves_router,
        simulation_router,
        world_router,
        ws_router,
    )
    from backend.db import close_driver, close_redis, get_driver, get_redis, initialize_constraints
    from backend.core.config import settings
except ModuleNotFoundError:
    from api import SimulationState, report_router, residents_router, saves_router, simulation_router, world_router, ws_router
    from db import close_driver, close_redis, get_driver, get_redis, initialize_constraints
    from core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.simulation_state = SimulationState()

    # Neo4j — optional; warn and continue if unavailable
    try:
        await get_driver()
        await initialize_constraints()
        logger.info("Neo4j connected and constraints initialised.")
        # Attempt to restore prior session data (spec §12)
        await app.state.simulation_state.restore_from_neo4j()
    except Exception as exc:
        logger.warning(
            "Neo4j unavailable (%s). Running without graph persistence. "
            "Start Neo4j or run `docker compose up neo4j` for full functionality.",
            exc,
        )

    # Redis — optional; warn and continue if unavailable
    try:
        await get_redis()
        logger.info("Redis connected.")
    except Exception as exc:
        logger.warning(
            "Redis unavailable (%s). Running without cache. "
            "Start Redis or run `docker compose up redis` for full functionality.",
            exc,
        )

    try:
        yield
    finally:
        simulation_state = getattr(app.state, "simulation_state", None)
        if simulation_state is not None:
            await simulation_state.stop()
        await close_driver()
        await close_redis()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

_cors_origins = [
    origin.strip()
    for origin in settings.cors_allowed_origins.split(",")
    if origin.strip()
]
# Always permit local dev servers regardless of config
for _dev_origin in ("http://127.0.0.1:5173", "http://localhost:5173", "http://localhost:3000"):
    if _dev_origin not in _cors_origins:
        _cors_origins.append(_dev_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(simulation_router)
app.include_router(residents_router)
app.include_router(world_router)
app.include_router(report_router)
app.include_router(saves_router)
app.include_router(ws_router)
