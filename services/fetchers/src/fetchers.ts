import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";

import {
  ARTICLE_INGEST_REQUESTED_EVENT,
  createHealthResponse,
  parseApiChannelConfig,
  parseEmailImapChannelConfig,
  parseRssChannelConfig,
  parseWebsiteChannelConfig,
  type HealthResponse,
  type SourceProviderType
} from "@newsportal/contracts";
import { ImapFlow } from "imapflow";
import type { Pool, PoolClient } from "pg";

import type { FetchersConfig } from "./config";
import {
  canonicalizeUrl,
  collapseWhitespace,
  decodeHtmlEntities,
  parseRssFeed,
  stripHtmlTags,
  type ParsedRssItem
} from "./rss";
import { runWithConcurrency } from "./scheduler";

interface SourceChannelRow {
  channelId: string;
  providerType: SourceProviderType;
  name: string;
  fetchUrl: string | null;
  configJson: unknown;
  language: string | null;
}

interface FetchCursorRow {
  cursorType: string;
  cursorValue: string | null;
  cursorJson: Record<string, unknown>;
}

interface FetcherState {
  isPolling: boolean;
  lastPollStartedAt: string | null;
  lastPollCompletedAt: string | null;
  lastChannelId: string | null;
  lastError: string | null;
  fetchedChannelCount: number;
  ingestedArticleCount: number;
  duplicateArticleCount: number;
}

type CursorMap = Record<string, FetchCursorRow>;

function normalizeWhitespace(value: string): string {
  return collapseWhitespace(decodeHtmlEntities(value));
}

function derivePlaintextLead(summaryHtml: string, bodyHtml: string): string {
  const summaryText = normalizeWhitespace(stripHtmlTags(summaryHtml));
  if (summaryText) {
    return summaryText;
  }

  const bodyText = normalizeWhitespace(stripHtmlTags(bodyHtml));
  if (!bodyText) {
    return "";
  }

  const sentences = bodyText.split(/(?<=[.!?])\s+/).slice(0, 3);
  return collapseWhitespace(sentences.join(" "));
}

function derivePlaintextBody(contentHtml: string, summaryHtml: string): string {
  const preferred = normalizeWhitespace(stripHtmlTags(contentHtml));
  if (preferred) {
    return preferred;
  }

  return normalizeWhitespace(stripHtmlTags(summaryHtml));
}

function pickLanguageHint(
  channelLanguage: string | null,
  feedLanguage: string | null
): { lang: string | null; confidence: number | null } {
  const rawHint = channelLanguage ?? feedLanguage;

  if (!rawHint) {
    return {
      lang: null,
      confidence: null
    };
  }

  const normalized = rawHint.toLowerCase();
  if (normalized.startsWith("uk")) {
    return {
      lang: "uk",
      confidence: 0.8
    };
  }
  if (normalized.startsWith("en")) {
    return {
      lang: "en",
      confidence: 0.8
    };
  }

  return {
    lang: normalized.slice(0, 8),
    confidence: 0.5
  };
}

function deriveTimestampCursorValue(
  latestPublishedAt: string | null,
  responseLastModified: string | null,
  fetchedAt: string
): string {
  return responseLastModified ?? latestPublishedAt ?? fetchedAt;
}

function extractHtmlTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return normalizeWhitespace(stripHtmlTags(titleMatch?.[1] ?? ""));
}

function extractHtmlDescription(html: string): string {
  const metaMatch = html.match(
    /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i
  );
  return normalizeWhitespace(stripHtmlTags(metaMatch?.[1] ?? ""));
}

