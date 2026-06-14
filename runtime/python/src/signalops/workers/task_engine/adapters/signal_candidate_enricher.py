from __future__ import annotations

from typing import Any


class PostgresSignalCandidateEnricherAdapter:
    def enrich_signal_candidates(
        self,
        *,
        signal_candidates: list[dict[str, Any]],
        enrichment: Any,
        mode: str,
        target_field: str | None,
    ) -> dict[str, Any]:
        field_name = target_field or "enrichment"
        annotations = enrichment if isinstance(enrichment, dict) else {}
        enriched_signal_candidates: list[dict[str, Any]] = []
        for signal_candidate in signal_candidates:
            signal_candidate_copy = dict(signal_candidate)
            value = annotations.get(signal_candidate.get("doc_id"), {})
            if mode == "replace":
                signal_candidate_copy[field_name] = value
            else:
                existing = signal_candidate_copy.get(field_name)
                if isinstance(existing, dict) and isinstance(value, dict):
                    signal_candidate_copy[field_name] = {**existing, **value}
                else:
                    signal_candidate_copy[field_name] = value
            enriched_signal_candidates.append(signal_candidate_copy)
        return {
            "signal_candidates": enriched_signal_candidates,
            "enriched_count": len(enriched_signal_candidates),
            "mode": mode,
        }

