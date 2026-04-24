# Контракт browser-assisted websites

Этот contract обязателен, когда работа трогает JS-heavy website polling, browser-assisted discovery/probing, hard-site handling, website auth headers or browser provenance.

## Назначение

Browser assistance is a bounded fallback for public/operator-authorized `website` sources where cheap static discovery cannot see resources without render or same-origin network activity.

## Ownership boundary

- Browser runtime ownership lives only in `services/fetchers`.
- `services/workers` may call fetchers-owned internal probe endpoint but must not own browser automation.
- Astro, FastAPI and generic discovery plugins must not add parallel browser stacks.
- Browser-assisted logic must not migrate into unrelated provider adapters.

## Supported scope

- Public website homepages and collection seeds.
- Static per-channel `Authorization` header when authenticated fetcher requests are enough.
- Rendered DOM link discovery.
- Same-origin network capture for HTML/JSON-derived/document/download URLs.
- Operator-managed website channels and discovery candidates.
- Provenance and challenge reporting.

Unsupported without explicit new policy:

- Login-required flows.
- Cookie/session replay.
- CAPTCHA solving/manual challenge bypass.
- Stealth/proxy/anti-detection escalation.
- Cross-origin browser crawling as a primitive.
- Non-website providers.

## Discovery and auth rules

- Cheap modes (`sitemap -> feed -> collection -> inline_data -> download`) run first.
- Browser assistance requires explicit `browserFallbackEnabled=true`, cheap miss, or known hard-site recommendation.
- `maxBrowserFetchesPerPoll` bounds seed pages.
- Hidden feed hints do not auto-convert provider type from `website` to `rss`.
- `source_channels.auth_config_json.authorizationHeader` is secret; admin/API may expose only safe summaries.
- Browser auth header injection must be same-origin only and must not leak to cross-origin assets.

## Probe contract

Fetchers internal route:

- `POST /internal/discovery/websites/probe`
- request: `{ "urls": string[], "sampleCount"?: number }`
- response: `{ "probed_websites": DiscoveryWebsiteProbeResult[] }`

Challenge kinds such as `login`, `captcha`, `cloudflare_js_challenge`, `unsupported_block` are evidence to stop/report, not bypass.

## Persistence/provenance

Use additive existing surfaces: `source_channels.config_json`, `auth_config_json`, `crawl_policy_cache`, `channel_fetch_runs.provider_metrics_json`, `web_resources.classification_json`, `web_resources.attributes_json`, `web_resources.raw_payload_json`, and website cursor JSON.

Browser-discovered resources should record provenance such as `browserAssisted`, `browserCaptureSource`, `browserSeedUrl`, `browserPageUrl`, `browserJsHeavyHint`, and `browserChallengeKind`.

## Proof expectations

- `pnpm test:channel-auth:compose`
- `pnpm test:hard-sites:compose`
- `pnpm test:website:compose`
- `pnpm test:website:admin:compose`
- `pnpm test:discovery-enabled:compose`

Live real-site validation is supplemental only and cannot replace deterministic local proof.

## Update triggers

Update when browser ownership, probe shape, auth header handling, provenance fields, supported/unsupported hard-site policy, or proof contour changes.
