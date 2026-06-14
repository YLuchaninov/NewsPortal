import {
  ADMIN_CREATE_PROVIDER_TYPES,
  formatProviderCapabilityLabel,
  isBetaIngestProviderType,
  type BetaIngestProviderType
} from "@signalops/contracts";

export const ADMIN_CHANNEL_PROVIDER_TYPES = ADMIN_CREATE_PROVIDER_TYPES;

export type AdminChannelProviderType = BetaIngestProviderType;

export function isAdminChannelProviderType(
  value: string
): value is AdminChannelProviderType {
  return isBetaIngestProviderType(value);
}

export function resolveAdminChannelProviderType(
  value: unknown,
  fallback: AdminChannelProviderType = "rss"
): AdminChannelProviderType {
  const normalized = String(value ?? "").trim();
  return isAdminChannelProviderType(normalized) ? normalized : fallback;
}

export function formatAdminChannelProviderLabel(
  providerType: AdminChannelProviderType
): string {
  return formatProviderCapabilityLabel(providerType);
}
