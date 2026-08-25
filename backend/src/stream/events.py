"""Turn a finished race into a time-ordered event stream.

The premise of the whole live pipeline: F1 runs ~24 weekends a year, so a
genuinely live feed is dead 341 days out of 365. Instead we replay a completed
race as if it were happening now. Same consumers, same topics, same code path
as a real feed would use -- but demoable on a Tuesday in February, and
deterministic enough to actually test.

Source data is whatever `processor.get_race_analytics()` already returns, so
this costs no extra FastF1 work and rides the Redis cache from day 1.
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple


def build_replay_events(analytics: Dict[str, Any]) -> Tuple[Dict, List[Dict]]:
    """Flatten analytics into (meta, events) with events sorted by session time.

    Each lap carries `race_time_s`, the absolute session clock at which it was
    completed. Interleaving every driver's crossings and sorting by it
    reproduces the order a live timing feed would have delivered them in.

    Older cached payloads predate that field, so we fall back to accumulating
    lap_time_s. That fallback is approximate on purpose: laps with no recorded
    LapTime are dropped upstream, so any driver missing one has their whole
    subsequent clock shifted earlier and drifts up the order. Prefer the
    absolute value whenever it is present.
    """
    lap_block = analytics.get("lap_times_and_splits") or {}
    per_driver: Dict[str, List[Dict]] = lap_block.get("drivers") or {}

    meta = {
        "year": analytics.get("year"),
        "gp": analytics.get("gp"),
        "event_name": analytics.get("event_name"),
        "total_laps": analytics.get("total_laps"),
        "drivers": analytics.get("drivers") or [],
    }

    events: List[Dict] = []
    for code, laps in per_driver.items():
        elapsed = 0.0
        for lap in sorted(laps, key=lambda r: r.get("lap") or 0):
            lap_time = lap.get("lap_time_s")
            if lap_time is None:
                continue
            elapsed += float(lap_time)
            race_time = lap.get("race_time_s")
            crossed = float(race_time) if race_time is not None else elapsed
            events.append(
                {
                    "t": round(crossed, 3),
                    "driver": str(code),
                    "lap": lap.get("lap"),
                    "lap_time_s": lap_time,
                    "position": lap.get("position"),
                    "compound": lap.get("compound"),
                    "stint": lap.get("stint"),
                    "pit_in": lap.get("pit_in"),
                    "pit_out": lap.get("pit_out"),
                    "s1_s": lap.get("s1_s"),
                    "s2_s": lap.get("s2_s"),
                    "s3_s": lap.get("s3_s"),
                    "track_status": lap.get("track_status"),
                }
            )

    events.sort(key=lambda e: e["t"])
    return meta, events
