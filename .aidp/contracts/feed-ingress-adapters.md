# Контракт feed ingress adapters

Этот contract обязателен, когда работа трогает RSS/Atom parsing, aggregator-aware normalization, `adapterStrategy`, feed URL canonicalization, max-entry-age gating or feed provenance.

## Назначение

External source model keeps `provider_type = rss`; Reddit, Hacker News, Google News and similar aggregators are handled by internal `FeedIngressAdapter` strategies inside fetchers.

Feed parsing and discovery normalization are fetchers-owned. Workers may orchestrate discovery, but live feed probing should call the fetchers internal feed probe contract rather than maintain a second parser with materially different URL/date/content semantics.

Fetchers feed/website probe endpoints are untrusted URL boundaries. Probe targets and final redirect URLs must pass the fetchers URL guard before any network result is trusted: only `http`/`https`, no credentials, no malformed/protocol-relative/overlong URLs, and no localhost/private/link-local/reserved IP literals. Batch probe endpoints must dedupe URLs and cap each request batch.

The canonical parser module is `services/fetchers/src/feed-parser/index.ts` plus its owner helpers. Do not recreate internal compatibility re-export files for old feed-parser import paths.

## Strategy set

- `generic`: baseline RSS/Atom/JSON Feed path.
- `reddit_search_rss`: tolerant Reddit search Atom/XML path.
- `hn_comments_feed`: hnrss normalization where items may point to HN discussion threads.
- `google_news_rss`: Google News wrapper canonicalization to publisher URL.

## Resolution rules

- `source_channels.config_json.adapterStrategy` is authoritative if set.
- Otherwise infer from `fetch_url`: Reddit search RSS, hnrss.org, Google News RSS, else `generic`.
- Admin/API read models should expose resolved strategy even when config is auto/empty.
- `provider_type` remains `rss`.

## Max entry age

- Explicit `config_json.maxEntryAgeHours` wins.
- Defaults for Reddit/HN/Google strategies: `168`.
- Generic default: `null`.
- Age gate runs fetcher-side before persistence and outbox enqueue.
- Entries without valid `publishedAt` are not dropped solely by age gate.

## Strategy behavior

- Reddit search: keep Reddit permalink item URL, body/summary from feed content, no generic parser hard-fail on bounded XML entity issues.
- HN comments: classify linked article, discussion thread, or dropped comment update; preserve `discussionUrl`; drop pure comment updates.
- Google News: bounded attempt to resolve publisher URL; fallback to wrapper URL is non-fatal.

## Provenance

`articles.raw_payload_json.feedAdapter` should include `strategy`, `sourceUrl`, `canonicalUrl`, `canonicalResolved`, `discussionUrl`, `discussionOnly`, and `itemKind` where relevant.

## Proof expectations

- TS unit coverage for config parse/inference and normalization.
- Shared parser/probe conformance coverage for RSS, Atom, RDF and JSON Feed edge cases that affect discovery/ingest parity.
- Probe safety coverage for unsafe URL rejection, redirect revalidation, parser-based HTML alternate discovery, dedupe and batch limits.
- Deterministic smoke/fixture proof for Reddit/HN/Google.
- Regression proof that generic RSS remains working.
- Live internet is not required for closeout.

## Update triggers

Update when strategies, inference rules, age gates, provenance fields, or operator config/read-model behavior changes.
