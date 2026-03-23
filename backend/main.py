import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse

logger = logging.getLogger(__name__)

try:
    from backend.api import (
        SimulationState,
        achievements_router,
        director_router,
        quests_router,
        report_router,
        residents_router,
        saves_router,
        schemas,
        settings_router,
        simulation_router,
        world_router,
        ws_router,
    )
    from backend.api.rules import router as rules_router
    from backend.db import close_driver, close_redis, get_driver, get_redis, initialize_constraints
    from backend.observability import (
        InMemoryRateLimiter,
        JsonRequestFormatter,
        RequestMetrics,
        build_request_log,
        configure_logging,
        get_client_ip,
        get_simulation_ticks_total,
    )
    from backend.core.config import settings
    from backend.core.runtime import ensure_runtime_assets
except ModuleNotFoundError:
    from api import SimulationState, achievements_router, director_router, quests_router, report_router, residents_router, saves_router, schemas, settings_router, simulation_router, world_router, ws_router
    from db import close_driver, close_redis, get_driver, get_redis, initialize_constraints
    from observability import InMemoryRateLimiter, JsonRequestFormatter, RequestMetrics, build_request_log, configure_logging, get_client_ip, get_simulation_ticks_total
    from core.config import settings
    from core.runtime import ensure_runtime_assets

configure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_runtime_assets(app.state.templates_dir)
    app.state.simulation_state = SimulationState()
    app.state.rate_limiter = InMemoryRateLimiter(
        limit=settings.rate_limit_max_requests,
        window_seconds=settings.rate_limit_window_seconds,
    )
    app.state.request_metrics = RequestMetrics()

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
app.state.templates_dir = Path(__file__).parent / "world" / "templates"


@app.middleware("http")
async def log_request_metrics(request: Request, call_next):
    start = time.perf_counter()
    client_ip = get_client_ip(request.headers, request.client.host if request.client else None)

    rate_limiter = getattr(request.app.state, "rate_limiter", None)
    if rate_limiter is not None and not rate_limiter.allow(client_ip):
        duration_ms = (time.perf_counter() - start) * 1000
        status_code = 429
        request_log = build_request_log(
            method=request.method,
            path=request.url.path,
            status=status_code,
            duration_ms=duration_ms,
        )
        request_metrics = getattr(request.app.state, "request_metrics", None)
        if request_metrics is not None:
            request_metrics.observe(request.method, request.url.path, status_code, duration_ms)
        logger.info("HTTP request completed", extra={"request_log": request_log})
        payload = schemas.ErrorResponse(detail="rate limit exceeded", code="rate_limit_exceeded")
        return JSONResponse(status_code=status_code, content=payload.model_dump())

    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (time.perf_counter() - start) * 1000
        logger.exception(
            "HTTP request failed",
            extra={
                "request_log": build_request_log(
                    method=request.method,
                    path=request.url.path,
                    status=500,
                    duration_ms=duration_ms,
                )
            },
        )
        request_metrics = getattr(request.app.state, "request_metrics", None)
        if request_metrics is not None:
            request_metrics.observe(request.method, request.url.path, 500, duration_ms)
        payload = schemas.ErrorResponse(
            detail="Internal server error",
            code="internal_server_error",
        )
        return JSONResponse(status_code=500, content=payload.model_dump())

    duration_ms = (time.perf_counter() - start) * 1000
    request_log = build_request_log(
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=duration_ms,
    )
    request_metrics = getattr(request.app.state, "request_metrics", None)
    if request_metrics is not None:
        request_metrics.observe(request.method, request.url.path, response.status_code, duration_ms)
    logger.info("HTTP request completed", extra={"request_log": request_log})
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


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled application error", exc_info=exc)
    payload = schemas.ErrorResponse(
        detail="Internal server error",
        code="internal_server_error",
    )
    return JSONResponse(status_code=500, content=payload.model_dump())


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


@app.get("/api/metrics")
async def metrics(request: Request) -> PlainTextResponse:
    request_metrics = getattr(request.app.state, "request_metrics", None)
    simulation_state = getattr(request.app.state, "simulation_state", None)
    from backend.api.ws import manager

    body = ""
    if request_metrics is not None:
        body = request_metrics.render_prometheus(
            active_connections=manager.count,
            simulation_ticks_total=get_simulation_ticks_total(simulation_state),
        )
    return PlainTextResponse(body, media_type="text/plain; version=0.0.4")

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
app.include_router(director_router)
app.include_router(quests_router)
app.include_router(world_router)
app.include_router(report_router)
app.include_router(saves_router)
app.include_router(settings_router)
app.include_router(ws_router)
app.include_router(rules_router)
