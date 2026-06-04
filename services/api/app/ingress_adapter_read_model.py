from __future__ import annotations

from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Json as Jsonb

from services.api.app.database import build_database_url, query_all, query_one


class IngressAdapterNotFoundError(LookupError):
    pass


class IngressAdapterMutationError(ValueError):
    pass


_PROVIDER_TYPES = {"rss", "website", "api", "email_imap"}
_RUNTIME_KINDS = {"declarative", "builtin"}
_OUTPUT_MODES = {"signal_candidates", "web_resources", "mixed"}
_STATUSES = {"active", "draft", "disabled", "archived"}
_SELECTION_MODES = {"manual", "mcp", "auto", "migration", "builtin_default"}
_SECRET_FIELD_PARTS = {
    "authorization",
    "cookie",
    "password",
    "secret",
    "token",
    "api_key",
    "apikey",
}
_DECLARATIVE_RECIPE_TOP_LEVEL_KEYS = {"request", "response", "pagination", "items", "map", "constants", "metadata", "maxItems"}
_DECLARATIVE_RECIPE_REQUEST_METHODS = {"GET", "POST"}
_DECLARATIVE_RECIPE_RESPONSE_FORMATS = {"json", "ndjson"}
_DECLARATIVE_RECIPE_PAGINATION_MODES = {"none", "next_url", "page", "cursor"}


