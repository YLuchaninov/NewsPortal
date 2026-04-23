# Website Ingestion / Scraping Audit

Date: 2026-04-15

## Scope

This audit covers only the `website` ingestion path in NewsPortal:

- website polling and cheap/static discovery;
- browser-assisted fallback for JS-heavy public sites;
- robots/auth/challenge handling;
- resource enrichment and editorial projection;
- whether `@extractus/article-extractor` should be used more broadly in the website path.

Explicitly out of scope:

- RSS/feed-ingress adapters as their own subsystem;
- discovery/search/recall missions;
- downstream selection/matching except where needed to judge website-resource usefulness.

## Evidence Base

### Code paths reviewed

- [services/fetchers/src/fetchers.ts](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/fetchers.ts)
- [services/fetchers/src/web-ingestion.ts](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/web-ingestion.ts)
- [services/fetchers/src/resource-enrichment.ts](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/resource-enrichment.ts)
- [docs/contracts/browser-assisted-websites.md](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/browser-assisted-websites.md)

### Local proof executed on 2026-04-15

- `node --import tsx --test tests/unit/ts/web-ingestion-browser.test.ts tests/unit/ts/admin-website-channels.test.ts`
- `PYTHONPATH=/tmp:. python -m unittest tests.unit.python.test_discovery_fetchers_website_probe`
- `pnpm test:website:compose`
- `pnpm test:hard-sites:compose`
- `pnpm test:channel-auth:compose`
- `pnpm test:website:admin:compose`
- `pnpm test:enrichment:compose`

### Proof summary

- `website:compose` passed: the fixture proved `website` stayed `provider_type = website`, discovered resource rows via sitemap/feed/collection/download, projected editorial rows into `articles`, and kept entity/document rows in `web_resources`.
- `hard-sites:compose` passed: the hard-site probe recommended browser assistance, surfaced browser provenance, projected the browser-discovered editorial story, kept the entity resource-only, and persisted explicit unsupported `captcha` failure for the blocked site.
- `channel-auth:compose` passed: same-origin auth injection worked and protected-source failures remained explicit.
- `website:admin:compose` passed: the admin/operator path created and updated `website`, `api`, and `email_imap` channels; the website leg produced `4` resource rows and `1` projected article in the live acceptance run.
- `enrichment:compose` passed: short-body articles were expanded, long-body articles were skipped conservatively, and failed extraction preserved the original body/media path.

## Current Website Ingestion Map

### 1. Channel polling and ownership

The `website` provider is polled by `FetcherService.pollWebsiteChannel(...)` in [services/fetchers/src/fetchers.ts](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/fetchers.ts). The fetcher keeps per-channel advisory leasing before poll execution, so the same website channel is not processed concurrently across poll loops or manual runs ([services/fetchers/src/fetchers.ts](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/fetchers.ts):424-499).

This is a strong design choice:

- it keeps ownership in fetchers;
- it avoids duplicate concurrent crawls for the same site;
- it aligns with the existing outbox/sequence discipline instead of adding side channels.

Verdict: `keep`

### 2. Policy bootstrap and crawl discipline

Before discovery, the website path builds runtime crawl policy through `CrawlPolicyCacheService`:

- fetches and caches `robots.txt`;
- extracts sitemap URLs and homepage feed hints;
- fetches `llms.txt` as additive metadata;
- uses DB-backed cache plus advisory transaction locking for same-domain policy refresh ([services/fetchers/src/web-ingestion.ts](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/web-ingestion.ts):1030-1135).

This is operationally sound and keeps crawl policy explicit.

Strengths:

- robots discipline is real rather than implied;
- homepage hints and sitemap hints are reused across polls;
- auth-configured channels bypass stale shared cache and fetch live policy truth.

Gap:

- unlike the RSS path, the website path does not currently send upstream conditional requests such as `If-None-Match` / `If-Modified-Since` during homepage/sitemap/feed fetches; freshness is controlled locally through cursors and cache TTL, not HTTP validators.

Verdict: `keep`, but `harden` with optional upstream conditional request support

### 3. Cheap/static discovery pipeline

Static discovery is intentionally cheap-first and mode-based:

