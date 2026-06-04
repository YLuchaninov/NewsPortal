import assert from "node:assert/strict";
import test from "node:test";

import { pollEmailImapProviderChannel } from "../../../services/fetchers/src/fetcher-email-imap-poller.ts";
import type {
  ChannelPollCompletion,
  PersistSignalCandidateInput,
  SourceChannelRow,
} from "../../../services/fetchers/src/fetcher-persistence.ts";

function buildChannel(configJson: unknown): SourceChannelRow {
  return {
    channelId: "22222222-2222-4222-8222-222222222222",
    providerType: "email_imap",
    name: "Mailbox channel",
    fetchUrl: "imaps://imap.example.com:993/INBOX",
    configJson,
    authConfigJson: null,
    language: "en",
    pollIntervalSeconds: 300,
    lastFetchAt: null,
    adaptiveEnabled: true,
    effectivePollIntervalSeconds: 300,
    maxPollIntervalSeconds: 3600,
    nextDueAt: null,
    adaptiveStep: 0,
    lastResultKind: null,
    consecutiveNoChangePolls: 0,
    consecutiveFailures: 0,
    adaptiveReason: null,
  };
}

async function* iterableMessages(messages: unknown[]) {
  for (const message of messages) {
    yield message;
  }
}

test("pollEmailImapProviderChannel resets UID cursor on UIDVALIDITY change and dedupes by Message-ID", async () => {
  const fetchCalls: Array<{
    range: string | Record<string, unknown>;
    query: Record<string, unknown>;
    options?: Record<string, unknown>;
  }> = [];
  const rawMultipart = [
    "Content-Type: multipart/mixed; boundary=\"np-boundary\"",
    "",
    "--np-boundary",
    "Content-Type: text/plain",
    "",
    "Plain body with https://example.com/plain",
    "--np-boundary",
    "Content-Type: text/html",
    "",
    "<p>HTML body <a href=\"https://example.com/html\">link</a></p><script>alert(1)</script>",
    "--np-boundary",
    "Content-Type: application/pdf; name=\"brief.pdf\"",
    "Content-Disposition: attachment; filename=\"brief.pdf\"",
    "",
    "JVBERi0x",
    "--np-boundary--",
    "",
  ].join("\r\n");
  const fakeClient = {
    async connect() {},
    async mailboxOpen(mailbox: string, options?: { readOnly?: boolean }) {
      assert.equal(mailbox, "INBOX");
      assert.equal(options?.readOnly, true);
      return { uidValidity: 12345n };
    },
    fetch(
      range: string | Record<string, unknown>,
      query: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) {
      fetchCalls.push({ range, query, options });
      return iterableMessages([
        {
          uid: 10,
          size: 512,
          envelope: {
            subject: "First mailbox story",
            messageId: "<Story-1@Example.COM>",
            from: [{ address: "press@example.com" }],
          },
          internalDate: "2026-05-01T08:00:00.000Z",
          source: Buffer.from(rawMultipart),
        },
        {
          uid: 11,
          size: 999999,
          envelope: {
            subject: "Huge skipped story",
            messageId: "<huge@example.com>",
            from: [{ address: "press@example.com" }],
          },
          internalDate: "2026-05-01T08:05:00.000Z",
          source: Buffer.from("oversized"),
        },
      ]);
    },
    async logout() {},
  };
  const persisted: PersistSignalCandidateInput[][] = [];
  let completion: ChannelPollCompletion | null = null;

  await pollEmailImapProviderChannel(
    buildChannel({
      host: "imap.example.com",
      username: "alerts@example.com",
      password: "secret",
      mailbox: "INBOX",
      searchFrom: "press@example.com",
      searchSinceHours: 24,
      maxMessageBytes: 2048,
      bodyPreference: "html",
      maxItemsPerPoll: 10,
    }),
    "2026-05-01T09:00:00.000Z",
    {
      loadCursorMap: async () => ({
        imap_uid: {
          cursorType: "imap_uid",
          cursorValue: "50",
          cursorJson: { uidValidity: "99999" },
        },
      }),
      persistInputsWithPreflight: async (_channelId, inputs) => {
        persisted.push([...inputs]);
        return { ingestedCount: inputs.length, duplicateCount: 0 };
      },
      markChannelSuccess: async (_channel, result) => {
        completion = result;
      },
      createClient: () => fakeClient,
    },
  );

  assert.equal(fetchCalls.length, 1);
  assert.deepEqual(fetchCalls[0]?.range, {
    all: true,
    since: new Date("2026-04-30T09:00:00.000Z"),
    from: "press@example.com",
  });
  assert.deepEqual(fetchCalls[0]?.query.source, { maxLength: 2048 });
  assert.equal(fetchCalls[0]?.options?.uid, true);
  assert.equal(persisted[0]?.length, 1);
  assert.equal(persisted[0]?.[0]?.externalSignalCandidateId, "message-id:story-1@example.com");
  assert.equal(persisted[0]?.[0]?.url, "imap://imap.example.com/INBOX/12345/10");
  assert.match(persisted[0]?.[0]?.body ?? "", /HTML body link/);
  assert.doesNotMatch(persisted[0]?.[0]?.body ?? "", /alert/);
  assert.deepEqual(persisted[0]?.[0]?.rawPayload.email, {
    uid: 10,
    uidValidity: "12345",
    messageId: "story-1@example.com",
    subject: "First mailbox story",
    fromAddress: "press@example.com",
    size: 512,
    links: ["https://example.com/html", "https://example.com/plain"],
    attachments: [
      {
        filename: "brief.pdf",
        contentType: "application/pdf",
        disposition: "attachment",
      },
    ],
  });
  assert.equal(completion?.fetchedItemCount, 1);
  assert.equal(completion?.cursorChanged, true);
  assert.deepEqual(completion?.cursorUpdates, [
    {
      cursorType: "imap_uid",
      cursorValue: "11",
      cursorJson: {
        mailbox: "INBOX",
        uidValidity: "12345",
        searchSinceHours: 24,
        maxMessageBytes: 2048,
      },
    },
  ]);
  assert.deepEqual(completion?.providerMetricsJson, {
    provider: "email_imap",
    uidValidity: "12345",
    uidValidityChanged: true,
    scannedCount: 2,
    selectedCount: 1,
    skippedOversizedCount: 1,
    skippedSenderCount: 0,
    malformedMessageCount: 0,
  });
});

