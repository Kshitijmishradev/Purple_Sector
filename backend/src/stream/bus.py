"""Redis pub/sub bridge between the consumer process and the API's WebSockets.

Why this exists: the Kafka consumer runs as its own container so you can scale
it and watch a consumer group rebalance. But the browsers are connected to the
API container. Those are different processes, so the consumer needs a way to
hand finished state to whichever API instance holds the socket.

Kafka is the durable, replayable log. Redis pub/sub is the last hop -- fire and
forget, no persistence, no consumer groups. That's the right split: you do not
want a socket fan-out committing offsets, and you do not want race history
living in a pub/sub channel.
"""

from __future__ import annotations

import logging
from typing import Any, AsyncIterator, Optional

import orjson
from redis.asyncio import Redis

from ..config import get_settings

logger = logging.getLogger(__name__)

LIVE_CHANNEL = "gl:live"

_publisher: Optional[Redis] = None


async def _client() -> Redis:
    global _publisher
    if _publisher is None:
        _publisher = Redis.from_url(get_settings().redis_url, decode_responses=False)
    return _publisher


async def publish(payload: Any) -> None:
    try:
        client = await _client()
        await client.publish(LIVE_CHANNEL, orjson.dumps(payload, default=str))
    except Exception as exc:  # never let fan-out failures kill the consumer
        logger.warning("publish failed: %s", exc)


async def subscribe() -> AsyncIterator[dict]:
    """Yield messages from the live channel until cancelled."""
    client = Redis.from_url(get_settings().redis_url, decode_responses=False)
    pubsub = client.pubsub()
    await pubsub.subscribe(LIVE_CHANNEL)
    try:
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            try:
                yield orjson.loads(message["data"])
            except orjson.JSONDecodeError:
                continue
    finally:
        await pubsub.unsubscribe(LIVE_CHANNEL)
        await pubsub.aclose()
        await client.aclose()


async def close() -> None:
    global _publisher
    if _publisher is not None:
        await _publisher.aclose()
        _publisher = None
