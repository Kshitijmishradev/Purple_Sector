"""Build the five-race, static-data bundle used by the free MVP.

This script is intentionally separate from the local full-stack prewarm path.
It may use FastF1 and pandas on a CI runner, but the deployed demo API never
imports either package: it only reads the generated compressed artifacts.
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import zlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import fastf1  # noqa: E402
import orjson  # noqa: E402

from src.processor import F1DataProcessor  # noqa: E402
from src.stream.events import build_replay_events  # noqa: E402

OUT_DIR = ROOT / "backend" / "demo_data" / "v1"
RACES_DIR = OUT_DIR / "races"
SEASON = 2026
RACE_LIMIT = 5
MAX_TELEMETRY_PAIRS = 6

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("demo-bundle")


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")


def json_safe(value: Any) -> Any:
    if value is None:
        return None
    if hasattr(value, "item"):
        try:
            return json_safe(value.item())
        except (ValueError, TypeError):
            pass
    if isinstance(value, (str, int, float, bool)):
        return value
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    return str(value)


def completed_races() -> List[Tuple[int, str, Any]]:
    races = scheduled_events()
    now = datetime.now(timezone.utc)
    done = []
    for _, event in races.iterrows():
        stamp = event["EventDate"].to_pydatetime()
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=timezone.utc)
        if stamp < now:
            done.append((int(event["RoundNumber"]), str(event["EventName"]), event))
    return done[-RACE_LIMIT:]


def scheduled_events() -> Any:
    schedule = fastf1.get_event_schedule(SEASON)
    return schedule[schedule["EventFormat"] != "testing"]


def validate_race(payload: Dict[str, Any]) -> None:
    required = ("meta", "analytics", "insights", "track_intel", "replay")
    missing = [key for key in required if not payload.get(key)]
    if missing:
        raise ValueError(f"missing race sections: {', '.join(missing)}")
    analytics = payload["analytics"]
    if analytics.get("error") or not analytics.get("drivers"):
        raise ValueError("analytics payload is empty or contains an error")
    replay = payload["replay"]
    if not replay.get("events") or not replay.get("meta"):
        raise ValueError("replay payload has no events")
    telemetry = payload.get("telemetry") or {}
    if not telemetry.get("pace_evolution"):
        raise ValueError("telemetry pace data is empty")
    if not telemetry.get("lap_matrix"):
        raise ValueError("telemetry lap matrix is empty")
    if not telemetry.get("lap_compare"):
        raise ValueError("telemetry comparison samples are empty")


def write_compressed(path: Path, payload: Any) -> None:
    raw = orjson.dumps(json_safe(payload), option=orjson.OPT_NON_STR_KEYS)
    path.write_bytes(zlib.compress(raw, level=1))


def build_telemetry(
    processor: F1DataProcessor,
    year: int,
    gp: str,
    drivers: List[str],
) -> Dict[str, Any]:
    chosen = drivers[:2]
    pace = processor.get_selective_telemetry(year, gp, chosen)
    matrix = processor.get_lap_tire_matrix(year, gp, chosen)
    compare: Dict[str, Any] = {}

    lap_choices: Dict[str, List[int]] = {
        code: [int(row["lap"]) for row in matrix["drivers"].get(code, [])]
        for code in chosen
    }
    if len(chosen) == 2 and all(lap_choices.get(code) for code in chosen):
        pairs = list(zip(lap_choices[chosen[0]], lap_choices[chosen[1]]))
        midpoint = pairs[len(pairs) // 2]
        samples = [midpoint]
        if pairs:
            samples += [pairs[0], pairs[-1]]
        for lap_a, lap_b in samples[:MAX_TELEMETRY_PAIRS]:
            key = f"{chosen[0]}:{lap_a}|{chosen[1]}:{lap_b}"
            try:
                compare[key] = processor.compare_lap_telemetry(
                    year, gp, [(chosen[0], lap_a), (chosen[1], lap_b)]
                )
            except Exception as exc:  # noqa: BLE001 - keep other samples
                log.warning("  telemetry sample skipped %s (%s)", key, exc)

    return {
        "pace_evolution": pace,
        "lap_matrix": matrix,
        "lap_compare": compare,
        "supported_drivers": chosen,
    }


def build_bundle() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    RACES_DIR.mkdir(parents=True, exist_ok=True)
    processor = F1DataProcessor()
    schedule = scheduled_events()
    selected = completed_races()
    if len(selected) < RACE_LIMIT:
        raise RuntimeError(f"only {len(selected)} completed races are available")

    manifest_races = []
    for round_number, gp, event in selected:
        log.info("Building R%02d %s", round_number, gp)
        meta = processor.get_minimal_meta(SEASON, gp)
        analytics = processor.get_race_analytics(SEASON, gp)
        insights = processor.get_race_insights(SEASON, gp)
        track_intel = processor.get_track_intel(SEASON, gp)
        replay_meta, replay_events = build_replay_events(analytics)
        telemetry = build_telemetry(
            processor,
            SEASON,
            gp,
            [d["code"] for d in meta.get("drivers", []) if d.get("code")],
        )
        payload = {
            "version": "v1",
            "year": SEASON,
            "gp": gp,
            "slug": slug(gp),
            "round": round_number,
            "meta": {"year": SEASON, "gp": gp, **meta},
            "analytics": analytics,
            "insights": insights,
            "track_intel": track_intel,
            "replay": {"meta": replay_meta, "events": replay_events},
            "telemetry": telemetry,
        }
        validate_race(payload)
        write_compressed(RACES_DIR / f"{slug(gp)}.json.zlib", payload)
        manifest_races.append(
            {
                "year": SEASON,
                "gp": gp,
                "slug": slug(gp),
                "round": round_number,
                "event_date": json_safe(event["EventDate"]),
                "event_name": meta.get("event_name", gp),
                "total_laps": meta.get("total_laps"),
                "telemetry_drivers": telemetry["supported_drivers"],
                "telemetry_samples": sorted(telemetry["lap_compare"]),
            }
        )

    supported_slugs = {race["slug"] for race in manifest_races}
    calendar = []
    for _, event in schedule.iterrows():
        item = json_safe(event.to_dict())
        item["circuit_key"] = slug(str(event["EventName"]))
        item["mvp_supported"] = slug(str(event["EventName"])) in supported_slugs
        calendar.append(item)

    manifest = {
        "version": "v1",
        "season": SEASON,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "races": manifest_races,
        "calendar": calendar,
        "events": [race["gp"] for race in manifest_races],
    }
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    log.info("Wrote %d races to %s", len(manifest_races), OUT_DIR)


def refresh_calendar() -> None:
    manifest_path = OUT_DIR / "manifest.json"
    if not manifest_path.exists():
        raise RuntimeError("Build the demo bundle before refreshing its calendar")
    current = json.loads(manifest_path.read_text())
    supported_slugs = {race["slug"] for race in current["races"]}
    calendar = []
    for _, event in scheduled_events().iterrows():
        item = json_safe(event.to_dict())
        item["circuit_key"] = slug(str(event["EventName"]))
        item["mvp_supported"] = slug(str(event["EventName"])) in supported_slugs
        calendar.append(item)
    current["calendar"] = calendar
    manifest_path.write_text(json.dumps(current, indent=2) + "\n")
    log.info("Added %d calendar events to %s", len(calendar), manifest_path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--calendar-only", action="store_true")
    args = parser.parse_args()
    if args.calendar_only:
        refresh_calendar()
        return 0
    if args.dry_run:
        selected = completed_races()
        log.info("Would build: %s", ", ".join(gp for _, gp, _ in selected[-RACE_LIMIT:]))
        return 0
    build_bundle()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
