import {
  formatAdminChannelProviderLabel,
  type AdminChannelProviderType,
} from "../lib/channel-providers";

export type ChannelProviderType = AdminChannelProviderType;
export type ApiFieldPathValue = string | string[];

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
  adapterKey?: string | null;
  ingressAdapterKey?: string | null;
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
  titleField?: ApiFieldPathValue;
  leadField?: ApiFieldPathValue;
  bodyField?: ApiFieldPathValue;
  urlField?: ApiFieldPathValue;
  publishedAtField?: ApiFieldPathValue;
  externalIdField?: ApiFieldPathValue;
  languageField?: ApiFieldPathValue;
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  mailbox?: string;
  searchFrom?: string | null;
  hasPassword?: boolean;
}

export interface ChannelEditorViewModel {
  isRss: boolean;
  isWebsite: boolean;
  isApi: boolean;
  isEmailImap: boolean;
  supportsAuthorizationHeader: boolean;
  basicsTitle: string;
  basicsDescription: string;
  placeholderName: string;
  urlLabel: string;
  urlHelpText: string;
  urlPlaceholder: string;
  submitLabel: string;
  authorizationDescription: string;
  hasAuthorizationHeader: boolean;
  selectedAdapterStrategy: string;
  resolvedAdapterStrategy: string;
  resolvedMaxEntryAgeHours: number | null;
  hasPassword: boolean;
  passwordHelpText: string;
}

export const channelEditorInputClassName = "h-10 text-sm";
export const channelEditorSelectClassName =
  "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring";
export const channelEditorTextareaClassName =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function boolToString(value: boolean): string {
  return value ? "true" : "false";
}

export function buildChannelEditorViewModel(
  value: ChannelEditorFormValue,
  mode: "create" | "edit",
): ChannelEditorViewModel {
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

  return {
    isRss,
    isWebsite,
    isApi,
    isEmailImap,
    supportsAuthorizationHeader,
    basicsTitle,
    basicsDescription,
    placeholderName,
    urlLabel,
    urlHelpText,
    urlPlaceholder,
    submitLabel,
    authorizationDescription,
    hasAuthorizationHeader,
    selectedAdapterStrategy,
    resolvedAdapterStrategy,
    resolvedMaxEntryAgeHours,
    hasPassword,
    passwordHelpText,
  };
}
