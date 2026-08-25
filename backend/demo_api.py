"""Static-data API for the no-cost Purple Sector MVP.

Unlike src.main, this module intentionally imports no FastF1, pandas, Redis,
Kafka client, or WebSocket code. It serves the versioned demo bundle created by
scripts/build_demo_bundle.py.
"""

from __future__ import annotations

import os
import re
import zlib
from functools import lru_cache
from pathlib import Path
from typing import Any

import orjson
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware


ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("DEMO_DATA_DIR", ROOT / "demo_data" / "v1"))


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")


def _load_json(path: Path) -> Any:
    return orjson.loads(path.read_bytes())


@lru_cache(maxsize=1)
def manifest() -> dict[str, Any]:
    path = DATA_DIR / "manifest.json"
    if not path.exists():
        raise RuntimeError(f"Demo manifest is missing: {path}")
    return _load_json(path)


@lru_cache(maxsize=8)
def race_payload(race_slug: str) -> dict[str, Any]:
    path = DATA_DIR / "races" / f"{race_slug}.json.zlib"
    if not path.exists():
        raise HTTPException(404, f"Race is not included in this MVP: {race_slug}")
    return orjson.loads(zlib.decompress(path.read_bytes()))


def race(year: int, gp: str) -> dict[str, Any]:
    data = manifest()
    selected = next(
        (item for item in data["races"] if item["year"] == year and item["slug"] == slug(gp)),
        None,
    )
    if selected is None:
        raise HTTPException(404, f"Only the five bundled MVP races are available")
    return race_payload(selected["slug"])


def _origins() -> list[str]:
    return [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "*").split(",") if origin.strip()]


app = FastAPI(title="Purple Sector MVP API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins(),
    allow_credentials=os.getenv("ALLOWED_ORIGINS", "*") != "*",
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, Any]:
    data = manifest()
    return {"status": "active", "mode": "demo", "season": data["season"], "races": len(data["races"])}


@app.get("/demo/manifest")
def demo_manifest() -> dict[str, Any]:
    return manifest()


@app.get("/races/{year}")
def races(year: int) -> dict[str, Any]:
    data = manifest()
    return {"year": year, "events": [item["gp"] for item in data["races"] if item["year"] == year]}


@app.get("/races/{year}/calendar")
def calendar(year: int) -> dict[str, Any]:
    data = manifest()
    events = data.get("calendar")
    if events is None:
        events = [
            {
                "RoundNumber": item["round"],
                "EventName": item["gp"],
                "OfficialEventName": item["event_name"],
                "EventDate": item["event_date"],
                "EventFormat": "conventional",
                "mvp_supported": True,
            }
            for item in data["races"]
        ]
    events = [event for event in events if int(event.get("RoundNumber", 0)) > 0]
    for event in events:
        event.setdefault("circuit_key", slug(str(event.get("EventName", ""))))
    return {"year": year, "events": events}


@app.get("/races/{year}/{gp}/meta")
def meta(year: int, gp: str) -> dict[str, Any]:
    return race(year, gp)["meta"]


@app.get("/races/{year}/{gp}/analytics")
def analytics(year: int, gp: str) -> dict[str, Any]:
    return race(year, gp)["analytics"]


@app.get("/insights/{year}/{gp}")
def insights(year: int, gp: str) -> dict[str, Any]:
    return race(year, gp)["insights"]


@app.get("/races/{year}/{gp}/track-intel")
def track_intel(year: int, gp: str) -> dict[str, Any]:
    return race(year, gp)["track_intel"]


@app.get("/races/{year}/{gp}/telemetry")
def telemetry(year: int, gp: str, drivers: str = Query(...)) -> dict[str, Any]:
    data = race(year, gp)
    codes = [code.strip().upper() for code in drivers.split(",") if code.strip()]
    pace = data["telemetry"]["pace_evolution"]
    selected = {code: pace[code] for code in codes if code in pace}
    if not selected:
        raise HTTPException(404, "Telemetry is not bundled for those drivers")
    return {"year": year, "gp": gp, "pace_evolution": selected}


@app.get("/races/{year}/{gp}/telemetry/lap-matrix")
def lap_matrix(year: int, gp: str, drivers: str = Query(...)) -> dict[str, Any]:
    data = race(year, gp)
    codes = [code.strip().upper() for code in drivers.split(",") if code.strip()]
    matrix = data["telemetry"]["lap_matrix"]
    return {
        "year": year,
        "gp": gp,
        "total_laps": matrix.get("total_laps"),
        "drivers": {code: matrix.get("drivers", {}).get(code, []) for code in codes},
    }


@app.get("/races/{year}/{gp}/telemetry/lap-compare")
def lap_compare(
    year: int,
    gp: str,
    drivers: str = Query(...),
    laps: str = Query(...),
) -> dict[str, Any]:
    data = race(year, gp)
    driver_codes = [code.strip().upper() for code in drivers.split(",") if code.strip()]
    lap_numbers = [part.strip() for part in laps.split(",") if part.strip()]
    if len(driver_codes) != len(lap_numbers) or len(driver_codes) not in (1, 2):
        raise HTTPException(400, "Provide one or two matching driver/lap pairs")
    key = "|".join(f"{code}:{lap}" for code, lap in zip(driver_codes, lap_numbers))
    comparison = data["telemetry"]["lap_compare"].get(key)
    if comparison is None:
        supported = ", ".join(data["telemetry"]["lap_compare"].keys())
        raise HTTPException(404, f"This MVP only includes bundled telemetry samples: {supported}")
    return comparison


@app.get("/replay/available")
def replay_available() -> dict[str, Any]:
    return {"races": [f"{item['year']}:{item['slug']}" for item in manifest()["races"]]}


@app.get("/demo/replay/{year}/{gp}")
def demo_replay(year: int, gp: str) -> dict[str, Any]:
    return race(year, gp)["replay"]


@app.get("/replay/status")
def replay_status() -> dict[str, Any]:
    return {"running": False, "mode": "client", "listeners": 0}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
