"""Redis cache-aside layer for GridLogic.

The expensive thing in this app is not downloading F1 data -- FastF1 already
caches raw sessions on disk. The expensive thing is the pandas work in
processor.py that turns a session into a payload. That is what we cache here.

Three problems this module solves:

1. Cold requests take 10-30s.  -> cache the computed payload
2. Concurrent cold requests run the same 2GB pandas job N times, and the
   OOM killer takes the container.  -> distributed lock, one winner computes
3. Redis being down should degrade to "slow", never to "broken".
   -> every Redis call is wrapped; failures fall through to compute
"""

from __future__ import annotations

import asyncio
import contextvars
import logging
import time
import zlib
from datetime import date
from functools import lru_cache
from typing import Any, Callable, Optional
from uuid import uuid4

import orjson
from redis.asyncio import Redis
from redis.exceptions import RedisError

from .config import get_settings

logger = logging.getLogger(__name__)

# Set by cached() so the middleware in main.py can emit an X-Cache header.
# A ContextVar (not a global) because many requests share one event loop.
cache_status: contextvars.ContextVar[str] = contextvars.ContextVar(
    "cache_status", default="BYPASS"
)

_redis: Optional[Redis] = None


# --- Lock release --------------------------------------------------------
#
# "delete the lock" is really "check I still own it, then delete it" -- a
# check-then-act pair. If the compute overran lock_timeout, the lock already
# expired, another worker took it, and a plain DEL would delete *their* lock.
#
# Redis runs a Lua script as one indivisible operation, which is exactly the
# atomicity a bare DEL cannot give us.
_RELEASE_LUA = """
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
else
    return 0
end
"""


class ComputationInProgress(Exception):
    """Another worker is computing this payload and did not finish in time."""


# --- Connection lifecycle -------------------------------------------------

async def connect() -> None:
    """Called from the FastAPI lifespan handler on startup."""
    global _redis
    settings = get_settings()
    if not settings.cache_enabled:
        logger.warning("Cache disabled by config; every request will compute")
        return
    try:
        # decode_responses MUST be False. We store zlib-compressed bytes;
        # with decoding on, redis-py tries to UTF-8 decode them and raises
        # UnicodeDecodeError on read, which looks like a bug in your reader.
        client = Redis.from_url(settings.redis_url, decode_responses=False)
        await client.ping()
        _redis = client
        logger.info("Connected to Redis at %s", settings.redis_url)
    except RedisError as exc:
        logger.error("Redis unavailable (%s) -- running without cache", exc)
        _redis = None


async def disconnect() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None


def is_connected() -> bool:
    return _redis is not None


# --- Serialization --------------------------------------------------------

_OPTS = orjson.OPT_SERIALIZE_NUMPY | orjson.OPT_NON_STR_KEYS


def _coerce_keys(obj: Any) -> Any:
    """Recursively force dict keys to str.

    pandas groupby yields numpy scalar keys (np.int64 lap numbers), and orjson
    rejects those even with OPT_NON_STR_KEYS. JSON requires string keys
    regardless, so coercing here makes the cached copy byte-identical to a
    freshly computed response.
    """
    if isinstance(obj, dict):
        return {
            (k if isinstance(k, str) else str(k)): _coerce_keys(v)
            for k, v in obj.items()
        }
    if isinstance(obj, (list, tuple)):
        return [_coerce_keys(v) for v in obj]
    return obj


def _dumps(value: Any) -> bytes:
    # level=1 gets ~30x on this kind of numeric JSON at a fraction of the CPU
    # of level=9. Your payloads are 1-5MB raw, so this matters.
    return zlib.compress(
        orjson.dumps(value, default=str, option=_OPTS),
        level=1,
    )


def _loads(blob: bytes) -> Any:
    return orjson.loads(zlib.decompress(blob))


# --- Key construction -----------------------------------------------------

def make_key(namespace: str, *parts: Any) -> str:
    """gl:v1:analytics:2024:monza

    Lowercased and space-stripped so "Monza" and "monza " share a slot.
    """
    version = get_settings().cache_version
    clean = [str(p).strip().lower().replace(" ", "-") for p in parts]
    return ":".join(["gl", version, namespace, *clean])


# --- TTL policy -----------------------------------------------------------

@lru_cache(maxsize=1024)
def _event_date(year: int, gp: str) -> Optional[date]:
    """Date of an event. Memoized: an event's date never changes, only its age."""
    try:
        import fastf1

        event = fastf1.get_event(year, gp)
        value = event["EventDate"]
        return value.date() if hasattr(value, "date") else None
    except Exception:
        return None


