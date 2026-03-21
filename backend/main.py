import logging
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

try:
    from backend.api import (
        SimulationState,
        achievements_router,
        report_router,
        residents_router,
        saves_router,
        schemas,
        settings_router,
        simulation_router,
        world_router,
        ws_router,
    )
    from backend.db import close_driver, close_redis, get_driver, get_redis, initialize_constraints
    from backend.core.config import settings
except ModuleNotFoundError:
    from api import SimulationState, achievements_router, report_router, residents_router, saves_router, schemas, settings_router, simulation_router, world_router, ws_router
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


@app.middleware("http")
async def log_request_metrics(request: Request, call_next):
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (time.perf_counter() - start) * 1000
        logger.exception(
            "HTTP %s %s -> 500 in %.2fms",
            request.method,
            request.url.path,
            duration_ms,
        )
        raise

    duration_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "HTTP %s %s -> %s in %.2fms",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


def _normalise_error_detail(detail: Any) -> str:
    message = str(detail)
    if message.startswith("Value error, "):
        return message[len("Value error, ") :]
    return message


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    first_error = exc.errors()[0] if exc.errors() else {"msg": "Validation error"}
    payload = schemas.ErrorResponse(
        detail=_normalise_error_detail(first_error.get("msg", "Validation error")),
        code="validation_error",
    )
    return JSONResponse(status_code=422, content=payload.model_dump())


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict) and {"detail", "code"} <= set(exc.detail):
        payload = schemas.ErrorResponse(**exc.detail)
    else:
        payload = schemas.ErrorResponse(
            detail=_normalise_error_detail(exc.detail or "Request failed"),
            code={
                400: "bad_request",
                404: "not_found",
                422: "validation_error",
                503: "service_unavailable",
            }.get(exc.status_code, "http_error"),
        )
    return JSONResponse(status_code=exc.status_code, content=payload.model_dump())


_cors_origins = [
    origin.strip()
    for origin in settings.cors_allowed_origins.split(",")
    if origin.strip()
]
# Only permit local dev servers in non-production environments
if settings.environment != "production":
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

@app.get("/health", response_model=schemas.HealthResponse)
async def health() -> schemas.HealthResponse:
    """Return service readiness including Redis and Neo4j connection status."""
    import asyncio

    redis_status = "disconnected"
    try:
        from backend.db.redis import get_redis
        client = await get_redis()
        await asyncio.wait_for(client.ping(), timeout=1.0)
        redis_status = "connected"
    except Exception:
        pass

    neo4j_status = "disconnected"
    try:
        from backend.db.neo4j import get_driver
        driver = await get_driver()
        async def _neo4j_ping() -> None:
            async with driver.session() as session:
                await session.run("RETURN 1")
        await asyncio.wait_for(_neo4j_ping(), timeout=1.0)
        neo4j_status = "connected"
    except Exception:
        pass

    return schemas.HealthResponse(status="ok", redis=redis_status, neo4j=neo4j_status)


app.include_router(simulation_router)
app.include_router(residents_router)
app.include_router(achievements_router)
app.include_router(world_router)
app.include_router(report_router)
app.include_router(saves_router)
app.include_router(settings_router)
app.include_router(ws_router)
