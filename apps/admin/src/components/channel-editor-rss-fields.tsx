import { FormField, Input } from "@signalops/ui";

import {
  boolToString,
  type ChannelEditorFormValue,
} from "./channel-editor-form-model";

interface ChannelEditorRssFieldsProps {
  value: ChannelEditorFormValue;
  inputClassName: string;
  selectClassName: string;
  selectedAdapterStrategy: string;
  resolvedAdapterStrategy: string;
  resolvedMaxEntryAgeHours: number | null;
}

export function ChannelEditorRssFields({
  value,
  inputClassName,
  selectClassName,
  selectedAdapterStrategy,
  resolvedAdapterStrategy,
  resolvedMaxEntryAgeHours,
}: ChannelEditorRssFieldsProps) {
  return (
    <>
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
            defaultValue={String(value.maxItemsPerPoll ?? 20)}
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
            defaultValue={String(value.requestTimeoutMs ?? 10000)}
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
            defaultValue={boolToString(value.preferContentEncoded ?? true)}
            className={selectClassName}
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </FormField>

        <FormField
          label="Ingress adapter"
          name="channel-adapter-strategy"
          helpText="Use auto inference for legacy feeds, or pin a known aggregator adapter when the feed needs special normalization."
          helpWide
        >
          <select
            id="channel-adapter-strategy"
            name="adapterStrategy"
            defaultValue={selectedAdapterStrategy || "auto"}
            className={selectClassName}
          >
            <option value="auto">Auto infer</option>
            <option value="generic">Generic RSS / Atom</option>
            <option value="reddit_search_rss">Reddit search RSS</option>
            <option value="hn_comments_feed">Hacker News comments feed</option>
            <option value="google_news_rss">Google News RSS</option>
          </select>
        </FormField>

        <FormField
          label="Max entry age (hours)"
          name="channel-max-entry-age-hours"
          helpText="Optional pre-ingest freshness gate. Leave blank to use the strategy default, if any."
          helpWide
        >
          <Input
            id="channel-max-entry-age-hours"
            name="maxEntryAgeHours"
            type="number"
            min={1}
            defaultValue={value.maxEntryAgeHours != null ? String(value.maxEntryAgeHours) : ""}
            placeholder={
              resolvedMaxEntryAgeHours != null
                ? String(resolvedMaxEntryAgeHours)
                : "No limit"
            }
            className={inputClassName}
          />
        </FormField>

        <FormField
          label="SignalCandidate enrichment"
          name="channel-enrichment-enabled"
          helpText="Enable pre-normalize signal_candidate extraction for short RSS bodies from this channel."
          helpWide
        >
          <select
            id="channel-enrichment-enabled"
            name="enrichmentEnabled"
            defaultValue={boolToString(value.enrichmentEnabled ?? true)}
            className={selectClassName}
          >
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </FormField>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <FormField
          label="Enrichment min body length"
          name="channel-enrichment-min-body-length"
          helpText="If the current signal_candidate body is already at least this many characters, enrichment skips unless manually retried."
          helpWide
        >
          <Input
            id="channel-enrichment-min-body-length"
            name="enrichmentMinBodyLength"
            type="number"
            min={1}
            defaultValue={String(value.enrichmentMinBodyLength ?? 500)}
            className={inputClassName}
          />
        </FormField>

        <FormField
          label="User agent"
          name="channel-user-agent"
          helpText="Custom request identity sent to RSS providers when fetching this feed."
          helpWide
        >
          <Input
            id="channel-user-agent"
            name="userAgent"
            defaultValue={value.userAgent ?? ""}
            className={inputClassName}
          />
        </FormField>
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-border bg-background px-4 py-3 text-sm text-muted-foreground">
        <p>
          Resolved adapter strategy:{" "}
          <span className="font-medium text-foreground">{resolvedAdapterStrategy}</span>
        </p>
        <p className="mt-1">
          Resolved max entry age:{" "}
          <span className="font-medium text-foreground">
            {resolvedMaxEntryAgeHours != null
              ? `${resolvedMaxEntryAgeHours}h`
              : "No pre-ingest age gate"}
          </span>
        </p>
      </div>
    </>
  );
}