def ttl_for_event(year: int, gp: str) -> Optional[int]:
    """How long a payload for this race stays valid.

    A 2019 race is immutable -- cache it forever. A race that finished two
    hours ago may still be getting timing corrections from the F1 API, so
    keep it short. This is the bit that makes it a race cache rather than a
    generic one.

    Returns None for "no expiry" (redis-py treats ex=None as persist).
    """
    event_day = _event_date(year, gp)
    if event_day is None:
        return 3600  # unknown event: be conservative

    age_days = (date.today() - event_day).days
    if age_days > 7:
        return None      # settled, will never change again
    if age_days > 1:
        return 86_400    # 24h, corrections are unlikely by now
    return 300           # race weekend: stay fresh


# --- Stats ----------------------------------------------------------------

async def _bump(field: str) -> None:
    if _redis is None:
        return
    try:
        await _redis.hincrby(make_key("stats"), field, 1)
    except RedisError:
        pass


async def stats() -> dict:
    if _redis is None:
        return {"connected": False}
    try:
        raw = await _redis.hgetall(make_key("stats"))
        counts = {k.decode(): int(v) for k, v in raw.items()}
        hits, misses = counts.get("hits", 0), counts.get("misses", 0)
        total = hits + misses
        info = await _redis.info("memory")
        return {
            "connected": True,
            "hits": hits,
            "misses": misses,
            "hit_rate": round(hits / total, 3) if total else None,
            "used_memory": info.get("used_memory_human"),
        }
    except RedisError as exc:
        return {"connected": False, "error": str(exc)}


# --- The main event -------------------------------------------------------

async def cached(
    key: str,
    ttl: Optional[int],
    compute: Callable[[], Any],
    *,
    attempts: int = 3,
) -> Any:
    """Cache-aside with stampede protection.

    `compute` is a blocking callable. It is run via asyncio.to_thread because
    processor.py is synchronous pandas -- calling it directly from an async
    route freezes the event loop and every other request hangs behind it.
    """
    settings = get_settings()

    if _redis is None:
        cache_status.set("BYPASS")
        return await asyncio.to_thread(compute)

    lock_key = f"{key}:lock"

    for _ in range(attempts):
        # 1. Fast path.
        try:
            hit = await _redis.get(key)
        except RedisError as exc:
            logger.warning("Redis GET failed (%s) -- computing directly", exc)
            cache_status.set("BYPASS")
            return await asyncio.to_thread(compute)

        if hit is not None:
            cache_status.set("HIT")
            await _bump("hits")
            return _loads(hit)

        # 2. Try to become the one worker that computes this.
        #    SET NX is a single command, so exactly one caller can win --
        #    no gap for a second worker to slip into.
        token = uuid4().hex
        try:
            won = await _redis.set(
                lock_key, token, nx=True, ex=settings.lock_timeout
            )
        except RedisError:
            won = True  # can't coordinate; better to compute than to fail

        if won:
            cache_status.set("MISS")
            await _bump("misses")
            try:
                value = await asyncio.to_thread(compute)
                # Coerce before BOTH the store and the return, so a MISS and a
                # HIT hand back identical shapes. Otherwise the page works on
                # first load and breaks on refresh (or the reverse).
                value = _coerce_keys(value)
                try:
                    await _redis.set(key, _dumps(value), ex=ttl)
                except RedisError as exc:
                    logger.warning("Redis SET failed (%s)", exc)
                return value
            finally:
                try:
                    await _redis.eval(_RELEASE_LUA, 1, lock_key, token)
                except RedisError:
                    pass

        # 3. We lost. Wait for the winner rather than duplicating the work.
        deadline = time.monotonic() + settings.wait_timeout
        while time.monotonic() < deadline:
            await asyncio.sleep(0.5)
            try:
                hit = await _redis.get(key)
                if hit is not None:
                    cache_status.set("HIT")
                    await _bump("hits")
                    return _loads(hit)
                if not await _redis.exists(lock_key):
                    break  # winner died or its lock expired -- retry as winner
            except RedisError:
                break
        else:
            raise ComputationInProgress(
                "Timed out waiting for another worker to finish this race"
            )

    raise ComputationInProgress("Gave up acquiring the compute lock")


# --- Invalidation ---------------------------------------------------------

async def invalidate(pattern: str) -> int:
    """Delete keys matching a glob. Uses SCAN, never KEYS.

    KEYS blocks the whole server while it walks the keyspace -- fine with 12
    keys on your laptop, an outage in production. SCAN walks it in chunks.
    """
    if _redis is None:
        return 0
    removed = 0
    try:
        async for key in _redis.scan_iter(match=pattern, count=200):
            await _redis.delete(key)
            removed += 1
    except RedisError as exc:
        logger.warning("Invalidation failed (%s)", exc)
    return removed
