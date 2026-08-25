# Purple Sector

Formula 1 race analytics — lap timing, tyre strategy and full car telemetry,
with a Kafka pipeline that replays a finished race as a live timing feed.

<p align="center">
  <img src="F1_SS/purple-sector-replay-demo.gif" width="820" alt="Race replay streaming live standings through Kafka">
</p>

Purple is the FIA colour for the fastest sector in a session — the whole
interface is built around that one convention: purple for fastest, green for
a personal best, yellow for slower. If you've watched a broadcast timing
screen, there's nothing new to learn here.

---

## Why a replay engine, not a live feed

Formula 1 runs roughly twenty-four race weekends a year. A pipeline built for
genuinely live data would sit idle the other 340-odd days — which makes it a
bad thing to put a demo link in front of anyone. Purple Sector replays a
*completed* race through the same infrastructure a live feed would use: the
same Kafka topics, the same stateful consumer, the same WebSocket fan-out,
just running on a clock you control instead of the actual clock.

```
FastAPI ──▶ Redis (cache-aside, distributed lock)
   │
   ▼
Kafka / Redpanda ──▶ stateful consumer ──▶ Redis pub/sub ──▶ WebSocket ──▶ browser
(partitioned by      (derives standings,
 driver, for           gaps, tyre age)
 ordering)
```

---

## Screenshots

### Timing tower & replay setup
Position, gap, interval and fastest-lap tracking for every driver, styled
after an FIA timing screen rather than a generic dashboard.

<img src="F1_SS/timing-tower.png" width="820" alt="Timing tower with driver selection and fastest lap card">

### Pace and gap analysis
Lap-by-lap pace comparison and rolling interval gap between any two drivers,
with pit stops visible as step changes in the gap.

<p float="left">
  <img src="F1_SS/pace-chart.png" width="410" alt="Lap-by-lap pace chart">
  <img src="F1_SS/interval-gaps.png" width="410" alt="Interval gap chart with pit stop steps">
</p>

### Telemetry — driver and lap selection
Pick two drivers and any lap each; tyre compound per lap is shown as a grid
so you can line up direct comparisons before loading the trace.

<img src="F1_SS/telemetry-drivers.png" width="820" alt="Telemetry driver and lap selection with tyre compound grid">

### Telemetry — track map traced from real coordinates
The circuit outline is not a stock image — it's traced from the same X/Y
telemetry FastF1 returns for the lap, overlaid with a live speed trace.

<img src="F1_SS/telemetry-track-map.png" width="820" alt="Speed trace with track map traced from lap telemetry">

### Telemetry — delta, throttle, brake, RPM, gear
Full channel breakdown between two laps on a shared distance axis, so a
braking point or throttle difference lines up exactly where it happened on
track.

<p float="left">
  <img src="F1_SS/telemetry-delta.png" width="820" alt="Delta, throttle and brake traces between two laps">
</p>
<p float="left">
  <img src="F1_SS/telemetry-rpm-gear.png" width="820" alt="RPM and gear traces between two laps">
</p>

### Calendar
Season schedule with a live countdown to the next session and circuit
statistics for the selected round.

<img src="F1_SS/calendar.png" width="820" alt="Season calendar with countdown and circuit stats">

### Circuit intelligence
Corner-by-corner circuit map with sector boundaries and speed trap location,
generated from FastF1's circuit info for the session.

<img src="F1_SS/circuit-map.png" width="820" alt="Circuit map with sector colours, corner numbers and speed trap">

---

## Stack

**Backend** — FastAPI, FastF1, pandas, Redis (cache-aside + distributed lock),
Kafka/Redpanda (`aiokafka`), WebSockets.

**Frontend** — React 19, Vite, Tailwind, shadcn/ui, Recharts, TanStack Query.

**Infra** — Docker Compose: `redis`, `redpanda`, `console` (broker UI),
`backend`, `consumer` (independently scalable stream processor).

---

## Running it

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

docker compose up --build      # redis, redpanda, api, consumer
cd frontend && bun install && bun run dev
```

| URL                          | What                     |
|-------------------------------|--------------------------|
| http://localhost:5173         | App                      |
| http://localhost:8000/docs    | API reference            |
| http://localhost:8080         | Redpanda console         |

Trigger a replay:

```bash
curl -X POST "localhost:8000/replay/2024/Italian%20Grand%20Prix?speed=10"
```

Then open **Race Replay** in the app, or watch the raw stream:

```bash
docker compose exec redpanda rpk topic consume f1.timing
```

Locally the backend computes any season on demand, so there is nothing to set
up. The deployed build instead ships a precomputed 2026 season and refreshes it
weekly; to build that bundle yourself:

```bash
python scripts/prewarm.py --all
```

---

## Measured, not claimed

All figures below are from the 2026 season on an M-series Mac, with FastF1's
download cache already warm — a genuinely cold session adds ~5s of network on
top.

**The cache.** Analytics payloads sit behind Redis with a distributed compute
lock, so concurrent cold requests never duplicate the same pandas job:

| | |
|---|---|
| Uncached (pandas) | ~1.0s |
| Cached (Redis hit) | **~40ms** |

**Where the cost actually is.** Not where you would guess — the replay feed is
cheap, and `telemetry=True` is what hurts:

| Path | Time | Peak RSS | Stored |
|---|---|---|---|
| `analytics` — the replay source | 1.0s | 125 MB | 54 KB |
| `insights` / `meta` / `lap-matrix` | ~2s | — | ~10 KB |
| `track-intel` | 13.2s | — | 0.1 KB |
| `lap-compare` telemetry | 32.4s | **621 MB** | 76 KB |

That gap is the reason the deployed build precomputes everything except the
combinatorial telemetry endpoints and ships it in the repo — the whole 2026
season is about 1.6 MB, and the serving container never loads a FastF1
session. It runs in **344 MB** all in, of which Redpanda is 267 MB and the API
127 MB, most of that just importing pandas.

**The replay stream.** A race is ~1300 events. The consumer used to broadcast
the entire field on every one of them; it now coalesces to a fixed rate:

| | Frames | Payload |
|---|---|---|
| Per event | 1321 | 14.5 MB |
| Coalesced (5 Hz) | **137** | **1.5 MB** |

The final classification is identical either way — verified by diffing the last
standings frame from both. Note those are decompressed sizes: `permessage-deflate`
squeezes a standings frame about 5.3×, so real egress is nearer 290 KB.

**One number worth the detour.** Reconstructing the replay clock by
accumulating lap durations looks reasonable and is badly wrong. Laps with no
recorded `LapTime` are dropped upstream, and only **4 of 22 drivers** finished
the 2026 British GP with complete timing — accumulation placed one of them 8.5
minutes ahead of where he actually was, and since standings sort by elapsed
time, every driver with a gap in their data floated up the timing tower. The
absolute session clock was in the source data all along.

---

*Purple Sector is an independent project built on public FastF1 data. Not
affiliated with Formula 1, the FIA, or any team.*
