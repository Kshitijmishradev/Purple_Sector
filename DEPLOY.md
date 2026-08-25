# Deploying Purple Sector for free

Backend on a Hugging Face Space, interface on Cloudflare Pages, data refreshed
weekly by GitHub Actions. Nothing here costs anything.

## Why this shape

The app has two very different cost profiles, measured on the 2026 British GP:

| Path                          | Time   | Peak RSS | Payload |
|-------------------------------|--------|----------|---------|
| `analytics` — the replay feed | 1.0s   | 125 MB   | 54 KB   |
| `lap-compare` telemetry       | 32.4s  | 621 MB   | 76 KB   |

The replay is cheap; `telemetry=True` is what is expensive. So everything
except the combinatorial telemetry endpoints is precomputed by
`scripts/prewarm.py` on a CI runner and committed — the whole 2026 season is
around 1.6 MB. The deployed container seeds Redis from those files at boot and
never loads a FastF1 session to answer a request.

Measured footprint of the running container, after a full replay:

```
344 MB total
  267 MB  redpanda
  127 MB  api          (this is almost entirely import cost)
   41 MB  consumer
   18 MB  redis
```

Redpanda is most of it. That is the price of keeping the real broker rather
than swapping the pipeline for Redis Streams, and on a Space's 16 GB it is
irrelevant.

## 1. Prewarm the season

```bash
pip install -r backend/requirements.txt
python scripts/prewarm.py --all
git add backend/prewarmed && git commit -m "chore: prewarm 2026 season"
```

Verify before deploying — the container is only as good as this bundle:

```bash
ls backend/prewarmed | wc -l
```

## 2. Create the Space

Create a new Space with **SDK: Docker**, hardware **CPU basic (free)**, then:

```bash
git remote add space https://huggingface.co/spaces/<user>/<space>
cp deploy/README.hf.md README.md
git add README.md && git commit -m "deploy: Space metadata"
git push space HEAD:main
git reset --hard HEAD~1
```

The README swap matters: a Space reads its configuration (`sdk: docker`,
`app_port: 7860`) from YAML frontmatter in `README.md`, and that frontmatter
would render as a stray table on GitHub. The weekly workflow does the same
swap on a throwaway commit.

Set one variable in **Settings → Variables and secrets**:

```
ALLOWED_ORIGINS = https://<your-pages-domain>
```

Getting this wrong fails as a CORS error in the browser with nothing obvious
in the logs, so the container warns at boot if it is unset.

Check it came up:

```bash
curl https://<user>-<space>.hf.space/health
curl https://<user>-<space>.hf.space/replay/available
```

## 3. Deploy the interface

Cloudflare Pages (or Vercel), pointed at this repo:

- Root directory: `frontend`
- Build command: `bun run build`
- Output directory: `dist`
- Environment: `VITE_API_URL=https://<user>-<space>.hf.space`

`WS_URL` is derived from `API_URL` in `src/lib/api.js` (`https` → `wss`), so
setting `VITE_API_URL` alone is enough. `public/_redirects` handles react-router
deep links; without it a refresh on `/live` returns 404.

## 4. Automate the weekly refresh

`.github/workflows/prewarm.yml` runs Tuesdays. It rebuilds missing rounds plus
the two most recent — the second because timing corrections keep landing for
days after a race, the same belief `ttl_for_event` encodes — commits, and
pushes to the Space, which redeploys it.

Add to the repository:

- Secret `HF_TOKEN` — a Hugging Face write token
- Variable `HF_SPACE` — `<user>/<space>`

Without `HF_TOKEN` the job still commits the refreshed data; it just does not
publish.

## After changing a payload shape

Bump `CACHE_VERSION` in `backend/src/config.py`, then rebuild **everything**:

```bash
python scripts/prewarm.py --all
```

An incremental run would leave the season half-built under the new version.
Keys from the old version become unreachable rather than being served, so the
failure mode is slow, not wrong — but it is still a broken deployment.

## Known constraints

- **One instance.** The replay engine keeps state in the API process, so a
  second replica would report `running: false` while the first is streaming.
- **Telemetry still computes on demand.** `lap-compare` is combinatorial (22
  drivers × ~55 laps of possible pairs) and cannot be exhaustively prewarmed.
  It peaks at 621 MB, which a Space absorbs and a 512 MB tier would not.
- **Free Spaces sleep** after prolonged inactivity and cold-start in a minute
  or two. A daily `GET /health` from a scheduled workflow keeps it warm.
- **The filesystem is ephemeral.** Everything writable lives under `/tmp`;
  Redis is reseeded from `prewarmed/` on every boot, and the broker only ever
  holds an in-flight replay.