- `sitemap`
- `feed`
- `collection`
- `inline_data`
- `download`

Mode selection is done by `selectWebsiteDiscoveryModes(...)` ([services/fetchers/src/web-ingestion.ts](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/web-ingestion.ts):861-882). The full discovery loop is assembled in `discoverWebsiteResources(...)` and `probeWebsitesForDiscovery(...)` ([services/fetchers/src/web-ingestion.ts](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/web-ingestion.ts):2015-2302).

Why this is strong:

- the crawl starts with cheap primitives before escalating to a browser;
- feeds discovered on a website remain hints inside the `website` boundary instead of silently converting the source into RSS;
- URL normalization, same-domain filtering, allow/block patterns, and freshness cursors are all bounded inside one runtime owner.

Proof-backed behavior:

- `website:compose` proves sitemap + hidden-feed + collection + download discovery all materialize into resource rows;
- the same proof asserts that the hidden feed does not auto-convert the channel into `rss`;
- unit tests prove the cheap mode list intentionally excludes `browser_assisted`.

Main weakness:

- discovery quality depends heavily on heuristics and HTML shape assumptions rather than a richer site model.

Verdict: `keep`

### 4. Resource classification and dedupe

Each discovered URL is converted into a `DiscoveredWebsiteResource` through:

- URL/path heuristics via `inferResourceKindsFromUrl(...)`;
- optional structured-type hints from JSON-LD;
- repeated-card/pagination/download heuristics;
- dedupe by normalized URL with best-confidence merge behavior ([services/fetchers/src/web-ingestion.ts](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/web-ingestion.ts):429-558,498-543,904-953).

This is effective enough for a bounded generic system, but it is the most brittle part of the website path.

Strengths:

- no provider-specific hardcoding per site;
- typed extraction is gated by generic signals;
- dedupe preserves richer merged reasons and signals.

Weaknesses:

- path-segment heuristics can misclassify modern websites with weak URL semantics;
- repeated-card/pagination detection is coarse;
- resource typing can drift on sites where editorial/entity/listing boundaries are not reflected in URL or JSON-LD.

Verdict: `harden`

### 5. Freshness and repeat polling

The website path uses three cursor styles:

- `timestamp`
- `lastmod`
- `set_diff`

Resources are filtered against stored cursors before persistence, and cursor updates are written after a successful poll ([services/fetchers/src/web-ingestion.ts](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/web-ingestion.ts):702-726,2260-2302).

This is a good bounded strategy for heterogeneous website sources because many sites do not expose reliable validators. It also explains why the website subsystem can stay generic without per-site state machines.

Gap:

- local cursor gating avoids repeated persistence, but it does not reduce all upstream fetch cost because pages are still fetched to discover current resources.

Verdict: `keep`

### 6. Browser-assisted fallback

Browser escalation is guarded by `shouldAttemptBrowserAssistedDiscovery(...)`:

- only if `browserFallbackEnabled=true`;
- immediately when a challenge hint exists;
- or when static discovery found nothing;
- or for JS-heavy pages with very low static yield ([services/fetchers/src/web-ingestion.ts](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/web-ingestion.ts):884-902).

This matches the right architecture for public-site scraping.

Strengths:

- browser use is additive, not default;
- request interception reuses same-origin auth logic instead of global browser headers;
- provenance is preserved in raw signals;
- unsupported login/captcha/challenge states fail explicitly instead of silently degrading to `no_change`.

Proof-backed behavior:

- `hard-sites:compose` proved the hard site yields useful resources only after browser assistance;
- the same smoke proved explicit `captcha` failure on the blocked site;
- unit coverage proved cross-origin auth leakage is blocked.

Main weakness:

- the browser trigger heuristic is intentionally simple and may miss cases where static discovery returns a small but incomplete set; it is safe, but not deeply optimized.

Verdict: `keep`, but `measure more`

### 7. Auth and challenge handling

Auth injection is handled through:

- `buildWebsiteRequestHeaders(...)` for direct requests;
- `buildBrowserRouteHeaders(...)` for browser-routed requests ([services/fetchers/src/web-ingestion.ts](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/web-ingestion.ts):962-997).

The logic is correctly scoped:

