from __future__ import annotations

import uuid
from typing import Any
from urllib.parse import urlparse

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Json

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
        poll_interval_seconds = 1800 if source["provider_type"] == "rss" else 3600
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

    def _insert_runtime_state(self, connection: Any, *, channel_id: str) -> None:
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
                values (%s, true, 1800, 28800, now(), 0, null, 0, 0, 'discovery_registration', now())
                on conflict (channel_id) do nothing
                """,
                (channel_id,),
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
