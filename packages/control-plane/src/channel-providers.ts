export const ADMIN_CHANNEL_PROVIDER_TYPES = [
  "rss",
  "website",
  "api",
  "email_imap",
] as const;

export type AdminChannelProviderType =
  (typeof ADMIN_CHANNEL_PROVIDER_TYPES)[number];

export function isAdminChannelProviderType(
  value: string
): value is AdminChannelProviderType {
  return (ADMIN_CHANNEL_PROVIDER_TYPES as readonly string[]).includes(value);
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
  switch (providerType) {
    case "rss":
      return "RSS";
    case "website":
      return "Website";
    case "api":
      return "API";
    case "email_imap":
      return "Email IMAP";
    default:
      return providerType;
  }
}
