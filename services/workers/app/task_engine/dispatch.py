from __future__ import annotations

import asyncio
import os
from typing import Any
from urllib.parse import urlparse


SEQUENCE_QUEUE = "q.sequence"
SEQUENCE_JOB_NAME = "sequence.run"


class SequenceQueueDispatchError(RuntimeError):
    pass


def build_redis_url() -> str:
    if os.getenv("REDIS_URL"):
        return os.environ["REDIS_URL"]

    host = os.getenv("REDIS_HOST", "127.0.0.1")
    port = os.getenv(
        "REDIS_PORT",
        "56379" if host in {"127.0.0.1", "localhost"} else "6379",
    )
    return f"redis://{host}:{port}"


def build_redis_connection_options() -> dict[str, Any]:
    parsed = urlparse(build_redis_url())
    return {
        "host": parsed.hostname or "127.0.0.1",
        "port": parsed.port or 6379,
        "db": int(parsed.path.lstrip("/") or "0"),
    }


async def enqueue_sequence_run_job_async(run_id: str, sequence_id: str) -> None:
    try:
        from bullmq import Queue
    except ModuleNotFoundError as error:  # pragma: no cover - env dependent
        raise SequenceQueueDispatchError(
            "BullMQ transport is not available in this runtime."
        ) from error

    queue = Queue(
        SEQUENCE_QUEUE,
        {
            "connection": build_redis_connection_options(),
        },
    )
    try:
        await queue.add(
            SEQUENCE_JOB_NAME,
            {
                "jobId": run_id,
                "runId": run_id,
                "sequenceId": sequence_id,
            },
            {
                "jobId": run_id,
                "removeOnComplete": 100,
                "removeOnFail": 100,
            },
        )
    except SequenceQueueDispatchError:
        raise
    except Exception as error:  # pragma: no cover - runtime dependent
        raise SequenceQueueDispatchError(
            f"Failed to enqueue sequence run {run_id}: {error}"
        ) from error
    finally:
        close = getattr(queue, "close", None)
        if callable(close):
            await close()


def enqueue_sequence_run_job(run_id: str, sequence_id: str) -> None:
    try:
        asyncio.run(enqueue_sequence_run_job_async(run_id, sequence_id))
    except SequenceQueueDispatchError:
        raise
    except Exception as error:  # pragma: no cover - runtime dependent
        raise SequenceQueueDispatchError(str(error)) from error