function getByPath(value: unknown, path: string): unknown {
  if (!path.trim()) {
    return value;
  }

  const segments = path.split(".").map((segment) => segment.trim()).filter(Boolean);
  let current: unknown = value;
  for (const segment of segments) {
    if (current == null || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function normalizeExternalUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return canonicalizeUrl(url);
  }
  return url;
}

function rawEmailToBody(rawSource: string): string {
  const separatorIndex = rawSource.search(/\r?\n\r?\n/);
  const body = separatorIndex >= 0 ? rawSource.slice(separatorIndex + 4) : rawSource;
  const cleaned = body
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ");
  return normalizeWhitespace(stripHtmlTags(cleaned));
}

class FetcherService {
  private readonly state: FetcherState = {
    isPolling: false,
    lastPollStartedAt: null,
    lastPollCompletedAt: null,
    lastChannelId: null,
    lastError: null,
    fetchedChannelCount: 0,
    ingestedArticleCount: 0,
    duplicateArticleCount: 0
  };

  constructor(
    private readonly pool: Pool,
    private readonly config: FetchersConfig
  ) {}

  getState(): FetcherState {
    return {
      ...this.state
    };
  }

  createHealthResponse(): HealthResponse {
    return createHealthResponse("fetchers", {
      database: "ok",
      isPolling: String(this.state.isPolling),
      fetchedChannelCount: String(this.state.fetchedChannelCount),
      ingestedArticleCount: String(this.state.ingestedArticleCount),
      duplicateArticleCount: String(this.state.duplicateArticleCount),
      lastPollCompletedAt: this.state.lastPollCompletedAt ?? "never"
    });
  }

  async pollOnce(): Promise<void> {
    if (this.state.isPolling) {
      return;
    }

    this.state.isPolling = true;
    this.state.lastPollStartedAt = new Date().toISOString();

    try {
      const channels = await this.loadDueChannels();
      const results = await runWithConcurrency(
        channels,
        this.config.fetchersConcurrency,
        async (channel) => {
          this.state.lastChannelId = channel.channelId;
          await this.pollChannelSafely(channel.channelId);
        }
      );
      const failedChannels = results.filter(
        (result): result is Extract<(typeof results)[number], { status: "rejected" }> =>
          result.status === "rejected"
      );

      this.state.lastError =
        failedChannels.length > 0
          ? `${failedChannels.length} of ${channels.length} due channel(s) failed during the last poll.`
          : null;
    } catch (error) {
      this.state.lastError =
        error instanceof Error ? error.message : "Unknown fetchers poll failure";
      throw error;
    } finally {
      this.state.isPolling = false;
      this.state.lastPollCompletedAt = new Date().toISOString();
    }
  }

  private async pollChannelSafely(channelId: string): Promise<void> {
    try {
      await this.pollChannel(channelId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown fetcher channel failure";
      await this.markChannelFailure(channelId, message, new Date().toISOString()).catch(
        () => undefined
      );
      throw error;
    }
  }

  async pollChannel(channelId: string): Promise<void> {
    const channel = await this.loadChannelById(channelId);
    if (!channel) {
      throw new Error(`Source channel ${channelId} was not found or is not active.`);
    }

    switch (channel.providerType) {
      case "rss":
        await this.pollRssChannel(channel);
        return;
      case "website":
        await this.pollWebsiteChannel(channel);
        return;
      case "api":
        await this.pollApiChannel(channel);
        return;
      case "email_imap":
        await this.pollEmailImapChannel(channel);
        return;
      case "youtube":
        await this.markChannelFailure(
          channel.channelId,
          "YouTube is future-ready only in the local MVP.",
          new Date().toISOString()
        );
        return;
      default:
        throw new Error(`Unsupported provider type: ${channel.providerType}`);
    }
  }

  private async pollRssChannel(channel: SourceChannelRow): Promise<void> {
    if (!channel.fetchUrl) {
      throw new Error(`RSS channel ${channel.channelId} is missing fetchUrl.`);
    }

    const rssConfig = parseRssChannelConfig(channel.configJson);
    const cursors = await this.loadCursorMap(channel.channelId);
    const headers = new Headers({
      "user-agent": rssConfig.userAgent || this.config.defaultUserAgent,
      accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8"
    });

    if (cursors.etag?.cursorValue) {
      headers.set("if-none-match", cursors.etag.cursorValue);
    }
    if (cursors.timestamp?.cursorValue) {
      headers.set("if-modified-since", cursors.timestamp.cursorValue);
    }

    const response = await fetch(channel.fetchUrl, {
      headers,
      signal: AbortSignal.timeout(rssConfig.requestTimeoutMs)
    });
    const fetchedAt = new Date().toISOString();

    if (response.status === 304) {
      await this.markChannelSuccess(channel.channelId, fetchedAt, [
        {
          cursorType: "timestamp",
          cursorValue: fetchedAt,
          cursorJson: {
            header: "not-modified"
          }
        }
      ]);
      this.state.fetchedChannelCount += 1;
      return;
    }

    if (!response.ok) {
      const message = `RSS fetch failed for ${channel.channelId}: ${response.status} ${response.statusText}`;
      await this.markChannelFailure(channel.channelId, message, fetchedAt);
      throw new Error(message);
    }

    const xml = await response.text();
    try {
      const parsedFeed = parseRssFeed(xml);
      const items = parsedFeed.items.slice(0, rssConfig.maxItemsPerPoll);
      let ingestedCount = 0;
      let duplicateCount = 0;
      for (const item of items) {
        const persisted = await this.persistRssItem(
          channel,
          item,
          parsedFeed.language,
          rssConfig.preferContentEncoded
        );
        if (persisted) {
          ingestedCount += 1;
        } else {
          duplicateCount += 1;
        }
      }
      const latestPublishedAt = items
        .map((item) => item.publishedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;
      await this.markChannelSuccess(channel.channelId, fetchedAt, [
        {
          cursorType: "etag",
          cursorValue: response.headers.get("etag"),
          cursorJson: {
            header: "etag"
          }
        },
        {
          cursorType: "timestamp",
          cursorValue: deriveTimestampCursorValue(
            latestPublishedAt,
            response.headers.get("last-modified"),
            fetchedAt
          ),
          cursorJson: {
            header: "last-modified"
          }
        }
      ]);
      this.state.fetchedChannelCount += 1;
      this.state.ingestedArticleCount += ingestedCount;
      this.state.duplicateArticleCount += duplicateCount;
      this.state.lastError = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown RSS parsing failure";
      await this.markChannelFailure(channel.channelId, message, fetchedAt);
      throw error;
    }
  }

  private async pollWebsiteChannel(channel: SourceChannelRow): Promise<void> {
    if (!channel.fetchUrl) {
      throw new Error(`Website channel ${channel.channelId} is missing fetchUrl.`);
    }

    const websiteConfig = parseWebsiteChannelConfig(channel.configJson);
    const response = await fetch(channel.fetchUrl, {
      headers: {
        "user-agent": websiteConfig.userAgent || this.config.defaultUserAgent,
        accept: "text/html,application/xhtml+xml"
      },
      signal: AbortSignal.timeout(websiteConfig.requestTimeoutMs)
    });
    const fetchedAt = new Date().toISOString();
    if (!response.ok) {
      const message = `Website fetch failed for ${channel.channelId}: ${response.status} ${response.statusText}`;
      await this.markChannelFailure(channel.channelId, message, fetchedAt);
      throw new Error(message);
    }

    const html = await response.text();
    const title = extractHtmlTitle(html) || channel.name;
    const lead = extractHtmlDescription(html);
    const body = normalizeWhitespace(stripHtmlTags(html));
    const { lang, confidence } = pickLanguageHint(channel.language, response.headers.get("content-language"));
    const persisted = await this.persistArticle({
      channel,
      externalArticleId: normalizeExternalUrl(channel.fetchUrl),
      url: normalizeExternalUrl(channel.fetchUrl),
      publishedAt: response.headers.get("last-modified") ?? fetchedAt,
      title,
      lead,
      body,
      lang,
      confidence,
      rawPayload: {
        fetcher: "website",
        fetchedAt,
        html: {
          url: channel.fetchUrl,
          title,
          description: lead
        }
      }
    });
    await this.markChannelSuccess(channel.channelId, fetchedAt, [
      {
        cursorType: "timestamp",
        cursorValue: fetchedAt,
        cursorJson: {
          provider: "website"
        }
      }
    ]);
    this.state.fetchedChannelCount += 1;
    this.state.ingestedArticleCount += persisted ? 1 : 0;
    this.state.duplicateArticleCount += persisted ? 0 : 1;
  }

  private async pollApiChannel(channel: SourceChannelRow): Promise<void> {
    if (!channel.fetchUrl) {
      throw new Error(`API channel ${channel.channelId} is missing fetchUrl.`);
    }

    const apiConfig = parseApiChannelConfig(channel.configJson);
    const response = await fetch(channel.fetchUrl, {
      headers: {
        "user-agent": apiConfig.userAgent || this.config.defaultUserAgent,
        accept: "application/json"
      },
      signal: AbortSignal.timeout(apiConfig.requestTimeoutMs)
    });
    const fetchedAt = new Date().toISOString();
    if (!response.ok) {
      const message = `API fetch failed for ${channel.channelId}: ${response.status} ${response.statusText}`;
      await this.markChannelFailure(channel.channelId, message, fetchedAt);
      throw new Error(message);
    }

    const payload = (await response.json()) as unknown;
    const itemsCandidate = getByPath(payload, apiConfig.itemsPath);
    const items = Array.isArray(itemsCandidate)
      ? itemsCandidate
      : Array.isArray(payload)
        ? payload
        : [];
    let ingestedCount = 0;
    let duplicateCount = 0;
    let latestPublishedAt: string | null = null;
    for (const item of items.slice(0, apiConfig.maxItemsPerPoll)) {
      const record = (item ?? {}) as Record<string, unknown>;
      const rawUrl = String(getByPath(record, apiConfig.urlField) ?? "").trim();
      if (!rawUrl) {
        continue;
      }
      const publishedAt = String(getByPath(record, apiConfig.publishedAtField) ?? fetchedAt);
      latestPublishedAt = (latestPublishedAt ?? "") > publishedAt ? latestPublishedAt : publishedAt;
      const persisted = await this.persistArticle({
        channel,
        externalArticleId:
          String(getByPath(record, apiConfig.externalIdField) ?? rawUrl).trim() || rawUrl,
        url: normalizeExternalUrl(rawUrl),
        publishedAt,
        title: normalizeWhitespace(String(getByPath(record, apiConfig.titleField) ?? "Untitled article")),
        lead: normalizeWhitespace(String(getByPath(record, apiConfig.leadField) ?? "")),
        body: normalizeWhitespace(String(getByPath(record, apiConfig.bodyField) ?? "")),
        lang:
          String(getByPath(record, apiConfig.languageField) ?? channel.language ?? "").trim() ||
          null,
        confidence: channel.language ? 0.8 : 0.5,
        rawPayload: {
          fetcher: "api",
          fetchedAt,
          sourceItem: record
        }
      });
      if (persisted) {
        ingestedCount += 1;
      } else {
        duplicateCount += 1;
      }
    }

    await this.markChannelSuccess(channel.channelId, fetchedAt, [
      {
        cursorType: "timestamp",
        cursorValue: latestPublishedAt ?? fetchedAt,
        cursorJson: {
          provider: "api"
        }
      }
    ]);
    this.state.fetchedChannelCount += 1;
    this.state.ingestedArticleCount += ingestedCount;
    this.state.duplicateArticleCount += duplicateCount;
  }

  private async pollEmailImapChannel(channel: SourceChannelRow): Promise<void> {
    const imapConfig = parseEmailImapChannelConfig(channel.configJson);
    if (!imapConfig.host || !imapConfig.username || !imapConfig.password) {
      throw new Error(`IMAP channel ${channel.channelId} is missing host/username/password.`);
    }

    const cursors = await this.loadCursorMap(channel.channelId);
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
    let ingestedCount = 0;
    let duplicateCount = 0;
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

      for (const message of messages
        .sort((left, right) => right.uid - left.uid)
        .slice(0, imapConfig.maxItemsPerPoll)
        .reverse()) {
        const persisted = await this.persistArticle({
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
        });
        if (persisted) {
          ingestedCount += 1;
        } else {
          duplicateCount += 1;
        }
      }

      await this.markChannelSuccess(channel.channelId, fetchedAt, [
        {
          cursorType: "imap_uid",
          cursorValue: String(maxUid),
          cursorJson: {
            mailbox: imapConfig.mailbox
          }
        }
      ]);
      this.state.fetchedChannelCount += 1;
      this.state.ingestedArticleCount += ingestedCount;
      this.state.duplicateArticleCount += duplicateCount;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown IMAP fetch failure";
      await this.markChannelFailure(channel.channelId, message, fetchedAt);
      throw error;
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  private async loadDueChannels(): Promise<SourceChannelRow[]> {
    const result = await this.pool.query<SourceChannelRow>(
      `
        select
          channel_id::text as "channelId",
          provider_type as "providerType",
          name,
          fetch_url as "fetchUrl",
          config_json as "configJson",
          language
        from source_channels
        where
          is_active = true
          and provider_type in ('rss', 'website', 'api', 'email_imap')
          and (
            provider_type = 'email_imap'
            or fetch_url is not null
          )
          and (
            last_fetch_at is null
            or last_fetch_at <= now() - make_interval(secs => poll_interval_seconds)
          )
        order by coalesce(last_fetch_at, to_timestamp(0)), created_at
        limit $1
      `,
      [this.config.fetchersBatchSize]
    );
    return result.rows;
  }

  private async loadChannelById(channelId: string): Promise<SourceChannelRow | null> {
    const result = await this.pool.query<SourceChannelRow>(
      `
        select
          channel_id::text as "channelId",
          provider_type as "providerType",
          name,
          fetch_url as "fetchUrl",
          config_json as "configJson",
          language
        from source_channels
        where channel_id = $1
          and is_active = true
        limit 1
      `,
      [channelId]
    );
    return result.rows[0] ?? null;
  }

  private async loadCursorMap(channelId: string): Promise<CursorMap> {
    const result = await this.pool.query<FetchCursorRow>(
      `
        select
          cursor_type as "cursorType",
          cursor_value as "cursorValue",
          cursor_json as "cursorJson"
        from fetch_cursors
        where channel_id = $1
      `,
      [channelId]
    );

    return Object.fromEntries(result.rows.map((row) => [row.cursorType, row])) as CursorMap;
  }

  private async persistRssItem(
    channel: SourceChannelRow,
    item: ParsedRssItem,
    feedLanguage: string | null,
    preferContentEncoded: boolean
  ): Promise<boolean> {
    if (!item.url) {
      return false;
    }

    const canonicalUrl = canonicalizeUrl(item.url);
    const externalArticleId = item.guid?.trim() || canonicalUrl;
    const publishedAt = item.publishedAt ?? new Date().toISOString();
    const { lang, confidence } = pickLanguageHint(channel.language, feedLanguage);
    const title = normalizeWhitespace(item.title);
    const lead = derivePlaintextLead(item.summaryHtml, item.contentHtml);
    const body = preferContentEncoded
      ? derivePlaintextBody(item.contentHtml, item.summaryHtml)
      : derivePlaintextBody(item.summaryHtml, item.contentHtml);
    return this.persistArticle({
      channel,
      externalArticleId,
      url: canonicalUrl,
      publishedAt,
      title,
      lead,
      body,
      lang,
      confidence,
      rawPayload: {
        fetcher: "rss",
        fetchedAt: new Date().toISOString(),
        rss: {
          guid: item.guid,
          title: item.title,
          link: item.url,
          description: item.summaryHtml,
          contentEncoded: item.contentHtml,
          publishedAt: item.publishedAt,
          rawXmlHash: item.rawXmlHash
        }
      }
    });
  }

  private async persistArticle(input: {
    channel: SourceChannelRow;
    externalArticleId: string;
    url: string;
    publishedAt: string;
    title: string;
    lead: string;
    body: string;
    lang: string | null;
    confidence: number | null;
    rawPayload: Record<string, unknown>;
  }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const insertResult = await client.query<{ docId: string }>(
        `
          insert into articles (
            channel_id,
            source_article_id,
            url,
            content_format,
            published_at,
            title,
            lead,
            body,
            lang,
            lang_confidence,
            raw_payload_json
          )
          values (
            $1,
            $2,
            $3,
            'article',
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10::jsonb
          )
          on conflict do nothing
          returning doc_id::text as "docId"
        `,
        [
          input.channel.channelId,
          input.externalArticleId,
          input.url,
          input.publishedAt,
          input.title,
          input.lead,
          input.body,
          input.lang,
          input.confidence,
          JSON.stringify(input.rawPayload)
        ]
      );
      const insertedArticle = insertResult.rows[0];
      if (!insertedArticle) {
        await client.query("rollback");
        return false;
      }

      await client.query(
        `
          insert into article_external_refs (
            external_ref_id,
            channel_id,
            external_article_id,
            doc_id
          )
          values ($1, $2, $3, $4)
          on conflict (channel_id, external_article_id) do nothing
        `,
        [randomUUID(), input.channel.channelId, input.externalArticleId, insertedArticle.docId]
      );
      await this.insertOutboxEvent(client, ARTICLE_INGEST_REQUESTED_EVENT, insertedArticle.docId, {
        docId: insertedArticle.docId,
        version: 1
      });
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertOutboxEvent(
    client: PoolClient,
    eventType: string,
    docId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await client.query(
      `
        insert into outbox_events (
          event_id,
          event_type,
          aggregate_type,
          aggregate_id,
          payload_json
        )
        values ($1, $2, 'article', $3, $4::jsonb)
      `,
      [randomUUID(), eventType, docId, JSON.stringify(payload)]
    );
  }

  private async markChannelSuccess(
    channelId: string,
    fetchedAt: string,
    cursorUpdates: Array<{
      cursorType: string;
      cursorValue: string | null | undefined;
      cursorJson: Record<string, unknown>;
    }>
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `
          update source_channels
          set
            last_fetch_at = $2,
            last_success_at = $2,
            last_error_at = null,
            last_error_message = null,
            updated_at = now()
          where channel_id = $1
        `,
        [channelId, fetchedAt]
      );

      for (const cursorUpdate of cursorUpdates) {
        if (!cursorUpdate.cursorValue) {
          continue;
        }
        await this.upsertCursor(
          client,
          channelId,
          cursorUpdate.cursorType,
          cursorUpdate.cursorValue,
          cursorUpdate.cursorJson
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async markChannelFailure(
    channelId: string,
    errorMessage: string,
    fetchedAt: string
  ): Promise<void> {
    await this.pool.query(
      `
        update source_channels
        set
          last_fetch_at = $2,
          last_error_at = $2,
          last_error_message = $3,
          updated_at = now()
        where channel_id = $1
      `,
      [channelId, fetchedAt, errorMessage]
    );
  }

  private async upsertCursor(
    client: PoolClient,
    channelId: string,
    cursorType: string,
    cursorValue: string,
    cursorJson: Record<string, unknown>
  ): Promise<void> {
    await client.query(
      `
        insert into fetch_cursors (
          cursor_id,
          channel_id,
          cursor_type,
          cursor_value,
          cursor_json,
          updated_at
        )
        values ($1, $2, $3, $4, $5::jsonb, now())
        on conflict (channel_id, cursor_type)
        do update
        set
          cursor_value = excluded.cursor_value,
          cursor_json = excluded.cursor_json,
          updated_at = excluded.updated_at
      `,
      [randomUUID(), channelId, cursorType, cursorValue, JSON.stringify(cursorJson)]
    );
  }
}

export class RssFetcherService extends FetcherService {}
