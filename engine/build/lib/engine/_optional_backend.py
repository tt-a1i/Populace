from __future__ import annotations

from importlib import import_module
from typing import Any


def load_backend_attr(module_name: str, attr_name: str) -> Any | None:
    try:
        module = import_module(module_name)
    except ImportError:
        return None

    return getattr(module, attr_name, None)
