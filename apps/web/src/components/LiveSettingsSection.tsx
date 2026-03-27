import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DEFAULT_PAGE } from "@newsportal/contracts";
import { PaginationNav } from "@newsportal/ui";

import { LIVE_UPDATES_EVENT, type LiveUpdatesEventDetail } from "../lib/live-updates";

interface NotificationPreferencesState {
  webPush: boolean;
  telegram: boolean;
  weeklyEmailDigest: boolean;
}

interface ChannelRow {
  channel_binding_id?: string;
  channel_type?: string;
  config_json?: Record<string, unknown>;
  verified_at?: string | null;
  last_status?: string | null;
  last_sent_at?: string | null;
}

interface LiveSettingsSectionProps {
  initialThemePreference: string;
  initialNotificationPreferences: NotificationPreferencesState;
  initialChannels: ChannelRow[];
  initialPage: number;
  pageSize: number;
  currentPath: string;
  notificationChannelsPath: string;
  preferencesPath: string;
  sessionEmail: string;
  vapidKey: string;
}

function buildPageHref(currentPath: string, nextPage: number): string {
  const target = new URL(currentPath, "http://localhost");
  if (nextPage <= DEFAULT_PAGE) {
    target.searchParams.delete("page");
  } else {
    target.searchParams.set("page", String(nextPage));
  }
  return `${target.pathname}${target.search}`;
}

function formatTimestamp(value: unknown): string {
  if (!value) {
    return "Never";
  }

  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4 || 4)) % 4);
  const base64 = `${value}${padding}`.replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function buildChannelIdentifier(channel: ChannelRow): string {
  const config = channel.config_json ?? {};
  if (typeof config.email === "string" && config.email.trim()) {
    return config.email.trim();
  }
  if (typeof config.chat_id === "string" && config.chat_id.trim()) {
    return config.chat_id.trim();
  }
  return "browser";
}

function normalizePreferences(
  value: Record<string, unknown> | null | undefined,
  fallback: NotificationPreferencesState
): NotificationPreferencesState {
  return {
    webPush: value?.web_push !== false && fallback.webPush !== false,
    telegram: value?.telegram !== false && fallback.telegram !== false,
    weeklyEmailDigest:
      value?.weekly_email_digest !== false && fallback.weeklyEmailDigest !== false,
  };
}

