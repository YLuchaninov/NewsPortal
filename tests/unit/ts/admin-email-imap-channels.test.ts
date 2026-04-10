import assert from "node:assert/strict";
import test from "node:test";

import {
  parseEmailImapAdminChannelInput,
  upsertEmailImapChannels,
} from "../../../apps/admin/src/lib/server/email-imap-channels.ts";

test("parseEmailImapAdminChannelInput normalizes mailbox admin payload fields", () => {
  const channel = parseEmailImapAdminChannelInput({
    name: "Press inbox",
    language: "en",
    isActive: "false",
    pollIntervalSeconds: "900",
    adaptiveEnabled: "false",
    maxPollIntervalSeconds: "7200",
    host: "imap.example.com",
    port: "993",
    secure: "true",
    username: "alerts@example.com",
    password: "MailboxSecret!",
    mailbox: "PRESS",
    searchFrom: "press@example.com",
    maxItemsPerPoll: "12",
    enrichmentEnabled: "false",
    enrichmentMinBodyLength: "800",
  });

  assert.deepEqual(channel, {
    channelId: undefined,
    providerType: "email_imap",
    name: "Press inbox",
    language: "en",
    isActive: false,
    pollIntervalSeconds: 900,
    adaptiveEnabled: false,
    maxPollIntervalSeconds: 7200,
    host: "imap.example.com",
    port: 993,
    secure: true,
    username: "alerts@example.com",
    passwordUpdate: {
      mode: "replace",
      password: "MailboxSecret!",
    },
    mailbox: "PRESS",
    searchFrom: "press@example.com",
    maxItemsPerPoll: 12,
    enrichmentEnabled: false,
    enrichmentMinBodyLength: 800,
  });
});

test("parseEmailImapAdminChannelInput preserves stored password on edit when blank", () => {
  const channel = parseEmailImapAdminChannelInput({
    channelId: "channel-123",
    name: "Press inbox",
    host: "imap.example.com",
    username: "alerts@example.com",
    mailbox: "INBOX",
  });

  assert.deepEqual(channel.passwordUpdate, {
    mode: "preserve",
    password: null,
  });
});

test("parseEmailImapAdminChannelInput rejects non-mailbox providers and missing create password", () => {
  assert.throws(
    () =>
      parseEmailImapAdminChannelInput({
        providerType: "api",
        name: "Wrong provider",
        host: "imap.example.com",
        username: "alerts@example.com",
        password: "MailboxSecret!",
      }),
    /Only email IMAP channels are supported/
  );

  assert.throws(
    () =>
      parseEmailImapAdminChannelInput({
        name: "Missing password",
        host: "imap.example.com",
        username: "alerts@example.com",
      }),
    /password" is required/
  );

  assert.throws(
    () =>
      parseEmailImapAdminChannelInput({
        name: "Broken host",
        host: "imap example.com",
        username: "alerts@example.com",
        password: "MailboxSecret!",
      }),
    /must not contain whitespace/
  );
});

test("upsertEmailImapChannels preserves stored password and rewrites derived fetch_url on update", async () => {
  const clientQueries: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const fakeClient = {
    async query(sql: string, params?: unknown[]) {
      clientQueries.push({ sql, params });
      if (sql.includes("select config_json")) {
        return {
          rowCount: 1,
          rows: [
            {
              config_json: {
                host: "imap.example.com",
                port: 993,
                secure: true,
                username: "alerts@example.com",
                password: "PersistedSecret!",
                mailbox: "INBOX",
                searchFrom: "press@example.com",
                maxItemsPerPoll: 12,
              },
            },
          ],
        };
      }
      if (sql.includes("update source_channels")) {
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };
  const fakePool = {
    async query(sql: string) {
      if (sql.includes("from source_providers")) {
        return { rows: [{ provider_id: "provider-1" }] };
      }
      throw new Error(`Unexpected pool query: ${sql}`);
    },
    async connect() {
      return fakeClient;
    },
  };

  const preserveInput = parseEmailImapAdminChannelInput({
    channelId: "channel-123",
    name: "Press inbox",
    host: "imap.example.com",
    port: "993",
    secure: "true",
    username: "alerts@example.com",
    mailbox: "PRESS",
    searchFrom: "alerts@example.com",
  });
  await upsertEmailImapChannels(fakePool as never, [preserveInput]);

  const updateQuery = clientQueries.find(({ sql }) => sql.includes("update source_channels"));
  assert.ok(updateQuery, "Expected update flow to issue an Email IMAP channel update.");
  assert.equal(updateQuery.params?.[3], "imaps://imap.example.com:993/PRESS");
  assert.deepEqual(
    updateQuery.params?.[7],
    JSON.stringify({
      host: "imap.example.com",
      port: 993,
      secure: true,
      username: "alerts@example.com",
      password: "PersistedSecret!",
      mailbox: "PRESS",
      searchFrom: "alerts@example.com",
      maxItemsPerPoll: 20,
    })
  );
});
