from backend.api import schemas
from backend.api.achievements import router as achievements_router
from backend.api.report import router as report_router
from backend.api.residents import router as residents_router
from backend.api.saves import router as saves_router
from backend.api.settings import router as settings_router
from backend.api.simulation import SimulationState, router as simulation_router
from backend.api.world import router as world_router
from backend.api.ws import router as ws_router

__all__ = [
    "achievements_router",
    "report_router",
    "saves_router",
    "schemas",
    "settings_router",
    "SimulationState",
    "residents_router",
    "simulation_router",
    "world_router",
    "ws_router",
]
