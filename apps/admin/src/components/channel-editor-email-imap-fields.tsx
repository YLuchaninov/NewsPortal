import { FormField, Input } from "@newsportal/ui";

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