test("pollEmailImapProviderChannel fetches by UID range when UIDVALIDITY is stable", async () => {
  const fetchRanges: Array<string | Record<string, unknown>> = [];
  const fakeClient = {
    async connect() {},
    async mailboxOpen() {
      return { uidValidity: "12345" };
    },
    fetch(range: string | Record<string, unknown>) {
      fetchRanges.push(range);
      return iterableMessages([]);
    },
    async logout() {},
  };
  let completion: ChannelPollCompletion | null = null;

  await pollEmailImapProviderChannel(
    buildChannel({
      host: "imap.example.com",
      username: "alerts@example.com",
      password: "secret",
      mailbox: "INBOX",
      searchSinceHours: 24,
    }),
    "2026-05-01T09:00:00.000Z",
    {
      loadCursorMap: async () => ({
        imap_uid: {
          cursorType: "imap_uid",
          cursorValue: "50",
          cursorJson: { uidValidity: "12345" },
        },
      }),
      persistInputsWithPreflight: async () => ({ ingestedCount: 0, duplicateCount: 0 }),
      markChannelSuccess: async (_channel, result) => {
        completion = result;
      },
      createClient: () => fakeClient,
    },
  );

  assert.deepEqual(fetchRanges, [
    {
      uid: "51:*",
      since: new Date("2026-04-30T09:00:00.000Z"),
    },
  ]);
  assert.equal(completion?.cursorChanged, false);
});
