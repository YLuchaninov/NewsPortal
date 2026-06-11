import { DEFAULT_EMAIL_IMAP_CHANNEL_CONFIG } from "./model";
import type { EmailImapChannelConfig } from "./model";
import {
  asRecord,
  readBoolean,
  readNullablePositiveInteger,
  readOptionalString,
  readPositiveInteger,
  readString,
} from "./shared";

function readEmailImapBodyPreference(value: unknown): EmailImapChannelConfig["bodyPreference"] {
  if (value == null) {
    return DEFAULT_EMAIL_IMAP_CHANNEL_CONFIG.bodyPreference;
  }
  if (typeof value !== "string") {
    throw new Error('Source channel config field "bodyPreference" must be a string.');
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "text" || normalized === "html") {
    return normalized;
  }
  throw new Error('Source channel config field "bodyPreference" must be text or html.');
}

export function parseEmailImapChannelConfig(config: unknown): EmailImapChannelConfig {
  const candidate = asRecord(config);

  return {
    host: readString(candidate.host, DEFAULT_EMAIL_IMAP_CHANNEL_CONFIG.host, "host"),
    port: readPositiveInteger(candidate.port, DEFAULT_EMAIL_IMAP_CHANNEL_CONFIG.port, "port"),
    secure: readBoolean(candidate.secure, DEFAULT_EMAIL_IMAP_CHANNEL_CONFIG.secure, "secure"),
    username: readString(
      candidate.username,
      DEFAULT_EMAIL_IMAP_CHANNEL_CONFIG.username,
      "username"
    ),
    password: readString(
      candidate.password,
      DEFAULT_EMAIL_IMAP_CHANNEL_CONFIG.password,
      "password"
    ),
    mailbox: readString(
      candidate.mailbox,
      DEFAULT_EMAIL_IMAP_CHANNEL_CONFIG.mailbox,
      "mailbox"
    ),
    searchFrom: readOptionalString(
      candidate.searchFrom,
      DEFAULT_EMAIL_IMAP_CHANNEL_CONFIG.searchFrom ?? null,
      "searchFrom"
    ),
    searchSinceHours: readNullablePositiveInteger(
      candidate.searchSinceHours,
      DEFAULT_EMAIL_IMAP_CHANNEL_CONFIG.searchSinceHours,
      "searchSinceHours"
    ),
    maxMessageBytes: Math.min(
      5 * 1024 * 1024,
      readPositiveInteger(
        candidate.maxMessageBytes,
        DEFAULT_EMAIL_IMAP_CHANNEL_CONFIG.maxMessageBytes,
        "maxMessageBytes"
      )
    ),
    bodyPreference: readEmailImapBodyPreference(candidate.bodyPreference),
    maxItemsPerPoll: readPositiveInteger(
      candidate.maxItemsPerPoll,
      DEFAULT_EMAIL_IMAP_CHANNEL_CONFIG.maxItemsPerPoll,
      "maxItemsPerPoll"
    )
  };
}
