import type { ReactNode } from "react";

import type { ChannelRow } from "./live-settings-section-model";

interface SettingsCardProps {
  title: string;
  description: ReactNode;
  children: ReactNode;
}

export function SettingsCard({
  title,
  description,
  children,
}: SettingsCardProps) {
  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
      {children}
    </section>
  );
}

interface ToggleRowProps {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  name?: string;
  className?: string;
}

export function ToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
  name,
  className = "flex items-center justify-between py-3 border-b border-border",
}: ToggleRowProps) {
  return (
    <div className={className}>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <label className="relative inline-flex cursor-pointer items-center">
        {name ? <input type="hidden" name={name} value="false" /> : null}
        <input
          type="checkbox"
          name={name}
          value={name ? "true" : undefined}
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          className="sr-only peer"
        />
        <div className="peer h-5 w-9 rounded-full bg-input peer-checked:bg-primary after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-4 after:shadow-sm"></div>
      </label>
    </div>
  );
}

interface SubmitButtonProps {
  disabled: boolean;
  pendingLabel: string;
  idleLabel: string;
}

export function SubmitButton({
  disabled,
  pendingLabel,
  idleLabel,
}: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
    >
      {disabled ? pendingLabel : idleLabel}
    </button>
  );
}

interface DigestStatusSummaryProps {
  nextRunAt: unknown;
  lastSentAt: unknown;
  lastDeliveryStatus: unknown;
  lastDeliveryError: string | null | undefined;
  formatTimestamp: (value: unknown) => string;
}

export function DigestStatusSummary({
  nextRunAt,
  lastSentAt,
  lastDeliveryStatus,
  lastDeliveryError,
  formatTimestamp,
}: DigestStatusSummaryProps) {
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">Next run</span>
        <span className="font-medium">{formatTimestamp(nextRunAt)}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">Last sent</span>
        <span className="font-medium">{formatTimestamp(lastSentAt)}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">Last status</span>
        <span className="font-medium">{String(lastDeliveryStatus ?? "never")}</span>
      </div>
      {lastDeliveryError && (
        <p className="text-xs text-red-600 dark:text-red-400">
          {lastDeliveryError}
        </p>
      )}
    </div>
  );
}

interface ConnectedChannelsTableProps {
  channels: ChannelRow[];
  buildChannelIdentifier: (channel: ChannelRow) => string;
  formatTimestamp: (value: unknown) => string;
}

export function ConnectedChannelsTable({
  channels,
  buildChannelIdentifier,
  formatTimestamp,
}: ConnectedChannelsTableProps) {
  return (
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
          {channels.length === 0 ? (
            <tr>
              <td
                colSpan={3}
                className="px-4 py-8 text-center text-sm text-muted-foreground"
              >
                No connected channels on this page
              </td>
            </tr>
          ) : (
            channels.map((channel) => {
              const isSent = channel.last_status === "sent";
              return (
                <tr
                  key={String(
                    channel.channel_binding_id ?? buildChannelIdentifier(channel)
                  )}
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
  );
}
