from __future__ import annotations

import json
import logging
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
class JsonRequestFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = getattr(record, "request_log", None)
        if payload is None:
            payload = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "level": record.levelname,
                "message": record.getMessage(),
            }
        return json.dumps(payload, ensure_ascii=False)


def configure_logging() -> None:
    root_logger = logging.getLogger()
    formatter = JsonRequestFormatter()

    if not root_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(formatter)
        root_logger.addHandler(handler)
    else:
        for handler in root_logger.handlers:
            handler.setFormatter(formatter)

    if root_logger.level == logging.NOTSET:
        root_logger.setLevel(logging.INFO)


class RequestMetrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._request_counts: dict[tuple[str, str, int], int] = defaultdict(int)
        self._duration_totals: dict[tuple[str, str], float] = defaultdict(float)
        self._duration_counts: dict[tuple[str, str], int] = defaultdict(int)

    def observe(self, method: str, path: str, status: int, duration_ms: float) -> None:
        with self._lock:
            self._request_counts[(method, path, status)] += 1
            self._duration_totals[(method, path)] += duration_ms
            self._duration_counts[(method, path)] += 1

    def render_prometheus(self, *, active_connections: int, simulation_ticks_total: int) -> str:
        with self._lock:
            request_counts = dict(self._request_counts)
            duration_totals = dict(self._duration_totals)
            duration_counts = dict(self._duration_counts)

        lines = [
            "# HELP request_count Total HTTP requests processed.",
            "# TYPE request_count counter",
        ]
        for (method, path, status), count in sorted(request_counts.items()):
            lines.append(
                f'request_count{{method="{method}",path="{path}",status="{status}"}} {count}'
            )

        lines.extend(
            [
                "# HELP request_duration HTTP request duration in milliseconds.",
                "# TYPE request_duration summary",
            ]
        )
        for (method, path), total in sorted(duration_totals.items()):
            labels = f'method="{method}",path="{path}"'
            lines.append(f"request_duration_sum{{{labels}}} {total:.6f}")
            lines.append(f"request_duration_count{{{labels}}} {duration_counts[(method, path)]}")

        lines.extend(
            [
                "# HELP active_connections Active WebSocket connections.",
                "# TYPE active_connections gauge",
                f"active_connections {active_connections}",
                "# HELP simulation_ticks_total Total simulation ticks processed.",
                "# TYPE simulation_ticks_total counter",
                f"simulation_ticks_total {simulation_ticks_total}",
            ]
        )
        return "\n".join(lines) + "\n"


class InMemoryRateLimiter:
    def __init__(self, *, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._lock = threading.Lock()
        self._requests: dict[str, deque[float]] = defaultdict(deque)

    @property
    def max_requests(self) -> int:
        return self.limit

    @max_requests.setter
    def max_requests(self, value: int) -> None:
        self.limit = value

    def allow(self, client_ip: str, now: float | None = None) -> bool:
        current = time.time() if now is None else now
        cutoff = current - self.window_seconds

        with self._lock:
            timestamps = self._requests[client_ip]
            while timestamps and timestamps[0] <= cutoff:
                timestamps.popleft()
            if len(timestamps) >= self.limit:
                return False
            timestamps.append(current)
            return True

    def reset(self) -> None:
        with self._lock:
            self._requests.clear()


def build_request_log(*, method: str, path: str, status: int, duration_ms: float) -> dict[str, object]:
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": "INFO",
        "method": method,
        "path": path,
        "status": status,
        "duration_ms": round(duration_ms, 2),
    }


def get_client_ip(headers: object, fallback: str | None) -> str:
    forwarded_for = ""
    if hasattr(headers, "get"):
        forwarded_for = headers.get("x-forwarded-for", "") or headers.get("X-Forwarded-For", "")
    elif isinstance(headers, dict):
        forwarded_for = headers.get("x-forwarded-for", "") or headers.get("X-Forwarded-For", "")
    if forwarded_for.strip():
        return forwarded_for.split(",")[0].strip()
    return fallback or "unknown"


def get_simulation_ticks_total(state: object | None) -> int:
    if state is None:
        return 0
    return int(
        getattr(state, "_total_tick_count", getattr(getattr(state, "world", None), "current_tick", 0))
    )
