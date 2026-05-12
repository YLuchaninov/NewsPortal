# Channel Adapter Gap And Source Alternatives

## Status

Partially implemented research capability. This document records the product gap for API-like and adapter-owned sources during discovery/onboarding tests. Do not clean up retained discovery evidence because this note is about product capability, not test data removal.

## Problem

Some high-signal sources are not RSS feeds or simple websites. Examples include Stack Exchange, GitHub, Product Hunt, ATS/job-board APIs, marketplace APIs, and other structured providers. Treating those URLs as RSS or generic website channels creates broken channels, misleading source-health evidence, and wasted discovery runs.

## Current Control

Current controls:

- API-like URLs should be classified as `api_mapping_required` and require explicit field mappings before onboarding.
- Provider-specific sources without a supported channel adapter should be recorded as `adapter_required`, `needs_config`, `unsupported`, `access_required`, or `monitor_only`, not promoted as fake RSS/website sources.
- RSS onboarding should require a feed-like URL or feed-probe evidence from the fetchers-owned probe contract.
- Website/root/page URLs should use `channels.alternatives.plan` to look for safe RSS alternatives before judging the source as low quality.
- Source priors can extend monitor/probation observation only. They must not influence article selection, ranking, escalation, web visibility, or selected counts.

## Experimental Adapter Layer

The research-stage adapter layer uses existing `source_channels.provider_type = "api"` with `config_json.api.adapterKey` rather than adding a new provider type. It is intentionally split from final selection:

- `discovery.source_roles.plan` and `discovery.source_roles.coverage` show whether the funnel covers thematic source roles such as project marketplaces, ATS job boards, remote job boards, community search, forum/support, procurement, closed professional networks, and indirect aggregators.
- `discovery.adapter_research.plan/start/list/explain` records official/public, research-only, closed-access, or unsupported acquisition paths as discovery endpoint evidence.
- `discovery.indirect_targets.plan/start` records bounded search/news/site-query lanes for closed or API-gapped platforms.
- `discovery.indirect_targets.channels.plan` materializes selected detect-only indirect targets into `channels.bulk_onboard`-ready API search-channel rows. It is read-only; channel creation still goes through `channels.bulk_onboard.plan -> apply -> verify`.
- API adapter metadata such as `adapterKey`, `researchMode`, `tosRisk`, `sourceRole`, and `requiresProductionReplacement` is acquisition evidence only. It must not select, rank, escalate, or publish content.

Initial supported adapter keys include official/public `hn_algolia_search`, `github_issues_search`, `stack_exchange_search`, `greenhouse_job_board`, `lever_postings`, `ashby_job_postings`, `remotive_jobs`, `remoteok_jobs`, `weworkremotely_rss`, `searxng_search`, `brave_search`, `tavily_search`, `exa_search`, `discourse_search`, plus research-only public-page/search candidates for project marketplaces and closed platforms. `ddgs_search` is available as a fetchers-direct local research adapter; it is not production-certified direct coverage. Research-only candidates are for product-flow proof and require a production replacement before certification.

Indirect search execution is its own acquisition lane. DDGS can be used as the default fetchers-direct local research adapter; SearXNG is the preferred self-hosted search option when a base URL is configured; Brave/Tavily/Exa require provider keys; SerpAPI Google News remains research-only/high-risk and requires explicit opt-in. Search-result metadata such as provider, rank, source role, and directCoverage must not select, rank, escalate, or publish content.

Marketplace and forum adapters should extract project/detail evidence, not category/navigation volume. Adapter extraction must reject login/profile/filter/search/listing-wrapper links and preserve project fields such as title, description/scope, budget hints, posted date, tags/category, and buyer/location hints when available. Use `operator.report.verify reportKind=marketplace_extraction_quality` before treating marketplace/forum acquisition as a selection bottleneck.

## Alternative Finder Stage

The alternative finder uses the existing fetchers feed probe as the canonical RSS autodiscovery path:

1. Safely fetch/probe the candidate URL through fetchers URL guard behavior.
2. Use the existing probe contract to inspect HTML alternate links and validate RSS/Atom/JSON Feed candidates.
3. Return valid feeds as candidates for `channels.bulk_onboard.plan`.
4. If feed autodiscovery finds nothing, suggest bounded well-known feed paths and source-replacement discovery runs.

The alternative finder does not create channels. Candidates still pass through `channels.bulk_onboard.plan -> channels.bulk_onboard.apply -> channels.bulk_onboard.verify`.

## Remaining Adapter Implementation Plan

Before production certification, define one adapter contract per provider family:

- Search/list endpoint contract and pagination/rate-limit behavior.
- Auth and provider-rule requirements.
- Item normalization shape and stable external IDs.
- Error taxonomy and provider health reporting.
- MCP/admin configuration fields.
- Replay fixtures and cost/yield metrics.

## Risk

Without adapters, discovery can find source ideas that are genuinely relevant but not onboardable through existing channel types. The system should surface that as an adapter/configuration gap, not as proof that the source or domain is bad.
