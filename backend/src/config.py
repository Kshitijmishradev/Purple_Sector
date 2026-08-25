"""Application settings, loaded from environment variables.

Everything that differs between your laptop and a server lives here.
Nothing else in the codebase should read os.environ directly.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --- Redis ---
    redis_url: str = "redis://localhost:6379/0"
    cache_enabled: bool = True

    # Bump this whenever a _build_*_payload changes shape. Every old key
    # becomes unreachable instantly, so a deploy can never serve a stale
    # schema to a new frontend. Cheaper and safer than manual invalidation.
    cache_version: str = "v2"

    # Seconds a worker may hold the compute lock. Must exceed your worst-case
    # FastF1 load or the lock expires mid-compute and a second worker starts.
    lock_timeout: int = 240

    # Seconds a losing worker waits for the winner before giving up (503).
    wait_timeout: int = 240

    # --- Kafka / Redpanda ---
    kafka_bootstrap: str = "localhost:19092"
    kafka_topic: str = "f1.timing"
    kafka_group: str = "gridlogic-live"

    # Standings frames pushed to browsers per second. Each frame is the whole
    # field (~11KB), and a replay emits an event per driver per lap, so
    # publishing one frame per event sends ~14MB to every viewer over a race.
    # Coalescing to a fixed rate costs nothing visually -- the tower cannot
    # usefully redraw faster than this -- and cuts that by roughly 5x.
    publish_hz: float = 5.0

    # --- FastF1 ---
    fastf1_cache_dir: str = "data_cache"

    # --- HTTP ---
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
