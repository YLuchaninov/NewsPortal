FROM python:3.12-slim

WORKDIR /workspace

ENV PYTHONPATH=/workspace \
    MODEL_CACHE_DIR=/workspace/data/models \
    HNSW_INDEX_ROOT=/workspace/data/indices \
    HNSW_SNAPSHOT_ROOT=/workspace/data/snapshots

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY infra/docker/python.requirements.txt /tmp/python.requirements.txt
RUN pip install --no-cache-dir -r /tmp/python.requirements.txt

COPY services/__init__.py services/__init__.py
COPY services/api services/api
COPY services/indexer services/indexer
COPY services/ml services/ml
COPY services/workers services/workers
COPY data data

RUN mkdir -p /workspace/data/models /workspace/data/indices /workspace/data/snapshots /workspace/data/logs

CMD ["python", "-m", "app.main"]