def _first_present(payload: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in payload:
            return payload[key]
    return None


def _normalize_json_object(value: Any, field_name: str) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    raise IngressAdapterMutationError(f"{field_name} must be an object.")


def _read_enum(value: Any, field_name: str, allowed: set[str], default: str | None = None) -> str:
    normalized = str(value if value is not None else default or "").strip()
    if normalized not in allowed:
        allowed_list = ", ".join(sorted(allowed))
        raise IngressAdapterMutationError(f"{field_name} must be one of {allowed_list}.")
    return normalized


def _assert_no_secret_config(value: Any, path: str = "config") -> None:
    if isinstance(value, dict):
        for key, nested in value.items():
            normalized_key = str(key).lower()
            if any(part in normalized_key for part in _SECRET_FIELD_PARTS):
                raise IngressAdapterMutationError(f"{path}.{key} must not contain secrets.")
            _assert_no_secret_config(nested, f"{path}.{key}")
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            _assert_no_secret_config(nested, f"{path}[{index}]")


def _validate_declarative_recipe(recipe: Any) -> None:
    if recipe is None:
        return
    if not isinstance(recipe, dict):
        raise IngressAdapterMutationError("recipe must be an object when provided.")
    unknown_keys = set(recipe) - _DECLARATIVE_RECIPE_TOP_LEVEL_KEYS
    if unknown_keys:
        raise IngressAdapterMutationError(
            f"recipe has unsupported keys: {', '.join(sorted(unknown_keys))}."
        )
    request = recipe.get("request")
    if request is not None:
        if not isinstance(request, dict):
            raise IngressAdapterMutationError("recipe.request must be an object.")
        method = str(request.get("method") or "GET").strip().upper()
        if method not in _DECLARATIVE_RECIPE_REQUEST_METHODS:
            raise IngressAdapterMutationError("recipe.request.method must be GET or POST.")
        if method == "POST" and "bodyJson" in request:
            _assert_no_secret_config(request["bodyJson"], "recipe.request.bodyJson")
    response = recipe.get("response")
    if response is not None:
        if not isinstance(response, dict):
            raise IngressAdapterMutationError("recipe.response must be an object.")
        response_format = str(response.get("format") or "json").strip().lower()
        if response_format not in _DECLARATIVE_RECIPE_RESPONSE_FORMATS:
            raise IngressAdapterMutationError("recipe.response.format must be json or ndjson.")
    pagination = recipe.get("pagination")
    if pagination is not None:
        if not isinstance(pagination, dict):
            raise IngressAdapterMutationError("recipe.pagination must be an object.")
        mode = str(pagination.get("mode") or "none").strip().lower()
        if mode not in _DECLARATIVE_RECIPE_PAGINATION_MODES:
            raise IngressAdapterMutationError("recipe.pagination.mode must be none, next_url, page, or cursor.")
        max_pages = int(pagination.get("maxPagesPerPoll") or 1)
        if max_pages < 1 or max_pages > 10:
            raise IngressAdapterMutationError("recipe.pagination.maxPagesPerPoll must be between 1 and 10.")
    if "items" in recipe and not isinstance(recipe.get("items"), str):
        raise IngressAdapterMutationError("recipe.items must be a selector path string.")
    mapping = recipe.get("map")
    if mapping is not None and not isinstance(mapping, dict):
        raise IngressAdapterMutationError("recipe.map must be an object.")
    constants = recipe.get("constants")
    if constants is not None:
        if not isinstance(constants, dict):
            raise IngressAdapterMutationError("recipe.constants must be an object.")
        _assert_no_secret_config(constants, "recipe.constants")


def _adapter_row_to_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "adapterKey": row["adapter_key"],
        "title": row["title"],
        "description": row["description"],
        "runtimeKind": row["runtime_kind"],
        "providerType": row["provider_type"],
        "outputMode": row["output_mode"],
        "status": row["status"],
        "priority": row["priority"],
        "matchRules": row["match_rules_json"] or {},
        "configSchema": row["config_schema_json"] or {},
        "recipe": row["recipe_json"],
        "moduleName": row["module_name"],
        "metadata": row["metadata_json"] or {},
        "isSystem": row["is_system"],
        "editable": row["editable"],
        "createdBy": row["created_by"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "activeBindingCount": row.get("active_binding_count", 0),
    }


def list_ingress_adapters(
    *,
    provider_type: str | None = None,
    runtime_kind: str | None = None,
    status: str | None = None,
    query_all_func=query_all,
) -> list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    if provider_type:
        filters.append("iac.provider_type = %s")
        params.append(provider_type)
    if runtime_kind:
        filters.append("iac.runtime_kind = %s")
        params.append(runtime_kind)
    if status:
        filters.append("iac.status = %s")
        params.append(status)

    where_clause = f"where {' and '.join(filters)}" if filters else ""
    rows = query_all_func(
        f"""
        select
          iac.*,
          count(scab.channel_id) filter (where scab.enabled = true)::int as active_binding_count
        from ingress_adapter_catalog iac
        left join source_channel_adapter_binding scab on scab.adapter_key = iac.adapter_key
        {where_clause}
        group by iac.adapter_key
        order by iac.provider_type, iac.priority desc, iac.adapter_key
        """,
        tuple(params),
    )
    return [_adapter_row_to_payload(row) for row in rows]


def get_ingress_adapter(
    adapter_key: str,
    *,
    query_one_func=query_one,
) -> dict[str, Any]:
    row = query_one_func(
        """
        select
          iac.*,
          count(scab.channel_id) filter (where scab.enabled = true)::int as active_binding_count
        from ingress_adapter_catalog iac
        left join source_channel_adapter_binding scab on scab.adapter_key = iac.adapter_key
        where iac.adapter_key = %s
        group by iac.adapter_key
        """,
        (adapter_key,),
    )
    if row is None:
        raise IngressAdapterNotFoundError(adapter_key)
    return _adapter_row_to_payload(row)


def create_declarative_ingress_adapter(payload: dict[str, Any]) -> dict[str, Any]:
    adapter_key = str(payload.get("adapterKey") or payload.get("adapter_key") or "").strip()
    if not adapter_key:
        raise IngressAdapterMutationError("adapterKey is required.")
    runtime_kind = _read_enum(
        payload.get("runtimeKind") or payload.get("runtime_kind"),
        "runtimeKind",
        _RUNTIME_KINDS,
        "declarative",
    )
    if runtime_kind != "declarative":
        raise IngressAdapterMutationError("Only declarative adapters can be created through maintenance API.")
    provider_type = _read_enum(
        payload.get("providerType") or payload.get("provider_type"),
        "providerType",
        _PROVIDER_TYPES,
    )
    if provider_type != "api":
        raise IngressAdapterMutationError("Declarative adapters currently support providerType api only.")
    output_mode = _read_enum(
        payload.get("outputMode") or payload.get("output_mode"),
        "outputMode",
        _OUTPUT_MODES,
        "signal_candidates",
    )
    title = str(payload.get("title") or adapter_key).strip()
    description = str(payload.get("description") or "").strip()
    status = _read_enum(payload.get("status"), "status", _STATUSES, "draft")
    priority = int(payload.get("priority") or 100)
    match_rules = _normalize_json_object(
        _first_present(payload, "matchRules", "match_rules_json"),
        "matchRules",
    )
    config_schema = _normalize_json_object(
        _first_present(payload, "configSchema", "config_schema_json"),
        "configSchema",
    )
    recipe = _first_present(payload, "recipe", "recipe_json")
    _validate_declarative_recipe(recipe)
    metadata = _normalize_json_object(
        _first_present(payload, "metadata", "metadata_json"),
        "metadata",
    )
    _assert_no_secret_config(match_rules, "matchRules")
    _assert_no_secret_config(config_schema, "configSchema")
    _assert_no_secret_config(recipe, "recipe")
    _assert_no_secret_config(metadata, "metadata")

    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into ingress_adapter_catalog (
                  adapter_key, title, description, runtime_kind, provider_type,
                  output_mode, status, priority, match_rules_json,
                  config_schema_json, recipe_json, module_name, metadata_json,
                  is_system, editable, created_by
                )
                values (
                  %s, %s, %s, 'declarative', %s, %s, %s, %s, %s::jsonb,
                  %s::jsonb, %s::jsonb, %s, %s::jsonb, false, true, %s
                )
                returning *
                """,
                (
                    adapter_key,
                    title,
                    description,
                    provider_type,
                    output_mode,
                    status,
                    priority,
                    Jsonb(match_rules),
                    Jsonb(config_schema),
                    Jsonb(recipe) if recipe is not None else None,
                    str(payload.get("moduleName") or payload.get("module_name") or "declarative.api.custom"),
                    Jsonb(metadata),
                    str(payload.get("createdBy") or payload.get("created_by") or "maintenance-api"),
                ),
            )
            row = dict(cursor.fetchone())
        connection.commit()
    row["active_binding_count"] = 0
    return _adapter_row_to_payload(row)


def update_declarative_ingress_adapter(adapter_key: str, payload: dict[str, Any]) -> dict[str, Any]:
    current = get_ingress_adapter(adapter_key)
    if current["runtimeKind"] != "declarative" or current["isSystem"] or not current["editable"]:
        raise IngressAdapterMutationError("Only editable declarative adapters can be updated.")

    fields = {
        "title": payload.get("title", current["title"]),
        "description": payload.get("description", current["description"]),
        "status": _read_enum(payload.get("status", current["status"]), "status", _STATUSES),
        "priority": int(payload.get("priority", current["priority"])),
        "match_rules_json": _normalize_json_object(payload.get("matchRules", current["matchRules"]), "matchRules"),
        "config_schema_json": _normalize_json_object(payload.get("configSchema", current["configSchema"]), "configSchema"),
        "recipe_json": payload.get("recipe", current["recipe"]),
        "metadata_json": _normalize_json_object(payload.get("metadata", current["metadata"]), "metadata"),
    }
    _validate_declarative_recipe(fields["recipe_json"])
    _assert_no_secret_config(fields["match_rules_json"], "matchRules")
    _assert_no_secret_config(fields["config_schema_json"], "configSchema")
    _assert_no_secret_config(fields["recipe_json"], "recipe")
    _assert_no_secret_config(fields["metadata_json"], "metadata")

    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update ingress_adapter_catalog
                set
                  title = %s,
                  description = %s,
                  status = %s,
                  priority = %s,
                  match_rules_json = %s::jsonb,
                  config_schema_json = %s::jsonb,
                  recipe_json = %s::jsonb,
                  metadata_json = %s::jsonb,
                  updated_at = now()
                where adapter_key = %s
                returning *
                """,
                (
                    fields["title"],
                    fields["description"],
                    fields["status"],
                    fields["priority"],
                    Jsonb(fields["match_rules_json"]),
                    Jsonb(fields["config_schema_json"]),
                    Jsonb(fields["recipe_json"]) if fields["recipe_json"] is not None else None,
                    Jsonb(fields["metadata_json"]),
                    adapter_key,
                ),
            )
            row = dict(cursor.fetchone())
        connection.commit()
    row["active_binding_count"] = current["activeBindingCount"]
    return _adapter_row_to_payload(row)


