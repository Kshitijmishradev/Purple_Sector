# GridLogic — Architecture

F1 race analytics with a Redis caching layer and a Kafka-based replay pipeline.

## Why this shape

**The expensive thing is pandas, not the network.** FastF1 already caches raw
session downloads to disk. What costs 10–30s per request is `processor.py`
turning a session into payloads. So Redis caches *computed payloads*, not
sessions.

**There is no live F1 data 341 days a year.** A genuinely live pipeline would be
idle almost always and untestable on demand. Instead the producer replays a
finished race on a scaled clock. Same topics, same consumers, same code path a
real feed would use — but deterministic, testable, and demoable any day.

## Components

| Service    | Role                                                        |
|------------|-------------------------------------------------------------|
| `backend`  | FastAPI. Serves cached analytics, hosts the replay producer and WebSocket fan-out |
| `redis`    | Cache for computed payloads + pub/sub bridge to the sockets  |
| `redpanda` | Kafka-compatible broker. Same protocol, no JVM, ~300MB       |
| `consumer` | Stateful stream processor. Kafka → standings → Redis pub/sub |
| `console`  | Redpanda web UI for inspecting topics and messages           |

## Request path (cached reads)

```
browser → FastAPI → Redis ──hit──→ response (~5ms)
                      └──miss──→ SET NX lock → pandas → cache → response
```

Concurrent misses on the same key do **not** each compute. `SET NX` elects one
worker; the rest poll for its result. Without this, five simultaneous cold
requests meant five 2GB pandas jobs and an OOM kill.

The lock is released with a Lua script comparing a per-holder token, not a bare
`DEL` — if a compute overruns the lock TTL the lock has already been reassigned,
and an unguarded delete would release someone else's.

TTLs follow race age: older than a week is immutable and cached without expiry;
a race from the current weekend gets 300s because timing corrections still land.

## Stream path (replay)

```
POST /replay/{year}/{gp}?speed=10
        │
        ▼
   producer ──→ f1.timing ──→ consumer ──→ Redis pub/sub ──→ WebSocket → browser
   (in API)     (3 parts)     (group)
```

Messages are keyed by driver code. Kafka guarantees ordering only *within* a
partition, so keying by driver is what stops VER's lap 12 arriving before lap 11.

Each event is placed on the clock using `race_time_s`, the absolute session
time at which the lap was completed. The obvious alternative — accumulating
lap durations per driver — is wrong in a way that is easy to miss: laps with
no recorded `LapTime` are dropped upstream, and only 4 of 22 drivers finished
the 2026 British GP with complete timing. Accumulating put one of them eight
and a half minutes ahead of where he actually was, and since `standings()`
orders by elapsed time, drivers with gaps in their data floated to the front
of the tower.

The consumer is a separate container running in a consumer group. Scale it and
watch partitions rebalance:

```bash
docker compose up --scale consumer=2
```

Redis pub/sub handles the last hop rather than Kafka. The consumer and the API
are different processes, and a socket fan-out should not be committing offsets.
Kafka is the durable, replayable log; pub/sub is fire-and-forget delivery.

## Running

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up --build

cd frontend && bun install && bun run dev
```

| URL                      | What                          |
|--------------------------|-------------------------------|
| http://localhost:5173    | Frontend                      |
| http://localhost:8000/docs | API docs                    |
| http://localhost:8080    | Redpanda console              |
| localhost:19092          | Broker, for `rpk` from host   |

### Verifying the cache

```bash
curl -i localhost:8000/races/2024/Italian%20Grand%20Prix/analytics  # X-Cache: MISS
curl -i localhost:8000/races/2024/Italian%20Grand%20Prix/analytics  # X-Cache: HIT
curl localhost:8000/cache/stats
```

### Verifying the stream

```bash
rpk topic consume f1.timing --brokers localhost:19092
curl -X POST "localhost:8000/replay/2024/Italian%20Grand%20Prix?speed=30"
rpk group describe gridlogic-live --brokers localhost:19092
```

## Precomputed payloads

Measured on the 2026 British GP, warm:

| Path                          | Time   | Peak RSS | Payload (zlib) |
|-------------------------------|--------|----------|----------------|
| `analytics` (the replay feed) | 1.0s   | 125 MB   | 54 KB          |
| `insights` / `meta`           | ~2s    | —        | ~7 KB          |
| `track-intel`                 | 13.2s  | —        | 0.1 KB         |
| `lap-compare` telemetry       | 32.4s  | 621 MB   | 76 KB          |

The pandas work is what costs, and `telemetry=True` is what makes it expensive
— the replay path itself is cheap. So everything except the combinatorial
telemetry endpoints is computed ahead of time by `scripts/prewarm.py`, on a CI
runner where 680MB and a few minutes are free, and committed to the repo:

```bash
python scripts/prewarm.py            # missing rounds + the last two
python scripts/prewarm.py --all      # required after a CACHE_VERSION bump
```

`cache.seed_from_disk()` loads the bundle into Redis at startup, so a deployed
container serves every read from cache and never imports FastF1 at request
time. The whole 2026 season is around 1.6 MB.

Two things this guards against, both of which are silent failures rather than
crashes:

- `get_race_analytics` *returns* `{"error": ...}` for a session with no lap
  data instead of raising. Combined with a `None` TTL for settled races, an
  unvalidated write would cache that error object permanently. The script
  validates every payload before writing.
- Track intel is borrowed from the previous season by event name, which
  assumes a name means the same venue every year. In 2026 it does not: the
  Spanish GP moved to Madrid while Barcelona kept a round under a new name.
  The lookup now matches on location, not name, and reports
  `unavailable_reason` rather than describing the wrong circuit.

Because the season is live, a scheduled workflow re-runs this weekly, rebuilds
the two most recent rounds to pick up timing corrections, and pushes — which
is also what redeploys.

## Cache invalidation

`CACHE_VERSION` prefixes every key. Bump it whenever a `_build_*_payload`
changes shape and every old key becomes unreachable at once — no manual
flushing, and no chance of serving an old schema to a new frontend.

Per-race invalidation: `DELETE /cache/{year}/{gp}`.

## Known limits

- One replay at a time; this is a demo engine, not a scheduler.
- The replay engine's state lives in the API process. Run more than one API
  replica and `/replay/status` will poll a different one than is streaming.
- The consumer keeps state in memory. Restart it mid-replay and standings
  rebuild from the next message rather than from the start.
- `auto_offset_reset=latest` means a consumer joining mid-replay sees only new
  messages. Switch to `earliest` if you want it to catch up from the beginning.
