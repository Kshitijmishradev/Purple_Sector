"""Precompute every payload the 2026 season needs and write them to disk.

Why this exists
---------------
The expensive half of this app is pandas, not the network: a full per-race
prewarm peaks around 680MB and takes ~16s. That is fine on a CI runner with
7GB and free minutes, and fatal on a 512MB free-tier container. So all of it
happens here, ahead of time, and the deployed API serves the results without
ever importing FastF1 at request time.

The season is live, so this is not a one-shot build. It runs weekly and is
designed to be re-run safely at any point:

  * a round with no file yet is always built
  * the two most recent rounds are always REBUILT, because timing corrections
    land for several days after a race -- the same belief `ttl_for_event`
    already encodes when it refuses to cache a fresh race for more than 300s
  * everything else is left alone

Usage
-----
    python scripts/prewarm.py              # missing rounds + last two
    python scripts/prewarm.py --all        # rebuild the whole season
    python scripts/prewarm.py --round 12   # one specific round
    python scripts/prewarm.py --dry-run    # report what it would do

`--all` is mandatory after any change to a `_build_*_payload`: bumping
CACHE_VERSION makes every existing file unreachable, and an incremental run
would leave the season half-built under the new version.
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Tuple

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import fastf1  # noqa: E402

from src import cache  # noqa: E402
from src.config import get_settings  # noqa: E402
from src.processor import F1DataProcessor  # noqa: E402

SEASON = 2026
OUT_DIR = ROOT / "backend" / "prewarmed"
FASTF1_DIR = ROOT / "backend" / "data_cache"

# How many of the most recent completed rounds to rebuild every run.
# Two, not one: a Tuesday job sees Sunday's race before the F1 API has
# finished issuing corrections, so last week's round gets a second pass.
REBUILD_RECENT = 2

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("prewarm")


class ValidationError(Exception):
    """A computed payload is not fit to be cached."""


# --- validation -----------------------------------------------------------
#
# This is the part that matters most. `ttl_for_event` caches anything older
# than a week with NO expiry, so a bad payload written here is not a transient
# glitch -- it is permanent until someone notices and purges it by hand.
# `get_race_analytics` returns {"error": ...} rather than raising when a
# session has no lap data, which is exactly the shape that would slip through
# an unguarded write.

def _check_analytics(payload: Dict[str, Any]) -> None:
    if payload.get("error"):
        raise ValidationError(f"processor reported: {payload['error']}")
    if not payload.get("total_laps"):
        raise ValidationError("no total_laps")
    if not payload.get("drivers"):
        raise ValidationError("no drivers")

    laps = (payload.get("lap_times_and_splits") or {}).get("drivers") or {}
    if not laps:
        raise ValidationError("no per-driver lap data")

    # The replay clock depends on this field. If it is absent the stream
    # silently falls back to accumulating lap times, which drifts by minutes
    # for any driver with a gap in their timing -- so treat it as fatal here
    # rather than shipping a subtly wrong replay.
    total = sum(len(rows) for rows in laps.values())
    timed = sum(
        1 for rows in laps.values() for r in rows if r.get("race_time_s") is not None
    )
    if timed == 0:
        raise ValidationError("no race_time_s on any lap (stale processor?)")
    if timed < total * 0.9:
        raise ValidationError(f"only {timed}/{total} laps carry race_time_s")


def _check_nonempty(payload: Any) -> None:
    if not payload:
        raise ValidationError("empty payload")


def _check_track_intel(payload: Dict[str, Any]) -> None:
    """Track intel is borrowed from last season, and that can legitimately fail.

    A brand-new or relocated venue has no prior session to borrow from, and
    the processor says so explicitly. That is a real answer, not a defect --
    but an all-None payload with no reason attached means the borrow silently
    fell through, which is the shape that would otherwise get cached forever.
    """
    _check_nonempty(payload)

    if payload.get("unavailable_reason"):
        return  # deliberate, self-describing

    missing = [
        field
        for field in ("total_laps", "circuit_length_km", "race_distance_km")
        if payload.get(field) is None
    ]
    if missing:
        raise ValidationError(f"no reason given but empty: {', '.join(missing)}")


def _check_insights(payload: Dict[str, Any]) -> None:
    _check_nonempty(payload)
    if not payload.get("pace_evolution") and not payload.get("stints"):
        raise ValidationError("neither stints nor pace_evolution present")


# --- disk layout ----------------------------------------------------------

def key_to_filename(key: str) -> str:
    """gl:v2:analytics:2026:british-grand-prix -> gl__v2__analytics__...zlib

    Colons are legal on Linux but not on every filesystem a contributor might
    clone onto, and they make shell globbing awkward. The mapping is
    reversible, which is what the loader needs.
    """
    return key.replace(":", "__") + ".zlib"


def filename_to_key(name: str) -> str:
    return name[: -len(".zlib")].replace("__", ":")


def write_payload(key: str, payload: Any) -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    blob = cache._dumps(cache._coerce_keys(payload))
    (OUT_DIR / key_to_filename(key)).write_bytes(blob)
    return len(blob)


# --- what to build --------------------------------------------------------

Job = Tuple[str, Callable[[], Any], Callable[[Any], None]]


def season_jobs(processor: F1DataProcessor) -> List[Job]:
    """Payloads that belong to the season rather than a single race."""
    schedule = fastf1.get_event_schedule(SEASON)
    races = schedule[schedule["EventFormat"] != "testing"]

    def build_schedule() -> Dict[str, Any]:
        return {"year": SEASON, "events": races["EventName"].tolist()}

    return [
        (cache.make_key("schedule", SEASON), build_schedule, _check_nonempty),
    ]


def race_jobs(processor: F1DataProcessor, gp: str) -> List[Job]:
    return [
        (
            cache.make_key("meta", SEASON, gp),
            lambda: processor.get_minimal_meta(SEASON, gp),
            _check_nonempty,
        ),
        (
            cache.make_key("analytics", SEASON, gp),
            lambda: processor.get_race_analytics(SEASON, gp),
            _check_analytics,
        ),
        (
            cache.make_key("insights", SEASON, gp),
            lambda: processor.get_race_insights(SEASON, gp),
            _check_insights,
        ),
        (
            cache.make_key("track-intel", SEASON, gp),
            lambda: processor.get_track_intel(SEASON, gp),
            _check_track_intel,
        ),
    ]


# --- schedule inspection --------------------------------------------------

def completed_rounds() -> List[Tuple[int, str]]:
    """(round_number, event_name) for every 2026 race that has already run."""
    schedule = fastf1.get_event_schedule(SEASON)
    races = schedule[schedule["EventFormat"] != "testing"]
    now = datetime.now(timezone.utc)

    out: List[Tuple[int, str]] = []
    for _, event in races.iterrows():
        event_date = event["EventDate"]
        stamp = event_date.to_pydatetime()
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=timezone.utc)
        if stamp < now:
            out.append((int(event["RoundNumber"]), str(event["EventName"])))
    return out


def select_rounds(args, done: List[Tuple[int, str]]) -> List[Tuple[int, str]]:
    if args.round:
        picked = [r for r in done if r[0] == args.round]
        if not picked:
            raise SystemExit(f"Round {args.round} is not a completed 2026 race")
        return picked

    if args.all:
        return done

    missing = [
        r
        for r in done
        if not (OUT_DIR / key_to_filename(cache.make_key("analytics", SEASON, r[1]))).exists()
    ]
    recent = done[-REBUILD_RECENT:] if done else []

    merged = {r[0]: r for r in missing + recent}
    return [merged[k] for k in sorted(merged)]


# --- main -----------------------------------------------------------------

def run_job(job: Job, dry_run: bool) -> Tuple[bool, int, str]:
    key, build, validate = job
    if dry_run:
        return True, 0, "would build"

    started = time.time()
    try:
        payload = build()
        validate(payload)
    except ValidationError as exc:
        return False, 0, f"INVALID: {exc}"
    except Exception as exc:  # noqa: BLE001 - report and keep going
        return False, 0, f"FAILED: {type(exc).__name__}: {exc}"

    size = write_payload(key, payload)
    return True, size, f"{time.time() - started:5.1f}s  {size / 1024:6.1f} KB"


def main() -> int:
    parser = argparse.ArgumentParser(description="Prewarm 2026 season payloads")
    parser.add_argument("--all", action="store_true", help="rebuild every completed round")
    parser.add_argument("--round", type=int, help="rebuild one round number")
    parser.add_argument("--dry-run", action="store_true", help="report, do not build")
    args = parser.parse_args()

    FASTF1_DIR.mkdir(parents=True, exist_ok=True)
    fastf1.Cache.enable_cache(str(FASTF1_DIR))

    settings = get_settings()
    log.info("Prewarming %s season  (CACHE_VERSION=%s)", SEASON, settings.cache_version)

    processor = F1DataProcessor()
    done = completed_rounds()
    if not done:
        log.warning("No completed %s rounds yet -- nothing to do", SEASON)
        return 0

    targets = select_rounds(args, done)
    log.info("%d/%d rounds completed; building %d", len(done), len(done), len(targets))
    log.info("")

    failures: List[str] = []
    total_bytes = 0

    for key, build, validate in season_jobs(processor):
        ok, size, note = run_job((key, build, validate), args.dry_run)
        total_bytes += size
        log.info("  %-52s %s", key, note)
        if not ok:
            failures.append(f"{key}: {note}")

    for number, gp in targets:
        log.info("")
        log.info("R%02d %s", number, gp)
        for job in race_jobs(processor, gp):
            ok, size, note = run_job(job, args.dry_run)
            total_bytes += size
            log.info("  %-52s %s", job[0], note)
            if not ok:
                failures.append(f"{job[0]}: {note}")

    log.info("")
    log.info("Wrote %.1f KB across this run", total_bytes / 1024)

    if OUT_DIR.exists():
        files = list(OUT_DIR.glob("*.zlib"))
        on_disk = sum(f.stat().st_size for f in files)
        log.info("Bundle now %d files, %.1f KB total", len(files), on_disk / 1024)

    if failures:
        log.error("")
        log.error("%d job(s) failed:", len(failures))
        for line in failures:
            log.error("  %s", line)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
