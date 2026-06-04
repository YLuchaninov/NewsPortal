import type { JsonSchema } from "@signalops/contracts";

import {
  createReadTool,
  createWriteTool,
  JsonRpcError,
  readOptionalString,
  readPayload,
  readRequiredString,
  type McpToolDefinition,
} from "./shared";

const adapterFilterSchema = {
  type: "object",
  properties: {
    providerType: { type: "string" },
    runtimeKind: { type: "string" },
    status: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const adapterReadSchema = {
  type: "object",
  required: ["adapterKey"],
  properties: {
    adapterKey: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const adapterPayloadSchema = {
  type: "object",
  required: ["payload"],
  properties: {
    payload: {
      type: "object",
      additionalProperties: true,
    },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const adapterDryRunSchema = {
  type: "object",
  required: ["adapterKey"],
  properties: {
    adapterKey: { type: "string" },
    providerType: { type: "string" },
    fetchUrl: { type: "string" },
    config: { type: "object", additionalProperties: true },
    limit: { type: "number" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const bindingReadSchema = {
  type: "object",
  required: ["channelId"],
  properties: {
    channelId: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const bindingSetSchema = {
  type: "object",
  required: ["channelId", "adapterKey"],
  properties: {
    channelId: { type: "string" },
    adapterKey: { type: "string" },
    config: { type: "object", additionalProperties: true },
    selectionMode: { type: "string", enum: ["manual", "mcp", "auto", "migration", "builtin_default"] },
    enabled: { type: "boolean" },
    selectionReason: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const STATUSES = new Set(["active", "draft", "disabled", "archived"]);
const OUTPUT_MODES = new Set(["articles", "web_resources", "mixed"]);
const SELECTION_MODES = new Set(["manual", "mcp", "auto", "migration", "builtin_default"]);
const SECRET_FIELD_PARTS = ["authorization", "cookie", "password", "secret", "token", "api_key", "apikey"];
const DECLARATIVE_RECIPE_TOP_LEVEL_KEYS = new Set([
  "request",
  "response",
  "pagination",
  "items",
  "map",
  "constants",
  "metadata",
  "maxItems",
]);
const DECLARATIVE_RECIPE_REQUEST_METHODS = new Set(["GET", "POST"]);
const DECLARATIVE_RECIPE_RESPONSE_FORMATS = new Set(["json", "ndjson"]);
const DECLARATIVE_RECIPE_PAGINATION_MODES = new Set(["none", "next_url", "page", "cursor"]);

function asJsonObject(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readEnum(value: unknown, fieldName: string, allowed: Set<string>, fallback?: string): string {
  const normalized = String(value ?? fallback ?? "").trim();
  if (!allowed.has(normalized)) {
    throw new JsonRpcError(-32602, `${fieldName} must be one of ${Array.from(allowed).sort().join(", ")}.`, {
      statusCode: 400,
    });
  }
  return normalized;
}

function assertNoSecretConfig(value: unknown, path = "config"): void {
  if (value == null) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((nested, index) => assertNoSecretConfig(nested, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object") {
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase();
    if (SECRET_FIELD_PARTS.some((part) => normalizedKey.includes(part))) {
      throw new JsonRpcError(-32602, `${path}.${key} must not contain secrets.`, { statusCode: 400 });
    }
    assertNoSecretConfig(nested, `${path}.${key}`);
  }
}

function validateDeclarativeRecipe(value: unknown): void {
  if (value == null) {
    return;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new JsonRpcError(-32602, "payload.recipe must be an object when provided.", { statusCode: 400 });
  }
  const recipe = value as Record<string, unknown>;
  const unknownKeys = Object.keys(recipe).filter((key) => !DECLARATIVE_RECIPE_TOP_LEVEL_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new JsonRpcError(-32602, `payload.recipe has unsupported keys: ${unknownKeys.sort().join(", ")}.`, {
      statusCode: 400,
    });
  }
  const request = recipe.request == null ? null : asJsonObject(recipe.request);
  if (request) {
    const method = String(request.method ?? "GET").trim().toUpperCase();
    if (!DECLARATIVE_RECIPE_REQUEST_METHODS.has(method)) {
      throw new JsonRpcError(-32602, "payload.recipe.request.method must be GET or POST.", { statusCode: 400 });
    }
    if (method === "POST" && request.bodyJson != null) {
      assertNoSecretConfig(request.bodyJson, "payload.recipe.request.bodyJson");
    }
  }
  const response = recipe.response == null ? null : asJsonObject(recipe.response);
  if (response) {
    const format = String(response.format ?? "json").trim().toLowerCase();
    if (!DECLARATIVE_RECIPE_RESPONSE_FORMATS.has(format)) {
      throw new JsonRpcError(-32602, "payload.recipe.response.format must be json or ndjson.", { statusCode: 400 });
    }
  }
  const pagination = recipe.pagination == null ? null : asJsonObject(recipe.pagination);
  if (pagination) {
    const mode = String(pagination.mode ?? "none").trim().toLowerCase();
    if (!DECLARATIVE_RECIPE_PAGINATION_MODES.has(mode)) {
      throw new JsonRpcError(-32602, "payload.recipe.pagination.mode must be none, next_url, page, or cursor.", {
        statusCode: 400,
      });
    }
    const maxPagesPerPoll = Number(pagination.maxPagesPerPoll ?? 1);
    if (!Number.isInteger(maxPagesPerPoll) || maxPagesPerPoll < 1 || maxPagesPerPoll > 10) {
      throw new JsonRpcError(-32602, "payload.recipe.pagination.maxPagesPerPoll must be between 1 and 10.", {
        statusCode: 400,
      });
    }
  }
  if (recipe.items != null && typeof recipe.items !== "string") {
    throw new JsonRpcError(-32602, "payload.recipe.items must be a selector path string.", { statusCode: 400 });
  }
  if (recipe.map != null) {
    asJsonObject(recipe.map);
  }
  if (recipe.constants != null) {
    const constants = asJsonObject(recipe.constants);
    assertNoSecretConfig(constants, "payload.recipe.constants");
  }
}

async function listAdapters(
  pool: Parameters<McpToolDefinition["handler"]>[0]["pool"],
  args: Record<string, unknown>
) {
  const filters: string[] = [];
  const params: unknown[] = [];
  const providerType = readOptionalString(args.providerType);
  const runtimeKind = readOptionalString(args.runtimeKind);
  const status = readOptionalString(args.status);
  if (providerType) {
    params.push(providerType);
    filters.push(`iac.provider_type = $${params.length}`);
  }
  if (runtimeKind) {
    params.push(runtimeKind);
    filters.push(`iac.runtime_kind = $${params.length}`);
  }
  if (status) {
    params.push(status);
    filters.push(`iac.status = $${params.length}`);
  }
  const whereClause = filters.length > 0 ? `where ${filters.join(" and ")}` : "";
  const result = await pool.query(
    `
      select
        iac.adapter_key as "adapterKey",
        iac.title,
        iac.description,
        iac.runtime_kind as "runtimeKind",
        iac.provider_type as "providerType",
        iac.output_mode as "outputMode",
        iac.status,
        iac.priority,
        iac.match_rules_json as "matchRules",
        iac.config_schema_json as "configSchema",
        iac.recipe_json as "recipe",
        iac.module_name as "moduleName",
        iac.metadata_json as "metadata",
        iac.is_system as "isSystem",
        iac.editable,
        count(scab.channel_id) filter (where scab.enabled = true)::int as "activeBindingCount"
      from ingress_adapter_catalog iac
      left join source_channel_adapter_binding scab on scab.adapter_key = iac.adapter_key
      ${whereClause}
      group by iac.adapter_key
      order by iac.provider_type, iac.priority desc, iac.adapter_key
    `,
    params
  );
  return { items: result.rows };
}

async function readLegacyFallbackReport(pool: Parameters<McpToolDefinition["handler"]>[0]["pool"]) {
  const result = await pool.query(`
    select
      sc.channel_id::text as "channelId",
      sc.name,
      sc.provider_type as "providerType",
      sc.fetch_url as "fetchUrl",
      scab.enabled as "bindingEnabled",
      scab.adapter_key as "bindingAdapterKey",
      iac.status as "bindingAdapterStatus",
      iac.provider_type as "bindingProviderType",
      iac.runtime_kind as "bindingRuntimeKind",
      (
        scab.channel_id is not null
        and scab.enabled = true
        and iac.adapter_key is not null
        and iac.status = 'active'
        and iac.provider_type = sc.provider_type
      ) as "hasValidBinding",
      (
        sc.config_json ? 'adapterStrategy'
        or lower(coalesce(sc.fetch_url, '')) like '%news.google.com/rss/%'
        or lower(coalesce(sc.fetch_url, '')) like '%hnrss.org/%'
        or lower(coalesce(sc.fetch_url, '')) like '%reddit.com/search.rss%'
      ) as "hasLegacyRssAdapterHint",
      coalesce(
        nullif(sc.config_json #>> '{api,adapterKey}', ''),
        nullif(sc.config_json #>> '{adapter,adapterKey}', ''),
        nullif(sc.config_json #>> '{adapterKey}', '')
      ) as "legacyApiAdapterKey",
      last_run.adapter_key as "lastRunAdapterKey",
      last_run.adapter_runtime_kind as "lastRunAdapterRuntimeKind",
      last_run.adapter_selection_mode as "lastRunAdapterSelectionMode",
      last_run.provider_metrics_json #>> '{adapterResolutionSource}' as "lastRunAdapterResolutionSource"
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
  `);
  const totals = {
    activeChannelCount: 0,
    validBindingCount: 0,
    channelsWithoutValidBindingCount: 0,
    missingBindingCount: 0,
    disabledBindingCount: 0,
    invalidBindingCount: 0,
    legacyConfigResolutionCount: 0,
    legacyConfigFieldCount: 0,
    lastRunLegacyConfigCount: 0,
    providerMismatchCount: 0,
    providerDefaultResolutionCount: 0,
  };
  const byProvider = new Map<string, typeof totals & { providerType: string }>();
  const channels = result.rows.map((row) => {
    const providerType = String(row.providerType);
    const hasValidBinding = row.hasValidBinding === true;
    const providerMismatch =
      row.bindingAdapterKey != null &&
      row.bindingProviderType != null &&
      row.bindingProviderType !== providerType;
    const legacyConfigFields = {
      rssAdapterStrategy: providerType === "rss" && row.hasLegacyRssAdapterHint === true,
      apiAdapterKey: providerType === "api" && Boolean(row.legacyApiAdapterKey),
    };
    const hasLegacyConfigFields = Object.values(legacyConfigFields).some(Boolean);
    const computedResolverSource = hasValidBinding ? "binding" : "provider_default";
    const providerRow = byProvider.get(providerType) ?? { ...totals, providerType };
    providerRow.activeChannelCount += 1;
    providerRow.validBindingCount += Number(hasValidBinding);
    providerRow.channelsWithoutValidBindingCount += Number(!hasValidBinding);
    providerRow.missingBindingCount += Number(row.bindingAdapterKey == null);
    providerRow.disabledBindingCount += Number(row.bindingAdapterKey != null && row.bindingEnabled !== true);
    providerRow.invalidBindingCount += Number(
      row.bindingAdapterKey != null &&
        (row.bindingAdapterStatus !== "active" || row.bindingProviderType !== providerType)
    );
    providerRow.legacyConfigFieldCount += Number(hasLegacyConfigFields);
    providerRow.lastRunLegacyConfigCount += Number(row.lastRunAdapterResolutionSource === "legacy_config");
    providerRow.providerMismatchCount += Number(providerMismatch);
    providerRow.providerDefaultResolutionCount += Number(computedResolverSource === "provider_default");
    byProvider.set(providerType, providerRow);
    return {
      channelId: row.channelId,
      name: row.name,
      providerType,
      fetchUrl: row.fetchUrl,
      hasValidEnabledBinding: hasValidBinding,
      bindingAdapterKey: row.bindingAdapterKey,
      bindingEnabled: row.bindingEnabled,
      bindingAdapterStatus: row.bindingAdapterStatus,
      bindingProviderType: row.bindingProviderType,
      bindingRuntimeKind: row.bindingRuntimeKind,
      bindingProviderMismatch: providerMismatch,
      computedResolverSource,
      lastFetchRun: {
        adapterKey: row.lastRunAdapterKey,
        adapterRuntimeKind: row.lastRunAdapterRuntimeKind,
        adapterSelectionMode: row.lastRunAdapterSelectionMode,
        adapterResolutionSource: row.lastRunAdapterResolutionSource,
      },
      legacyConfigFields,
      hasLegacyConfigFields,
      legacyFieldsIgnoredForRuntimeSelection: true,
    };
  });
  for (const row of byProvider.values()) {
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
      totals[key] += Number(row[key] ?? 0);
    }
  }
  const removalAllowed =
    totals.channelsWithoutValidBindingCount === 0 &&
    totals.lastRunLegacyConfigCount === 0 &&
    totals.providerMismatchCount === 0;
  return {
    status: removalAllowed ? "ready" : "needs_backfill_or_rebind",
    removalAllowed,
    warning:
      !removalAllowed
        ? "Legacy readers can be removed only after every active supported channel has a valid enabled binding and clean smoke proof shows zero legacy_config resolutions."
        : null,
    totals,
    byProvider: Array.from(byProvider.values()).sort((a, b) => a.providerType.localeCompare(b.providerType)),
    channels,
  };
}

export const INGRESS_ADAPTER_MCP_TOOLS: readonly McpToolDefinition[] = [
  createReadTool(
    "ingress.adapters.list",
    "List ingress adapter catalog rows with optional provider/runtime/status filters.",
    adapterFilterSchema,
    async ({ pool }, args) => listAdapters(pool, args)
  ),
  createReadTool(
    "ingress.adapters.read",
    "Read one ingress adapter catalog row.",
    adapterReadSchema,
    async ({ pool }, args) => {
      const result = await pool.query(
        `
          select *
          from ingress_adapter_catalog
          where adapter_key = $1
        `,
        [readRequiredString(args.adapterKey, "adapterKey")]
      );
      const row = result.rows[0];
      if (!row) {
        throw new JsonRpcError(-32602, "Ingress adapter was not found.", { statusCode: 404 });
      }
      return row;
    }
  ),
  createReadTool(
    "ingress.adapters.legacy_fallback_report",
    "Read legacy adapter fallback readiness counts. This is diagnostic only and never removes compatibility readers.",
    { type: "object", additionalProperties: false },
    async ({ pool }) => readLegacyFallbackReport(pool)
  ),
  createWriteTool(
    "ingress.adapters.create_declarative",
    "Create an editable declarative ingress adapter. Builtin code adapters cannot be created through MCP.",
    "write.channels",
    adapterPayloadSchema,
    async ({ pool, token }, args) => {
      const payload = readPayload(args);
      const adapterKey = readRequiredString(payload.adapterKey, "payload.adapterKey");
      const providerType = readRequiredString(payload.providerType, "payload.providerType");
      if (providerType !== "api") {
        throw new JsonRpcError(-32602, "Declarative adapters currently support providerType api only.", {
          statusCode: 400,
        });
      }
      const outputMode = readEnum(payload.outputMode, "payload.outputMode", OUTPUT_MODES, "articles");
      const status = readEnum(payload.status, "payload.status", STATUSES, "draft");
      const matchRules = asJsonObject(payload.matchRules);
      const configSchema = asJsonObject(payload.configSchema);
      const recipe = payload.recipe == null ? null : asJsonObject(payload.recipe);
      const metadata = asJsonObject(payload.metadata);
      assertNoSecretConfig(matchRules, "payload.matchRules");
      assertNoSecretConfig(configSchema, "payload.configSchema");
      assertNoSecretConfig(recipe, "payload.recipe");
      validateDeclarativeRecipe(recipe);
      assertNoSecretConfig(metadata, "payload.metadata");
      const result = await pool.query(
        `
          insert into ingress_adapter_catalog (
            adapter_key, title, description, runtime_kind, provider_type, output_mode,
            status, priority, match_rules_json, config_schema_json, recipe_json,
            module_name, metadata_json, is_system, editable, created_by
          )
          values ($1, $2, $3, 'declarative', $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12::jsonb, false, true, $13)
          returning adapter_key as "adapterKey", title, runtime_kind as "runtimeKind", provider_type as "providerType", status
        `,
        [
          adapterKey,
          readOptionalString(payload.title) ?? adapterKey,
          readOptionalString(payload.description) ?? "",
          providerType,
          outputMode,
          status,
          Number(payload.priority ?? 100),
          JSON.stringify(matchRules),
          JSON.stringify(configSchema),
          recipe == null ? null : JSON.stringify(recipe),
          readOptionalString(payload.moduleName) ?? "declarative.api.custom",
          JSON.stringify(metadata),
          token.issuedByUserId,
        ]
      );
      return { created: true, adapter: result.rows[0] };
    }
  ),
  createWriteTool(
    "ingress.adapters.update_declarative",
    "Update an editable declarative ingress adapter. System/builtin adapters are read-only.",
    "write.channels",
    {
      type: "object",
      required: ["adapterKey", "payload"],
      properties: {
        adapterKey: { type: "string" },
        payload: { type: "object", additionalProperties: true },
      },
      additionalProperties: false,
    },
    async ({ pool }, args) => {
      const adapterKey = readRequiredString(args.adapterKey, "adapterKey");
      const payload = readPayload(args);
      const current = await pool.query(
        "select runtime_kind, is_system, editable from ingress_adapter_catalog where adapter_key = $1",
        [adapterKey]
      );
      const currentRow = current.rows[0];
      if (!currentRow) {
        throw new JsonRpcError(-32602, "Ingress adapter was not found.", { statusCode: 404 });
      }
      if (currentRow.runtime_kind !== "declarative" || currentRow.is_system || !currentRow.editable) {
        throw new JsonRpcError(-32602, "Only editable declarative adapters can be updated.", { statusCode: 400 });
      }
      if (payload.status != null) {
        readEnum(payload.status, "payload.status", STATUSES);
      }
      const matchRules = payload.matchRules == null ? null : asJsonObject(payload.matchRules);
      const configSchema = payload.configSchema == null ? null : asJsonObject(payload.configSchema);
      const recipe = payload.recipe == null ? null : asJsonObject(payload.recipe);
      const metadata = payload.metadata == null ? null : asJsonObject(payload.metadata);
      assertNoSecretConfig(matchRules, "payload.matchRules");
      assertNoSecretConfig(configSchema, "payload.configSchema");
      assertNoSecretConfig(recipe, "payload.recipe");
      validateDeclarativeRecipe(recipe);
      assertNoSecretConfig(metadata, "payload.metadata");
      const result = await pool.query(
        `
          update ingress_adapter_catalog
          set
            title = coalesce($2, title),
            description = coalesce($3, description),
            status = coalesce($4, status),
            priority = coalesce($5, priority),
            match_rules_json = coalesce($6::jsonb, match_rules_json),
            config_schema_json = coalesce($7::jsonb, config_schema_json),
            recipe_json = coalesce($8::jsonb, recipe_json),
            metadata_json = coalesce($9::jsonb, metadata_json),
            updated_at = now()
          where adapter_key = $1
          returning adapter_key as "adapterKey", title, runtime_kind as "runtimeKind", provider_type as "providerType", status
        `,
        [
          adapterKey,
          readOptionalString(payload.title),
          readOptionalString(payload.description),
          readOptionalString(payload.status),
          payload.priority == null ? null : Number(payload.priority),
          matchRules == null ? null : JSON.stringify(matchRules),
          configSchema == null ? null : JSON.stringify(configSchema),
          recipe == null ? null : JSON.stringify(recipe),
          metadata == null ? null : JSON.stringify(metadata),
        ]
      );
      return { updated: true, adapter: result.rows[0] };
    }
  ),
  createReadTool(
    "ingress.adapters.dry_run",
    "Dry-run an ingress adapter through the fetchers internal runtime. The dry-run does not write articles, resources, cursors or outbox rows.",
    adapterDryRunSchema,
    async (_context, args) => {
      const baseUrl = (process.env.FETCHERS_INTERNAL_BASE_URL ?? "http://fetchers:4100").replace(/\/+$/u, "");
      const response = await fetch(`${baseUrl}/internal/ingress-adapters/dry-run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      });
      if (!response.ok) {
        throw new JsonRpcError(-32603, `Fetchers dry-run failed with HTTP ${response.status}.`, {
          statusCode: 502,
        });
      }
      return response.json();
    }
  ),
  createReadTool(
    "ingress.adapters.recommend_for_channel",
    "Recommend adapters for an existing channel using catalog match rules. This never mutates the binding.",
    bindingReadSchema,
    async ({ pool }, args) => {
      const channelId = readRequiredString(args.channelId, "channelId");
      const channel = await pool.query(
        "select provider_type, fetch_url from source_channels where channel_id = $1",
        [channelId]
      );
      const row = channel.rows[0];
      if (!row) {
        throw new JsonRpcError(-32602, "Channel was not found.", { statusCode: 404 });
      }
      const catalog = await pool.query(
        `
          select adapter_key, title, priority, match_rules_json
          from ingress_adapter_catalog
          where provider_type = $1 and status = 'active'
          order by priority desc, adapter_key
        `,
        [row.provider_type]
      );
      const fetchUrl = String(row.fetch_url ?? "").toLowerCase();
      return {
        channelId,
        recommendations: catalog.rows.map((adapter) => {
          const rules = asJsonObject(adapter.match_rules_json);
          const hostRules = Array.isArray(rules.urlHostContains) ? rules.urlHostContains : [];
          const matchedHost = hostRules.length === 0 || hostRules.some((host) => fetchUrl.includes(String(host).toLowerCase()));
          return {
            adapterKey: adapter.adapter_key,
            title: adapter.title,
            priority: adapter.priority,
            matchedRules: matchedHost && hostRules.length > 0 ? ["urlHostContains"] : [],
            failedRules: matchedHost ? [] : ["urlHostContains"],
            autoBindable: Boolean(rules.allowAutoSelect) && matchedHost,
            reason: Boolean(rules.allowAutoSelect) && matchedHost ? "Matched safe catalog rules." : "Available for manual review.",
          };
        }),
      };
    }
  ),
  createReadTool(
    "ingress.bindings.read",
    "Read the sticky adapter binding for one channel.",
    bindingReadSchema,
    async ({ pool }, args) => {
      const result = await pool.query(
        `
          select scab.*, iac.title, iac.runtime_kind, iac.output_mode, iac.status
          from source_channel_adapter_binding scab
          join ingress_adapter_catalog iac on iac.adapter_key = scab.adapter_key
          where scab.channel_id = $1
        `,
        [readRequiredString(args.channelId, "channelId")]
      );
      const row = result.rows[0];
      if (!row) {
        throw new JsonRpcError(-32602, "Channel adapter binding was not found.", { statusCode: 404 });
      }
      return row;
    }
  ),
  createWriteTool(
    "ingress.bindings.set",
    "Set or replace the sticky adapter binding for one channel.",
    "write.channels",
    bindingSetSchema,
    async ({ pool, token }, args) => {
      const channelId = readRequiredString(args.channelId, "channelId");
      const adapterKey = readRequiredString(args.adapterKey, "adapterKey");
      const adapter = await pool.query(
        "select status, provider_type from ingress_adapter_catalog where adapter_key = $1",
        [adapterKey]
      );
      if (!adapter.rows[0]) {
        throw new JsonRpcError(-32602, "Ingress adapter was not found.", { statusCode: 404 });
      }
      if (["disabled", "archived"].includes(String(adapter.rows[0].status))) {
        throw new JsonRpcError(-32602, "Disabled or archived adapters cannot be bound.", { statusCode: 400 });
      }
      const channel = await pool.query(
        "select provider_type from source_channels where channel_id = $1",
        [channelId]
      );
      if (!channel.rows[0]) {
        throw new JsonRpcError(-32602, "Channel was not found.", { statusCode: 404 });
      }
      if (channel.rows[0].provider_type !== adapter.rows[0].provider_type) {
        throw new JsonRpcError(-32602, "Adapter providerType must match channel providerType.", {
          statusCode: 400,
        });
      }
      const selectionMode = readEnum(args.selectionMode, "selectionMode", SELECTION_MODES, "mcp");
      const config = asJsonObject(args.config);
      assertNoSecretConfig(config, "config");
      await pool.query(
        `
          insert into source_channel_adapter_binding (
            channel_id, adapter_key, config_json, selection_mode, enabled,
            selected_by, selection_reason, updated_at
          )
          values ($1, $2, $3::jsonb, $4, $5, $6, $7, now())
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
        `,
        [
          channelId,
          adapterKey,
          JSON.stringify(config),
          selectionMode,
          args.enabled !== false,
          token.issuedByUserId,
          readOptionalString(args.selectionReason),
        ]
      );
      return { channelId, adapterKey, updated: true };
    }
  ),
  createWriteTool(
    "ingress.bindings.delete",
    "Delete a channel adapter binding so runtime falls back to legacy config/provider default.",
    "write.channels",
    bindingReadSchema,
    async ({ pool }, args) => {
      const channelId = readRequiredString(args.channelId, "channelId");
      const result = await pool.query(
        "delete from source_channel_adapter_binding where channel_id = $1",
        [channelId]
      );
      return { channelId, deleted: (result.rowCount ?? 0) > 0 };
    }
  ),
] as const;
