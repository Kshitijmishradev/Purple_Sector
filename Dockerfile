# Purple Sector, whole stack in one container, for a free Hugging Face Space.
#
# Normally these are four services (see docker-compose.yml, which remains the
# way to run this locally). A Space gives you one container, but a generous
# one -- so rather than dropping Kafka and rewriting the pipeline around Redis
# Streams, the broker moves in alongside everything else. The architecture the
# README describes is the architecture that is deployed.
#
# The container never computes analytics: backend/prewarmed holds the season,
# and cache.seed_from_disk() loads it at boot. That is what keeps this well
# inside the memory a free tier gives you.

FROM redpandadata/redpanda:v24.2.7 AS broker

FROM python:3.11-slim

# redis-server for the cache and the pub/sub hop, supervisor to run the four
# processes, ca-certificates because FastF1 talks to the F1 API over HTTPS.
RUN apt-get update && apt-get install -y --no-install-recommends \
        redis-server \
        supervisor \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Redpanda ships a self-contained tree under /opt/redpanda, so it can be
# lifted wholesale out of the official image rather than built or apt-added.
COPY --from=broker /opt/redpanda /opt/redpanda
ENV PATH="/opt/redpanda/bin:${PATH}"

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/src ./src
COPY backend/prewarmed ./prewarmed
COPY deploy/supervisord.conf /etc/supervisor/conf.d/purple-sector.conf
COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# A Space's filesystem is ephemeral and only some paths are writable, so every
# process that needs to write is pointed at /tmp. Nothing here needs to
# survive a restart: Redis is reseeded from ./prewarmed, and the broker only
# holds an in-flight replay.
ENV REDIS_URL=redis://127.0.0.1:6379/0 \
    KAFKA_BOOTSTRAP=127.0.0.1:9092 \
    KAFKA_TOPIC=f1.timing \
    KAFKA_GROUP=gridlogic-live \
    CACHE_VERSION=v2 \
    FASTF1_CACHE_DIR=/tmp/data_cache \
    PYTHONUNBUFFERED=1

# Spaces route to the port declared as app_port in the README frontmatter.
EXPOSE 7860

ENTRYPOINT ["/entrypoint.sh"]
