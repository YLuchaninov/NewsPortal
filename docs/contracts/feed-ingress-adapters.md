# Feed Ingress Adapters

Этот deep contract описывает durable truth для aggregator-aware RSS/Atom intake внутри существующего `provider_type = rss`.

## Purpose

Внешняя модель источников не получает новые provider types для Reddit, Hacker News, Google News или похожих системных агрегаторов.
Вместо этого fetchers используют внутренний слой `FeedIngressAdapter`, который:

- выбирает adapter strategy из `source_channels.config_json.adapterStrategy` или runtime inference по `fetch_url`;
- parse-ит feed body подходящим parser path;
- нормализует canonical target URL до persistence;
- режет stale entries по `maxEntryAgeHours` до создания `articles` и `article.ingest.requested`;
- пишет adapter provenance в `articles.raw_payload_json.feedAdapter`.

## Strategy Set

- `generic`
  Baseline extractus RSS/ATOM/JSON Feed path без special-case normalization.
- `reddit_search_rss`
  Tolerant Atom/XML path для Reddit search feeds. Valid `200` response не должен hard-fail только из-за XML entity expansion overflow.
- `hn_comments_feed`
  Нормализация `hnrss.org` feeds, где item URL часто ведет на `news.ycombinator.com/item?...` discussion thread.
- `google_news_rss`
  Canonicalization path для `news.google.com/rss/articles/...` wrapper URLs до publisher URL.

## Resolution Rules

- Если `config_json.adapterStrategy` задан, он authoritative для данного RSS channel.
- Если explicit strategy отсутствует, runtime infer-ит strategy по `fetch_url`:
  - `reddit.com` + `search.rss` -> `reddit_search_rss`
  - `hnrss.org` -> `hn_comments_feed`
  - `news.google.com` + `/rss/` -> `google_news_rss`
  - все остальное -> `generic`
- Admin/API read models должны показывать resolved strategy, даже когда `config_json.adapterStrategy` пустой.
- `provider_type` при этом остается `rss`.

## Max Entry Age Rules

- `config_json.maxEntryAgeHours` всегда побеждает inferred/default value.
- Strategy defaults:
  - `reddit_search_rss` -> `168`
  - `hn_comments_feed` -> `168`
  - `google_news_rss` -> `168`
  - `generic` -> `null`
- Age gate применяется fetcher-side до persistence и до outbox enqueue.
- Entry без валидного `publishedAt` не режется только по age gate.

## Per-Strategy Normalization

### Reddit Search RSS

- Parser path остается bounded внутри fetchers и не меняет generic extractus contract.
- `article.url` сохраняет Reddit permalink item URL.
- Body/summary продолжают браться из feed content.

### Hacker News Comments Feed

- Item классифицируется как `linked_article`, `discussion_thread` или dropped comment update.
- Если feed body содержит `Article URL: ...`, canonical `article.url` должен стать outbound article URL.
- HN discussion URL сохраняется в provenance (`discussionUrl`), а не теряется.
- Чистые `New comment by ...` updates не ingested.
- Ask/Show/discussion items без outbound URL остаются discussion-origin rows с `discussionOnly = true`.

### Google News RSS

- Перед persistence fetchers пытаются резолвить final publisher URL из Google wrapper.
- Resolution bounded short timeout и per-poll in-memory cache.
- Failure to resolve не превращается в hard failure: fallback остается raw Google wrapper URL.

## Provenance Contract

`articles.raw_payload_json.feedAdapter` должен содержать adapter-specific provenance:

- `strategy`
- `sourceUrl`
- `canonicalUrl`
- `canonicalResolved`
- `discussionUrl`
- `discussionOnly`
- `itemKind`

Generic RSS rows тоже могут писать `feedAdapter`, но без discussion-specific semantics.

## Operator Contract

- RSS create/edit forms принимают `adapterStrategy` и `maxEntryAgeHours`.
- Empty/`auto` strategy оставляет runtime inference.
- Existing channels без новых полей не требуют schema migration.

## Verification Contract

Минимальный proof для этой подсистемы:

- TS unit coverage для config parse/inference и per-strategy normalization;
- deterministic local adapter smoke на fixture feeds для Reddit/HN/Google;
- regression proof, что generic RSS path не ломается;
- live internet не считается обязательным closeout-proof для этого слоя.
