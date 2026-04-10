from __future__ import annotations

import json
import os
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def _build_fetchers_internal_base_url() -> str:
    configured = os.getenv("FETCHERS_INTERNAL_BASE_URL")
    if configured:
        return configured.rstrip("/")

    fetchers_port = os.getenv("FETCHERS_PORT", "4100")
    postgres_host = os.getenv("POSTGRES_HOST", "127.0.0.1").strip().lower()
    default_host = "127.0.0.1" if postgres_host in {"127.0.0.1", "localhost"} else "fetchers"
    return f"http://{default_host}:{fetchers_port}"


def _fetchers_internal_timeout_seconds() -> float:
    raw_value = os.getenv("FETCHERS_INTERNAL_TIMEOUT_SECONDS", "30")
    try:
        return max(1.0, float(raw_value))
    except ValueError:
        return 30.0


class FetchersWebsiteProbeAdapter:
    def probe_websites(self, *, urls: list[str], sample_count: int) -> list[dict[str, Any]]:
        request_body = json.dumps(
            {
                "urls": urls,
                "sampleCount": sample_count,
            }
        ).encode("utf-8")
        request = Request(
            f"{_build_fetchers_internal_base_url()}/internal/discovery/websites/probe",
            data=request_body,
            headers={
                "accept": "application/json",
                "content-type": "application/json",
            },
            method="POST",
        )

        try:
            with urlopen(request, timeout=_fetchers_internal_timeout_seconds()) as response:
                payload = response.read().decode("utf-8")
        except HTTPError as error:
            error_body = error.read().decode("utf-8", errors="replace")
            detail = error_body or str(error.reason)
            raise RuntimeError(
                f"Fetchers website probe request failed with HTTP {error.code}: {detail}"
            ) from error
        except URLError as error:
            raise RuntimeError(
                f"Fetchers website probe request failed: {error.reason}"
            ) from error

        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError as error:
            raise RuntimeError(
                "Fetchers website probe request returned invalid JSON."
            ) from error

        if not isinstance(parsed, dict):
            raise TypeError(
                "Fetchers website probe request must return a JSON object."
            )

        results = parsed.get("probed_websites")
        if not isinstance(results, list):
            raise TypeError(
                "Fetchers website probe request must return a probed_websites list."
            )

        normalized: list[dict[str, Any]] = []
        for item in results:
            if isinstance(item, dict):
                normalized.append(dict(item))
        return normalized


HttpxWebsiteProbeAdapter = FetchersWebsiteProbeAdapter