def read_channel_adapter_binding(channel_id: str) -> dict[str, Any] | None:
    row = query_one(
        """
        select
          scab.channel_id::text as channel_id,
          scab.adapter_key,
          scab.config_json,
          scab.selection_mode,
          scab.enabled,
          scab.selected_by,
          scab.selection_reason,
          scab.created_at,
          scab.updated_at,
          iac.title,
          iac.runtime_kind,
          iac.provider_type,
          iac.output_mode,
          iac.status
        from source_channel_adapter_binding scab
        join ingress_adapter_catalog iac on iac.adapter_key = scab.adapter_key
        where scab.channel_id = %s
        """,
        (channel_id,),
    )
    if row is None:
        return None
    return {
        "channelId": row["channel_id"],
        "adapterKey": row["adapter_key"],
        "config": row["config_json"] or {},
        "selectionMode": row["selection_mode"],
        "enabled": row["enabled"],
        "selectedBy": row["selected_by"],
        "selectionReason": row["selection_reason"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "title": row["title"],
        "runtimeKind": row["runtime_kind"],
        "providerType": row["provider_type"],
        "outputMode": row["output_mode"],
        "status": row["status"],
    }


def upsert_channel_adapter_binding(channel_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    adapter_key = str(payload.get("adapterKey") or payload.get("adapter_key") or "").strip()
    if not adapter_key:
        raise IngressAdapterMutationError("adapterKey is required.")
    config = _normalize_json_object(_first_present(payload, "config", "config_json"), "config")
    _assert_no_secret_config(config, "config")
    selection_mode = _read_enum(
        payload.get("selectionMode") or payload.get("selection_mode"),
        "selectionMode",
        _SELECTION_MODES,
        "manual",
    )
    enabled = bool(payload.get("enabled", True))
    selected_by = str(payload.get("selectedBy") or payload.get("selected_by") or "maintenance-api")
    selection_reason = str(payload.get("selectionReason") or payload.get("selection_reason") or "").strip() or None

    adapter = get_ingress_adapter(adapter_key)
    if adapter["status"] in {"disabled", "archived"}:
        raise IngressAdapterMutationError("Disabled or archived adapters cannot be bound.")

    with psycopg.connect(build_database_url()) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "select provider_type from source_channels where channel_id = %s",
                (channel_id,),
            )
            channel_row = cursor.fetchone()
            if channel_row is None:
                raise IngressAdapterMutationError("Channel was not found.")
            if channel_row[0] != adapter["providerType"]:
                raise IngressAdapterMutationError("Adapter providerType must match channel providerType.")
            cursor.execute(
                """
                insert into source_channel_adapter_binding (
                  channel_id, adapter_key, config_json, selection_mode, enabled,
                  selected_by, selection_reason, updated_at
                )
                values (%s, %s, %s::jsonb, %s, %s, %s, %s, now())
                on conflict (channel_id)
                do update
                set
                  adapter_key = excluded.adapter_key,
                  config_json = excluded.config_json,
                  selection_mode = excluded.selection_mode,
                  enabled = excluded.enabled,
                  selected_by = excluded.selected_by,
                  selection_reason = excluded.selection_reason,
                  updated_at = excluded.updated_at
                """,
                (
                    channel_id,
                    adapter_key,
                    Jsonb(config),
                    selection_mode,
                    enabled,
                    selected_by,
                    selection_reason,
                ),
            )
        connection.commit()
    return read_channel_adapter_binding(channel_id) or {}


def delete_channel_adapter_binding(channel_id: str) -> dict[str, Any]:
    with psycopg.connect(build_database_url()) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "delete from source_channel_adapter_binding where channel_id = %s",
                (channel_id,),
            )
            deleted = cursor.rowcount
        connection.commit()
    return {"channelId": channel_id, "deleted": deleted > 0}


