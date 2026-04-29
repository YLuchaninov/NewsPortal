import {
  DEFAULT_PAGE,
  type DigestCadence,
  type UserDigestSettingsView,
} from "@newsportal/contracts";

export interface NotificationPreferencesState {
  webPush: boolean;
  telegram: boolean;
}

export interface ChannelRow {
  channel_binding_id?: string;
  channel_type?: string;
  config_json?: Record<string, unknown>;
  verified_at?: string | null;
  last_status?: string | null;
  last_sent_at?: string | null;
}

export interface LiveSettingsSectionProps {
  initialThemePreference: string;
  initialNotificationPreferences: NotificationPreferencesState;
  initialDigestSettings: UserDigestSettingsView;
  initialChannels: ChannelRow[];
  initialPage: number;
  pageSize: number;
  currentPath: string;
  notificationChannelsPath: string;
  preferencesPath: string;
  digestSettingsPath: string;
  sessionEmail: string;
  vapidKey: string;
}

export function buildPageHref(currentPath: string, nextPage: number): string {
  const target = new URL(currentPath, "http://localhost");
  if (nextPage <= DEFAULT_PAGE) {
    target.searchParams.delete("page");
  } else {
    target.searchParams.set("page", String(nextPage));
  }
  return `${target.pathname}${target.search}`;
}

export function formatTimestamp(value: unknown): string {
  if (!value) {
    return "Never";
  }

  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

export function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4 || 4)) % 4);
  const base64 = `${value}${padding}`.replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function buildChannelIdentifier(channel: ChannelRow): string {
  const config = channel.config_json ?? {};
  if (typeof config.email === "string" && config.email.trim()) {
    return config.email.trim();
  }
  if (typeof config.chat_id === "string" && config.chat_id.trim()) {
    return config.chat_id.trim();
  }
  return "browser";
}

export function normalizePreferences(
  value: Record<string, unknown> | null | undefined,
  fallback: NotificationPreferencesState
): NotificationPreferencesState {
  return {
    webPush: value?.web_push !== false && fallback.webPush !== false,
    telegram: value?.telegram !== false && fallback.telegram !== false,
  };
}

export function normalizeDigestSettings(
  value: UserDigestSettingsView | null | undefined,
  fallback: UserDigestSettingsView
): UserDigestSettingsView {
  return {
    is_enabled: value?.is_enabled ?? fallback.is_enabled,
    cadence: (value?.cadence ?? fallback.cadence ?? "weekly") as DigestCadence,
    send_hour: Number.isFinite(Number(value?.send_hour))
      ? Number(value?.send_hour)
      : fallback.send_hour,
    send_minute: Number.isFinite(Number(value?.send_minute))
      ? Number(value?.send_minute)
      : fallback.send_minute,
    timezone: String(value?.timezone ?? fallback.timezone ?? "").trim() || null,
    skip_if_empty: value?.skip_if_empty ?? fallback.skip_if_empty,
    next_run_at: value?.next_run_at ?? fallback.next_run_at ?? null,
    last_sent_at: value?.last_sent_at ?? fallback.last_sent_at ?? null,
    last_delivery_status:
      value?.last_delivery_status ?? fallback.last_delivery_status ?? null,
    last_delivery_error:
      value?.last_delivery_error ?? fallback.last_delivery_error ?? null,
    recipient_email:
      String(value?.recipient_email ?? fallback.recipient_email ?? "").trim() || null,
  };
}

export function formatTimeValue(hour: number, minute: number): string {
  return `${String(hour ?? 9).padStart(2, "0")}:${String(minute ?? 0).padStart(2, "0")}`;
}

export function paginateChannels(
  channels: ChannelRow[],
  requestedPage: number,
  pageSize: number
) {
  const total = channels.length;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;
  const page = Math.min(Math.max(requestedPage, DEFAULT_PAGE), totalPages);
  const offset = (page - 1) * pageSize;
  return {
    items: channels.slice(offset, offset + pageSize),
    total,
    totalPages,
    page,
    hasPrev: page > DEFAULT_PAGE,
    hasNext: page < totalPages,
  };
}

export async function readJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    let errorMessage = `Request failed with ${response.status}.`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        errorMessage = payload.error;
      }
    } catch {
      // Ignore JSON parsing errors and keep the fallback message.
    }
    throw new Error(errorMessage);
  }
  return (await response.json()) as T;
}
