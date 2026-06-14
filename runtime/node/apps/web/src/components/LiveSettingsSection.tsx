import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { DigestCadence, UserDigestSettingsView } from "@signalops/contracts";
import { PaginationNav, reportClientError, readClientErrorMessage } from "@signalops/ui";

import { LIVE_UPDATES_EVENT, type LiveUpdatesEventDetail } from "../lib/live-updates";
import {
  buildChannelIdentifier,
  buildPageHref,
  formatTimeValue,
  formatTimestamp,
  normalizeDigestSettings,
  normalizePreferences,
  paginateChannels,
  readJson,
  urlBase64ToUint8Array,
  type ChannelRow,
  type LiveSettingsSectionProps,
} from "./live-settings-section-model";
import {
  ConnectedChannelsTable,
  DigestStatusSummary,
  SettingsCard,
  SubmitButton,
  ToggleRow,
} from "./live-settings-section-parts";

export function LiveSettingsSection({
  initialThemePreference,
  initialNotificationPreferences,
  initialDigestSettings,
  initialChannels,
  initialPage,
  pageSize,
  currentPath,
  notificationChannelsPath,
  preferencesPath,
  digestSettingsPath,
  sessionEmail,
  vapidKey,
}: LiveSettingsSectionProps) {
  const [themePreference, setThemePreference] = useState(initialThemePreference);
  const [preferences, setPreferences] = useState(initialNotificationPreferences);
  const [digestSettings, setDigestSettings] = useState(initialDigestSettings);
  const [channels, setChannels] = useState(initialChannels);
  const [page, setPage] = useState(initialPage);
  const [webPushStatus, setWebPushStatus] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [digestEmail, setDigestEmail] = useState(sessionEmail);
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [savingDigestSettings, setSavingDigestSettings] = useState(false);
  const [connectingWebPush, setConnectingWebPush] = useState(false);
  const [connectingTelegram, setConnectingTelegram] = useState(false);
  const [connectingEmailDigest, setConnectingEmailDigest] = useState(false);

  const paginatedChannels = paginateChannels(channels, page, pageSize);

  async function refreshSettings(): Promise<void> {
    const [preferencesPayload, channelsPayload, digestSettingsPayload] = await Promise.all([
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
      readJson<{ digestSettings: UserDigestSettingsView | null }>(digestSettingsPath, {
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
    setDigestSettings((current) =>
      normalizeDigestSettings(digestSettingsPayload.digestSettings, current)
    );
  }

  function requestLiveRefresh(): void {
    window.__signalopsLiveUpdates?.forceRefresh?.();
  }

  async function submitPreferences(successMessage: string): Promise<void> {
    const body = new URLSearchParams({
      themePreference,
      webPushEnabled: String(preferences.webPush),
      telegramEnabled: String(preferences.telegram),
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

  async function submitDigestSettings(): Promise<void> {
    const body = new URLSearchParams({
      digestEnabled: String(digestSettings.is_enabled),
      digestCadence: digestSettings.cadence,
      digestTime: formatTimeValue(digestSettings.send_hour, digestSettings.send_minute),
      digestTimezone: String(digestSettings.timezone ?? ""),
      digestSkipIfEmpty: String(digestSettings.skip_if_empty),
    });

    const response = await readJson<{ digestSettings: UserDigestSettingsView }>(
      digestSettingsPath,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        credentials: "same-origin",
      }
    );

    setDigestSettings(normalizeDigestSettings(response.digestSettings, digestSettings));
    toast.success("Digest settings saved");
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
      const errorMessage = readClientErrorMessage(error, "Failed to connect.");
      setWebPushStatus(errorMessage);
      reportClientError(error, {
        context: "Connect web push channel",
        fallbackMessage: "Failed to connect.",
      });
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
  }, [digestSettingsPath, notificationChannelsPath, preferencesPath]);

  return (
    <div className="grid gap-6 max-w-3xl">
      <SettingsCard title="Appearance" description="Choose how SignalOps looks to you">
        <div className="p-6">
          <form
            className="flex items-end gap-3"
            method="post"
            action={preferencesPath}
            onSubmit={async (event) => {
              event.preventDefault();
              setSavingAppearance(true);
              try {
                await submitPreferences("Preferences saved");
              } catch (error) {
                reportClientError(error, {
                  context: "Save appearance preferences",
                  fallbackMessage: "Unable to save preferences.",
                });
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
                name="themePreference"
                value={themePreference}
                onChange={(event) => setThemePreference(event.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <SubmitButton
              disabled={savingAppearance}
              pendingLabel="Saving..."
              idleLabel="Save"
            />
          </form>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Notification Preferences"
        description="Control which notification channels are active"
      >
        <div className="p-6 space-y-4">
          <form
            className="space-y-4"
            method="post"
            action={preferencesPath}
            onSubmit={async (event) => {
              event.preventDefault();
              setSavingPreferences(true);
              try {
                await submitPreferences("Preferences saved");
              } catch (error) {
                reportClientError(error, {
                  context: "Save notification preferences",
                  fallbackMessage: "Unable to save preferences.",
                });
              } finally {
                setSavingPreferences(false);
              }
            }}
          >
            <ToggleRow
              title="Web Push"
              description="Browser push notifications"
              name="webPushEnabled"
              checked={preferences.webPush}
              onCheckedChange={(checked) =>
                setPreferences((current) => ({
                  ...current,
                  webPush: checked,
                }))
              }
            />
            <ToggleRow
              title="Telegram"
              description="Telegram channel alerts"
              name="telegramEnabled"
              checked={preferences.telegram}
              onCheckedChange={(checked) =>
                setPreferences((current) => ({
                  ...current,
                  telegram: checked,
                }))
              }
            />
            <SubmitButton
              disabled={savingPreferences}
              pendingLabel="Saving..."
              idleLabel="Save Preferences"
            />
          </form>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Scheduled Digest"
        description="Configure when your match digest email should be sent"
      >
        <div className="p-6 space-y-4">
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setSavingDigestSettings(true);
              try {
                await submitDigestSettings();
              } catch (error) {
                reportClientError(error, {
                  context: "Save digest settings",
                  fallbackMessage: "Unable to save digest settings.",
                });
              } finally {
                setSavingDigestSettings(false);
              }
            }}
          >
            <ToggleRow
              title="Enable scheduled digest"
              description="Uses your connected email digest channel"
              checked={digestSettings.is_enabled}
              onCheckedChange={(checked) =>
                setDigestSettings((current) => ({
                  ...current,
                  is_enabled: checked,
                }))
              }
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="digest-cadence">
                  Cadence
                </label>
                <select
                  id="digest-cadence"
                  value={digestSettings.cadence}
                  onChange={(event) =>
                    setDigestSettings((current) => ({
                      ...current,
                      cadence: event.target.value as DigestCadence,
                    }))
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="daily">Daily</option>
                  <option value="every_3_days">Every 3 days</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="digest-time">
                  Send time
                </label>
                <input
                  id="digest-time"
                  type="time"
                  value={formatTimeValue(digestSettings.send_hour, digestSettings.send_minute)}
                  onChange={(event) => {
                    const [hour, minute] = event.target.value.split(":");
                    setDigestSettings((current) => ({
                      ...current,
                      send_hour: Number.parseInt(hour ?? "9", 10),
                      send_minute: Number.parseInt(minute ?? "0", 10),
                    }));
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="digest-timezone">
                Timezone
              </label>
              <input
                id="digest-timezone"
                value={String(digestSettings.timezone ?? "")}
                onChange={(event) =>
                  setDigestSettings((current) => ({
                    ...current,
                    timezone: event.target.value,
                  }))
                }
                placeholder="Europe/Warsaw"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Current recipient: {digestSettings.recipient_email ?? "connect an email digest channel first"}
              </p>
            </div>

            <ToggleRow
              title="Skip empty digest runs"
              description="Do not send a digest when there are no new personal matches"
              checked={digestSettings.skip_if_empty}
              onCheckedChange={(checked) =>
                setDigestSettings((current) => ({
                  ...current,
                  skip_if_empty: checked,
                }))
              }
              className="flex items-center justify-between py-3 border-y border-border"
            />

            <DigestStatusSummary
              nextRunAt={digestSettings.next_run_at}
              lastSentAt={digestSettings.last_sent_at}
              lastDeliveryStatus={digestSettings.last_delivery_status}
              lastDeliveryError={digestSettings.last_delivery_error}
              formatTimestamp={formatTimestamp}
            />

            <SubmitButton
              disabled={savingDigestSettings}
              pendingLabel="Saving..."
              idleLabel="Save Digest Settings"
            />
          </form>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Connect Channels"
        description="Link notification delivery channels to your account"
      >
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
              method="post"
              action={notificationChannelsPath}
              onSubmit={async (event) => {
                event.preventDefault();
                setConnectingTelegram(true);
                try {
                  await connectChannel("telegram", telegramChatId);
                  setTelegramChatId("");
                } catch (error) {
                  reportClientError(error, {
                    context: "Connect Telegram channel",
                    fallbackMessage: "Unable to connect Telegram right now.",
                  });
                } finally {
                  setConnectingTelegram(false);
                }
              }}
            >
              <input type="hidden" name="channelType" value="telegram" />
              <input
                name="chatId"
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
              method="post"
              action={notificationChannelsPath}
              onSubmit={async (event) => {
                event.preventDefault();
                setConnectingEmailDigest(true);
                try {
                  await connectChannel("email_digest", digestEmail);
                } catch (error) {
                  reportClientError(error, {
                    context: "Connect email digest channel",
                    fallbackMessage: "Unable to connect email digest right now.",
                  });
                } finally {
                  setConnectingEmailDigest(false);
                }
              }}
            >
              <input type="hidden" name="channelType" value="email_digest" />
              <input
                type="email"
                name="email"
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
      </SettingsCard>

      {paginatedChannels.total > 0 && (
        <SettingsCard
          title="Connected Channels"
          description={
            <>
              {paginatedChannels.total} channel
              {paginatedChannels.total !== 1 ? "s" : ""} total
              {paginatedChannels.total > 0 &&
                ` — page ${paginatedChannels.page} of ${Math.max(
                  paginatedChannels.totalPages,
                  1
                )}`}
            </>
          }
        >
          <ConnectedChannelsTable
            channels={paginatedChannels.items}
            buildChannelIdentifier={buildChannelIdentifier}
            formatTimestamp={formatTimestamp}
          />
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
        </SettingsCard>
      )}
    </div>
  );
}
