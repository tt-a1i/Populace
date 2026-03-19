from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    from backend.api import (
        SimulationState,
        report_router,
        residents_router,
        simulation_router,
        world_router,
        ws_router,
    )
    from backend.db import close_driver, close_redis, get_driver, get_redis, initialize_constraints
    from backend.core.config import settings
except ModuleNotFoundError:
    from api import SimulationState, report_router, residents_router, simulation_router, world_router, ws_router
    from db import close_driver, close_redis, get_driver, get_redis, initialize_constraints
    from core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.simulation_state = SimulationState()
    await get_driver()
    await initialize_constraints()
    await get_redis()

    try:
        yield
    finally:
        simulation_state = getattr(app.state, "simulation_state", None)
        if simulation_state is not None:
            await simulation_state.stop()
        await close_driver()
        await close_redis()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_allowed_origins.split(",") if origin.strip()],
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
app.include_router(ws_router)
