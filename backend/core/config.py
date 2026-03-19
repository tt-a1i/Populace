from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="",
        case_sensitive=False,
        frozen=True,
    )

    app_name: str = Field(default="Populace Backend")

    # Deployment settings
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000)
    neo4j_uri: str = Field(default="bolt://neo4j:7687")
    redis_url: str = Field(default="redis://redis:6379")
    llm_api_key: str = Field(default="")
    llm_base_url: str = Field(default="")
    llm_model_name: str = Field(default="")
    cors_allowed_origins: str = Field(default="http://localhost:3000,http://frontend:3000")

    # Simulation parameters
    tick_interval_seconds: float = Field(default=3.0)
    tick_per_day: int = Field(default=48)
    max_concurrent_llm_calls: int = Field(default=3)
    llm_timeout_seconds: float = Field(default=5.0)
    llm_call_probability: float = Field(default=0.2)

    # Memory parameters
    short_term_memory_size: int = Field(default=20)
    reflection_threshold: int = Field(default=10)
    relationship_decay_rate: float = Field(default=0.01)

    # Spatial parameters
    map_width_tiles: int = Field(default=40)
    map_height_tiles: int = Field(default=30)
    tile_size_px: int = Field(default=32)
    interaction_distance: int = Field(default=2)
    max_dialogues_per_tick: int = Field(default=2)

    # Snapshot settings
    snapshot_interval_ticks: int = Field(default=10)

    # Internationalisation
    default_language: str = Field(default="zh")


settings = Settings()


# Compatibility aliases derived from the singleton settings instance.
TICK_INTERVAL_SECONDS = settings.tick_interval_seconds
TICK_PER_DAY = settings.tick_per_day
MAX_CONCURRENT_LLM_CALLS = settings.max_concurrent_llm_calls
LLM_TIMEOUT_SECONDS = settings.llm_timeout_seconds
LLM_CALL_PROBABILITY = settings.llm_call_probability
SHORT_TERM_MEMORY_SIZE = settings.short_term_memory_size
REFLECTION_THRESHOLD = settings.reflection_threshold
RELATIONSHIP_DECAY_RATE = settings.relationship_decay_rate
MAP_WIDTH_TILES = settings.map_width_tiles
MAP_HEIGHT_TILES = settings.map_height_tiles
TILE_SIZE_PX = settings.tile_size_px
INTERACTION_DISTANCE = settings.interaction_distance
MAX_DIALOGUES_PER_TICK = settings.max_dialogues_per_tick
SNAPSHOT_INTERVAL_TICKS = settings.snapshot_interval_ticks
