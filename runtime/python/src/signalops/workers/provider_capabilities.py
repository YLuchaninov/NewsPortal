from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


_REGISTRY_RELATIVE_PATH = Path("runtime/node/packages/contracts/src/source/provider-capabilities.json")
_BETA_RUNTIME_STATUS = "beta_runtime"


def _repo_root() -> Path:
    current = Path(__file__).resolve()
    for parent in current.parents:
        candidate = parent / _REGISTRY_RELATIVE_PATH
        if candidate.exists():
            return parent
    raise FileNotFoundError(f"Could not locate provider capability registry: {_REGISTRY_RELATIVE_PATH}")


@lru_cache(maxsize=1)
def load_provider_capabilities() -> tuple[dict[str, Any], ...]:
    registry_path = _repo_root() / _REGISTRY_RELATIVE_PATH
    payload = json.loads(registry_path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("Provider capability registry must be a JSON array.")

    capabilities: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in payload:
        if not isinstance(item, dict):
            raise ValueError("Provider capability entries must be JSON objects.")
        provider_type = str(item.get("providerType") or "").strip()
        if not provider_type:
            raise ValueError("Provider capability entries require providerType.")
        if provider_type in seen:
            raise ValueError(f"Duplicate provider capability: {provider_type}")
        seen.add(provider_type)
        capabilities.append(dict(item))
    return tuple(capabilities)


def beta_ingest_provider_types() -> tuple[str, ...]:
    return tuple(
        str(item["providerType"])
        for item in load_provider_capabilities()
        if item.get("status") == _BETA_RUNTIME_STATUS and item.get("ingestRuntime") is True
    )


BETA_INGEST_PROVIDER_TYPES = beta_ingest_provider_types()
BETA_INGEST_PROVIDER_TYPE_SET = frozenset(BETA_INGEST_PROVIDER_TYPES)


def is_beta_ingest_provider_type(value: str) -> bool:
    return value in BETA_INGEST_PROVIDER_TYPE_SET
