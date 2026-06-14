from __future__ import annotations

import http.client
import json
import os
import socket
import time
from typing import Any, Final
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .exceptions import TaskExecutionError

FETCHERS_INTERNAL_RETRY_ATTEMPTS: Final = 3
FETCHERS_INTERNAL_RETRY_DELAY_SECONDS: Final = 1.0
FETCHERS_INTERNAL_RETRYABLE_HTTP_STATUS: Final = {429, 502, 503, 504}
_FETCHERS_INTERNAL_RETRYABLE_REASON_SUBSTRINGS: Final = (
    "connection refused",
    "connection reset by peer",
    "name or service not known",
    "temporary failure in name resolution",
    "remote end closed connection without response",
    "timed out",
)


def build_fetchers_internal_base_url() -> str:
    configured = os.getenv("FETCHERS_INTERNAL_BASE_URL")
    if configured:
        return configured.rstrip("/")

    fetchers_port = os.getenv("FETCHERS_PORT", "4100")
    postgres_host = os.getenv("POSTGRES_HOST", "127.0.0.1").strip().lower()
    default_host = "127.0.0.1" if postgres_host in {"127.0.0.1", "localhost"} else "fetchers"
    return f"http://{default_host}:{fetchers_port}"


def fetchers_internal_timeout_seconds() -> float:
    raw_value = os.getenv("FETCHERS_INTERNAL_TIMEOUT_SECONDS", "30")
    try:
        return max(1.0, float(raw_value))
    except ValueError:
        return 30.0


def _is_retryable_fetchers_transport_reason(reason: Any) -> bool:
    if isinstance(
        reason,
        (
            TimeoutError,
            ConnectionError,
            socket.timeout,
            socket.gaierror,
            http.client.RemoteDisconnected,
        ),
    ):
        return True
    if isinstance(reason, str):
        normalized = reason.strip().lower()
        return any(
            fragment in normalized
            for fragment in _FETCHERS_INTERNAL_RETRYABLE_REASON_SUBSTRINGS
        )
    return False


def _sleep_fetchers_internal_retry() -> None:
    time.sleep(FETCHERS_INTERNAL_RETRY_DELAY_SECONDS)


def request_fetchers_json(
    *,
    request: Request,
    subject_label: str,
    subject_id: str,
) -> dict[str, Any]:
    payload = ""
    for attempt in range(1, FETCHERS_INTERNAL_RETRY_ATTEMPTS + 1):
        try:
            with urlopen(request, timeout=fetchers_internal_timeout_seconds()) as response:
                payload = response.read().decode("utf-8")
            break
        except HTTPError as error:
            error_body = error.read().decode("utf-8", errors="replace")
            detail = error_body or str(error.reason)
            if (
                error.code in FETCHERS_INTERNAL_RETRYABLE_HTTP_STATUS
                and attempt < FETCHERS_INTERNAL_RETRY_ATTEMPTS
            ):
                _sleep_fetchers_internal_retry()
                continue
            if error.code in FETCHERS_INTERNAL_RETRYABLE_HTTP_STATUS:
                raise TaskExecutionError(
                    f"Fetchers enrichment request for {subject_label} {subject_id} failed with HTTP {error.code}: {detail}",
                    retryable=True,
                ) from error
            raise RuntimeError(
                f"Fetchers enrichment request for {subject_label} {subject_id} failed with HTTP {error.code}: {detail}"
            ) from error
        except URLError as error:
            detail = str(error.reason)
            if (
                _is_retryable_fetchers_transport_reason(error.reason)
                and attempt < FETCHERS_INTERNAL_RETRY_ATTEMPTS
            ):
                _sleep_fetchers_internal_retry()
                continue
            if _is_retryable_fetchers_transport_reason(error.reason):
                raise TaskExecutionError(
                    f"Fetchers enrichment request for {subject_label} {subject_id} failed: {detail}",
                    retryable=True,
                ) from error
            raise RuntimeError(
                f"Fetchers enrichment request for {subject_label} {subject_id} failed: {detail}"
            ) from error
        except http.client.RemoteDisconnected as error:
            if attempt < FETCHERS_INTERNAL_RETRY_ATTEMPTS:
                _sleep_fetchers_internal_retry()
                continue
            raise TaskExecutionError(
                f"Fetchers enrichment request for {subject_label} {subject_id} failed: {error}",
                retryable=True,
            ) from error

    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError as error:
        raise RuntimeError(
            f"Fetchers enrichment request for {subject_label} {subject_id} returned invalid JSON."
        ) from error

    if not isinstance(parsed, dict):
        raise TypeError(
            f"Fetchers enrichment request for {subject_label} {subject_id} must return a JSON object."
        )

    return parsed
