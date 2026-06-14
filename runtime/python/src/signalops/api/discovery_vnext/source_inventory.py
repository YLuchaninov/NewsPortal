from __future__ import annotations

from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse

from signalops.api.database import query_one
from signalops.api.discovery_vnext.models import DiscoveryVNextProbationHandoffPayload
from signalops.workers.discovery_vnext_handoff import apply_probation_handoff
from signalops.workers.task_engine.adapters.source_registrar import PostgresSourceRegistrarAdapter

def apply_probation_handoff_from_payload(payload: DiscoveryVNextProbationHandoffPayload) -> dict[str, Any]:
    result = apply_probation_handoff(
        source_understanding=payload.source_understanding,
        routing_decision=payload.routing_decision,
        registrar=PostgresSourceRegistrarAdapter(),
        provider_type=payload.provider_type,
        created_by=payload.created_by,
        dry_run=payload.dry_run,
    )
    channel_id = _first_registered_channel_id(result)
    inventory = None
    if channel_id and payload.source_inventory_id and not payload.dry_run:
        current_state = _inventory_state_for_decision(
            str(payload.routing_decision.get("decision") or "auto_register_probation")
        )
        if current_state not in {"probation_channel", "cheap_watch"}:
            current_state = "probation_channel"
        inventory = mark_inventory_registered_channel(
            source_inventory_id=payload.source_inventory_id,
            channel_id=channel_id,
            current_state=current_state,
        )
    return {
        **result,
        "sourceInventory": inventory,
    }


def mark_inventory_registered_channel(
    *, source_inventory_id: str, channel_id: str, current_state: str = "probation_channel"
) -> dict[str, Any]:
    row = query_one(
        """
        update source_inventory
        set registered_channel_id = %s,
            current_state = %s,
            updated_at = now()
        where source_inventory_id = %s
        returning *
        """,
        (channel_id, current_state, source_inventory_id),
    )
    return row or {}


def source_identity_key(
    *,
    canonical_url: str,
    provider_type: str,
    source_understanding: dict[str, Any],
) -> str:
    del source_understanding
    parsed = urlparse(canonical_url)
    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    path = parsed.path or "/"
    query = _source_identity_query(parsed.query)
    resolved = f"{parsed.scheme}://{host}{path}{query}".rstrip("/")
    return f"{provider_type}|{host}|{resolved}"


def _source_identity_query(query: str) -> str:
    if not query:
        return ""
    blocked = {"run_id", "runid", "interest_id", "interestid", "hypothesis_id", "hypothesisid", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"}
    pairs = []
    for key, values in parse_qs(query, keep_blank_values=True).items():
        if key.lower() in blocked:
            continue
        for value in values:
            pairs.append((key, value))
    encoded = urlencode(pairs)
    return f"?{encoded}" if encoded else ""

def _inventory_state_for_decision(decision: str) -> str:
    return {
        "auto_register_probation": "probation_channel",
        "inventory_context": "inventory_context",
        "cheap_watch": "cheap_watch",
        "manual_review": "manual_review",
        "adapter_backlog": "adapter_backlog",
        "blocked": "blocked",
        "rejected_structural": "rejected_structural",
        "inventory_low_priority": "inventory_low_priority",
    }.get(decision, "inventory")


def _first_registered_channel_id(result: dict[str, Any]) -> str | None:
    for row in result.get("registrarResults") or []:
        if isinstance(row, dict) and row.get("status") in {"registered", "duplicate"} and row.get("channel_id"):
            return str(row["channel_id"])
    return None


def _domain_from_url(url: str) -> str:
    host = urlparse(url).hostname or "unknown"
    return host[4:] if host.startswith("www.") else host
