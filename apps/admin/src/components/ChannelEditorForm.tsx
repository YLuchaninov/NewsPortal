import * as React from "react";

import { FormField, Input } from "@newsportal/ui";

export interface ChannelEditorFormValue {
  channelId?: string;
  name: string;
  fetchUrl: string;
  language: string;
  isActive: boolean;
  pollIntervalSeconds: number;
  adaptiveEnabled: boolean;
  maxPollIntervalSeconds: number;
  maxItemsPerPoll: number;
  requestTimeoutMs: number;
  userAgent: string;
  preferContentEncoded: boolean;
}

interface ChannelEditorFormProps {
  action: string;
  mode: "create" | "edit";
  redirectTo: string;
  cancelHref: string;
  value: ChannelEditorFormValue;
}

function boolToString(value: boolean): string {
  return value ? "true" : "false";
}

const inputClassName = "h-10 text-sm";

export function ChannelEditorForm({
  action,
  mode,
  redirectTo,
  cancelHref,
  value,
}: ChannelEditorFormProps) {
  return (
    <form method="post" action={action} className="space-y-6">
      <input type="hidden" name="intent" value="save" />
      <input type="hidden" name="providerType" value="rss" />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      {value.channelId && <input type="hidden" name="channelId" value={value.channelId} />}

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-foreground">
            {mode === "create" ? "Channel basics" : "Edit channel"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "create"
              ? "Start with the feed identity and polling defaults. You can fine-tune advanced fetch settings below."
              : "Update the feed URL, language, and polling behavior without leaving this screen."}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            label="Channel name"
            name="channel-name"
            required
            helpText="A human-friendly label shown in admin lists and operational logs."
          >
            <Input
              id="channel-name"
              name="name"
              defaultValue={value.name}
              placeholder="Reuters World RSS"
              className={inputClassName}
            />
          </FormField>

          <FormField
            label="Language"
            name="channel-language"
            helpText="ISO language code used for downstream text processing."
          >
            <Input
              id="channel-language"
              name="language"
              defaultValue={value.language}
              placeholder="en"
              className={inputClassName}
            />
          </FormField>
        </div>

        <div className="mt-4">
          <FormField
            label="Feed URL"
            name="channel-fetch-url"
            required
            helpText="Must be a valid absolute http(s) RSS feed URL."
            helpWide
          >
            <Input
              id="channel-fetch-url"
              name="fetchUrl"
              type="url"
              defaultValue={value.fetchUrl}
              placeholder="https://example.com/feed.xml"
              className={inputClassName}
            />
          </FormField>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <FormField
            label="Base poll interval (seconds)"
            name="channel-poll-interval"
            helpText="Lower values fetch faster but create more load. 300 seconds means every 5 minutes."
            helpWide
          >
            <Input
              id="channel-poll-interval"
              name="pollIntervalSeconds"
              type="number"
              min={30}
              defaultValue={String(value.pollIntervalSeconds)}
              className={inputClassName}
            />
          </FormField>

          <FormField
            label="Active state"
            name="channel-active"
            helpText="Paused channels stay in the system but stop polling until you resume them."
          >
            <select
              id="channel-active"
              name="isActive"
              defaultValue={boolToString(value.isActive)}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="true">Active</option>
              <option value="false">Paused</option>
            </select>
          </FormField>

          <FormField
            label="Adaptive scheduling"
            name="channel-adaptive"
            helpText="Lets the system slow polling for quiet feeds and speed back up when fresh content appears."
            helpWide
          >
            <select
              id="channel-adaptive"
              name="adaptiveEnabled"
              defaultValue={boolToString(value.adaptiveEnabled)}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="true">Enabled</option>
              <option value="false">Fixed interval only</option>
            </select>
          </FormField>
        </div>
      </section>

      <details className="group rounded-2xl border border-border bg-card p-5 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-foreground">Advanced fetch settings</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Fine-tune runtime limits, feed parsing, and scheduling ceilings.
            </p>
          </div>
          <span className="text-xs font-medium text-primary transition group-open:rotate-180">⌄</span>
        </summary>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <FormField
            label="Maximum adaptive interval (seconds)"
            name="channel-max-poll-interval"
            helpText="Upper bound for adaptive backoff when a feed stays quiet."
            helpWide
          >
            <Input
              id="channel-max-poll-interval"
              name="maxPollIntervalSeconds"
              type="number"
              min={30}
              defaultValue={String(value.maxPollIntervalSeconds)}
              className={inputClassName}
            />
          </FormField>

          <FormField
            label="Max items per poll"
            name="channel-max-items"
            helpText="Caps how many RSS items are processed from a single fetch pass."
          >
            <Input
              id="channel-max-items"
              name="maxItemsPerPoll"
              type="number"
              min={1}
              defaultValue={String(value.maxItemsPerPoll)}
              className={inputClassName}
            />
          </FormField>

          <FormField
            label="Request timeout (ms)"
            name="channel-timeout"
            helpText="How long the fetcher waits before treating the feed request as failed."
            helpWide
          >
            <Input
              id="channel-timeout"
              name="requestTimeoutMs"
              type="number"
              min={1000}
              defaultValue={String(value.requestTimeoutMs)}
              className={inputClassName}
            />
          </FormField>

          <FormField
            label="Prefer content:encoded"
            name="channel-prefer-content-encoded"
            helpText="Use richer feed body payloads when the RSS source exposes them."
            helpWide
          >
            <select
              id="channel-prefer-content-encoded"
              name="preferContentEncoded"
              defaultValue={boolToString(value.preferContentEncoded)}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </FormField>
        </div>

        <div className="mt-4">
          <FormField
            label="User agent"
            name="channel-user-agent"
            helpText="Custom request identity sent to RSS providers when fetching this feed."
            helpWide
          >
            <Input
              id="channel-user-agent"
              name="userAgent"
              defaultValue={value.userAgent}
              className={inputClassName}
            />
          </FormField>
        </div>
      </details>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
        <a
          href={cancelHref}
          className="inline-flex h-10 items-center justify-center rounded-md border border-input px-4 text-sm font-medium transition-colors hover:bg-accent"
        >
          Back to channels
        </a>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {mode === "create" ? "Create channel" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
