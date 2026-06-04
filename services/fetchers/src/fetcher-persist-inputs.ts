import {
  derivePlaintextBody,
  derivePlaintextLead,
  normalizeWhitespace,
  pickLanguageHint,
} from "./fetcher-channel-helpers";
import type { AdaptedFeedEntry } from "./feed-ingress-adapters";
import type { ParsedFeed } from "./feed-parser/index";
import type {
  PersistSignalCandidateInput,
  PersistResourceInput,
  SourceChannelRow,
} from "./fetcher-persistence";
import { canonicalizeUrl } from "./rss";
import type { DiscoveredWebsiteResource } from "./web-ingestion";

export function buildRssPersistInput(
  channel: SourceChannelRow,
  parsedFeed: ParsedFeed,
  item: AdaptedFeedEntry,
  fetchedAt: string,
  preferContentEncoded: boolean
): PersistSignalCandidateInput | null {
  if (!item.url) {
    return null;
  }

  const canonicalUrl = canonicalizeUrl(item.url);
  const externalSignalCandidateId = item.entry.guid?.trim() || canonicalUrl;
  const publishedAt = item.publishedAt ?? new Date().toISOString();
  const { lang, confidence } = pickLanguageHint(channel.language, parsedFeed.language);
  const title = normalizeWhitespace(item.entry.title);
  const lead = derivePlaintextLead(item.entry.summaryHtml, item.entry.contentHtml);
  const body = preferContentEncoded
    ? derivePlaintextBody(item.entry.contentHtml, item.entry.summaryHtml)
    : derivePlaintextBody(item.entry.summaryHtml, item.entry.contentHtml);
  return {
    channel,
    externalSignalCandidateId,
    url: canonicalUrl,
    publishedAt,
    title,
    lead,
    body,
    lang,
    confidence,
    rawPayload: {
      fetcher: parsedFeed.fetcher,
      fetchedAt,
      feedAdapter: item.feedAdapter,
      feed: {
        format: parsedFeed.format,
        title: parsedFeed.title,
        language: parsedFeed.language,
        description: parsedFeed.description,
        generator: parsedFeed.generator,
        publishedAt: parsedFeed.publishedAt
      },
      entry: {
        guid: item.entry.guid,
        title: item.entry.title,
        link: item.entry.url,
        description: item.entry.summaryHtml,
        contentEncoded: item.entry.contentHtml,
        publishedAt: item.entry.publishedAt,
        rawXmlHash: item.entry.rawXmlHash,
        enclosure: item.entry.enclosure,
        mediaContentUrl: item.entry.mediaContentUrl,
        categories: item.entry.categories
      },
      rss: {
        guid: item.entry.guid,
        title: item.entry.title,
        link: item.entry.url,
        description: item.entry.summaryHtml,
        contentEncoded: item.entry.contentHtml,
        publishedAt: item.entry.publishedAt,
        rawXmlHash: item.entry.rawXmlHash,
        enclosure: item.entry.enclosure,
        mediaContentUrl: item.entry.mediaContentUrl,
        categories: item.entry.categories,
        feed: {
          format: parsedFeed.format,
          title: parsedFeed.title,
          language: parsedFeed.language,
          description: parsedFeed.description,
          generator: parsedFeed.generator,
          publishedAt: parsedFeed.publishedAt
        }
      }
    }
  };
}

export function buildWebsitePersistInput(
  channel: SourceChannelRow,
  resource: DiscoveredWebsiteResource,
  fetchedAt: string
): PersistResourceInput {
  return {
    channel,
    externalSignalCandidateId: resource.externalResourceId,
    url: resource.normalizedUrl,
    resourceKind: resource.classification.kind,
    title: resource.title ?? "[Pending enrichment]",
    summary: resource.summary ?? "",
    publishedAt: resource.publishedAt,
    modifiedAt: resource.modifiedAt,
    freshnessMarkerType: resource.freshnessMarkerType,
    freshnessMarkerValue: resource.freshnessMarkerValue,
    discoverySource: resource.discoverySource,
    classificationJson: {
      kind: resource.classification.kind,
      confidence: resource.classification.confidence,
      reasons: resource.classification.reasons,
      hintedKinds: resource.hintedKinds,
      discovery: {
        kind: resource.classification.kind,
        confidence: resource.classification.confidence,
        reasons: resource.classification.reasons,
        hintedKinds: resource.hintedKinds,
        discoverySource: resource.discoverySource,
      },
      resolved: {
        kind: resource.classification.kind,
        confidence: resource.classification.confidence,
        reasonSource: "discovery",
      },
      transition: {
        kindChanged: false,
        fromKind: resource.classification.kind,
        toKind: resource.classification.kind,
        reasonSource: "discovery",
      }
    },
    rawPayload: {
      fetcher: `website_${resource.discoverySource}`,
      fetchedAt,
      discovery: {
        parentUrl: resource.parentUrl,
        freshnessMarkerType: resource.freshnessMarkerType,
        freshnessMarkerValue: resource.freshnessMarkerValue,
        hintedKinds: resource.hintedKinds,
        classification: resource.classification,
        rawSignals: resource.rawSignals
      }
    }
  };
}
