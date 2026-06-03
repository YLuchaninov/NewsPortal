from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .website_probe import (
    _build_fetchers_internal_base_url,
    _fetchers_internal_timeout_seconds,
)


class FetchersRssProbeAdapter:
    def probe_feeds(
        self,
        *,
        urls: list[str],
        sample_count: int,
        timeout_seconds: float | None = None,
    ) -> list[dict[str, Any]]:
        request_body = json.dumps(
            {
                "urls": urls,
                "sampleCount": sample_count,
            }
        ).encode("utf-8")
        request = Request(
            f"{_build_fetchers_internal_base_url()}/internal/discovery/feeds/probe",
            data=request_body,
            headers={
                "accept": "application/json",
                "content-type": "application/json",
            },
            method="POST",
        )

        try:
            with urlopen(request, timeout=timeout_seconds or _fetchers_internal_timeout_seconds()) as response:
                payload = response.read().decode("utf-8")
        except HTTPError as error:
            error_body = error.read().decode("utf-8", errors="replace")
            detail = error_body or str(error.reason)
            raise RuntimeError(
                f"Fetchers feed probe request failed with HTTP {error.code}: {detail}"
            ) from error
        except URLError as error:
            raise RuntimeError(
                f"Fetchers feed probe request failed: {error.reason}"
            ) from error

        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError as error:
            raise RuntimeError("Fetchers feed probe request returned invalid JSON.") from error

        if not isinstance(parsed, dict):
            raise TypeError("Fetchers feed probe request must return a JSON object.")

        results = parsed.get("probed_feeds")
        if not isinstance(results, list):
            raise TypeError("Fetchers feed probe request must return a probed_feeds list.")

        normalized: list[dict[str, Any]] = []
        for item in results:
            if isinstance(item, dict):
                normalized.append(dict(item))
        return normalized
