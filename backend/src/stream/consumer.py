"""Kafka consumer: turns a raw lap stream into live standings.

Runs as its own container, in a consumer group. That is the point -- start a
second replica and Redpanda reassigns partitions between them while you watch:

    docker compose up --scale consumer=2

This is the "stateful processing" half of the pipeline. The producer emits
isolated lap events with no notion of who is winning; this service accumulates
them into standings and derives gaps, then hands the result to Redis pub/sub
for the API to push over WebSockets.

Run with:  python -m src.stream.consumer
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict

import orjson
from aiokafka import AIOKafkaConsumer

from ..config import get_settings
from . import bus

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("consumer")


class RaceState:
    """Latest known state per driver, plus everything a timing tower needs.

    Beyond raw laps this tracks session bests and personal bests so the UI can
    colour times the way FIA timing does: purple for fastest in session, green
    for a driver's own best, yellow otherwise. Those flags have to be derived
    here -- the producer emits isolated laps and has no memory.
    """

    def __init__(self) -> None:
        self.reset()

    def reset(self, meta: Dict | None = None) -> None:
        self.meta = meta or {}
        self.drivers: Dict[str, Dict[str, Any]] = {}
        self.reference = {
            d.get("code"): d for d in (self.meta.get("drivers") or []) if d.get("code")
        }
        self.session_best_lap: float | None = None
        self.session_best_driver: str | None = None
        self.session_best_sectors: list[float | None] = [None, None, None]

    def apply(self, event: Dict[str, Any]) -> None:
        code = event["driver"]
        ref = self.reference.get(code, {})
        entry = self.drivers.setdefault(
            code,
            {
                "code": code,
                "name": ref.get("name", code),
                "team": ref.get("team", "Unknown"),
                "color": ref.get("color", "#777777"),
                "pit_stops": 0,
                "best_sectors": [None, None, None],
                "stint_start_lap": event.get("lap") or 1,
            },
        )

        lap_number = event.get("lap")
        lap_time = event.get("lap_time_s")
        sectors = [event.get("s1_s"), event.get("s2_s"), event.get("s3_s")]

        # New stint means fresh rubber -- reset the age counter.
        if event.get("stint") != entry.get("stint"):
            entry["stint_start_lap"] = lap_number or entry.get("stint_start_lap", 1)

        entry.update(
            {
                "lap": lap_number,
                "position": event.get("position"),
                "last_lap_s": lap_time,
                "sectors": sectors,
                "compound": event.get("compound"),
                "stint": event.get("stint"),
                "elapsed_s": event.get("t"),
                "track_status": event.get("track_status"),
            }
        )

        if event.get("pit_in"):
            entry["pit_stops"] = entry.get("pit_stops", 0) + 1
        entry["in_pit"] = bool(event.get("pit_in") or event.get("pit_out"))
        entry["tyre_age"] = max(0, (lap_number or 0) - entry.get("stint_start_lap", 0))

        # --- lap time flags ---
        personal_best = False
        session_best = False
        if lap_time is not None:
            best = entry.get("best_lap_s")
            if best is None or lap_time < best:
                entry["best_lap_s"] = lap_time
                personal_best = True
            if self.session_best_lap is None or lap_time < self.session_best_lap:
                self.session_best_lap = lap_time
                self.session_best_driver = code
                session_best = True
        entry["last_was_personal_best"] = personal_best
        entry["last_was_session_best"] = session_best

        # --- sector flags ---
        sector_flags = []
        for index, value in enumerate(sectors):
            if value is None:
                sector_flags.append(None)
                continue
            own = entry["best_sectors"][index]
            if own is None or value < own:
                entry["best_sectors"][index] = value
            overall = self.session_best_sectors[index]
            if overall is None or value < overall:
                self.session_best_sectors[index] = value
                sector_flags.append("session")
            elif value <= entry["best_sectors"][index]:
                sector_flags.append("personal")
            else:
                sector_flags.append("slower")
        entry["sector_flags"] = sector_flags

    def standings(self) -> list[dict]:
        """Order by laps completed, then elapsed time. Derive gap and interval.

        Gap is to the leader, interval is to the car directly ahead -- the two
        numbers a race engineer actually calls over the radio. Cars a lap down
        get '+1 LAP' instead of a meaningless time delta.
        """
        rows = sorted(
            self.drivers.values(),
            key=lambda d: (-(d.get("lap") or 0), d.get("elapsed_s") or 0.0),
        )
        if not rows:
            return []

        leader = rows[0]
        leader_lap = leader.get("lap") or 0
        leader_elapsed = leader.get("elapsed_s") or 0.0

        for index, row in enumerate(rows):
            row["live_position"] = index + 1
            lap = row.get("lap") or 0
            elapsed = row.get("elapsed_s") or 0.0
            lapped = lap < leader_lap

            if index == 0:
                row["gap"] = "LEADER"
                row["gap_s"] = 0.0
                row["interval"] = "\u2014"
            elif lapped:
                down = leader_lap - lap
                row["gap"] = f"+{down} LAP" + ("S" if down > 1 else "")
                row["gap_s"] = None
                row["interval"] = row["gap"]
            else:
                row["gap_s"] = round(elapsed - leader_elapsed, 3)
                row["gap"] = f"+{row['gap_s']:.3f}"
                ahead = rows[index - 1]
                if (ahead.get("lap") or 0) == lap:
                    delta = elapsed - (ahead.get("elapsed_s") or 0.0)
                    row["interval"] = f"+{delta:.3f}"
                else:
                    row["interval"] = row["gap"]

            row["is_session_best_holder"] = row["code"] == self.session_best_driver

        return rows


async def consume() -> None:
    settings = get_settings()
    state = RaceState()

    consumer = AIOKafkaConsumer(
        settings.kafka_topic,
        bootstrap_servers=settings.kafka_bootstrap,
        group_id=settings.kafka_group,
        value_deserializer=lambda v: orjson.loads(v),
        auto_offset_reset="latest",
        enable_auto_commit=True,
    )

    # Redpanda may still be starting when this container comes up.
    for attempt in range(30):
        try:
            await consumer.start()
            break
        except Exception as exc:
            logger.warning("broker not ready (%s), retry %s", exc, attempt + 1)
            await asyncio.sleep(2)
    else:
        raise RuntimeError("Could not reach the broker")

    logger.info("Consuming %s as group %s", settings.kafka_topic, settings.kafka_group)

    # Coalesce standings frames. Applying an event is cheap; broadcasting the
    # whole field is not, and at 200x a replay produces events far faster than
    # any UI can use. So events update state immediately and a separate pump
    # publishes the latest snapshot at a fixed rate. What viewers see is
    # identical; what crosses the network is ~5x smaller.
    dirty = asyncio.Event()
    latest: Dict[str, Any] = {"lap": None, "partition": None}
    interval = 1.0 / max(settings.publish_hz, 0.1)

    async def publish_standings() -> None:
        await bus.publish(
            {
                "type": "standings",
                "lap": latest["lap"],
                "total_laps": state.meta.get("total_laps"),
                "partition": latest["partition"],
                "session_best_lap": state.session_best_lap,
                "session_best_driver": state.session_best_driver,
                "session_best_sectors": state.session_best_sectors,
                "standings": state.standings(),
            }
        )

    async def pump() -> None:
        while True:
            await dirty.wait()
            dirty.clear()
            await publish_standings()
            await asyncio.sleep(interval)

    pump_task = asyncio.create_task(pump())
    frames = 0

    try:
        async for message in consumer:
            event = message.value
            kind = event.get("type")

            if kind == "session_start":
                dirty.clear()
                state.reset(event.get("meta") or {})
                latest.update(lap=None, partition=None)
                await bus.publish({"type": "session_start", "meta": state.meta})
                logger.info("Session start: %s", state.meta.get("event_name"))
                continue

            if kind == "session_end":
                # Publish unconditionally rather than only when dirty: the
                # pump may have just consumed the flag and be mid-sleep, and
                # the final classification is the one frame that must land.
                dirty.clear()
                await publish_standings()
                await bus.publish({"type": "session_end"})
                logger.info("Session end (%d frames published)", frames)
                frames = 0
                continue

            if kind != "lap":
                continue

            state.apply(event)
            latest["lap"] = event.get("lap")
            latest["partition"] = message.partition
            if not dirty.is_set():
                frames += 1
            dirty.set()
    finally:
        pump_task.cancel()
        try:
            await pump_task
        except asyncio.CancelledError:
            pass
        await consumer.stop()
        await bus.close()


if __name__ == "__main__":
    try:
        asyncio.run(consume())
    except KeyboardInterrupt:
        pass