def recommend_adapters_for_channel(channel_id: str) -> list[dict[str, Any]]:
    channel = query_one(
        """
        select channel_id::text as channel_id, provider_type, fetch_url, config_json
        from source_channels
        where channel_id = %s
        """,
        (channel_id,),
    )
    if channel is None:
        raise IngressAdapterMutationError("Channel was not found.")
    fetch_url = str(channel.get("fetch_url") or "")
    rows = query_all(
        """
        select *
        from ingress_adapter_catalog
        where provider_type = %s
          and status = 'active'
        order by priority desc, adapter_key
        """,
        (channel["provider_type"],),
    )
    recommendations: list[dict[str, Any]] = []
    for row in rows:
        rules = row.get("match_rules_json") or {}
        matched: list[str] = []
        failed: list[str] = []
        host_rules = rules.get("urlHostContains")
        if isinstance(host_rules, list) and host_rules:
            if any(str(host).lower() in fetch_url.lower() for host in host_rules):
                matched.append("urlHostContains")
            else:
                failed.append("urlHostContains")
        path_rules = rules.get("urlPathContains")
        if isinstance(path_rules, list) and path_rules:
            if any(str(path).lower() in fetch_url.lower() for path in path_rules):
                matched.append("urlPathContains")
            else:
                failed.append("urlPathContains")
        auto_bindable = bool(rules.get("allowAutoSelect")) and not failed
        recommendations.append(
            {
                "adapterKey": row["adapter_key"],
                "title": row["title"],
                "priority": row["priority"],
                "matchedRules": matched,
                "failedRules": failed,
                "autoBindable": auto_bindable,
                "reason": "Matched safe catalog rules." if auto_bindable else "Available catalog adapter for manual review.",
            }
        )
    return recommendations


