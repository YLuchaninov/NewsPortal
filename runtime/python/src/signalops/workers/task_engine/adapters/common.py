from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlparse, urlunparse

from signalops.runtime_config import build_database_url

__all__ = ["build_database_url", "ensure_jsonable", "normalize_url"]


def normalize_url(value: str) -> str:
    parsed = urlparse(value.strip())
    scheme = (parsed.scheme or "https").lower()
    netloc = parsed.netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    path = parsed.path.rstrip("/") or "/"
    return urlunparse((scheme, netloc, path, "", "", ""))


def ensure_jsonable(value: Any) -> Any:
    json.dumps(value)
    return value
