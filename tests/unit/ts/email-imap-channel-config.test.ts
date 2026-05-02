import assert from "node:assert/strict";
import test from "node:test";

import { parseEmailImapChannelConfig } from "../../../packages/contracts/src/source.ts";

test("parseEmailImapChannelConfig applies bounded IMAP hardening defaults", () => {
  assert.deepEqual(parseEmailImapChannelConfig({}), {
    host: "",
    port: 993,
    secure: true,
    username: "",
    password: "",
    mailbox: "INBOX",
    searchFrom: null,
    searchSinceHours: 720,
    maxMessageBytes: 524288,
    bodyPreference: "text",
    maxItemsPerPoll: 20,
  });
});

test("parseEmailImapChannelConfig accepts IMAP window, size, and body options", () => {
  assert.deepEqual(
    parseEmailImapChannelConfig({
      host: "imap.example.com",
      port: 143,
      secure: false,
      username: "alerts@example.com",
      password: "secret",
      mailbox: "PRESS",
      searchFrom: "press@example.com",
      searchSinceHours: 24,
      maxMessageBytes: 20 * 1024 * 1024,
      bodyPreference: "html",
      maxItemsPerPoll: 5,
    }),
    {
      host: "imap.example.com",
      port: 143,
      secure: false,
      username: "alerts@example.com",
      password: "secret",
      mailbox: "PRESS",
      searchFrom: "press@example.com",
      searchSinceHours: 24,
      maxMessageBytes: 5 * 1024 * 1024,
      bodyPreference: "html",
      maxItemsPerPoll: 5,
    },
  );
});

test("parseEmailImapChannelConfig rejects invalid IMAP body preference", () => {
  assert.throws(
    () => parseEmailImapChannelConfig({ bodyPreference: "rich" }),
    /bodyPreference" must be text or html/,
  );
});