def read_legacy_fallback_report(*, query_all_func=query_all) -> dict[str, Any]:
    rows = query_all_func(
        """
        select
          sc.channel_id::text,
          sc.name,
          sc.provider_type,
          sc.fetch_url,
          sc.config_json,
          scab.enabled as binding_enabled,
          scab.adapter_key as binding_adapter_key,
          iac.status as binding_adapter_status,
          iac.provider_type as binding_provider_type,
          iac.runtime_kind as binding_runtime_kind,
          (
            scab.channel_id is not null
            and scab.enabled = true
            and iac.adapter_key is not null
            and iac.status = 'active'
            and iac.provider_type = sc.provider_type
          ) as has_valid_binding,
          (
            sc.config_json ? 'adapterStrategy'
            or lower(coalesce(sc.fetch_url, '')) like '%%news.google.com/rss/%%'
            or lower(coalesce(sc.fetch_url, '')) like '%%hnrss.org/%%'
            or lower(coalesce(sc.fetch_url, '')) like '%%reddit.com/search.rss%%'
          ) as has_legacy_rss_adapter_hint,
          coalesce(
            nullif(sc.config_json #>> '{api,adapterKey}', ''),
            nullif(sc.config_json #>> '{adapter,adapterKey}', ''),
            nullif(sc.config_json #>> '{adapterKey}', '')
          ) as legacy_api_adapter_key,
          last_run.adapter_key as last_run_adapter_key,
          last_run.adapter_runtime_kind as last_run_adapter_runtime_kind,
          last_run.adapter_selection_mode as last_run_adapter_selection_mode,
          last_run.provider_metrics_json #>> '{adapterResolutionSource}' as last_run_adapter_resolution_source
        from source_channels sc
        left join source_channel_adapter_binding scab on scab.channel_id = sc.channel_id
        left join ingress_adapter_catalog iac on iac.adapter_key = scab.adapter_key
        left join lateral (
          select
            cfr.adapter_key,
            cfr.adapter_runtime_kind,
            cfr.adapter_selection_mode,
            cfr.provider_metrics_json
          from channel_fetch_runs cfr
          where cfr.channel_id = sc.channel_id
          order by cfr.started_at desc
          limit 1
        ) last_run on true
        where sc.provider_type in ('rss', 'api', 'website', 'email_imap')
          and sc.is_active = true
        order by sc.provider_type, sc.name, sc.channel_id
        """
    )
    totals = {
        "activeChannelCount": 0,
        "validBindingCount": 0,
        "channelsWithoutValidBindingCount": 0,
        "missingBindingCount": 0,
        "disabledBindingCount": 0,
        "invalidBindingCount": 0,
        "legacyConfigResolutionCount": 0,
        "legacyConfigFieldCount": 0,
        "lastRunLegacyConfigCount": 0,
        "providerMismatchCount": 0,
        "providerDefaultResolutionCount": 0,
    }
    provider_acc: dict[str, dict[str, Any]] = {}
    channels: list[dict[str, Any]] = []
    for row in rows:
        provider_type = row["provider_type"]
        has_valid_binding = bool(row["has_valid_binding"])
        missing_binding = row["binding_adapter_key"] is None
        disabled_binding = row["binding_adapter_key"] is not None and row["binding_enabled"] is not True
        invalid_binding = (
            row["binding_adapter_key"] is not None
            and (
                row["binding_adapter_status"] != "active"
                or row["binding_provider_type"] != provider_type
            )
        )
        provider_mismatch = (
            row["binding_adapter_key"] is not None
            and row["binding_provider_type"] is not None
            and row["binding_provider_type"] != provider_type
        )
        legacy_fields = {
            "rssAdapterStrategy": bool(provider_type == "rss" and row["has_legacy_rss_adapter_hint"]),
            "apiAdapterKey": bool(provider_type == "api" and row["legacy_api_adapter_key"]),
        }
        has_legacy_fields = any(legacy_fields.values())
        computed_source = "binding" if has_valid_binding else "provider_default"
        last_run_source = row["last_run_adapter_resolution_source"]
        channel = {
            "channelId": row["channel_id"],
            "name": row["name"],
            "providerType": provider_type,
            "fetchUrl": row["fetch_url"],
            "hasValidEnabledBinding": has_valid_binding,
            "bindingAdapterKey": row["binding_adapter_key"],
            "bindingEnabled": row["binding_enabled"],
            "bindingAdapterStatus": row["binding_adapter_status"],
            "bindingProviderType": row["binding_provider_type"],
            "bindingRuntimeKind": row["binding_runtime_kind"],
            "bindingProviderMismatch": provider_mismatch,
            "computedResolverSource": computed_source,
            "lastFetchRun": {
                "adapterKey": row["last_run_adapter_key"],
                "adapterRuntimeKind": row["last_run_adapter_runtime_kind"],
                "adapterSelectionMode": row["last_run_adapter_selection_mode"],
                "adapterResolutionSource": last_run_source,
            },
            "legacyConfigFields": legacy_fields,
            "hasLegacyConfigFields": has_legacy_fields,
            "legacyFieldsIgnoredForRuntimeSelection": True,
        }
        channels.append(channel)

        item = provider_acc.setdefault(
            provider_type,
            {
                "providerType": provider_type,
                "activeChannelCount": 0,
                "validBindingCount": 0,
                "channelsWithoutValidBindingCount": 0,
                "missingBindingCount": 0,
                "disabledBindingCount": 0,
                "invalidBindingCount": 0,
                "legacyConfigResolutionCount": 0,
                "legacyConfigFieldCount": 0,
                "lastRunLegacyConfigCount": 0,
                "providerMismatchCount": 0,
                "providerDefaultResolutionCount": 0,
            },
        )
        item["activeChannelCount"] += 1
        item["validBindingCount"] += int(has_valid_binding)
        item["channelsWithoutValidBindingCount"] += int(not has_valid_binding)
        item["missingBindingCount"] += int(missing_binding)
        item["disabledBindingCount"] += int(disabled_binding)
        item["invalidBindingCount"] += int(invalid_binding)
        item["legacyConfigFieldCount"] += int(has_legacy_fields)
        item["lastRunLegacyConfigCount"] += int(last_run_source == "legacy_config")
        item["providerMismatchCount"] += int(provider_mismatch)
        item["providerDefaultResolutionCount"] += int(computed_source == "provider_default")

    by_provider = sorted(provider_acc.values(), key=lambda item: item["providerType"])
    for item in by_provider:
        for key in totals:
            totals[key] += int(item[key])
    removal_allowed = (
        totals["channelsWithoutValidBindingCount"] == 0
        and totals["lastRunLegacyConfigCount"] == 0
        and totals["providerMismatchCount"] == 0
    )
    return {
        "status": "ready" if removal_allowed else "needs_backfill_or_rebind",
        "removalAllowed": removal_allowed,
        "warning": (
            "Legacy readers can be removed only after every active supported channel has a valid enabled binding and clean smoke proof shows zero legacy_config resolutions."
            if not removal_allowed
            else None
        ),
        "totals": totals,
        "byProvider": by_provider,
        "channels": channels,
    }
