from __future__ import annotations

import random
from typing import TYPE_CHECKING

from engine.types import Event, Season, WeatherType

if TYPE_CHECKING:
    from engine.world import World


SEASON_CHANGE_INTERVAL = 100
WEATHER_CHANGE_INTERVAL = 12
FORECAST_STEPS = 3
SEASON_ORDER = [Season.spring, Season.summer, Season.autumn, Season.winter]
WEATHER_WEIGHTS: dict[Season, dict[WeatherType, float]] = {
    Season.spring: {
        WeatherType.sunny: 0.35,
        WeatherType.cloudy: 0.30,
        WeatherType.rainy: 0.25,
        WeatherType.stormy: 0.05,
        WeatherType.snowy: 0.05,
    },
    Season.summer: {
        WeatherType.sunny: 0.45,
        WeatherType.cloudy: 0.20,
        WeatherType.rainy: 0.15,
        WeatherType.stormy: 0.20,
        WeatherType.snowy: 0.00,
    },
    Season.autumn: {
        WeatherType.sunny: 0.28,
        WeatherType.cloudy: 0.28,
        WeatherType.rainy: 0.25,
        WeatherType.stormy: 0.14,
        WeatherType.snowy: 0.05,
    },
    Season.winter: {
        WeatherType.sunny: 0.20,
        WeatherType.cloudy: 0.20,
        WeatherType.rainy: 0.10,
        WeatherType.stormy: 0.10,
        WeatherType.snowy: 0.40,
    },
}
FESTIVAL_BY_SEASON: dict[Season, dict[str, str | int]] = {
    Season.spring: {
        "id": "festival-spring",
        "name": "春节",
        "description": "春节集会开始了，居民们回到镇中心互相拜年。",
        "dialogue_hint": "街上到处都是拜年的声音，连寒暄都带着节庆的热气。",
        "duration_ticks": 12,
    },
    Season.summer: {
        "id": "festival-summer",
        "name": "夏日祭",
        "description": "夏日祭开场，大家朝广场聚过去看灯和摊位。",
        "dialogue_hint": "夏日祭的灯光把话题都烘得热闹起来。",
        "duration_ticks": 12,
    },
    Season.autumn: {
        "id": "festival-autumn",
        "name": "秋收节",
        "description": "秋收节开始了，居民们围着集市分享丰收见闻。",
        "dialogue_hint": "秋收节让每一句问候都像带着谷物的香气。",
        "duration_ticks": 12,
    },
    Season.winter: {
        "id": "festival-winter",
        "name": "冬至",
        "description": "冬至集会开始了，大家围在室内喝热汤聊天。",
        "dialogue_hint": "冬至的热气把原本拘谨的话也煨得柔和起来。",
        "duration_ticks": 12,
    },
}


def normalize_season(value: str | Season | None) -> Season:
    if isinstance(value, Season):
        return value
    try:
        return Season(str(value or Season.spring.value))
    except ValueError:
        return Season.spring


def normalize_weather(value: str | WeatherType | None) -> WeatherType:
    if isinstance(value, WeatherType):
        return value
    try:
        return WeatherType(str(value or WeatherType.sunny.value))
    except ValueError:
        return WeatherType.sunny


def season_for_tick(tick: int) -> Season:
    return SEASON_ORDER[(tick // SEASON_CHANGE_INTERVAL) % len(SEASON_ORDER)]


def choose_weather(season: Season, *, rng: random.Random | None = None) -> WeatherType:
    roller = rng or random
    weights = WEATHER_WEIGHTS[season]
    options = list(weights.keys())
    return roller.choices(options, weights=[weights[item] for item in options], k=1)[0]


def build_forecast(season: Season | str, steps: int = FORECAST_STEPS) -> list[str]:
    active_season = normalize_season(season)
    return [choose_weather(active_season).value for _ in range(max(0, steps))]


def sync_weather_cycle(world: "World") -> list[str]:
    events: list[str] = []

    next_season = season_for_tick(world.current_tick)
    if next_season != normalize_season(world.season):
        world.season = next_season
        festival = FESTIVAL_BY_SEASON[next_season]
        world.active_festival = str(festival["name"])
        world.active_festival_dialogue_hint = str(festival["dialogue_hint"])
        world.active_festival_ticks_remaining = int(festival["duration_ticks"])
        world.pending_events.append(
            Event(
                id=f"{festival['id']}-{world.current_tick}",
                description=str(festival["description"]),
                timestamp=world.simulation_time(),
                source="system",
            )
        )
        events.append(str(festival["description"]))

    if world.current_tick % WEATHER_CHANGE_INTERVAL == 0:
        next_weather = choose_weather(normalize_season(world.season))
        if next_weather != normalize_weather(world.weather):
            world.weather = next_weather
            events.append(f"天气变化：{next_weather.value}")

    remaining = int(getattr(world, "active_festival_ticks_remaining", 0) or 0)
    if remaining > 0:
        world.active_festival_ticks_remaining = remaining - 1
        if world.active_festival_ticks_remaining <= 0:
            world.active_festival = None
            world.active_festival_dialogue_hint = None

    world.weather_forecast = build_forecast(normalize_season(world.season))
    return events
