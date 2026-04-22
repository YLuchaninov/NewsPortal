import { FormField, Input } from "@newsportal/ui";

import {
  formatAdminChannelProviderLabel,
  type AdminChannelProviderType,
} from "../lib/channel-providers";

export type ChannelProviderType = AdminChannelProviderType;

export interface ChannelEditorFormValue {
  channelId?: string;
  providerType: ChannelProviderType;
  name: string;
  fetchUrl: string;
  language: string;
  isActive: boolean;
  pollIntervalSeconds: number;
  adaptiveEnabled: boolean;
  maxPollIntervalSeconds: number;
  requestTimeoutMs?: number;
  userAgent?: string;
  maxItemsPerPoll?: number;
  preferContentEncoded?: boolean;
  adapterStrategy?: string | null;
  maxEntryAgeHours?: number | null;
  resolvedAdapterStrategy?: string | null;
  resolvedMaxEntryAgeHours?: number | null;
  enrichmentEnabled?: boolean;
  enrichmentMinBodyLength?: number;
  maxResourcesPerPoll?: number;
  totalPollTimeoutMs?: number;
  crawlDelayMs?: number;
  sitemapDiscoveryEnabled?: boolean;
  feedDiscoveryEnabled?: boolean;
  collectionDiscoveryEnabled?: boolean;
  downloadDiscoveryEnabled?: boolean;
  browserFallbackEnabled?: boolean;
  collectionSeedUrlsText?: string;
  allowedUrlPatternsText?: string;
  blockedUrlPatternsText?: string;
  hasAuthorizationHeader?: boolean;
  itemsPath?: string;
  titleField?: string;
  leadField?: string;
  bodyField?: string;
  urlField?: string;
  publishedAtField?: string;
  externalIdField?: string;
  languageField?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  mailbox?: string;
  searchFrom?: string | null;
  hasPassword?: boolean;
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
  const isRss = value.providerType === "rss";
  const isWebsite = value.providerType === "website";
  const isApi = value.providerType === "api";
  const isEmailImap = value.providerType === "email_imap";
  const supportsAuthorizationHeader = !isEmailImap;
  const providerLabel = formatAdminChannelProviderLabel(value.providerType);

  const basicsTitle =
    mode === "create"
      ? isWebsite
        ? "Website channel basics"
        : isApi
          ? "API channel basics"
          : isEmailImap
            ? "Email IMAP channel basics"
            : "RSS channel basics"
      : `Edit ${providerLabel} channel`;

  const basicsDescription =
    mode === "create"
      ? isWebsite
        ? "Start with the site entry URL and safe discovery defaults. You can fine-tune crawl behavior below."
        : isApi
          ? "Start with the JSON endpoint, then map the payload fields that contain article-level content."
          : isEmailImap
            ? "Connect one mailbox with IMAP credentials and an optional sender filter for ingest."
            : "Start with the feed endpoint and polling defaults. You can fine-tune advanced fetch settings below."
      : isWebsite
        ? "Update the site entry URL, language, and discovery behavior without leaving this screen."
        : isApi
          ? "Update the API endpoint, payload mapping, and polling behavior without leaving this screen."
          : isEmailImap
            ? "Update mailbox connection details and polling behavior without leaving this screen."
            : "Update the RSS endpoint, language, and polling behavior without leaving this screen.";

  const placeholderName = isWebsite
    ? "World Bank Data Portal"
    : isApi
      ? "Transparency API feed"
      : isEmailImap
        ? "Press inbox"
        : "Reuters World RSS";

  const urlLabel = isWebsite
    ? "Website entry URL"
    : isApi
      ? "API endpoint URL"
      : "Feed URL";

  const urlHelpText = isWebsite
    ? "Must be a valid absolute http(s) website URL. The fetcher will probe sitemaps, feeds, collection pages, and downloadable resources from here."
    : isApi
      ? "Must be a valid absolute http(s) JSON endpoint. Use the field mapping below to point at the array and properties that contain article data."
      : "Must be a valid absolute http(s) RSS feed URL.";

  const urlPlaceholder = isWebsite
    ? "https://example.com/"
    : isApi
      ? "https://example.com/api/items"
      : "https://example.com/feed.xml";

  const submitLabel =
    mode === "create"
      ? isWebsite
        ? "Create website channel"
        : isApi
          ? "Create API channel"
          : isEmailImap
            ? "Create Email IMAP channel"
            : "Create RSS channel"
      : "Save changes";

