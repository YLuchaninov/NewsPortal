import { Buffer } from "node:buffer";

import { parseEmailImapChannelConfig } from "@newsportal/contracts";
import { ImapFlow } from "imapflow";

import {
  ChannelFetchError,
  classifyUnexpectedFailure,
  extractEmailMessageContent,
  normalizeWhitespace,
} from "./fetcher-channel-helpers";
import type {
  ChannelPollCompletion,
  CursorMap,
  PersistArticleInput,
  SourceChannelRow
} from "./fetcher-persistence";

interface EmailImapChannelPollerDependencies {
  loadCursorMap: (channelId: string) => Promise<CursorMap>;
  persistInputsWithPreflight: (
    channelId: string,
    inputs: readonly PersistArticleInput[]
  ) => Promise<{ ingestedCount: number; duplicateCount: number }>;
  markChannelSuccess: (
    channel: SourceChannelRow,
    completion: ChannelPollCompletion
  ) => Promise<void>;
  createClient?: (options: ConstructorParameters<typeof ImapFlow>[0]) => EmailImapClient;
}

interface EmailImapClient {
  connect: () => Promise<void>;
  mailboxOpen: (
    mailbox: string,
    options?: { readOnly?: boolean }
  ) => Promise<{ uidValidity?: bigint | number | string }>;
  fetch: (
    range: string | Record<string, unknown>,
    query: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => AsyncIterable<EmailImapFetchedMessage>;
  logout: () => Promise<void>;
}

interface EmailImapFetchedMessage {
  uid?: number;
  envelope?: {
    subject?: string;
    messageId?: string;
    from?: Array<{ address?: string | null }>;
  };
  internalDate?: Date | string | null;
  size?: number;
  source?: Buffer | string | null;
}

function normalizeMessageId(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/^<|>$/g, "").toLowerCase() ?? "";
  return normalized ? normalized : null;
}

function normalizeMailboxUidValidity(value: bigint | number | string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  return String(value);
}

function readCursorUidValidity(cursors: CursorMap): string | null {
  const value = cursors.imap_uid?.cursorJson?.uidValidity;
  if (value == null) {
    return null;
  }
  return String(value);
}

function buildSinceDate(searchSinceHours: number | null, fetchedAt: string): Date | null {
  if (searchSinceHours == null) {
    return null;
  }
  return new Date(new Date(fetchedAt).getTime() - searchSinceHours * 60 * 60 * 1000);
}

function buildImapFetchRange(
  lastUid: number,
  searchSinceHours: number | null,
  searchFrom: string | null | undefined,
  fetchedAt: string
): string | Record<string, unknown> {
  const since = buildSinceDate(searchSinceHours, fetchedAt);
  const query: Record<string, unknown> = lastUid > 0 ? { uid: `${lastUid + 1}:*` } : { all: true };
  if (since) {
    query.since = since;
  }
  if (searchFrom) {
    query.from = searchFrom;
  }
  return Object.keys(query).length === 1 && query.all === true ? "1:*" : query;
}

function buildEmailExternalArticleId(
  messageId: string | null,
  uidValidity: string | null,
  uid: number
): string {
  if (messageId) {
    return `message-id:${messageId}`;
  }
  return `imap:${uidValidity ?? "unknown"}:${uid}`;
}

function buildEmailItemUrl(host: string, mailbox: string, uidValidity: string | null, uid: number): string {
  const mailboxPath = encodeURIComponent(mailbox);
  const uidValidityPath = encodeURIComponent(uidValidity ?? "unknown");
  return `imap://${host}/${mailboxPath}/${uidValidityPath}/${uid}`;
}

