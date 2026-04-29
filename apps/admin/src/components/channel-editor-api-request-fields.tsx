import { FormField, Input } from "@newsportal/ui";

import {
  boolToString,
  type ChannelEditorFormValue,
} from "./channel-editor-form-model";

interface ChannelEditorApiRequestFieldsProps {
  value: ChannelEditorFormValue;
  inputClassName: string;
  selectClassName: string;
}

export function ChannelEditorApiRequestFields({
  value,
  inputClassName,
  selectClassName,
}: ChannelEditorApiRequestFieldsProps) {
  return (
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
          className={selectClassName}
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
  );
}
