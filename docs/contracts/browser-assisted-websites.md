# Browser-assisted websites

Этот deep contract doc обязателен whenever work touches JS-heavy website polling, anti-bot handling, browser-assisted discovery, or discovery-time website probing.

## Purpose

Capability нужна для public или operator-authorized `website` sources, где cheap static discovery не видит реальные resource URLs без browser render или same-origin network activity.

v1 deliberately остается bounded:

- поддерживаются только public JS-heavy sites и soft anti-bot friction, которую normal headless Chromium проходит без специальных обходов;
- browser assistance остается additive fallback поверх cheap website modes, а не становится новым default ingest path;
- local deterministic proof считается canonical closeout proof; live internet sites не нужны.

## Ownership boundary

Browser runtime ownership живет только в `services/fetchers`.

Это означает:

- Playwright/Chromium dependency, launch, render, and network capture находятся в fetchers boundary;
- `services/workers` могут только вызывать fetchers-owned internal probe endpoint и не должны владеть browser automation напрямую;
- Astro apps, FastAPI maintenance handlers и Python worker adapters не должны добавлять свой browser stack для website probing;
- browser-assisted logic не должна silently migrate into generic discovery plugins, admin BFF handlers, or unrelated provider adapters.

## Supported and unsupported scope

Поддерживается:

- public website homepages и collection seeds;
- static per-channel `Authorization` header for website sources where authenticated fetcher requests are enough;
- rendered DOM link discovery;
- same-origin network capture for HTML, JSON-derived URLs, and bounded document/download URLs;
- operator-managed website channels и discovery-driven website candidates;
- provenance and challenge reporting for explicit unsupported blocks.

Не поддерживается:

- login-required flows;
- cookie/session replay or other interactive browser auth flows;
- CAPTCHA solving or manual challenge bypass;
- stealth scraping escalation, proxy rotation, or anti-detection tactics;
- cross-origin browser crawling as a discovery primitive;
- non-website providers.

## Discovery contract

Cheap modes остаются canonical first pass:

`sitemap -> feed -> collection -> inline_data -> download`

`browser_assisted` допускается только когда одновременно true одно из условий:

- website channel config explicitly allows it via `browserFallbackEnabled=true`; and
- cheap modes не вернули acceptable resources; or
- hard-site evidence already says browser help is recommended.

`maxBrowserFetchesPerPoll` caps the number of seed pages that browser assistance may open during one poll/probe.

Browser assistance не должна auto-convert `website` source into `rss`, even if hidden feed hints are discovered. Hidden feeds remain hints inside discovery/provenance state only.

## Authorization header contract

Optional fetcher-side source auth lives on the channel as:

- `source_channels.auth_config_json.authorizationHeader`

This v1 contract is intentionally bounded:

- operator enters the full raw `Authorization` header value;
- admin/API read models must not echo the secret back and may expose only safe summary like `has_authorization_header`;
- cheap/static website requests may attach the header only when the request origin matches the configured channel origin;
- browser-assisted polling must inject the header via same-origin request interception, not via global `extraHTTPHeaders` or other context-wide browser defaults;
- cross-origin assets, embeds, redirects, and discovered URLs must not receive the header.

## Probe contract

Fetchers owns the internal discovery probe endpoint:

- route: `POST /internal/discovery/websites/probe`
- request shape: `{ "urls": string[], "sampleCount"?: number }`
- response shape: `{ "probed_websites": DiscoveryWebsiteProbeResult[] }`

Each normalized probe result may include two hard-site-only additive fields:

- `browser_assisted_recommended`
- `challenge_kind`

`challenge_kind` is internal evidence, not a signal to bypass the challenge.

Known challenge classes in v1:

- `login`
- `captcha`
- `cloudflare_js_challenge`
- `unsupported_block`

## Persistence and provenance contract

Browser-assisted state must stay additive and must not require a new table in v1.

Allowed persistence surfaces:

- `source_channels.config_json` for non-secret website config
- `source_channels.auth_config_json` for static channel auth
- `web_resources.raw_payload_json` / `raw_signals`
- website cursor JSON `modes`

Required provenance fields for browser-discovered resources:

- `browserAssisted`
- `browserCaptureSource`
- `browserSeedUrl`
- `browserPageUrl`
- `browserJsHeavyHint`
- `browserChallengeKind`

Discovery registration may also persist additive hints in `config_json.discoveryHints`, including:

- `discoveredFeedUrls`
- `classification`
- `capabilities`
- `browserAssistedRecommended`
- `challengeKind`

When discovery recommends browser assistance for a website candidate, registration may materialize:

- `browserFallbackEnabled=true`
- `maxBrowserFetchesPerPoll=2`

The registered provider type must still remain `website`.

## Admin and observability contract

Operators must be able to distinguish cheap/static discovery from browser-assisted discovery on the existing website resource surfaces.

Current observability lane:

- `/admin/resources`
- `/admin/resources/[resourceId]`

Browser-assisted rows should render truthful provenance such as DOM vs network capture source and any recorded challenge hint.

## Failure contract

Unsupported hard blocks must fail explicitly.

Required v1 behavior:

- if browser probing or polling hits login/CAPTCHA/unsupported challenge evidence, record the explicit unsupported outcome;
- stop instead of silently retrying alternate bypass logic;
- surface the failure as a truthful hard failure rather than pretending the channel simply had `no_change`.

## Proof contract

Capability closeout requires deterministic local proof:

- `pnpm test:channel-auth:compose`
- `pnpm test:hard-sites:compose`
- `pnpm test:website:compose`
- `pnpm test:website:admin:compose`
- `pnpm test:discovery-enabled:compose`

`pnpm test:channel-auth:compose` must prove:

- protected RSS returns explicit auth-oriented `401/403` failure without the configured header;
- the same RSS source succeeds with the configured header and still treats `429` as `rate_limited`;
- protected website discovery succeeds only with the configured header;
- browser-assisted same-origin requests receive the header while cross-origin requests do not.

`pnpm test:hard-sites:compose` is the canonical bounded proof for this subsystem. It must prove:

- static probing misses the JS-heavy fixture;
- browser-assisted probing recommends browser help and surfaces browser provenance;
- a registered website channel with browser fallback enabled discovers/persists/enriches resources through the normal `web_resources` + `resource.ingest.requested` path;
- same-origin browser-assisted requests may use the configured `Authorization` header without leaking it to cross-origin assets or requests;
- unsupported challenges fail explicitly;
- no live internet target is required.
