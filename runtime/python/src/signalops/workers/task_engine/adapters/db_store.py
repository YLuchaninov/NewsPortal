from __future__ import annotations

from typing import Any


class PostgresDbStoreAdapter:
    def store(
        self,
        *,
        record_key: str,
        payload: Any,
        namespace: str | None,
    ) -> dict[str, Any]:
        size = len(payload) if isinstance(payload, list) else 1
        return {
            "record_key": record_key,
            "namespace": namespace,
            "size": size,
            "stored": True,
        }

