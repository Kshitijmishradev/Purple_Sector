---
title: Purple Sector
emoji: 🏁
colorFrom: purple
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# Purple Sector — API

Formula 1 race analytics with a Kafka replay pipeline that streams a finished
race as a live timing feed.

This Space runs the backend only: FastAPI, Redis, Redpanda and the stream
consumer in one container. The interface is deployed separately and talks to
this host over HTTPS and a WebSocket.

The 2026 season is precomputed and committed to the repository, so this
container serves analytics from cache and never runs a FastF1 session load at
request time. A scheduled job refreshes the data after each race weekend.

- `GET  /health` — liveness and cache connectivity
- `GET  /docs` — full API reference
- `GET  /replay/available` — races this deployment can stream
- `POST /replay/{year}/{gp}?speed=10` — start a replay
- `WS   /ws/live` — live standings

Source: https://github.com/Kshitijmishradev/Purple_Sector