  const authorizationDescription = isWebsite
    ? "Use a static Authorization header only when this website requires authenticated fetcher requests. Interactive login and cookie-based sessions stay unsupported."
    : isApi
      ? "Use a static Authorization header only when this API requires authenticated requests. The fetcher forwards it exactly as entered."
      : "Use a static Authorization header only when this feed requires authenticated fetcher requests.";

  const hasAuthorizationHeader = value.hasAuthorizationHeader === true;
  const selectedAdapterStrategy = value.adapterStrategy ?? "";
  const resolvedAdapterStrategy =
    value.resolvedAdapterStrategy ?? (selectedAdapterStrategy || "generic");
  const resolvedMaxEntryAgeHours =
    value.resolvedMaxEntryAgeHours ?? value.maxEntryAgeHours ?? null;
  const hasPassword = value.hasPassword === true;
  const passwordHelpText =
    mode === "edit"
      ? hasPassword
        ? "A password is already configured. Leave this blank to preserve it, or enter a new value to replace it."
        : "No password is configured yet. Enter one now to enable mailbox access."
      : "Mailbox password used for IMAP login.";

  return (
    <form method="post" action={action} className="space-y-6">
      <input type="hidden" name="intent" value="save" />
      <input type="hidden" name="providerType" value={value.providerType} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      {value.channelId && <input type="hidden" name="channelId" value={value.channelId} />}

      <section className="rounded-2xl border border-border bg-background px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {[
            { title: "Basics", body: "Identity, source URL, schedule, and active state." },
            { title: "Auth", body: supportsAuthorizationHeader ? "Stored Authorization header when this source needs it." : "Credentials live in the mailbox section below." },
            {
              title: "Provider settings",
              body: isWebsite
                ? "Discovery modes, crawl budgets, and URL constraints."
                : isApi
                  ? "Payload mapping, request budgets, and enrichment."
                  : isEmailImap
                    ? "Mailbox connection, sender filter, and ingest limits."
                    : "RSS adapter, enrichment thresholds, and feed-specific fetch controls.",
            },
            { title: "Advanced", body: "Collapsed by default for the noisiest provider-specific controls." },
          ].map((item) => (
            <div key={item.title} className="min-w-[180px] flex-1 rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-foreground">{basicsTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{basicsDescription}</p>
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
              placeholder={placeholderName}
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

        {isEmailImap ? (
          <>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <FormField
                label="IMAP host"
                name="channel-imap-host"
                required
                helpText="Hostname of the mailbox server without spaces."
              >
                <Input
                  id="channel-imap-host"
                  name="host"
                  defaultValue={value.host ?? ""}
                  placeholder="imap.example.com"
                  className={inputClassName}
                />
              </FormField>

              <FormField
                label="Port"
                name="channel-imap-port"
                helpText="993 is the standard secure IMAP port."
              >
                <Input
                  id="channel-imap-port"
                  name="port"
                  type="number"
                  min={1}
                  defaultValue={String(value.port ?? 993)}
                  className={inputClassName}
                />
              </FormField>

              <FormField
                label="Transport security"
                name="channel-imap-secure"
                helpText="Use secure IMAP unless you have an explicit local-only reason not to."
              >
                <select
                  id="channel-imap-secure"
                  name="secure"
                  defaultValue={boolToString(value.secure ?? true)}
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="true">Secure (IMAPS)</option>
                  <option value="false">Plain IMAP</option>
                </select>
              </FormField>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <FormField
                label="Username"
                name="channel-imap-username"
                required
                helpText="Mailbox login username."
              >
                <Input
                  id="channel-imap-username"
                  name="username"
                  defaultValue={value.username ?? ""}
                  placeholder="alerts@example.com"
                  className={inputClassName}
                />
              </FormField>

              <FormField
                label="Password"
                name="channel-imap-password"
                required={mode === "create"}
                helpText={passwordHelpText}
                helpWide
              >
                <Input
                  id="channel-imap-password"
                  name="password"
                  type="password"
                  autoComplete="off"
                  defaultValue=""
                  placeholder={mode === "edit" ? "Leave blank to preserve" : "Mailbox password"}
                  className={inputClassName}
                />
              </FormField>
            </div>

            {mode === "edit" && (
              <div className="mt-4 rounded-xl border border-dashed border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                <p>
                  Current password status:{" "}
                  <span className="font-medium text-foreground">
                    {hasPassword ? "Configured" : "Not configured"}
                  </span>
                </p>
              </div>
            )}

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <FormField
                label="Mailbox"
                name="channel-imap-mailbox"
                helpText="Folder to open before scanning for new messages."
              >
                <Input
                  id="channel-imap-mailbox"
                  name="mailbox"
                  defaultValue={value.mailbox ?? "INBOX"}
                  placeholder="INBOX"
                  className={inputClassName}
                />
              </FormField>

              <FormField
                label="Sender filter"
                name="channel-imap-search-from"
                helpText="Optional exact sender address to keep only messages from one source."
                helpWide
              >
                <Input
                  id="channel-imap-search-from"
                  name="searchFrom"
                  defaultValue={value.searchFrom ?? ""}
                  placeholder="press@example.com"
                  className={inputClassName}
                />
              </FormField>
            </div>
          </>
        ) : (
          <div className="mt-4">
            <FormField
              label={urlLabel}
              name="channel-fetch-url"
              required
              helpText={urlHelpText}
              helpWide
            >
              <Input
                id="channel-fetch-url"
                name="fetchUrl"
                type="url"
                defaultValue={value.fetchUrl}
                placeholder={urlPlaceholder}
                className={inputClassName}
              />
            </FormField>
          </div>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <FormField
            label="Base poll interval (seconds)"
            name="channel-poll-interval"
            helpText={
              isWebsite
                ? "Lower values discover changes faster but increase crawl load. 900 seconds means every 15 minutes."
                : "Lower values fetch faster but create more load. 300 seconds means every 5 minutes."
            }
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
            helpText="Lets the system slow polling for quiet channels and speed back up when fresh content appears."
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

      {supportsAuthorizationHeader && (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-foreground">Source authorization</h2>
            <p className="mt-1 text-sm text-muted-foreground">{authorizationDescription}</p>
          </div>

          <div className="grid gap-4">
            <FormField
              label="Authorization header"
              name="channel-authorization-header"
              helpText={
                mode === "edit"
                  ? hasAuthorizationHeader
                    ? "A header is already configured. Leave this blank to preserve it, enter a new value to replace it, or clear it below."
                    : "No header is configured yet. Leave this blank to keep authorization disabled."
                  : "Optional raw Authorization header value, for example Bearer <token>."
              }
              helpWide
            >
              <Input
                id="channel-authorization-header"
                name="authorizationHeader"
                type="password"
                autoComplete="off"
                defaultValue=""
                placeholder="Bearer ..."
                className={inputClassName}
              />
            </FormField>

            {mode === "edit" && (
              <div className="rounded-xl border border-dashed border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                <p>
                  Current status:{" "}
                  <span className="font-medium text-foreground">
                    {hasAuthorizationHeader ? "Configured" : "Not configured"}
                  </span>
                </p>
                <label className="mt-3 flex items-start gap-2 text-foreground">
                  <input
                    type="checkbox"
                    name="clearAuthorizationHeader"
                    value="true"
                    className="mt-1 h-4 w-4 rounded border-input"
                  />
                  <span className="text-sm">
                    Clear the stored Authorization header for this channel.
                  </span>
                </label>
              </div>
            )}
          </div>
        </section>
      )}

      <details
        className="group rounded-2xl border border-border bg-card p-5 shadow-sm"
        open={mode === "edit" && !isRss}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <div>
            <p className="text-base font-semibold text-foreground">Advanced fetch settings</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isWebsite
                ? "Fine-tune discovery modes, crawl budgets, and URL constraints for this site."
                : isApi
                  ? "Fine-tune payload mapping, request budgets, and enrichment behavior for this API."
                  : isEmailImap
                    ? "Fine-tune mailbox polling limits and enrichment behavior."
                    : "Fine-tune runtime limits, feed parsing, and scheduling ceilings."}
            </p>
          </div>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition group-open:rotate-180">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </summary>

        {isWebsite ? (
          <>
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
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder={"/login\n/signup\n/cart"}
                />
              </FormField>
            </div>
          </>
        ) : isApi ? (
          <>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <FormField
                label="Maximum adaptive interval (seconds)"
                name="channel-max-poll-interval"
                helpText="Upper bound for adaptive backoff when the API stays quiet."
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
                helpText="Caps how many JSON items are processed from one polling pass."
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
                helpText="How long the fetcher waits before treating the endpoint as failed."
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
                label="Article enrichment"
                name="channel-enrichment-enabled"
                helpText="Enable extraction enrichment for short or sparse API article bodies from this channel."
                helpWide
              >
                <select
                  id="channel-enrichment-enabled"
                  name="enrichmentEnabled"
                  defaultValue={boolToString(value.enrichmentEnabled ?? true)}
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </FormField>

              <FormField
                label="Enrichment min body length"
                name="channel-enrichment-min-body-length"
                helpText="If the current article body is already at least this many characters, enrichment skips unless manually retried."
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
                helpText="Custom request identity sent to the upstream API."
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

            <div className="mt-6">
              <h3 className="text-sm font-semibold text-foreground">JSON field mapping</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Use dot paths when the response nests article data inside objects. The
                defaults match a top-level <code>items</code> array with common news
                property names.
              </p>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <FormField
                label="Items path"
                name="channel-items-path"
                helpText="Array path inside the JSON payload, for example items or data.records."
                helpWide
              >
                <Input
                  id="channel-items-path"
                  name="itemsPath"
                  defaultValue={value.itemsPath ?? "items"}
                  className={inputClassName}
                />
              </FormField>

              <FormField label="Title field" name="channel-title-field" helpText="Property that contains the article headline.">
                <Input
                  id="channel-title-field"
                  name="titleField"
                  defaultValue={value.titleField ?? "title"}
                  className={inputClassName}
                />
              </FormField>

              <FormField label="Lead field" name="channel-lead-field" helpText="Property that contains the summary or lead text.">
                <Input
                  id="channel-lead-field"
                  name="leadField"
                  defaultValue={value.leadField ?? "lead"}
                  className={inputClassName}
                />
              </FormField>

              <FormField label="Body field" name="channel-body-field" helpText="Property that contains the full or long-form article body.">
                <Input
                  id="channel-body-field"
                  name="bodyField"
                  defaultValue={value.bodyField ?? "body"}
                  className={inputClassName}
                />
              </FormField>

              <FormField label="URL field" name="channel-url-field" helpText="Property that contains the canonical article URL.">
                <Input
                  id="channel-url-field"
                  name="urlField"
                  defaultValue={value.urlField ?? "url"}
                  className={inputClassName}
                />
              </FormField>

              <FormField label="Published-at field" name="channel-published-at-field" helpText="Property that contains the published timestamp.">
                <Input
                  id="channel-published-at-field"
                  name="publishedAtField"
                  defaultValue={value.publishedAtField ?? "publishedAt"}
                  className={inputClassName}
                />
              </FormField>

              <FormField label="External ID field" name="channel-external-id-field" helpText="Property used as the stable per-item source identifier.">
                <Input
                  id="channel-external-id-field"
                  name="externalIdField"
                  defaultValue={value.externalIdField ?? "id"}
                  className={inputClassName}
                />
              </FormField>

              <FormField label="Language field" name="channel-language-field" helpText="Property that contains the item language code.">
                <Input
                  id="channel-language-field"
                  name="languageField"
                  defaultValue={value.languageField ?? "language"}
                  className={inputClassName}
                />
              </FormField>
            </div>
          </>
        ) : isEmailImap ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <FormField
              label="Maximum adaptive interval (seconds)"
              name="channel-max-poll-interval"
              helpText="Upper bound for adaptive backoff when the mailbox stays quiet."
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
              label="Max messages per poll"
              name="channel-max-items"
              helpText="Caps how many new IMAP messages are processed from one polling pass."
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
              label="Article enrichment"
              name="channel-enrichment-enabled"
              helpText="Enable enrichment when message bodies arrive too short or too sparse for downstream use."
              helpWide
            >
              <select
                id="channel-enrichment-enabled"
                name="enrichmentEnabled"
                defaultValue={boolToString(value.enrichmentEnabled ?? true)}
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </FormField>

            <FormField
              label="Enrichment min body length"
              name="channel-enrichment-min-body-length"
              helpText="If the current message body is already at least this many characters, enrichment skips unless manually retried."
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
          </div>
        ) : (
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
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                label="Article enrichment"
                name="channel-enrichment-enabled"
                helpText="Enable pre-normalize article extraction for short RSS bodies from this channel."
                helpWide
              >
                <select
                  id="channel-enrichment-enabled"
                  name="enrichmentEnabled"
                  defaultValue={boolToString(value.enrichmentEnabled ?? true)}
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                helpText="If the current article body is already at least this many characters, enrichment skips unless manually retried."
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
        )}
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
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
