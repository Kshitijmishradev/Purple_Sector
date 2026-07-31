"""Replay a finished race into Kafka on a scaled wall clock.

Runs as an asyncio task inside the API process. One replay at a time -- this is
a demo engine, not a job scheduler.

The important Kafka detail here is the message key. Keying by driver code means
every event for VER lands in the same partition, and Kafka only guarantees
ordering *within* a partition. Key by something else and VER's lap 12 can
arrive before lap 11 once you have more than one partition.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Callable, Dict, List, Optional

import orjson
from aiokafka import AIOKafkaProducer

from ..config import get_settings
from .events import build_replay_events

logger = logging.getLogger(__name__)


class ReplayEngine:
    def __init__(self) -> None:
        self._task: Optional[asyncio.Task] = None
        self._state: Dict[str, Any] = {"running": False}

    # --- control ---------------------------------------------------------

    async def start(
        self,
        year: int,
        gp: str,
        speed: float,
        loader: Callable[[], Any],
    ) -> Dict[str, Any]:
        if self._task and not self._task.done():
            raise RuntimeError("A replay is already running -- stop it first")

        analytics = await loader()
        meta, events = build_replay_events(analytics)
        if not events:
            raise ValueError("No lap data available to replay for this race")

        self._state = {
            "running": True,
            "year": year,
            "gp": gp,
            "speed": speed,
            "event_name": meta.get("event_name"),
            "total_events": len(events),
            "sent": 0,
            "lap": 0,
            "total_laps": meta.get("total_laps"),
        }
        self._task = asyncio.create_task(self._run(meta, events, speed))
        return self.status()

    async def stop(self) -> Dict[str, Any]:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._state["running"] = False
        return self.status()

    def status(self) -> Dict[str, Any]:
        return dict(self._state)

    # --- the loop --------------------------------------------------------

    async def _run(self, meta: Dict, events: List[Dict], speed: float) -> None:
        settings = get_settings()
        producer = AIOKafkaProducer(
            bootstrap_servers=settings.kafka_bootstrap,
            value_serializer=lambda v: orjson.dumps(v, default=str),
            key_serializer=lambda k: k.encode(),
            linger_ms=20,
        )
        await producer.start()
        try:
            # Control message first so consumers can reset their state and
            # clients get driver names/colours before any timing arrives.
            await producer.send_and_wait(
                settings.kafka_topic,
                key="__meta__",
                value={"type": "session_start", "meta": meta},
            )

            t_zero = events[0]["t"]
            started = time.monotonic()

            for event in events:
                target = (event["t"] - t_zero) / speed
                drift = target - (time.monotonic() - started)
                if drift > 0:
                    await asyncio.sleep(drift)

                await producer.send(
                    settings.kafka_topic,
                    key=event["driver"],
                    value={"type": "lap", **event},
                )
                self._state["sent"] += 1
                self._state["lap"] = event.get("lap") or self._state["lap"]

            await producer.send_and_wait(
                settings.kafka_topic,
                key="__meta__",
                value={"type": "session_end"},
            )
            logger.info("Replay finished: %s events", len(events))

        except asyncio.CancelledError:
            logger.info("Replay cancelled at event %s", self._state.get("sent"))
            raise
        except Exception:
            logger.exception("Replay failed")
        finally:
            self._state["running"] = False
            await producer.stop()


engine = ReplayEngine()