- same-origin requests receive the header;
- cross-origin assets do not;
- login/captcha/cloudflare-like blocks are classified and treated as unsupported.

This is one of the strongest parts of the subsystem.

Verdict: `keep`

### 8. Resource enrichment and editorial projection

After discovery, `ResourceEnrichmentService.extractResource(...)` fetches the resource URL, classifies the resolved kind, and then:

- keeps files/documents in the resource lane;
- extracts summary/links/attributes for listing/entity/document kinds;
- applies full article extraction only for resolved `editorial` resources;
- projects editorial resources into `articles` ([services/fetchers/src/resource-enrichment.ts](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/resource-enrichment.ts):460-720).

Proof-backed behavior:

- `website:compose` proved editorial resources project into `articles`, while entity/document rows stay resource-only;
- `enrichment:compose` proved conservative skip/fail behavior on the article-style enrichment path.

This boundary is correct:

- acquisition finds candidate resources;
- enrichment decides what each resource actually is;
- article projection stays downstream of typed extraction.

Verdict: `keep`

## `@extractus/article-extractor` Scope Decision

### Current usage

`@extractus/article-extractor` is already used in the website path, but only inside resource enrichment for resources that have already resolved to `editorial` ([services/fetchers/src/resource-enrichment.ts](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/resource-enrichment.ts):573-627).

It is not used:

- during website acquisition/discovery;
- for listing/entity/document resources;
- as a blanket fetch-time parser for every discovered HTML page.

### Important current tradeoff

The current editorial enrichment path already introduces duplicate-fetch risk:

1. the resource HTML page is fetched once by `extractResource(...)`;
2. editorial resources then call `extractArticle(finalUrl, ...)`, which performs another fetch against the same page.

That means the current placement is sensible in terms of semantic boundary, but not free in terms of cost.

### Decision

Do **not** expand `article-extractor` further into the website acquisition stage right now.

Do **not** apply it blanket-style to all HTML website resources.

Keep it scoped to post-discovery editorial enrichment only.

Reasoning:

- acquisition should stay cheap and generic; pulling full article extraction into discovery would blur crawling and extraction concerns;
- blanket use on all HTML pages would raise cost sharply for listing/entity/document pages with low incremental value;
- the current website path already uses `article-extractor` at the highest-value point: after resource typing and before editorial projection;
- the existing placement already carries some duplicate-fetch overhead, so broadening it before measuring current uplift would move in the wrong direction.

### Best next move

If future optimization is needed, the next experiment should be **not** “use more `article-extractor` everywhere”, but one of these narrower options:

- reuse already-fetched HTML when possible instead of refetching the editorial page;
- add observability for body uplift and extraction hit rate by `resource_kind`;
- if cost becomes visible, gate editorial extraction behind a threshold similar to the RSS article-enrichment skip model.

Verdict: `leave as is` for scope, `harden` the observability/cost model, and consider fetch reuse before any expansion

## Scorecard

| Area | Verdict | Notes |
| --- | --- | --- |
| Cheap/static discovery | Keep | Strong multi-mode pipeline; proof-backed; bounded and generic. |
| Browser-assisted fallback | Keep | Correct cheap-first architecture; green hard-site proof; heuristic can be better measured. |
| Auth/challenge discipline | Keep | Same-origin-only auth injection and explicit unsupported challenge handling are strong. |
| Resource classification heuristics | Harden | Works, but is the most brittle logic in the path. |
| Freshness/cursor gating | Keep | Practical and generic; avoids repeated persistence; upstream conditional GET is still missing. |
| Resource enrichment and projection | Keep | Boundaries are sound; editorial projection is downstream of typed extraction. |
| `article-extractor` scope | Keep as is | Already used at the right stage; do not broaden into discovery or all HTML resources. |

## External Comparison

### Cheap-first vs browser-first

