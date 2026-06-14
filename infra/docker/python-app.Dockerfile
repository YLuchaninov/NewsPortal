FROM python:3.12-slim AS builder

WORKDIR /build

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY infra/docker/python.requirements.txt /tmp/python.requirements.txt
RUN pip wheel --no-cache-dir --wheel-dir /tmp/wheels -r /tmp/python.requirements.txt

FROM python:3.12-slim AS runtime

WORKDIR /workspace

ARG PYTHON_APP_UID=10001
ARG PYTHON_APP_GID=10001

ENV PYTHONPATH=/workspace/runtime/python/src:/workspace \
    MODEL_CACHE_DIR=/workspace/data/models \
    HNSW_INDEX_ROOT=/workspace/data/indices \
    HNSW_SNAPSHOT_ROOT=/workspace/data/snapshots

RUN groupadd --gid "${PYTHON_APP_GID}" signalops \
    && useradd --uid "${PYTHON_APP_UID}" --gid signalops --home-dir /workspace --shell /usr/sbin/nologin signalops

COPY --from=builder /tmp/wheels /tmp/wheels
COPY infra/docker/python.requirements.txt /tmp/python.requirements.txt
RUN pip install --no-cache-dir --no-index --find-links=/tmp/wheels -r /tmp/python.requirements.txt \
    && rm -rf /tmp/wheels /tmp/python.requirements.txt

COPY --chown=signalops:signalops runtime/python/src runtime/python/src
COPY --chown=signalops:signalops runtime/node/packages/contracts/src/source/provider-capabilities.json runtime/node/packages/contracts/src/source/provider-capabilities.json

RUN mkdir -p /workspace/data/models /workspace/data/indices /workspace/data/snapshots /workspace/data/logs \
    && chown -R signalops:signalops /workspace

USER signalops

CMD ["python", "-m", "signalops.workers.main"]
