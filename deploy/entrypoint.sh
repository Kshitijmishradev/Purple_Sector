#!/usr/bin/env bash
# Prepare the writable paths a Space does not give us, then hand off to
# supervisor. Everything mutable lives under /tmp because the rest of the
# filesystem may be read-only and nothing here needs to outlive the container.
set -euo pipefail

mkdir -p /tmp/data_cache /tmp/redpanda /var/log/supervisor

# Redpanda insists on a writable data directory named in its config, and the
# flag form does not cover every path it touches. A minimal config file is
# less fragile than a long argument list.
mkdir -p /etc/redpanda
cat > /etc/redpanda/redpanda.yaml <<'YAML'
redpanda:
  data_directory: /tmp/redpanda
  node_id: 0
  seed_servers: []
  developer_mode: true
rpk:
  overprovisioned: true
YAML

# ALLOWED_ORIGINS is the one setting that genuinely differs per deployment,
# and getting it wrong fails as a CORS error in the browser rather than
# anything visible in the logs. Say so loudly at boot.
if [ -z "${ALLOWED_ORIGINS:-}" ]; then
    echo "WARNING: ALLOWED_ORIGINS is unset - the frontend's fetches will be"
    echo "         blocked by CORS. Set it to your frontend origin."
fi

echo "Starting Purple Sector (redis, redpanda, api, consumer)"
exec supervisord -c /etc/supervisor/conf.d/purple-sector.conf
