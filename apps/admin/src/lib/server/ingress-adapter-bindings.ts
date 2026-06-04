import {
  defaultIngressAdapterKeyForProvider,
  legacyRssStrategyToIngressAdapterKey,
  resolveRssChannelAdapterStrategy,
  type FeedIngressAdapterStrategy,
  type SourceProviderType,
} from "@signalops/contracts";

type Queryable = {
  query(sql: string, params?: unknown[]): Promise<unknown>;
};

type RssBindingInput = {
  providerType: "rss";
  channelId?: string;
  fetchUrl: string;
  adapterStrategy?: FeedIngressAdapterStrategy | null;
  maxEntryAgeHours?: number | null;
};

type ApiBindingInput = {
  providerType: "api";
  channelId?: string;
  ingressAdapterKey?: string | null;
  adapter: Record<string, unknown>;
};

type StaticBindingInput = {
  providerType: "website" | "email_imap";
  channelId?: string;
};

export type IngressAdapterBindingInput =
  | RssBindingInput
  | ApiBindingInput
  | StaticBindingInput;

function buildBindingConfig(channel: IngressAdapterBindingInput): Record<string, unknown> {
  if (channel.providerType === "rss") {
    return channel.maxEntryAgeHours != null ? { maxEntryAgeHours: channel.maxEntryAgeHours } : {};
  }
  if (channel.providerType === "api") {
    const adapterConfig = { ...channel.adapter };
    delete adapterConfig.adapterKey;
    return Object.keys(adapterConfig).length > 0 ? { adapter: adapterConfig } : {};
  }
  return {};
}

export function resolveIngressAdapterKeyForAdminChannel(
  channel: IngressAdapterBindingInput
): string {
  if (channel.providerType === "rss") {
    const strategy = resolveRssChannelAdapterStrategy(channel.fetchUrl, {
      adapterStrategy: channel.adapterStrategy ?? null,
    });
    return legacyRssStrategyToIngressAdapterKey(strategy);
  }

  if (channel.providerType === "api") {
    if (channel.ingressAdapterKey?.startsWith("api.")) {
      return channel.ingressAdapterKey;
    }
    return "api.generic_json_mapping";
  }

  return defaultIngressAdapterKeyForProvider(channel.providerType) ?? "";
}

export function stripLegacyAdapterConfigForBinding<T extends Record<string, unknown>>(
  providerType: SourceProviderType,
  config: T
): T {
  if (providerType === "rss") {
    const rest = { ...config };
    delete rest.adapterStrategy;
    return rest as T;
  }

  if (providerType === "api") {
    const rest = { ...config };
    delete rest.adapterKey;
    const restRecord = rest as Record<string, unknown>;
    const adapter = restRecord.adapter;
    if (adapter && typeof adapter === "object" && !Array.isArray(adapter)) {
      const adapterRecord = adapter as Record<string, unknown>;
      const adapterWithoutKey = { ...adapterRecord };
      delete adapterWithoutKey.adapterKey;
      restRecord.adapter = adapterWithoutKey;
    }
    return rest as T;
  }

  return config;
}

export async function upsertIngressAdapterBindingForAdminChannel(
  client: Queryable,
  channelId: string,
  channel: IngressAdapterBindingInput,
  selectedBy: string
): Promise<void> {
  const adapterKey = resolveIngressAdapterKeyForAdminChannel(channel);
  if (!adapterKey) {
    return;
  }

  await client.query(
    `
      insert into source_channel_adapter_binding (
        channel_id,
        adapter_key,
        config_json,
        selection_mode,
        enabled,
        selected_by,
        selection_reason,
        updated_at
      )
      values ($1, $2, $3::jsonb, 'manual', true, $4, 'admin channel save', now())
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
    [channelId, adapterKey, JSON.stringify(buildBindingConfig(channel)), selectedBy]
  );
}