export async function pollEmailImapProviderChannel(
  channel: SourceChannelRow,
  startedAt: string,
  dependencies: EmailImapChannelPollerDependencies
): Promise<void> {
  const imapConfig = parseEmailImapChannelConfig(channel.configJson);
  if (!imapConfig.host || !imapConfig.username || !imapConfig.password) {
    throw new ChannelFetchError(`IMAP channel ${channel.channelId} is missing host/username/password.`, {
      outcome: "hard_failure",
      httpStatus: null,
      retryAfterSeconds: null,
      fetchedItemCount: 0,
      newArticleCount: 0,
      duplicateSuppressedCount: 0,
      cursorChanged: false,
      errorMessage: `IMAP channel ${channel.channelId} is missing host/username/password.`
    });
  }

  const cursors = await dependencies.loadCursorMap(channel.channelId);
  const previousLastUid = Number(cursors.imap_uid?.cursorValue ?? "0");
  const clientFactory = dependencies.createClient ?? ((options) => new ImapFlow(options) as EmailImapClient);
  const client = clientFactory({
    host: imapConfig.host,
    port: imapConfig.port,
    secure: imapConfig.secure,
    auth: {
      user: imapConfig.username,
      pass: imapConfig.password
    }
  });
  const fetchedAt = new Date().toISOString();
  let effectiveLastUid = Number.isFinite(previousLastUid) && previousLastUid > 0 ? previousLastUid : 0;
  let maxUid = effectiveLastUid;
  let uidValidity: string | null = null;
  let uidValidityChanged: boolean;
  let scannedCount = 0;
  let skippedOversizedCount = 0;
  let skippedSenderCount = 0;
  let malformedMessageCount = 0;

  try {
    await client.connect();
    const mailbox = await client.mailboxOpen(imapConfig.mailbox, { readOnly: true });
    uidValidity = normalizeMailboxUidValidity(mailbox.uidValidity);
    const previousUidValidity = readCursorUidValidity(cursors);
    uidValidityChanged = Boolean(previousUidValidity && uidValidity && previousUidValidity !== uidValidity);
    if (uidValidityChanged) {
      effectiveLastUid = 0;
      maxUid = 0;
    }

    const messages: Array<{
      uid: number;
      messageId: string | null;
      subject: string;
      fromAddress: string | null;
      publishedAt: string;
      body: string;
      links: string[];
      attachments: Array<{
        filename: string | null;
        contentType: string | null;
        disposition: string | null;
      }>;
      size: number | null;
    }> = [];

    const fetchRange = buildImapFetchRange(
      effectiveLastUid,
      imapConfig.searchSinceHours,
      imapConfig.searchFrom,
      startedAt
    );

    for await (const message of client.fetch(fetchRange, {
      uid: true,
      envelope: true,
      internalDate: true,
      size: true,
      source: { maxLength: imapConfig.maxMessageBytes }
    }, { uid: true })) {
      if (typeof message.uid !== "number" || message.uid <= effectiveLastUid) {
        malformedMessageCount += typeof message.uid === "number" ? 0 : 1;
        continue;
      }
      scannedCount += 1;
      maxUid = Math.max(maxUid, message.uid);
      const envelope = message.envelope;
      const fromAddress = envelope?.from?.[0]?.address ?? null;
      if (
        imapConfig.searchFrom &&
        fromAddress &&
        fromAddress.toLowerCase() !== imapConfig.searchFrom.toLowerCase()
      ) {
        skippedSenderCount += 1;
        continue;
      }
      const messageSize = typeof message.size === "number" ? message.size : null;
      if (messageSize != null && messageSize > imapConfig.maxMessageBytes) {
        skippedOversizedCount += 1;
        continue;
      }
      const sourceText = Buffer.from(message.source ?? "").toString("utf-8");
      const content = extractEmailMessageContent(sourceText, {
        bodyPreference: imapConfig.bodyPreference
      });
      const messageId = normalizeMessageId(envelope?.messageId);
      messages.push({
        uid: message.uid,
        messageId,
        subject: normalizeWhitespace(envelope?.subject ?? "Untitled email feed item"),
        fromAddress,
        publishedAt:
          message.internalDate != null
            ? new Date(message.internalDate).toISOString()
            : fetchedAt,
        body: content.body,
        links: content.links,
        attachments: content.attachments,
        size: messageSize
      });
    }

    const selectedMessages = messages
      .sort((left, right) => right.uid - left.uid)
      .slice(0, imapConfig.maxItemsPerPoll)
      .reverse();

    const inputs = selectedMessages
      .map((message): PersistArticleInput => ({
        channel,
        externalArticleId: buildEmailExternalArticleId(message.messageId, uidValidity, message.uid),
        url: buildEmailItemUrl(imapConfig.host, imapConfig.mailbox, uidValidity, message.uid),
        publishedAt: message.publishedAt,
        title: message.subject,
        lead: message.body.slice(0, 280),
        body: message.body,
        lang: channel.language,
        confidence: channel.language ? 0.8 : null,
        rawPayload: {
          fetcher: "email_imap",
          fetchedAt,
          email: {
            uid: message.uid,
            uidValidity,
            messageId: message.messageId,
            subject: message.subject,
            fromAddress: message.fromAddress,
            size: message.size,
            links: message.links,
            attachments: message.attachments
          }
        }
      }));

    const { ingestedCount, duplicateCount } = await dependencies.persistInputsWithPreflight(
      channel.channelId,
      inputs
    );

    await dependencies.markChannelSuccess(channel, {
      startedAt,
      finishedAt: fetchedAt,
      outcome: ingestedCount > 0 ? "new_content" : "no_change",
      httpStatus: null,
      retryAfterSeconds: null,
      fetchedItemCount: selectedMessages.length,
      newArticleCount: ingestedCount,
      duplicateSuppressedCount: duplicateCount,
      cursorChanged: uidValidityChanged || String(maxUid) !== String(previousLastUid),
      errorMessage: null,
      cursorUpdates: [
        {
          cursorType: "imap_uid",
          cursorValue: String(maxUid),
          cursorJson: {
            mailbox: imapConfig.mailbox,
            uidValidity,
            searchSinceHours: imapConfig.searchSinceHours,
            maxMessageBytes: imapConfig.maxMessageBytes
          }
        }
      ],
      providerMetricsJson: {
        provider: "email_imap",
        uidValidity,
        uidValidityChanged,
        scannedCount,
        selectedCount: selectedMessages.length,
        skippedOversizedCount,
        skippedSenderCount,
        malformedMessageCount
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown IMAP fetch failure";
    throw new ChannelFetchError(message, {
      outcome: classifyUnexpectedFailure(message),
      httpStatus: null,
      retryAfterSeconds: null,
      fetchedItemCount: 0,
      newArticleCount: 0,
      duplicateSuppressedCount: 0,
      cursorChanged: false,
      errorMessage: message
    });
  } finally {
    await client.logout().catch(() => undefined);
  }
}
