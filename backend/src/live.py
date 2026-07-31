"""WebSocket fan-out.

One task subscribes to the Redis live channel and pushes each message to every
connected browser. Kept deliberately dumb: it holds the most recent standings
so a client joining mid-replay gets a full picture immediately instead of an
empty table until the next lap ticks over.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional, Set

from fastapi import WebSocket

from .stream import bus

logger = logging.getLogger(__name__)


class LiveHub:
    def __init__(self) -> None:
        self._clients: Set[WebSocket] = set()
        self._snapshot: Optional[Dict[str, Any]] = None
        self._task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._clients.add(websocket)
        if self._snapshot is not None:
            try:
                await websocket.send_json(self._snapshot)
            except Exception:
                pass

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(websocket)

    async def broadcast(self, payload: Dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._clients)
        dead = []
        for client in targets:
            try:
                await client.send_json(payload)
            except Exception:
                dead.append(client)
        if dead:
            async with self._lock:
                for client in dead:
                    self._clients.discard(client)

    @property
    def client_count(self) -> int:
        return len(self._clients)

    # --- pump ------------------------------------------------------------

    async def _pump(self) -> None:
        while True:
            try:
                async for message in bus.subscribe():
                    if message.get("type") == "standings":
                        self._snapshot = message
                    elif message.get("type") == "session_start":
                        self._snapshot = None
                    await self.broadcast(message)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("live pump died (%s), restarting in 2s", exc)
                await asyncio.sleep(2)

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._pump())

    async def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        await bus.close()


hub = LiveHub()
