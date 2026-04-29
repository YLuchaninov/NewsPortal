import { FormField } from "@newsportal/ui";

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
