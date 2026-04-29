import { FormField, Input } from "@newsportal/ui";

import {
  boolToString,
  buildChannelEditorViewModel,
  channelEditorInputClassName,
  channelEditorSelectClassName,
  channelEditorTextareaClassName,
  type ChannelEditorFormValue,
  type ChannelProviderType,
} from "./channel-editor-form-model";
import { ChannelEditorApiMappingFields } from "./channel-editor-api-mapping-fields";
import { ChannelEditorApiRequestFields } from "./channel-editor-api-request-fields";
import {
  ChannelEditorEmailImapAdvancedFields,
  ChannelEditorEmailImapFields,
} from "./channel-editor-email-imap-fields";
import {
  ChannelEditorActions,
  ChannelEditorOverview,
  ChannelEditorSection,
} from "./channel-editor-form-parts";
import { ChannelEditorRssFields } from "./channel-editor-rss-fields";
import { ChannelEditorWebsiteDiscoveryFields } from "./channel-editor-website-discovery-fields";

export type { ChannelEditorFormValue, ChannelProviderType };

interface ChannelEditorFormProps {
  action: string;
  mode: "create" | "edit";
  redirectTo: string;
  cancelHref: string;
  value: ChannelEditorFormValue;
}

export function ChannelEditorForm({
  action,
  mode,
  redirectTo,
  cancelHref,
  value,
}: ChannelEditorFormProps) {
  const {
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
  } = buildChannelEditorViewModel(value, mode);
  const inputClassName = channelEditorInputClassName;
  const selectClassName = channelEditorSelectClassName;
  const textareaClassName = channelEditorTextareaClassName;

  return (
    <form method="post" action={action} className="space-y-6">
      <input type="hidden" name="intent" value="save" />
      <input type="hidden" name="providerType" value={value.providerType} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      {value.channelId && <input type="hidden" name="channelId" value={value.channelId} />}

      <ChannelEditorOverview
        items={[
          { title: "Basics", body: "Identity, source URL, schedule, and active state." },
          {
            title: "Auth",
            body: supportsAuthorizationHeader
              ? "Stored Authorization header when this source needs it."
              : "Credentials live in the mailbox section below.",
          },
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
          {
            title: "Advanced",
            body: "Collapsed by default for the noisiest provider-specific controls.",
          },
        ]}
      />

      <ChannelEditorSection title={basicsTitle} description={basicsDescription}>
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
          <ChannelEditorEmailImapFields
            value={value}
            mode={mode}
            inputClassName={inputClassName}
            selectClassName={selectClassName}
            hasPassword={hasPassword}
            passwordHelpText={passwordHelpText}
          />
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
              className={selectClassName}
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
              className={selectClassName}
            >
              <option value="true">Enabled</option>
              <option value="false">Fixed interval only</option>
            </select>
          </FormField>
        </div>
      </ChannelEditorSection>

      {supportsAuthorizationHeader && (
        <ChannelEditorSection
          title="Source authorization"
          description={authorizationDescription}
        >
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
        </ChannelEditorSection>
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

            <ChannelEditorWebsiteDiscoveryFields
              value={value}
              selectClassName={selectClassName}
              textareaClassName={textareaClassName}
            />
          </>
        ) : isApi ? (
          <>
            <ChannelEditorApiRequestFields
              value={value}
              inputClassName={inputClassName}
              selectClassName={selectClassName}
            />

            <ChannelEditorApiMappingFields
              value={value}
              inputClassName={inputClassName}
            />
          </>
        ) : isEmailImap ? (
          <ChannelEditorEmailImapAdvancedFields
            value={value}
            inputClassName={inputClassName}
            selectClassName={selectClassName}
          />
        ) : (
          <ChannelEditorRssFields
            value={value}
            inputClassName={inputClassName}
            selectClassName={selectClassName}
            selectedAdapterStrategy={selectedAdapterStrategy}
            resolvedAdapterStrategy={resolvedAdapterStrategy}
            resolvedMaxEntryAgeHours={resolvedMaxEntryAgeHours}
          />
        )}
      </details>

      <ChannelEditorActions cancelHref={cancelHref} submitLabel={submitLabel} />
    </form>
  );
}
