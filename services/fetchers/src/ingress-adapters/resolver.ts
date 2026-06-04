import {
  defaultIngressAdapterKeyForProvider,
  type IngressAdapterOutputMode,
  type IngressAdapterRuntimeKind,
  type SourceProviderType,
} from "@signalops/contracts";
import type { Pool } from "pg";

import type { SourceChannelRow } from "../fetcher-persistence";

export interface ResolvedIngressAdapter {
  source: "binding" | "provider_default";
  adapterKey: string;
  runtimeKind: IngressAdapterRuntimeKind;
  providerType: SourceProviderType;
  outputMode: IngressAdapterOutputMode;
  selectionMode: "manual" | "mcp" | "auto" | "migration" | "builtin_default" | "provider_default";
  bindingConfigJson: Record<string, unknown>;
  catalogRecipeJson: Record<string, unknown>;
}

interface BindingRow {
  adapter_key: string;
  config_json: Record<string, unknown> | null;
  selection_mode: ResolvedIngressAdapter["selectionMode"];
  runtime_kind: IngressAdapterRuntimeKind;
  provider_type: SourceProviderType;
  output_mode: IngressAdapterOutputMode;
  recipe_json: Record<string, unknown> | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickFirstRecord(...values: unknown[]): Record<string, unknown> {
  for (const value of values) {
    const record = asRecord(value);
    if (Object.keys(record).length > 0) {
      return record;
    }
  }
  return {};
}

function declarativeRecipeToApiConfig(recipe: Record<string, unknown>): Record<string, unknown> {
  const request = asRecord(recipe.request);
  const response = asRecord(recipe.response);
  const pagination = asRecord(recipe.pagination);
  const map = asRecord(recipe.map);
  const constants = pickFirstRecord(recipe.constants, map.constants, recipe.metadata);
  const adapterConfig: Record<string, unknown> = {};

  if (constants.sourceRole != null) {
    adapterConfig.sourceRole = constants.sourceRole;
  }
  if (constants.contentKind != null) {
    adapterConfig.contentKind = constants.contentKind;
  }
  if (constants.tags != null) {
    adapterConfig.tags = constants.tags;
  }

  return {
    ...(request.method != null ? { requestMethod: request.method } : {}),
    ...(request.headers != null ? { requestHeaders: request.headers } : {}),
    ...(request.bodyJson != null ? { requestBodyJson: request.bodyJson } : {}),
    ...(response.format != null ? { responseFormat: response.format } : {}),
    ...(recipe.maxItems != null ? { maxItemsPerPoll: recipe.maxItems } : {}),
    ...(recipe.items != null ? { itemsPath: recipe.items } : {}),
    ...(map.title != null ? { titleField: map.title } : {}),
    ...(map.lead != null ? { leadField: map.lead } : {}),
    ...(map.body != null ? { bodyField: map.body } : {}),
    ...(map.url != null ? { urlField: map.url } : {}),
    ...(map.urlTemplate != null ? { urlTemplate: map.urlTemplate } : {}),
    ...(map.publishedAt != null ? { publishedAtField: map.publishedAt } : {}),
    ...(map.externalId != null ? { externalIdField: map.externalId } : {}),
    ...(map.language != null ? { languageField: map.language } : {}),
    ...(Object.keys(pagination).length > 0 ? { pagination } : {}),
    ...(Object.keys(adapterConfig).length > 0 ? { adapter: adapterConfig } : {}),
  };
}

function buildResolvedBindingConfig(binding: BindingRow): Record<string, unknown> {
  const bindingConfig = binding.config_json ?? {};
  if (binding.provider_type !== "api" || binding.runtime_kind !== "declarative") {
    return bindingConfig;
  }
  return {
    ...declarativeRecipeToApiConfig(binding.recipe_json ?? {}),
    ...bindingConfig,
  };
}

async function findActiveBinding(pool: Pool, channelId: string): Promise<BindingRow | null> {
  const result = await pool.query<BindingRow>(
    `
      select
        scab.adapter_key,
        scab.config_json,
        scab.selection_mode,
        iac.runtime_kind,
        iac.provider_type,
        iac.output_mode,
        iac.recipe_json
      from source_channel_adapter_binding scab
      join ingress_adapter_catalog iac on iac.adapter_key = scab.adapter_key
      where scab.channel_id = $1
        and scab.enabled = true
        and iac.status = 'active'
      limit 1
    `,
    [channelId]
  );
  return result.rows[0] ?? null;
}

function resolveProviderDefault(channel: SourceChannelRow): ResolvedIngressAdapter | null {
  const adapterKey = defaultIngressAdapterKeyForProvider(channel.providerType);
  if (!adapterKey) {
    return null;
  }
  return {
    source: "provider_default",
    adapterKey,
    runtimeKind: adapterKey === "api.generic_json_mapping" ? "declarative" : "builtin",
    providerType: channel.providerType,
    outputMode: channel.providerType === "website" ? "web_resources" : "articles",
    selectionMode: "provider_default",
    bindingConfigJson: {},
    catalogRecipeJson: {},
  };
}

export async function resolveIngressAdapterForChannel(
  pool: Pool,
  channel: SourceChannelRow
): Promise<ResolvedIngressAdapter | null> {
  const binding = await findActiveBinding(pool, channel.channelId);
  if (binding) {
    return {
      source: "binding",
      adapterKey: binding.adapter_key,
      runtimeKind: binding.runtime_kind,
      providerType: binding.provider_type,
      outputMode: binding.output_mode,
      selectionMode: binding.selection_mode,
      bindingConfigJson: buildResolvedBindingConfig(binding),
      catalogRecipeJson: binding.recipe_json ?? {},
    };
  }

  return resolveProviderDefault(channel);
}

export function applyResolvedIngressAdapterToChannel(
  channel: SourceChannelRow,
  resolved: ResolvedIngressAdapter | null
): SourceChannelRow {
  if (!resolved) {
    return channel;
  }

  return {
    ...channel,
    configJson: {
      ...asRecord(channel.configJson),
      ...resolved.bindingConfigJson,
    },
  };
}

export function buildIngressAdapterProviderMetrics(
  resolved: ResolvedIngressAdapter | null
): Record<string, unknown> {
  if (!resolved) {
    return {};
  }
  return {
    adapterKey: resolved.adapterKey,
    adapterRuntimeKind: resolved.runtimeKind,
    adapterSelectionMode: resolved.selectionMode,
    adapterResolutionSource: resolved.source,
  };
}
