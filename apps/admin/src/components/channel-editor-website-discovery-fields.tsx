import { FormField, Input } from "@signalops/ui";

import {
  boolToString,
  type ChannelEditorFormValue,
} from "./channel-editor-form-model";

interface ChannelEditorWebsiteDiscoveryFieldsProps {
  value: ChannelEditorFormValue;
  selectClassName: string;
  textareaClassName: string;
}

export function ChannelEditorWebsiteDiscoveryFields({
  value,
  selectClassName,
  textareaClassName,
}: ChannelEditorWebsiteDiscoveryFieldsProps) {
  return (
    <>
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-foreground">Discovery modes</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Keep website discovery cheap and deterministic. Browser fallback stays
          opt-in and should remain off unless you have explicit proof that the site
          needs it.
        </p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <FormField
          label="Sitemap discovery"
          name="channel-sitemap-discovery"
          helpText="Probe declared sitemaps and lastmod signals first."
        >
          <select
            id="channel-sitemap-discovery"
            name="sitemapDiscoveryEnabled"
            defaultValue={boolToString(value.sitemapDiscoveryEnabled ?? true)}
            className={selectClassName}
          >
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </FormField>

        <FormField
          label="Feed discovery"
          name="channel-feed-discovery"
          helpText="Treat discovered feeds as one signal, not as an automatic provider switch."
        >
          <select
            id="channel-feed-discovery"
            name="feedDiscoveryEnabled"
            defaultValue={boolToString(value.feedDiscoveryEnabled ?? true)}
            className={selectClassName}
          >
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </FormField>

        <FormField
          label="Collection discovery"
          name="channel-collection-discovery"
          helpText="Scan listing and directory pages for detail resources."
        >
          <select
            id="channel-collection-discovery"
            name="collectionDiscoveryEnabled"
            defaultValue={boolToString(value.collectionDiscoveryEnabled ?? true)}
            className={selectClassName}
          >
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </FormField>

        <FormField
          label="Download discovery"
          name="channel-download-discovery"
          helpText="Capture linked documents and data files when they are part of the site surface."
        >
          <select
            id="channel-download-discovery"
            name="downloadDiscoveryEnabled"
            defaultValue={boolToString(value.downloadDiscoveryEnabled ?? true)}
            className={selectClassName}
          >
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </FormField>

        <FormField
          label="Browser fallback"
          name="channel-browser-fallback"
          helpText="Use only for hard JS sites. This capability stays off by default to keep the lane cheap and predictable."
        >
          <select
            id="channel-browser-fallback"
            name="browserFallbackEnabled"
            defaultValue={boolToString(value.browserFallbackEnabled ?? false)}
            className={selectClassName}
          >
            <option value="false">Disabled</option>
            <option value="true">Enabled</option>
          </select>
        </FormField>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <FormField
          label="Collection seed URLs"
          name="channel-collection-seeds"
          helpText="Optional absolute URLs, one per line, to use as listing or directory seeds in addition to the homepage."
          helpWide
        >
          <textarea
            id="channel-collection-seeds"
            name="collectionSeedUrls"
            defaultValue={value.collectionSeedUrlsText ?? ""}
            rows={5}
            className={textareaClassName}
            placeholder={"https://example.com/datasets\nhttps://example.com/archive"}
          />
        </FormField>

        <FormField
          label="Allowed URL patterns"
          name="channel-allowed-patterns"
          helpText="Optional regex patterns, one per line. When set, only matching URLs are persisted."
          helpWide
        >
          <textarea
            id="channel-allowed-patterns"
            name="allowedUrlPatterns"
            defaultValue={value.allowedUrlPatternsText ?? ""}
            rows={5}
            className={textareaClassName}
            placeholder={"/datasets/\n/report"}
          />
        </FormField>

        <FormField
          label="Blocked URL patterns"
          name="channel-blocked-patterns"
          helpText="Optional regex patterns, one per line, to keep navigation pages, login flows, or low-value URLs out of storage."
          helpWide
        >
          <textarea
            id="channel-blocked-patterns"
            name="blockedUrlPatterns"
            defaultValue={value.blockedUrlPatternsText ?? ""}
            rows={5}
            className={textareaClassName}
            placeholder={"/login\n/signup\n/cart"}
          />
        </FormField>
      </div>
    </>
  );
}

interface ChannelEditorWebsiteCrawlFieldsProps {
  value: ChannelEditorFormValue;
  inputClassName: string;
}

export function ChannelEditorWebsiteCrawlFields({
  value,
  inputClassName,
}: ChannelEditorWebsiteCrawlFieldsProps) {
  return (
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <FormField
        label="Maximum adaptive interval (seconds)"
        name="channel-max-poll-interval"
        helpText="Upper bound for adaptive backoff when the site stays quiet."
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
        label="Max resources per poll"
        name="channel-max-resources"
        helpText="Caps how many discovered resources are persisted from one website polling pass."
      >
        <Input
          id="channel-max-resources"
          name="maxResourcesPerPoll"
          type="number"
          min={1}
          defaultValue={String(value.maxResourcesPerPoll ?? 50)}
          className={inputClassName}
        />
      </FormField>

      <FormField
        label="Request timeout (ms)"
        name="channel-timeout"
        helpText="How long the fetcher waits for one network request before treating it as failed."
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
        label="Total poll timeout (ms)"
        name="channel-total-timeout"
        helpText="Safety ceiling for the whole website discovery pass."
        helpWide
      >
        <Input
          id="channel-total-timeout"
          name="totalPollTimeoutMs"
          type="number"
          min={1000}
          defaultValue={String(value.totalPollTimeoutMs ?? 30000)}
          className={inputClassName}
        />
      </FormField>

      <FormField
        label="Crawl delay (ms)"
        name="channel-crawl-delay"
        helpText="Minimum delay between same-site requests from this channel, in addition to robots.txt guidance."
        helpWide
      >
        <Input
          id="channel-crawl-delay"
          name="crawlDelayMs"
          type="number"
          min={1}
          defaultValue={String(value.crawlDelayMs ?? 1000)}
          className={inputClassName}
        />
      </FormField>

      <FormField
        label="User agent"
        name="channel-user-agent"
        helpText="Custom request identity sent during capability probing and discovery."
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
  );
}