function paginateChannels(channels: ChannelRow[], requestedPage: number, pageSize: number) {
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

async function readJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
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

export function LiveSettingsSection({
  initialThemePreference,
  initialNotificationPreferences,
  initialChannels,
  initialPage,
  pageSize,
  currentPath,
  notificationChannelsPath,
  preferencesPath,
  sessionEmail,
  vapidKey,
}: LiveSettingsSectionProps) {
  const [themePreference, setThemePreference] = useState(initialThemePreference);
  const [preferences, setPreferences] = useState(initialNotificationPreferences);
  const [channels, setChannels] = useState(initialChannels);
  const [page, setPage] = useState(initialPage);
  const [webPushStatus, setWebPushStatus] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [digestEmail, setDigestEmail] = useState(sessionEmail);
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [connectingWebPush, setConnectingWebPush] = useState(false);
  const [connectingTelegram, setConnectingTelegram] = useState(false);
  const [connectingEmailDigest, setConnectingEmailDigest] = useState(false);

  const paginatedChannels = paginateChannels(channels, page, pageSize);

  async function refreshSettings(): Promise<void> {
    const [preferencesPayload, channelsPayload] = await Promise.all([
      readJson<{ preferences: { theme_preference?: string; notification_preferences?: Record<string, unknown> } | null }>(
        preferencesPath,
        {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        }
      ),
      readJson<{ channels: ChannelRow[] }>(notificationChannelsPath, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      }),
    ]);

    if (preferencesPayload.preferences) {
      setThemePreference(
        String(preferencesPayload.preferences.theme_preference ?? initialThemePreference)
      );
      setPreferences((current) =>
        normalizePreferences(
          preferencesPayload.preferences?.notification_preferences,
          current
        )
      );
    }

    setChannels(Array.isArray(channelsPayload.channels) ? channelsPayload.channels : []);
  }

  function requestLiveRefresh(): void {
    window.__newsportalLiveUpdates?.forceRefresh?.();
  }

  async function submitPreferences(successMessage: string): Promise<void> {
    const body = new URLSearchParams({
      themePreference,
      webPushEnabled: String(preferences.webPush),
      telegramEnabled: String(preferences.telegram),
      weeklyEmailDigestEnabled: String(preferences.weeklyEmailDigest),
    });

    await readJson<{ updated: boolean }>(preferencesPath, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      credentials: "same-origin",
    });

    toast.success(successMessage);
    await refreshSettings();
    requestLiveRefresh();
  }

  async function connectChannel(channelType: "telegram" | "email_digest", value: string): Promise<void> {
    const body = new URLSearchParams({
      channelType,
      ...(channelType === "telegram" ? { chatId: value } : { email: value }),
    });

    await readJson<{ created?: boolean; updated?: boolean }>(notificationChannelsPath, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      credentials: "same-origin",
    });

    toast.success("Channel connected");
    await refreshSettings();
    requestLiveRefresh();
  }

  async function handleWebPushConnect(): Promise<void> {
    if (!vapidKey) {
      return;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setWebPushStatus("Push not supported in this browser.");
      return;
    }

    setConnectingWebPush(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setWebPushStatus("Permission denied.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        });
      }

      const body = new URLSearchParams({
        channelType: "web_push",
        subscription: JSON.stringify(subscription.toJSON()),
      });

      await readJson<{ created?: boolean; updated?: boolean }>(notificationChannelsPath, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        credentials: "same-origin",
      });

      setWebPushStatus("✓ Web push connected");
      toast.success("Channel connected");
      await refreshSettings();
      requestLiveRefresh();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to connect.";
      setWebPushStatus(errorMessage);
      toast.error(errorMessage);
    } finally {
      setConnectingWebPush(false);
    }
  }

  useEffect(() => {
    if (page !== paginatedChannels.page) {
      setPage(paginatedChannels.page);
      window.history.replaceState(
        null,
        "",
        buildPageHref(currentPath, paginatedChannels.page)
      );
    }
  }, [currentPath, page, paginatedChannels.page]);

  useEffect(() => {
    function handleLiveUpdate(event: Event): void {
      const detail = (event as CustomEvent<LiveUpdatesEventDetail>).detail;
      if (!detail?.changes.settings) {
        return;
      }
      void refreshSettings();
    }

    window.addEventListener(LIVE_UPDATES_EVENT, handleLiveUpdate);
    return () => {
      window.removeEventListener(LIVE_UPDATES_EVENT, handleLiveUpdate);
    };
  }, [notificationChannelsPath, preferencesPath]);

  return (
    <div className="grid gap-6 max-w-3xl">
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-semibold">Appearance</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Choose how NewsPortal looks to you
          </p>
        </div>
        <div className="p-6">
          <form
            className="flex items-end gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              setSavingAppearance(true);
              try {
                await submitPreferences("Preferences saved");
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Unable to save preferences."
                );
              } finally {
                setSavingAppearance(false);
              }
            }}
          >
            <div className="grid gap-1.5 flex-1 max-w-[200px]">
              <label className="text-sm font-medium" htmlFor="theme-select">
                Theme
              </label>
              <select
                id="theme-select"
                value={themePreference}
                onChange={(event) => setThemePreference(event.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={savingAppearance}
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {savingAppearance ? "Saving..." : "Save"}
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-semibold">Notification Preferences</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Control which notification channels are active
          </p>
        </div>
        <div className="p-6 space-y-4">
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setSavingPreferences(true);
              try {
                await submitPreferences("Preferences saved");
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Unable to save preferences."
                );
              } finally {
                setSavingPreferences(false);
              }
            }}
          >
            <div className="flex items-center justify-between py-3 border-b border-border">
              <div>
                <p className="text-sm font-medium">Web Push</p>
                <p className="text-xs text-muted-foreground">
                  Browser push notifications
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={preferences.webPush}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      webPush: event.target.checked,
                    }))
                  }
                  className="sr-only peer"
                />
                <div className="peer h-5 w-9 rounded-full bg-input peer-checked:bg-primary after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-4 after:shadow-sm"></div>
              </label>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-border">
              <div>
                <p className="text-sm font-medium">Telegram</p>
                <p className="text-xs text-muted-foreground">
                  Telegram channel alerts
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={preferences.telegram}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      telegram: event.target.checked,
                    }))
                  }
                  className="sr-only peer"
                />
                <div className="peer h-5 w-9 rounded-full bg-input peer-checked:bg-primary after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-4 after:shadow-sm"></div>
              </label>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">Weekly Digest</p>
                <p className="text-xs text-muted-foreground">
                  Weekly email summary
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={preferences.weeklyEmailDigest}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      weeklyEmailDigest: event.target.checked,
                    }))
                  }
                  className="sr-only peer"
                />
                <div className="peer h-5 w-9 rounded-full bg-input peer-checked:bg-primary after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-4 after:shadow-sm"></div>
              </label>
            </div>
            <button
              type="submit"
              disabled={savingPreferences}
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {savingPreferences ? "Saving..." : "Save Preferences"}
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-semibold">Connect Channels</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Link notification delivery channels to your account
          </p>
        </div>
        <div className="p-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-4">
            <p className="font-medium text-sm mb-1">Web Push</p>
            <p className="text-xs text-muted-foreground mb-3">
              {vapidKey
                ? "Register this browser for push notifications"
                : "VAPID key not configured"}
            </p>
            <button
              type="button"
              disabled={!vapidKey || connectingWebPush}
              onClick={() => {
                void handleWebPushConnect();
              }}
              className="h-8 px-3 rounded-md border border-input text-xs font-medium hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {connectingWebPush ? "Connecting..." : "Connect Web Push"}
            </button>
            <p className="text-xs text-muted-foreground mt-2">{webPushStatus}</p>
          </div>

          <div className="rounded-lg border border-border p-4">
            <p className="font-medium text-sm mb-1">Telegram</p>
            <form
              className="flex gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                setConnectingTelegram(true);
                try {
                  await connectChannel("telegram", telegramChatId);
                  setTelegramChatId("");
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Unable to connect Telegram right now."
                  );
                } finally {
                  setConnectingTelegram(false);
                }
              }}
            >
              <input
                value={telegramChatId}
                onChange={(event) => setTelegramChatId(event.target.value)}
                placeholder="Chat ID"
                className="flex h-8 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <button
                type="submit"
                disabled={connectingTelegram}
                className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors shrink-0 disabled:opacity-50"
              >
                {connectingTelegram ? "Connecting..." : "Connect"}
              </button>
            </form>
          </div>

          <div className="rounded-lg border border-border p-4 sm:col-span-2">
            <p className="font-medium text-sm mb-1">Email Digest</p>
            <form
              className="flex gap-2 max-w-sm"
              onSubmit={async (event) => {
                event.preventDefault();
                setConnectingEmailDigest(true);
                try {
                  await connectChannel("email_digest", digestEmail);
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Unable to connect email digest right now."
                  );
                } finally {
                  setConnectingEmailDigest(false);
                }
              }}
            >
              <input
                type="email"
                value={digestEmail}
                onChange={(event) => setDigestEmail(event.target.value)}
                placeholder="your@email.com"
                className="flex h-8 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <button
                type="submit"
                disabled={connectingEmailDigest}
                className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors shrink-0 disabled:opacity-50"
              >
                {connectingEmailDigest ? "Connecting..." : "Connect"}
              </button>
            </form>
          </div>
        </div>
      </section>

      {paginatedChannels.total > 0 && (
        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="font-semibold">Connected Channels</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {paginatedChannels.total} channel
              {paginatedChannels.total !== 1 ? "s" : ""} total
              {paginatedChannels.total > 0 &&
                ` — page ${paginatedChannels.page} of ${Math.max(
                  paginatedChannels.totalPages,
                  1
                )}`}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Channel
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Verified
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Last Delivery
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedChannels.items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-8 text-center text-sm text-muted-foreground"
                    >
                      No connected channels on this page
                    </td>
                  </tr>
                ) : (
                  paginatedChannels.items.map((channel) => {
                    const isSent = channel.last_status === "sent";
                    return (
                      <tr
                        key={String(channel.channel_binding_id ?? buildChannelIdentifier(channel))}
                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium">
                            {String(channel.channel_type ?? "—")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {buildChannelIdentifier(channel)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {formatTimestamp(channel.verified_at)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              isSent
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {String(channel.last_status ?? "never")}
                          </span>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {formatTimestamp(channel.last_sent_at)}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {paginatedChannels.totalPages > 1 && (
            <PaginationNav
              className="rounded-none border-x-0 border-b-0 px-6 py-4"
              page={paginatedChannels.page}
              totalPages={paginatedChannels.totalPages}
              hasPrev={paginatedChannels.hasPrev}
              hasNext={paginatedChannels.hasNext}
              prevHref={buildPageHref(currentPath, paginatedChannels.page - 1)}
              nextHref={buildPageHref(currentPath, paginatedChannels.page + 1)}
            />
          )}
        </section>
      )}
    </div>
  );
}
