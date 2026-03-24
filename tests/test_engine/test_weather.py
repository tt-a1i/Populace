from engine.types import Season, WeatherType


def test_festival_calendar_has_one_event_per_season():
    from engine.weather import FESTIVAL_BY_SEASON

    assert set(FESTIVAL_BY_SEASON) == {Season.spring, Season.summer, Season.autumn, Season.winter}


def test_build_forecast_matches_weather_domain():
    from engine.weather import build_forecast

    forecast = build_forecast(Season.winter, steps=5)

    assert len(forecast) == 5
    assert set(forecast).issubset({member.value for member in WeatherType})