[Crawlee BrowserCrawler docs](https://crawlee.dev/js/api/3.3/browser-crawler) explicitly recommend browser crawling only when the site requires JavaScript and note that raw-HTTP crawling is far cheaper and faster when JS is not needed. NewsPortal matches this principle well: static modes run first and browser fallback is opt-in plus bounded.

Verdict: aligned with best practice

### Browser request interception

[Playwright Route API](https://playwright.dev/docs/api/class-route) is the relevant external reference for per-request header overrides. NewsPortal’s `buildBrowserRouteHeaders(...)` follows the right pattern operationally by injecting auth only into same-origin requests and not by setting global browser headers.

Verdict: aligned and safer than many ad hoc browser scrapers

### Feed/link discovery on websites

[Trafilatura’s feed discovery logic](https://trafilatura.readthedocs.io/en/latest/_modules/trafilatura/feeds.html) uses homepage alternate links, fallback anchor scanning, and bounded heuristics to find feed URLs. NewsPortal’s website path is conceptually similar: it treats homepage feed hints as one cheap mode among others rather than as a separate provider boundary.

Verdict: aligned in approach, intentionally more bounded

### Robots handling

[Google’s robots.txt guidance](https://developers.google.com/search/docs/crawling-indexing/robots/intro) frames robots primarily as crawl-traffic management, not as a hiding/security mechanism. NewsPortal’s website path uses robots as crawl discipline and explicit access policy, which is the correct interpretation.

Verdict: aligned

### HTTP freshness and validator support

The HTTP specification in [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html) defines validators and conditional requests such as `ETag` and `If-Modified-Since`. The RSS path in this repo uses those validators, but the website path currently does not. This is the clearest gap between the current website implementation and a stronger low-cost scraping baseline.

Verdict: gap worth fixing

## Recommendations

### P0: Keep the current website architecture

Do not replace the current cheap-first + bounded-browser design.

Reason:

- all website-only proof lanes are green;
- ownership boundaries are clear;
- the system already follows the right high-level scraping architecture.

### P1: Add upstream conditional request support to the website path

Candidate scope:

- homepage fetches;
- sitemap fetches;
- feed-hint fetches inside the website boundary;
- possibly resource enrichment fetches where validators are available.

Expected win:

- lower origin load;
- cheaper repeat polling;
- better latency on stable sites.

### P1: Improve observability before changing browser heuristics

Add runtime metrics for:

- static-only discovered resource count;
- browser-assisted incremental yield;
- browser-assisted challenge rate;
- projected editorial yield by discovery mode.

Reason:

- the current browser trigger heuristic is safe, but not deeply measured;
- the proof lane is green, but the production decision threshold is still qualitative.

### P1: Do not broaden `article-extractor`; optimize current usage first

Preferred next step:

- measure how often editorial enrichment materially improves body/summary/media over the already fetched HTML;
- if needed, reduce duplicate-fetch cost by reusing fetched HTML or by adding skip thresholds.

Reason:

- expanding `article-extractor` earlier would increase cost faster than it would increase useful signal.

### P2: Harden classification without turning it into provider-specific code

Focus on:

- richer structured-data signals;
- better confidence logging;
- clearer false-positive/false-negative diagnostics per `resource_kind`.

Reason:

- classification is the weakest part of the current subsystem, but still not weak enough to justify redesign before more telemetry exists.

## Final Verdict

The current website-ingestion subsystem is effective enough and structurally sound.

What is already good:

- cheap-first scraping;
- browser fallback kept bounded;
- strong auth/challenge discipline;
- clear separation between discovery, enrichment, and editorial projection;
- proof-backed runtime path.

What should change:

- add conditional-request support for website polling;
- improve browser-yield telemetry;
- optimize current `article-extractor` usage before expanding it.

What should not change right now:

- do not move `article-extractor` into acquisition/discovery;
- do not apply `article-extractor` blanket-style to all website HTML resources;
- do not replace the current website architecture with a browser-first or discovery-heavy model.

## Proof Gaps

- There is no dedicated metric pack yet for static-only yield vs browser-assisted incremental yield on a larger real-world portfolio; current confidence comes from deterministic local smokes plus code inspection.
- There is no explicit body-uplift report yet quantifying how much website editorial enrichment improves already fetched HTML across a representative corpus.
- The current worktree contains an in-flight delta in [services/fetchers/src/web-ingestion.ts](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/web-ingestion.ts) that improves login-gate detection and large-sitemap safety; that delta is positive, but it should still be treated as in-flight context until committed and re-proved as shipped truth.
