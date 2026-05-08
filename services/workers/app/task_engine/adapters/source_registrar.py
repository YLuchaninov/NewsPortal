from __future__ import annotations

import uuid
from typing import Any
from urllib.parse import urlparse

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Json

from ...discovery_v3_contracts import (
    build_discovery_config_fragment,
    build_source_evidence_contract,
)
from .common import build_database_url, normalize_url


SOURCE_CHANNEL_SYNC_REQUESTED_EVENT = "source.channel.sync.requested"
SUPPORTED_PROVIDER_TYPES = {"rss", "website", "api", "email_imap", "youtube"}


class PostgresSourceRegistrarAdapter:
    def __init__(self, database_url: str | None = None) -> None:
        self._database_url = database_url or build_database_url()

    def register_sources(
        self,
        *,
        sources: list[dict[str, Any]],
        enabled: bool,
        dry_run: bool,
        created_by: str | None,
        tags: list[str],
        provider_type: str,
    ) -> list[dict[str, Any]]:
        if not sources:
            return []

        normalized_candidates: list[dict[str, Any]] = []
        for source in sources:
            normalized_candidate = self._normalize_source_candidate(
                source,
                provider_type=provider_type,
            )
            if normalized_candidate is not None:
                normalized_candidates.append(normalized_candidate)
        if not normalized_candidates:
            return []

        with psycopg.connect(self._database_url, row_factory=dict_row) as connection:
            with connection.transaction():
                provider_ids = self._load_provider_ids(connection)
                existing_rows = self._load_existing_channels(connection)
                results: list[dict[str, Any]] = []
                for source in normalized_candidates:
                    duplicate = self._find_duplicate(existing_rows, source["normalized_url"])
                    if duplicate is not None:
                        results.append(
                            {
                                "channel_id": duplicate["channel_id"],
                                "url": source["url"],
                                "provider_type": duplicate["provider_type"],
                                "status": "duplicate",
                                "dry_run": dry_run,
                            }
                        )
                        continue

                    if dry_run:
                        results.append(
                            {
                                "channel_id": None,
                                "url": source["url"],
                                "provider_type": source["provider_type"],
                                "status": "preview",
                                "dry_run": True,
                            }
                        )
                        continue

                    channel_id = str(uuid.uuid4())
                    provider_id = provider_ids.get(source["provider_type"])
                    self._insert_channel(
                        connection,
                        channel_id=channel_id,
                        provider_id=provider_id,
                        source=source,
                        enabled=enabled,
                        created_by=created_by,
                        tags=tags,
                    )
                    self._insert_runtime_state(connection, channel_id=channel_id)
                    self._insert_outbox_event(connection, channel_id=channel_id, source=source)
                    existing_rows.append(
                        {
                            "channel_id": channel_id,
                            "provider_type": source["provider_type"],
                            "normalized_url": source["normalized_url"],
                        }
                    )
                    results.append(
                        {
                            "channel_id": channel_id,
                            "url": source["url"],
                            "provider_type": source["provider_type"],
                            "status": "registered",
                            "dry_run": False,
                        }
                    )
                return results

    def register_endpoint_source(
        self,
        *,
        endpoint: dict[str, Any],
        enabled: bool,
        created_by: str | None,
        tags: list[str],
        operator_config: dict[str, Any] | None = None,
        reason: str | None = None,
    ) -> dict[str, Any]:
        source = self._normalize_endpoint_candidate(
            endpoint,
            created_by=created_by,
            tags=tags,
            operator_config=operator_config or {},
        )
        endpoint_id = str(endpoint.get("endpoint_id") or endpoint.get("endpointId") or "").strip()
        if not endpoint_id:
            raise ValueError("endpoint_id is required for endpoint promotion.")

        with psycopg.connect(self._database_url, row_factory=dict_row) as connection:
            with connection.transaction():
                provider_ids = self._load_provider_ids(connection)
                existing_rows = self._load_existing_channels(connection)
                duplicate = self._find_duplicate(existing_rows, source["normalized_url"])
                if duplicate is not None:
                    return self._mark_endpoint_duplicate(
                        connection,
                        endpoint_id=endpoint_id,
                        source_channel_id=duplicate["channel_id"],
                        reviewed_by=created_by,
                        reason=reason or "duplicate_source_channel",
                    )

                channel_id = str(uuid.uuid4())
                provider_id = provider_ids.get(source["provider_type"])
                self._insert_channel(
                    connection,
                    channel_id=channel_id,
                    provider_id=provider_id,
                    source=source,
                    enabled=enabled,
                    created_by=created_by,
                    tags=tags,
                )
                self._insert_runtime_state(
                    connection,
                    channel_id=channel_id,
                    poll_interval_seconds=int(source.get("poll_interval_seconds") or 1800),
                )
                self._insert_outbox_event(connection, channel_id=channel_id, source=source)
                self._insert_source_contract(connection, channel_id=channel_id, endpoint=source)
                promoted_endpoint = self._mark_endpoint_registered(
                    connection,
                    endpoint_id=endpoint_id,
                    channel_id=channel_id,
                    reviewed_by=created_by,
                )
                self._insert_discovery_action(
                    connection,
                    endpoint=source,
                    endpoint_id=endpoint_id,
                    channel_id=channel_id,
                    requested_by=created_by,
                    reason=reason,
                    payload={
                        "enabled": enabled,
                        "tags": tags,
                        "operatorConfig": operator_config or {},
                    },
                )
                return promoted_endpoint

    def _normalize_source_candidate(
        self,
        source: dict[str, Any],
        *,
        provider_type: str,
    ) -> dict[str, Any] | None:
        effective_provider_type = str(source.get("provider_type") or provider_type).strip() or provider_type
        raw_url = (
            source.get("feed_url")
            if effective_provider_type == "rss" and source.get("feed_url")
            else source.get("source_url")
            or source.get("url")
            or source.get("final_url")
        )
        if not isinstance(raw_url, str) or not raw_url.strip():
            return None

        normalized_url = normalize_url(raw_url)
        parsed = urlparse(raw_url)
        title = str(
            source.get("title")
            or source.get("feed_title")
            or parsed.netloc
        ).strip()
        evaluation_json = (
            dict(source.get("evaluation_json") or {})
            if isinstance(source.get("evaluation_json"), dict)
            else {}
        )
        discovered_feed_urls = source.get("discovered_feed_urls")
        if not isinstance(discovered_feed_urls, list):
            discovered_feed_urls = source.get("hidden_rss_urls")
        if not isinstance(discovered_feed_urls, list):
            discovered_feed_urls = evaluation_json.get("discovered_feed_urls")
        if not isinstance(discovered_feed_urls, list):
            discovered_feed_urls = evaluation_json.get("hidden_rss_urls")
        discovery_hints = {
            "discoveredFeedUrls": [
                item
                for item in discovered_feed_urls or []
                if isinstance(item, str) and item.strip()
            ],
            "classification": dict(source.get("classification") or {})
            if isinstance(source.get("classification"), dict)
            else dict(evaluation_json.get("classification") or {})
            if isinstance(evaluation_json.get("classification"), dict)
            else {},
            "capabilities": dict(source.get("capabilities") or {})
            if isinstance(source.get("capabilities"), dict)
            else dict(evaluation_json.get("capabilities") or {})
            if isinstance(evaluation_json.get("capabilities"), dict)
            else {},
        }
        browser_assisted_recommended = bool(
            source.get("browser_assisted_recommended")
            or evaluation_json.get("browser_assisted_recommended")
        )
        challenge_kind = (
            str(source.get("challenge_kind") or evaluation_json.get("challenge_kind") or "").strip()
            or None
        )
        if browser_assisted_recommended:
            discovery_hints["browserAssistedRecommended"] = True
        if challenge_kind:
            discovery_hints["challengeKind"] = challenge_kind

        config_json: dict[str, Any] = {
            "discoveredBy": "ai_discovery_agent",
            "createdBy": created_by if (created_by := source.get("created_by")) else None,
            "tags": [tag for tag in source.get("tags", []) if isinstance(tag, str)],
            "discoveryHints": discovery_hints,
        }
        if effective_provider_type == "website" and browser_assisted_recommended:
            config_json["browserFallbackEnabled"] = True
            config_json["maxBrowserFetchesPerPoll"] = 2

        return {
            "url": raw_url.strip(),
            "normalized_url": normalized_url,
            "provider_type": (
                effective_provider_type
                if effective_provider_type in SUPPORTED_PROVIDER_TYPES
                else provider_type
            ),
            "title": title or parsed.netloc,
            "homepage_url": (
                str(source.get("homepage_url") or source.get("final_url") or raw_url).strip()
            ),
            "config_json": config_json,
        }

    def _normalize_endpoint_candidate(
        self,
        endpoint: dict[str, Any],
        *,
        created_by: str | None,
        tags: list[str],
        operator_config: dict[str, Any],
    ) -> dict[str, Any]:
        raw_url = str(
            endpoint.get("endpoint_url")
            or endpoint.get("endpointUrl")
            or endpoint.get("fetch_url")
            or endpoint.get("fetchUrl")
            or ""
        ).strip()
        if not raw_url:
            raise ValueError("endpoint_url is required for endpoint promotion.")

        normalized_url = str(
            endpoint.get("normalized_endpoint_url")
            or endpoint.get("normalizedEndpointUrl")
            or normalize_url(raw_url)
        )
        provider_type = str(endpoint.get("provider_type") or endpoint.get("providerType") or "website").strip()
        if provider_type not in SUPPORTED_PROVIDER_TYPES:
            raise ValueError(f"Unsupported provider_type for source channel promotion: {provider_type}")

        contract = build_source_evidence_contract(endpoint)
        discovery_config = build_discovery_config_fragment(endpoint, contract, trust_stage="probation")
        if operator_config:
            discovery_config["operatorConfig"] = dict(operator_config)
        if endpoint.get("total_score") is not None:
            discovery_config["totalScore"] = float(endpoint.get("total_score") or 0)

        source_role = str(endpoint.get("source_role") or endpoint.get("sourceRole") or "unknown")
        endpoint_kind = str(endpoint.get("endpoint_kind") or endpoint.get("endpointKind") or "unknown")
        config_json: dict[str, Any] = {
            "discoveredBy": "resilient_discovery",
            "createdBy": created_by,
            "discovery": discovery_config,
            "tags": _unique_strings(["discovery", source_role, *tags]),
        }
        if provider_type == "website":
            config_json.update(_website_endpoint_config(raw_url, source_role, endpoint_kind))

        parsed = urlparse(raw_url)
        return {
            "url": raw_url,
            "normalized_url": normalized_url,
            "provider_type": provider_type,
            "title": str(endpoint.get("title") or raw_url).strip() or parsed.netloc,
            "homepage_url": str(endpoint.get("homepage_url") or endpoint.get("homepageUrl") or raw_url).strip(),
            "poll_interval_seconds": 1800 if provider_type == "rss" else 3600,
            "config_json": config_json,
            "contract_json": contract,
            "target_id": endpoint.get("target_id") or endpoint.get("targetId"),
            "endpoint_id": endpoint.get("endpoint_id") or endpoint.get("endpointId"),
            "source_role": source_role,
            "signal_mode": endpoint.get("signal_mode") or endpoint.get("signalMode") or "direct",
            "endpoint_kind": endpoint_kind,
            "expected_data_shape": endpoint.get("expected_data_shape") or endpoint.get("expectedDataShape"),
        }

    def _load_provider_ids(self, connection: Any) -> dict[str, str]:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select provider_type, provider_id::text as provider_id
                from source_providers
                """
            )
            return {str(row["provider_type"]): str(row["provider_id"]) for row in cursor.fetchall()}

    def _load_existing_channels(self, connection: Any) -> list[dict[str, str]]:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select
                  channel_id::text as channel_id,
                  provider_type,
                  fetch_url,
                  homepage_url
                from source_channels
                """
            )
            rows = []
            for row in cursor.fetchall():
                for candidate in (row["fetch_url"], row["homepage_url"]):
                    if isinstance(candidate, str) and candidate.strip():
                        rows.append(
                            {
                                "channel_id": str(row["channel_id"]),
                                "provider_type": str(row["provider_type"]),
                                "normalized_url": normalize_url(candidate),
                            }
                        )
            return rows

    def _find_duplicate(
        self,
        existing_rows: list[dict[str, str]],
        normalized_url: str,
    ) -> dict[str, str] | None:
        for row in existing_rows:
            if row["normalized_url"] == normalized_url:
                return row
        return None

    def _insert_channel(
        self,
        connection: Any,
        *,
        channel_id: str,
        provider_id: str | None,
        source: dict[str, Any],
        enabled: bool,
        created_by: str | None,
        tags: list[str],
    ) -> None:
        config_json = dict(source["config_json"])
        if created_by:
            config_json["createdBy"] = created_by
        if tags:
            config_json["tags"] = list(tags)
        poll_interval_seconds = int(
            source.get("poll_interval_seconds")
            or (1800 if source["provider_type"] == "rss" else 3600)
        )
        homepage_url = source["homepage_url"] or source["url"]
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into source_channels (
                  channel_id,
                  provider_id,
                  provider_type,
                  name,
                  fetch_url,
                  homepage_url,
                  is_active,
                  poll_interval_seconds,
                  config_json
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                """,
                (
                    channel_id,
                    provider_id,
                    source["provider_type"],
                    source["title"],
                    source["url"],
                    homepage_url,
                    enabled,
                    poll_interval_seconds,
                    Json(config_json),
                ),
            )

    def _insert_runtime_state(
        self,
        connection: Any,
        *,
        channel_id: str,
        poll_interval_seconds: int = 1800,
    ) -> None:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into source_channel_runtime_state (
                  channel_id,
                  adaptive_enabled,
                  effective_poll_interval_seconds,
                  max_poll_interval_seconds,
                  next_due_at,
                  adaptive_step,
                  last_result_kind,
                  consecutive_no_change_polls,
                  consecutive_failures,
                  adaptive_reason,
                  updated_at
                )
                values (%s, true, %s, 28800, now(), 0, null, 0, 0, 'discovery_registration', now())
                on conflict (channel_id) do nothing
                """,
                (channel_id, poll_interval_seconds),
            )

    def _insert_outbox_event(self, connection: Any, *, channel_id: str, source: dict[str, Any]) -> None:
        event_id = str(uuid.uuid4())
        payload = {
            "channelId": channel_id,
            "providerType": source["provider_type"],
            "url": source["url"],
            "source": "discovery_agent",
        }
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into outbox_events (
                  event_id,
                  event_type,
                  aggregate_type,
                  aggregate_id,
                  payload_json
                )
                values (%s, %s, 'source_channel', %s, %s::jsonb)
                """,
                (
                    event_id,
                    SOURCE_CHANNEL_SYNC_REQUESTED_EVENT,
                    channel_id,
                    Json(payload),
                ),
            )

    def _insert_source_contract(
        self,
        connection: Any,
        *,
        channel_id: str,
        endpoint: dict[str, Any],
    ) -> None:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into discovery_source_contracts (
                  target_id, endpoint_id, source_channel_id, source_role, signal_mode,
                  provider_type, endpoint_kind, expected_data_shape, contract_json,
                  coverage_contribution, downstream_weight
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, 0.25, 0.3)
                """,
                (
                    endpoint.get("target_id"),
                    endpoint.get("endpoint_id"),
                    channel_id,
                    endpoint.get("source_role"),
                    endpoint.get("signal_mode"),
                    endpoint.get("provider_type"),
                    endpoint.get("endpoint_kind"),
                    endpoint.get("expected_data_shape"),
                    Json(endpoint.get("contract_json") or {}),
                ),
            )

    def _mark_endpoint_registered(
        self,
        connection: Any,
        *,
        endpoint_id: str,
        channel_id: str,
        reviewed_by: str | None,
    ) -> dict[str, Any]:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update discovery_source_endpoints
                set source_channel_id = %s,
                    status = 'registered',
                    recommended_action = 'manual_promote',
                    reviewed_by = %s,
                    reviewed_at = now(),
                    updated_at = now()
                where endpoint_id = %s
                returning *
                """,
                (channel_id, reviewed_by, endpoint_id),
            )
            row = cursor.fetchone()
            if row is None:
                raise LookupError(f"Discovery endpoint {endpoint_id} was not found.")
            return dict(row)

    def _mark_endpoint_duplicate(
        self,
        connection: Any,
        *,
        endpoint_id: str,
        source_channel_id: str | None,
        reviewed_by: str | None,
        reason: str,
    ) -> dict[str, Any]:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update discovery_source_endpoints
                set source_channel_id = coalesce(%s, source_channel_id),
                    status = 'duplicate',
                    recommended_action = 'reject',
                    rejection_reason = %s,
                    reviewed_by = %s,
                    reviewed_at = now(),
                    updated_at = now()
                where endpoint_id = %s
                returning *
                """,
                (source_channel_id, reason, reviewed_by, endpoint_id),
            )
            row = cursor.fetchone()
            if row is None:
                raise LookupError(f"Discovery endpoint {endpoint_id} was not found.")
            return dict(row)

    def _insert_discovery_action(
        self,
        connection: Any,
        *,
        endpoint: dict[str, Any],
        endpoint_id: str,
        channel_id: str,
        requested_by: str | None,
        reason: str | None,
        payload: dict[str, Any],
    ) -> None:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into discovery_actions (
                  target_id, endpoint_id, source_channel_id,
                  action_type, status, requested_by, decided_by, reason,
                  payload_json, result_json, completed_at
                )
                values (%s, %s, %s, 'promote_endpoint', 'completed', %s, %s, %s, %s::jsonb, %s::jsonb, now())
                """,
                (
                    endpoint.get("target_id"),
                    endpoint_id,
                    channel_id,
                    requested_by,
                    requested_by,
                    reason,
                    Json(payload),
                    Json({"channelId": channel_id, "trustStage": "probation"}),
                ),
            )


def _unique_strings(values: list[Any]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        text = str(value or "").strip()
        if text and text not in seen:
            seen.add(text)
            result.append(text)
    return result


def _website_endpoint_config(endpoint_url: str, source_role: str, endpoint_kind: str) -> dict[str, Any]:
    config: dict[str, Any] = {
        "collectionSeedUrls": [endpoint_url],
        "curated": {
            "preferCollectionDiscovery": True,
        },
    }
    if source_role in {"procurement_signal", "report_research", "primary_data"} or endpoint_kind in {
        "procurement",
        "report_library",
        "dataset",
    }:
        config["downloadDiscoveryEnabled"] = True
        config["downloadPatterns"] = [".pdf", ".csv", ".xlsx", ".json", ".xml", ".zip"]
        config["extraction"] = {"extractTables": True, "extractDownloads": True}
    if source_role == "procurement_signal" or endpoint_kind == "procurement":
        config["curated"]["listingUrlPatterns"] = [
            "procurement",
            "tenders",
            "contracts",
            "przetargi",
            "zamowienia",
            "postepowania",
            "bip",
            "ausschreibungen",
            "vergaben",
            "bekanntmachungen",
        ]
        config["curated"]["documentUrlPatterns"] = [
            "notice",
            "contract",
            "award",
            "tender",
            "rfp",
            "ogloszenie",
            "bekanntmachung",
        ]
    elif source_role == "report_research" or endpoint_kind == "report_library":
        config["curated"]["documentUrlPatterns"] = [
            "report",
            "reports",
            "research",
            "publication",
            "whitepaper",
        ]
    elif source_role == "primary_data" or endpoint_kind == "dataset":
        config["curated"]["dataFileUrlPatterns"] = ["data", "dataset", "csv", "xlsx", "json"]
    return config
