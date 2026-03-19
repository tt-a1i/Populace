"""World package — scenario loading, building logic, and event templates."""
from backend.world.town import load_scenario
from backend.world.buildings import enter_building, leave_building, get_occupants
from backend.world.events import PRESET_EVENTS, get_preset_by_id

__all__ = [
    "load_scenario",
    "enter_building",
    "leave_building",
    "get_occupants",
    "PRESET_EVENTS",
    "get_preset_by_id",
]
