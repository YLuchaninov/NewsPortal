import { Buffer } from "node:buffer";

import { parseEmailImapChannelConfig } from "@newsportal/contracts";
import { ImapFlow } from "imapflow";

import {
  ChannelFetchError,
  classifyUnexpectedFailure,
  normalizeWhitespace,
  rawEmailToBody
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
  const lastUid = Number(cursors.imap_uid?.cursorValue ?? "0");
  const client = new ImapFlow({
    host: imapConfig.host,
    port: imapConfig.port,
    secure: imapConfig.secure,
    auth: {
      user: imapConfig.username,
      pass: imapConfig.password
    }
  });
  let maxUid = lastUid;
  const fetchedAt = new Date().toISOString();

  try {
    await client.connect();
    await client.mailboxOpen(imapConfig.mailbox);
    const messages: Array<{
      uid: number;
      subject: string;
      fromAddress: string | null;
      publishedAt: string;
      body: string;
    }> = [];

    for await (const message of client.fetch("1:*", {
      uid: true,
      envelope: true,
      internalDate: true,
      source: true
    })) {
      if (typeof message.uid !== "number" || message.uid <= lastUid) {
        continue;
      }
      const envelope = message.envelope;
      const fromAddress = envelope?.from?.[0]?.address ?? null;
      if (imapConfig.searchFrom && fromAddress && fromAddress !== imapConfig.searchFrom) {
        continue;
      }
      const sourceText = Buffer.from(message.source ?? "").toString("utf-8");
      messages.push({
        uid: message.uid,
        subject: normalizeWhitespace(envelope?.subject ?? "Untitled email feed item"),
        fromAddress,
        publishedAt:
          message.internalDate != null
            ? new Date(message.internalDate).toISOString()
            : fetchedAt,
        body: rawEmailToBody(sourceText)
      });
    }

    messages
      .sort((left, right) => right.uid - left.uid)
      .slice(0, imapConfig.maxItemsPerPoll)
      .reverse()
      .forEach((message) => {
        maxUid = Math.max(maxUid, message.uid);
      });

    const inputs = messages
      .sort((left, right) => right.uid - left.uid)
      .slice(0, imapConfig.maxItemsPerPoll)
      .reverse()
      .map((message) => ({
        channel,
        externalArticleId: String(message.uid),
        url: `imap://${imapConfig.host}/${encodeURIComponent(imapConfig.mailbox)}/${message.uid}`,
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
            subject: message.subject,
            fromAddress: message.fromAddress
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
      fetchedItemCount: Math.min(messages.length, imapConfig.maxItemsPerPoll),
      newArticleCount: ingestedCount,
      duplicateSuppressedCount: duplicateCount,
      cursorChanged: String(maxUid) !== String(lastUid),
      errorMessage: null,
      cursorUpdates: [
        {
          cursorType: "imap_uid",
          cursorValue: String(maxUid),
          cursorJson: {
            mailbox: imapConfig.mailbox
          }
        }
      ]
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
