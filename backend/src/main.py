import logging
import os
from contextlib import asynccontextmanager
from typing import List

import fastf1
import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.datastructures import MutableHeaders

from . import cache
from .cache import ComputationInProgress, cached, make_key, ttl_for_event
from .config import get_settings
from .live import hub
from .processor import F1DataProcessor
from .stream.producer import engine as replay_engine
from .schemas import RaceInsights, TelemetryPoint

logging.basicConfig(level=logging.INFO)
settings = get_settings()


def _to_json_safe(value):
    if value is None:
        return None
    if pd.isna(value):
        return None
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    return value


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.fastf1_cache_dir, exist_ok=True)
    fastf1.Cache.enable_cache(settings.fastf1_cache_dir)
    await cache.connect()
    await cache.seed_from_disk()
    hub.start()
    yield
    await replay_engine.stop()
    await hub.stop()
    await cache.disconnect()


app = FastAPI(title="GridLogic F1 Analytics Engine", lifespan=lifespan)

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
    expose_headers=["X-Cache"],
)


class CacheHeaderMiddleware:
    """Surface HIT / MISS / BYPASS in devtools. Worth its handful of lines.

    Deliberately a raw ASGI middleware rather than `@app.middleware("http")`.
    Starlette runs BaseHTTPMiddleware's downstream app in a *separate task*,
    and a task is spawned with a copy of the context -- so the ContextVar that
    cached() sets is written into a context this middleware cannot see, and it
    reads back its own default on every single request. The header said BYPASS
    forever, including on a verified hit.

    A pure ASGI middleware awaits the app in the same task, and therefore the
    same context, so it observes the real value.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        cache.cache_status.set("BYPASS")

        async def send_with_header(message):
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message)["X-Cache"] = cache.cache_status.get()
            await send(message)

        await self.app(scope, receive, send_with_header)


app.add_middleware(CacheHeaderMiddleware)


processor = F1DataProcessor()


def _fail(exc: Exception, what: str) -> HTTPException:
    if isinstance(exc, ComputationInProgress):
        return HTTPException(503, f"{what} is being computed, retry shortly")
    if isinstance(exc, ValueError):
        return HTTPException(404, str(exc))
    logging.exception("%s failed", what)
    return HTTPException(500, f"{what} failed: {exc}")


# --- Health & cache admin -------------------------------------------------

@app.get("/health")
async def health_check():
    return {"status": "active", "engine": "GridLogic", "cache": cache.is_connected()}


@app.get("/cache/stats")
async def cache_stats():
    return await cache.stats()


@app.delete("/cache/{year}/{gp}")
async def cache_invalidate(year: int, gp: str):
    slug = str(gp).strip().lower().replace(" ", "-")
    removed = await cache.invalidate(f"gl:{settings.cache_version}:*:{year}:{slug}*")
    return {"invalidated": removed}


# --- Schedule -------------------------------------------------------------

def _schedule(year: int):
    schedule = fastf1.get_event_schedule(year)
    races = schedule[schedule["EventFormat"] != "testing"]
    return {"year": year, "events": races["EventName"].tolist()}


@app.get("/races/{year}")
async def get_races(year: int):
    try:
        return await cached(make_key("schedule", year), 21_600, lambda: _schedule(year))
    except Exception as e:
        raise _fail(e, "Schedule fetch")


def _calendar(year: int):
    schedule = fastf1.get_event_schedule(year)
    races = schedule[schedule["EventFormat"] != "testing"]
    fields = [
        "RoundNumber", "Country", "Location", "OfficialEventName", "EventDate",
        "EventName", "EventFormat", "Session1", "Session1DateUtc", "Session2",
        "Session2DateUtc", "Session3", "Session3DateUtc", "Session4",
        "Session4DateUtc", "Session5", "Session5DateUtc", "F1ApiSupport",
    ]
    events = [
        {field: _to_json_safe(row.get(field)) for field in fields}
        for _, row in races.iterrows()
    ]
    return {"year": year, "events": events}


@app.get("/races/{year}/calendar")
async def get_calendar(year: int):
    try:
        return await cached(make_key("calendar", year), 21_600, lambda: _calendar(year))
    except Exception as e:
        raise _fail(e, "Calendar fetch")


# --- Race payloads --------------------------------------------------------

@app.get("/races/{year}/{gp}/meta")
async def get_race_meta(year: int, gp: str):
    try:
        return await cached(
            make_key("meta", year, gp),
            ttl_for_event(year, gp),
            lambda: processor.get_minimal_meta(year, gp),
        )
    except Exception as e:
        raise _fail(e, "Race meta")


@app.get("/races/{year}/{gp}/track-intel")
async def get_race_track_intel(year: int, gp: str):
    try:
        return await cached(
            make_key("track-intel", year, gp),
            ttl_for_event(year, gp),
            lambda: processor.get_track_intel(year, gp),
        )
    except Exception as e:
        raise _fail(e, "Track intel")


@app.get("/races/{year}/{gp}/analytics")
async def get_race_analytics(year: int, gp: str):
    try:
        return await cached(
            make_key("analytics", year, gp),
            ttl_for_event(year, gp),
            lambda: processor.get_race_analytics(year, gp),
        )
    except Exception as e:
        raise _fail(e, "Analytics")


@app.get("/insights/{year}/{gp}", response_model=RaceInsights)
async def get_insights(year: int, gp: str):
    try:
        return await cached(
            make_key("insights", year, gp),
            ttl_for_event(year, gp),
            lambda: processor.get_race_insights(year, gp),
        )
    except Exception as e:
        raise _fail(e, "Insights")


# --- Telemetry ------------------------------------------------------------

@app.get("/telemetry/{year}/{gp}/{driver}", response_model=List[TelemetryPoint])
async def get_telemetry(year: int, gp: str, driver: str):
    try:
        return await cached(
            make_key("fastest-tel", year, gp, driver.upper()),
            ttl_for_event(year, gp),
            lambda: processor.get_fastest_telemetry(year, gp, driver),
        )
    except ComputationInProgress as e:
        raise _fail(e, "Telemetry")
    except Exception:
        raise HTTPException(404, f"Telemetry not found for {driver}")


@app.get("/races/{year}/{gp}/telemetry")
async def get_driver_telemetry(year: int, gp: str, drivers: str = Query(...)):
    codes = sorted({d.strip().upper() for d in drivers.split(",") if d.strip()})
    if not codes:
        raise HTTPException(400, "Provide at least one driver code")
    try:
        data = await cached(
            make_key("pace", year, gp, "-".join(codes)),
            ttl_for_event(year, gp),
            lambda: processor.get_selective_telemetry(year, gp, codes),
        )
        return {"pace_evolution": data}
    except Exception as e:
        raise _fail(e, "Pace evolution")


@app.get("/races/{year}/{gp}/telemetry/lap-matrix")
async def lap_tire_matrix(year: int, gp: str, drivers: str = Query(...)):
    """Per-lap tire compound per driver (rows = drivers, columns = lap numbers)."""
    codes = sorted({d.strip().upper() for d in drivers.split(",") if d.strip()})
    if not codes:
        raise HTTPException(400, "Provide at least one driver code")
    try:
        return await cached(
            make_key("lap-matrix", year, gp, "-".join(codes)),
            ttl_for_event(year, gp),
            lambda: processor.get_lap_tire_matrix(year, gp, codes),
        )
    except Exception as e:
        raise _fail(e, "Lap tire matrix")


@app.get("/races/{year}/{gp}/telemetry/lap-compare")
async def lap_compare_telemetry(
    year: int,
    gp: str,
    drivers: str = Query(..., description="Comma-separated driver codes in order, e.g. RUS,NOR"),
    laps: str = Query(..., description="Comma-separated lap numbers matching drivers, e.g. 21,53"),
):
    """Per-lap telemetry (speed, throttle, brake, RPM, gear, XY) and delta for two laps."""
    codes = [d.strip().upper() for d in drivers.split(",") if d.strip()]
    lap_parts = [p.strip() for p in laps.split(",") if p.strip()]
    if len(codes) != len(lap_parts):
        raise HTTPException(400, "drivers and laps must have the same number of entries")
    if not 1 <= len(codes) <= 2:
        raise HTTPException(400, "Provide one or two driver/lap pairs")
    try:
        lap_nums = [int(x) for x in lap_parts]
    except ValueError as exc:
        raise HTTPException(400, "All lap values must be integers") from exc

    specs = list(zip(codes, lap_nums))
    # Order matters here (delta is A relative to B), so do NOT sort.
    tag = "-".join(f"{d}{n}" for d, n in specs)
    try:
        return await cached(
            make_key("lap-compare", year, gp, tag),
            ttl_for_event(year, gp),
            lambda: processor.compare_lap_telemetry(year, gp, specs),
        )
    except Exception as e:
        raise _fail(e, "Lap telemetry")


# --- Live replay ----------------------------------------------------------

# A replay on a cache miss is a ~680MB pandas job. Unauthenticated, that is a
# one-request OOM for anyone who finds the URL, so a replay may only be
# started for a race we have already precomputed. The prewarmed bundle is
# therefore both the data source and the allowlist -- they cannot drift apart.
def _replayable() -> set[str]:
    prefix = f"gl:{settings.cache_version}:analytics:"
    names = set()
    if cache.PREWARM_DIR.exists():
        for path in cache.PREWARM_DIR.glob("*.zlib"):
            key = cache._filename_to_key(path.name)
            if key.startswith(prefix):
                names.add(key[len(prefix):])
    return names


@app.get("/replay/available")
async def replay_available():
    """Races this deployment can stream, for the UI to offer."""
    return {"races": sorted(_replayable())}


@app.post("/replay/{year}/{gp}")
async def replay_start(year: int, gp: str, speed: float = Query(10.0, ge=0.1, le=200)):
    """Replay a finished race into Kafka as if it were live.

    Reads through the Redis cache, so restarting a replay while you iterate
    costs milliseconds rather than a fresh FastF1 load.
    """
    slug = make_key("analytics", year, gp).split(":", 3)[3]
    available = _replayable()
    if available and slug not in available:
        raise HTTPException(
            404,
            f"No precomputed data for {year} {gp}. Available: {sorted(available)}",
        )

    async def loader():
        return await cached(
            make_key("analytics", year, gp),
            ttl_for_event(year, gp),
            lambda: processor.get_race_analytics(year, gp),
        )

    try:
        return await replay_engine.start(year, gp, speed, loader)
    except RuntimeError as e:
        raise HTTPException(409, str(e))
    except Exception as e:
        raise _fail(e, "Replay start")


@app.post("/replay/stop")
async def replay_stop():
    return await replay_engine.stop()


@app.get("/replay/status")
async def replay_status():
    return {**replay_engine.status(), "listeners": hub.client_count}


@app.websocket("/ws/live")
async def live_socket(websocket: WebSocket):
    await hub.connect(websocket)
    try:
        while True:
            # We never expect client messages; this just parks the coroutine
            # so disconnects are detected promptly.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await hub.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
