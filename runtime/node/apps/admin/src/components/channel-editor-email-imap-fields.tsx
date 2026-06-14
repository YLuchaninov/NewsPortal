import { FormField, Input } from "@signalops/ui";

import {
  boolToString,
  type ChannelEditorFormValue,
} from "./channel-editor-form-model";

interface ChannelEditorEmailImapFieldsProps {
  value: ChannelEditorFormValue;
  mode: "create" | "edit";
  inputClassName: string;
  selectClassName: string;
  hasPassword: boolean;
  passwordHelpText: string;
}

export function ChannelEditorEmailImapFields({
  value,
  mode,
  inputClassName,
  selectClassName,
  hasPassword,
  passwordHelpText,
}: ChannelEditorEmailImapFieldsProps) {
  return (
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
            className={selectClassName}
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
  );
}

interface ChannelEditorEmailImapAdvancedFieldsProps {
  value: ChannelEditorFormValue;
  inputClassName: string;
  selectClassName: string;
}

export function ChannelEditorEmailImapAdvancedFields({
  value,
  inputClassName,
  selectClassName,
}: ChannelEditorEmailImapAdvancedFieldsProps) {
  return (
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
        label="SignalCandidate enrichment"
        name="channel-enrichment-enabled"
        helpText="Enable enrichment when message bodies arrive too short or too sparse for downstream use."
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
  );
}
