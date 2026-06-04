# AIDP Work State

## Active Item

- id: `NEWSPORTAL-DISCOVERY-VNEXT-COMPLETION-2`
- lifecycle: `normal`
- route: `capability`
- route phase: `discovery-vnext-system-scope-resolution-completion`
- status: `active`
- risk: `medium`
- approval: approved by operator request on 2026-05-31 to implement the Discovery vNext Completion Plan from `docs/discovery_vnext_completion_blueprint.md`.
- planning required: yes
- planning source: `external-spec` + `tool-native`
- planning status: `accepted-for-this-item`
- accepted plan: `docs/discovery_vnext_completion_blueprint.md`, the operator-provided implementation plan on 2026-05-31, the tool-native `Discovery vNext Blueprint Completion Plan` accepted by operator request on 2026-05-31, `docs/next step/discovery_vnext_system_completion_plan.md`, the operator-requested `Discovery vNext System Completion Implementation Plan` accepted for implementation on 2026-06-03, the operator-requested `Plan implementation points 1-4 without destructive maintenance` accepted for implementation on 2026-06-03, and `docs/discovery_vnext_p0_p1_plan.md` plus the operator-requested `Discovery vNext P0-P1 Implementation Plan` accepted for implementation on 2026-06-03.

## Scope

Implement Discovery vNext completion as a universal, domain-neutral, zero-shot source sensor mesh for arbitrary system interests.

In scope:

- add `inventory_context` routing and inventory state support;
- extend Discovery vNext contracts, artifact validators and runtime schemas for SourceUnderstanding v2, RoutingDecision v2 and QueryQuality v2;
- improve deterministic `SourceUnderstanding` role/freshness/production-mode classification and per-signal capability scoring;
- enrich probe reports with generic page/source role hints and enforce valid RSS probe evidence before RSS channel handoff;
- update routing and probation handoff gates so high-risk, invalid-provider, context-only and non-public sources cannot silently become channels;
- complete `run_kind=full` orchestration through candidate selection, probe, understanding, routing, inventory update and optional handoff;
- improve MegaLoop and QueryQuality deterministic fallback behavior without adding domain hardcode;
- update MCP/admin surfaces and tests needed to prove the completed behavior.
- complete the remaining blueprint acceptance gaps: artifact lineage, MegaLoop memory wiring, policy-driven full-run candidate selection, QueryQuality persistence/feedback, deterministic eval suite, MCP aliases, admin manual review/policy surfaces and hard proof gates.
- complete follow-up proof/closure items 1-4: final diff review and commit, deterministic MCP proof for scope tools, admin source-inventory visual/action smoke, and safe PDF/document extraction in fetchers.
- calibrate the outsourcing client-signal funnel through MCP feedback/configuration and replay historical content with bounded `maintenance.reindex.request jobKind=backfill` chunks after the clean live verification exposed seller/service/SEO noise.
- complete P0-P1 Discovery vNext hardening from `docs/discovery_vnext_p0_p1_plan.md`: authoritative structural `SourceScopeResolution`, resolved-scope handoff, fail-visible full-run quality gates, individual hypothesis-aware probe caps, generic item-level conversion foundations, canonical `SourceUnderstanding` v2, coverage-policy MegaLoop, post-scope QueryQuality, bounded source-scope re-resolution, and operator verification gates.
- update `docs/product/architecture/nonstandard-technical-decisions.md` with repository-verified technical and business uniqueness details for the Discovery/source/selection/control-plane architecture.

Out of scope:

- reviving legacy graph/v3 discovery paths;
- adding domain-specific core enums or branches for outsourcing/procurement/job/security/etc.;
- using historical yield, selected-count or recent useful-hit telemetry as a keep/drop or auto-register input;
- bypassing login, CAPTCHA, browser challenge or provider policy boundaries;
- automatically creating production adapters without operator review.
- destructive delete for source/channel maintenance; P1.4 re-resolution may automatically demote/pause reversible bad channel projections only when scope evidence proves forbidden projection types, with audit trail and rollback group.

Allowed paths:

- `.aidp/**`
- `docs/discovery_vnext_completion_blueprint.md`
- `docs/discovery_vnext_p0_p1_plan.md`
- `docs/product/architecture/nonstandard-technical-decisions.md`
- `packages/contracts/**`
- `database/migrations/**`
- `services/workers/**`
- `services/fetchers/**`
- `services/api/**`
- `services/mcp/**`
- `apps/admin/**`
- `packages/sdk/**`
- `packages/control-plane/**`
- `tests/**`
- `infra/scripts/**`
- `package.json`
- `pnpm-lock.yaml`

Dependency addition note:

- planned dependency: `pdfjs-dist@6.0.227` as an exact direct dependency of `@newsportal/fetchers`;
- runtime owner/surface: fetchers resource enrichment only, for PDF text extraction on already URL-guarded and robots-bounded `web_resources`;
- license/advisory evidence checked on 2026-06-03: npm metadata reports `Apache-2.0`, exact version `6.0.227`, integrity `sha512-/P6M4SXw+70waMVLUM7rdRtvo+dEzqE1t6W/zQNvBETo2MaRa5rrvCcAYdfWGiUzadTgM0lJmRApUrW0d9zgKg==`, Node engine `>=22.13.0 || >=24`; Snyk package page reports latest/non-vulnerable `6.0.227` with no known security issues for latest; public search did not identify exact-version malware/compromise evidence for `pdfjs-dist@6.0.227`;
- rejected alternatives: `pdf-parse@2.4.5` because it pulls older `pdfjs-dist@5.4.296` plus native `@napi-rs/canvas`; `pdf2json@4.0.3` because it is not the primary PDF.js line; Python `pypdf` because workers do not own fetch/resource extraction boundary for this item.

Protected boundaries:

- PostgreSQL remains source of business truth; Redis/BullMQ/cache/HNSW/snapshots remain derived/runtime state.
- `source_inventory` is Discovery source truth; `source_channels` are optional operational projections created only after routing/handoff gates pass.
- Fetchers own RSS/website/resource probing semantics; Python workers may orchestrate but must not duplicate browser/website parsing ownership.
- Live provider execution remains gated by `DISCOVERY_ENABLED`, credentials, active policies and explicit positive budget.
- MCP/admin/API writes must preserve permission, destructive confirmation and validation guardrails.

## Context Manifest

- `.aidp/blueprint.md`: Discovery acquisition, source/content pipeline, system selection vs personalization, MCP/control-plane and live-provider budget boundaries.
- `.aidp/engineering.md`: capability planning, secure-by-design, observability-as-contract, dependency/layering, god-module pressure and live-provider discipline.
- `.aidp/verification.md`: Discovery vNext proof, MCP/API/Admin proof, schema/artifact validation, routing/no-yield proof and migration smoke expectations.
- `.aidp/contracts/discovery-agent.md`
- `.aidp/contracts/feed-ingress-adapters.md`
- `.aidp/contracts/mcp-control-plane.md`
- `.aidp/contracts/test-access-and-fixtures.md`
- `docs/discovery_vnext_completion_blueprint.md`
- `packages/contracts/src/discovery-vnext.ts`
- `services/workers/app/discovery_vnext_*.py`
- `services/api/app/discovery_vnext_api.py`
- `services/mcp/src/tools/discovery/vnext-tools.ts`

## Implementation Expectations

- Preserve domain-neutral core vocabulary; examples and eval fixtures may contain domain terms only as input/expected labels.
- Do not solve routing quality by threshold-only tweaks; SourceUnderstanding must expose source role, artifact freshness and signal production mode.
- `zero useful signals observed` means no event observed yet, not weak source.
- Candidate URL guesses are advisory; provider type used for channel creation must be validated by probe evidence.
- Full run must not require pre-supplied `probePlan` or `sourceUnderstanding`.
- All persisted routing decisions must be explainable from SourceUnderstanding, policy, risk/access and probe evidence.

## Proof Gates

Required gates:

- targeted Python unit tests for SourceUnderstanding, routing, probe/handoff and full-run behavior;
- targeted TS contract/MCP tests for enum/schema/tool surface changes;
- migration/schema smoke or equivalent SQL/static proof if constraints change;
- `pnpm lint:ts`;
- `pnpm lint:py`;
- `pnpm typecheck`;
- targeted MCP/API/admin tests when touched;
- `git diff --check`.

Residual live-provider gaps must be recorded honestly if live provider credentials, Docker runtime or positive budget are unavailable.

## Current Proof Status

- passed locally on 2026-06-04 for `nonstandard-technical-decisions-doc-refresh`:
  - refreshed `docs/product/architecture/nonstandard-technical-decisions.md` after checking repository reality in `.aidp/blueprint.md`, `.aidp/contracts/discovery-agent.md`, `.aidp/contracts/content-analysis-and-gating.md`, `docs/product/architecture/product-blueprint.md`, Discovery vNext plans, and current source code around source scope resolution, routing, handoff, MCP tools, adapter backlog, PDF extraction and final selection;
  - added technical and business uniqueness detail for SourceScopeResolution, routing as policy, inventory/channel separation, adapter backlog, declarative adapters, PDF/document extraction, strict selected-content gates, universal domain-neutral MegaLoop, bounded live/replay discipline, live proof harnesses and operator feedback loops;
  - proof passed: `git diff --check -- .aidp/work.md docs/product/architecture/nonstandard-technical-decisions.md`.
- passed locally on 2026-06-04 for `close-discovery-live-verification-after-strict-rss`:
  - read-only diagnosis of the latest live-signal gap found a generic proof/runtime issue, not a domain tuning issue: the manual MCP live-signal harness path ran `probe -> understand -> routing` without the authoritative `SourceScopeResolution` boundary, leaving inventory rows with `sourceScopeType=unknown` and no scope artifact lineage;
  - fixed the generic MCP proof harnesses so both `infra/scripts/test-discovery-vnext-mcp-live-signal-flow.mjs` and `infra/scripts/test-discovery-vnext-mcp-live-gap-flow.mjs` call `discovery.scope.resolve_apply`, pass the resulting `SourceScopeResolution` into `discovery.understand.preview`, persist `sourceScopeResolutionArtifactId`, and route using the resolved source URL rather than the raw candidate URL;
  - live-signal proof after the harness fix ran with strict scope gates: artifact `/tmp/newsportal-discovery-vnext-mcp-live-signal-flow-98409141-73b7-436c-ae9d-10aea8333a71.json`; result remained `downstream_selection_gap`, but the run persisted `SourceScopeResolution` artifacts and correctly kept sampled item/detail/context/wrapper candidates in inventory, inventory_context or adapter_backlog instead of auto-registering unsafe channels;
  - wide live-gap proof passed: `DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS=500 pnpm test:discovery:vnext-mcp-live-gap-flow -- --skip-build`, artifact `/tmp/newsportal-discovery-vnext-mcp-live-gap-flow-155dd967-2196-4940-bded-c07aad863059.json`, with 5/5 packs producing candidates, 100 query attempts, SourceScopeResolution artifacts, and routed inventory outcomes without gaps;
  - MCP-only backfill replay completed after the wide live-gap run: job `7e78b48d-2f95-424f-9776-964b8f928859`, `jobKind=backfill`, `retroNotifications=skip`, processed 1281 articles, found 87108 criteria matches, and recorded 0 LLM review failures/timeouts; dashboard showed one weak/noisy selected row before adapter proof, confirming selected-content gates were still strict rather than forced open;
  - fixed a generic fetchers startup/runtime bug in PDF extraction: `pdfjs-dist` is now lazy-loaded after Node-safe DOMMatrix/ImageData/Path2D fallbacks are installed, avoiding the prior fetchers crash-loop from PDF.js top-level `DOMMatrix` access while keeping PDF extraction fetcher-owned and without adding native canvas or OCR dependencies;
  - item-level live proof passed after the fetchers fix: `DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS=250 node infra/scripts/run-ted-api-adapter-mcp-proof.mjs`, artifact `/tmp/newsportal-ted-api-adapter-mcp-proof-cc3511be-9c0b-4362-ae6c-4c962ad5278b.json`, with 5 dry-run official API items, 10 fetched articles, 1 selected visible content item, and `operator.report.verify selection` reporting `highQualityCount=1` and no weak/noise selected warning;
  - proof gates passed: `python3 -m py_compile services/workers/app/discovery_vnext_artifacts.py services/workers/app/discovery_vnext_scope_resolution.py services/workers/app/discovery_vnext_understanding.py services/workers/app/discovery_vnext_routing.py services/workers/app/discovery_vnext_candidates.py services/workers/app/discovery_vnext_megaloop.py services/workers/app/discovery_vnext_probe.py services/workers/app/discovery_vnext_handoff.py services/api/app/discovery_vnext_api.py`, `node --check infra/scripts/test-discovery-vnext-mcp-live-signal-flow.mjs`, `node --check infra/scripts/test-discovery-vnext-mcp-live-gap-flow.mjs`, `pnpm unit_tests:py -- tests/unit/python/test_discovery_vnext_foundation.py` (376/376), `pnpm unit_tests:ts -- tests/unit/ts/discovery-vnext-contracts.test.ts tests/unit/ts/mcp-control-plane.test.ts` (repo TS suite 417/417), `pnpm --filter @newsportal/fetchers typecheck`, `pnpm unit_tests:ts -- tests/unit/ts/resource-enrichment-website.test.ts tests/unit/ts/document-observations.test.ts` (repo TS suite 417/417), `pnpm lint:ts`, `pnpm lint:py`, `pnpm typecheck` (existing Astro hints only, no errors), `pnpm test:migrations:smoke`, `pnpm test:discovery:vnext-flow` with report `/tmp/newsportal-discovery-vnext-flow-dvf-e9850815-cf3.json`, and `pnpm test:mcp:http:discovery` with artifacts `/tmp/newsportal-mcp-http-deterministic-f5e614bc-c0ca-4b6a-bab5-787f9c220889.json` and `.md`;
  - conclusion: the full funnel is proven for at least one item-level official buyer signal through MCP/runtime paths; remaining zero-selected outcomes in broad source-discovery runs are quality/conversion outcomes, not evidence to weaken selected-content gates or add domain-specific core shortcuts.
- passed locally on 2026-06-03 for `strict-rss-source-gate`:
  - implemented domain-neutral productive RSS semantics: `validFeed` remains parseable feed metadata, while `productiveFeed` requires sample entries and is now required for RSS auto-register/probation handoff;
  - routing/handoff proof: parseable empty RSS feeds route away from channel creation and direct handoff returns `rss_feed_not_productive`; RSS handoff uses validated `feedFinalUrl` as the operational channel/feed URL when available;
  - harness proof: live-signal report now records channel provider, channel URL, fetch run adapter/status/count summaries, RSS downstream evidence via `articles.list`, and RSS zero-output as `rss_feed_not_productive`;
  - targeted proof passed: `python3 -m py_compile services/workers/app/discovery_vnext_probe.py services/workers/app/discovery_vnext_understanding.py services/workers/app/discovery_vnext_routing.py services/workers/app/discovery_vnext_handoff.py tests/unit/python/test_discovery_vnext_foundation.py`, `pnpm unit_tests:py -- tests/unit/python/test_discovery_vnext_foundation.py` (376/376), `node --check infra/scripts/test-discovery-vnext-mcp-live-signal-flow.mjs`, `pnpm lint:ts`, and `git diff --check` for touched files;
  - full rebuilt live MCP proof completed: `DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS=500 pnpm test:discovery:vnext-mcp-live-signal-flow`, artifacts `/tmp/newsportal-discovery-vnext-mcp-live-signal-flow-b499d52c-102b-4354-8cd1-12a876899f43.json` and `.md`; result still failed only on `downstream_selection_gap`, but RSS source readiness passed with 2 fetched content families, 10 explainable items, productive RSS fetch counts 20/20 and 10/10, and no empty-RSS downstream timeout gap;
  - DB read-back confirmed operational RSS channel URLs were validated feed URLs (`https://www.yazoul.net/advisory/rss.xml`, `https://www.regcompliancewatch.com/feed/`), not raw article/candidate URLs.
- passed locally on 2026-06-03 for `discovery-vnext-p0-p1-hardening`:
  - implementation scope closed: expanded `SourceScopeResolution` contract and deterministic structural resolver, resolved-scope routing/handoff gates, fail-visible full-run status/warning summary, individual hypothesis-aware candidate identity and probe caps, generic item-observation mapping helpers, canonical `SourceUnderstanding` v2 envelope, coverage-policy MegaLoop request support, post-scope QueryQuality categories, and bounded source-scope re-resolution with reversible pause/demote audit support and no delete path;
  - migration proof passed: `pnpm test:migrations:smoke` applied 63 migrations and verified Discovery constraints/indexes, including migration `0062_discovery_vnext_p0_p1_hardening.sql`;
  - targeted Python proof passed: `python3 -m py_compile services/workers/app/discovery_vnext_artifacts.py services/workers/app/discovery_vnext_scope_resolution.py services/workers/app/discovery_vnext_understanding.py services/workers/app/discovery_vnext_routing.py services/workers/app/discovery_vnext_candidates.py services/workers/app/discovery_vnext_megaloop.py services/api/app/discovery_vnext_api.py` and `pnpm unit_tests:py -- tests/unit/python/test_discovery_vnext_foundation.py` (373/373);
  - targeted TS/MCP/admin proof passed: `pnpm unit_tests:ts -- tests/unit/ts/discovery-vnext-contracts.test.ts tests/unit/ts/mcp-control-plane.test.ts tests/unit/ts/ingress-adapter-contracts.test.ts tests/unit/ts/discovery-admin.test.ts` (repo TS suite 417/417);
  - deterministic full-flow proof passed: `pnpm test:discovery:vnext-flow`, report `/tmp/newsportal-discovery-vnext-flow-dvf-fd9a94cd-43c.json`;
  - deterministic MCP discovery proof passed: `pnpm test:mcp:http:discovery`, JSON artifact `/tmp/newsportal-mcp-http-deterministic-847298de-2570-49b7-918c-47d7c3f75245.json`, Markdown report `/tmp/newsportal-mcp-http-deterministic-847298de-2570-49b7-918c-47d7c3f75245.md`;
  - final gates passed: `pnpm lint:ts`, `pnpm lint:py`, `pnpm typecheck` (existing Astro hints only, no errors), and `git diff --check`;
  - domain-neutrality sanity scan passed for modified core files: no outsourcing/Russia/China core branches or enums were introduced; domain terms remain only in existing tests/negative leakage fixtures and docs/operator evidence.
- passed locally on 2026-06-03 for `discovery-vnext-system-scope-resolution-completion`:
  - `python3 -m py_compile services/workers/app/discovery_vnext_artifacts.py services/workers/app/discovery_vnext_scope_resolution.py services/workers/app/discovery_vnext_understanding.py services/workers/app/discovery_vnext_routing.py services/workers/app/discovery_vnext_handoff.py services/workers/app/discovery_vnext_candidates.py services/workers/app/discovery_vnext_megaloop.py services/api/app/discovery_vnext_api.py services/api/app/routes/discovery_routes.py`;
  - `pnpm unit_tests:py -- tests/unit/python/test_discovery_vnext_foundation.py`;
  - `pnpm unit_tests:ts -- tests/unit/ts/discovery-vnext-contracts.test.ts tests/unit/ts/mcp-control-plane.test.ts tests/unit/ts/ingress-adapter-contracts.test.ts tests/unit/ts/discovery-admin.test.ts`;
  - `pnpm lint:ts`;
  - `pnpm lint:py`;
  - `pnpm typecheck` (completed with existing Astro hints, no errors);
  - `pnpm test:migrations:smoke`;
  - `pnpm test:discovery:vnext-flow`;
  - `git diff --check`.
- passed locally on 2026-06-03 for `plan-points-1-4-without-destructive-maintenance`:
  - implementation scope closed: final diff review, strict deterministic MCP proof for new Discovery scope tools, admin source-inventory visual/action smoke, and fetcher-owned PDF/document extraction with exact pinned `pdfjs-dist@6.0.227`;
  - destructive maintenance remains out of scope: no automatic pause/delete path was added to `source_inventory.resolve_scopes`; destructive rollback remains confirmation-gated through the existing `confirm=true` flow only;
  - PDF extraction constraints: no OCR dependency, no native canvas dependency, bounded bytes/pages/text/time, scanned/image-only PDFs are recorded as skipped/failed instead of hallucinated text, and extracted evidence is persisted as `resourceKind=document` with parser/version/metadata audit fields;
  - dependency/security proof passed: `pnpm check:dependency-compliance`, `pnpm check:supply-chain-inventory --json`, and `pnpm audit --prod`;
  - targeted PDF proof passed via `pnpm unit_tests:ts -- tests/unit/ts/resource-enrichment-website.test.ts tests/unit/ts/document-observations.test.ts` (repo script executed the TS unit suite, 417/417);
  - targeted MCP/admin proof passed via `pnpm unit_tests:ts -- tests/unit/ts/mcp-control-plane.test.ts tests/unit/ts/discovery-admin.test.ts` (repo script executed the TS unit suite, 417/417), `pnpm test:mcp:http:discovery`, and `pnpm test:mcp:compose --skip-build`;
  - deterministic MCP proof artifact: `/tmp/newsportal-mcp-http-deterministic-a0d12be7-0e22-4732-8176-8bd781e828d9.json`;
  - deterministic MCP proof report: `/tmp/newsportal-mcp-http-deterministic-a0d12be7-0e22-4732-8176-8bd781e828d9.md`;
  - full flow proof passed via `pnpm test:discovery:vnext-flow`, report `/tmp/newsportal-discovery-vnext-flow-dvf-55baf0c9-3c1.json`;
  - final gates passed: `python3 -m py_compile services/api/app/discovery_vnext_api.py services/workers/app/discovery_vnext_scope_resolution.py services/workers/app/discovery_vnext_understanding.py services/workers/app/discovery_vnext_routing.py`, `pnpm lint:ts`, `pnpm lint:py`, `pnpm typecheck`, `pnpm test:migrations:smoke`, and `git diff --check`.
- passed locally on 2026-05-31:
  - `python3 -m py_compile services/workers/app/discovery_vnext_understanding.py services/workers/app/discovery_vnext_routing.py services/workers/app/discovery_vnext_probe.py services/workers/app/discovery_vnext_candidates.py services/workers/app/discovery_vnext_megaloop.py services/api/app/discovery_vnext_api.py`;
  - `python3 -m py_compile services/api/app/discovery_vnext_api.py`;
  - `pnpm unit_tests:py -- tests/unit/python/test_discovery_vnext_foundation.py`;
  - `pnpm unit_tests:ts -- tests/unit/ts/discovery-vnext-contracts.test.ts tests/unit/ts/mcp-control-plane.test.ts tests/unit/ts/discovery-admin.test.ts`;
  - `pnpm lint:ts`;
  - `pnpm lint:py`;
  - `pnpm typecheck` (completed with existing Astro hints, no errors);
  - `pnpm test:migrations:smoke`;
  - `pnpm test:discovery:vnext-flow`;
  - `git diff --check`.
- full clean-slate live MCP outsourcing verification passed locally on 2026-05-31 after Discovery vNext completion changes:
  - preflight command: `pnpm test:discovery:vnext-mcp-outsourcing-verification:preflight -- --skip-build`;
  - preflight artifacts: `/tmp/newsportal-discovery-vnext-mcp-outsourcing-verification-c9250ade-457f-4dcc-97fa-ea7dbe4f8228.json`, `/tmp/newsportal-discovery-vnext-mcp-outsourcing-verification-c9250ade-457f-4dcc-97fa-ea7dbe4f8228.md`;
  - full command: `DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS=200 pnpm test:discovery:vnext-mcp-outsourcing-verification -- --poll-windows=15,45,90`;
  - full artifacts: `/tmp/newsportal-discovery-vnext-mcp-outsourcing-verification-d72bcd22-6dbf-4769-872b-2f13c08911ee.json`, `/tmp/newsportal-discovery-vnext-mcp-outsourcing-verification-d72bcd22-6dbf-4769-872b-2f13c08911ee.md`;
  - clean slate: executed via `pnpm dev:mvp:internal:down:volumes`, local Docker volumes `docker_pg_data` and `docker_redis_data` removed/recreated;
  - status: `passed`; gaps: none; MCP calls: 378;
  - criteria: product read-after-write true, 5 signal families with candidates/provider evidence, 5 routed/backlog sources, 3 families with fetched content, 12 explainable items, 2 quality iterations, 3 real polling observations;
  - polling observations: T+15 at `2026-05-31T09:45:45.881Z`, T+45 at `2026-05-31T10:15:46.369Z`, T+90 at `2026-05-31T11:00:46.765Z`;
  - scheduling: `sequence_gap_recorded`; no unambiguous MCP sequence plugin for recurring outsourcing signal monitoring was selected, so persistent observation remains on source-channel polling cadence.
- MCP-only outsourcing funnel calibration and bounded historical reindex passed locally on 2026-06-01:
  - main artifact: `/tmp/newsportal-outsourcing-calibration-reindex-902d2ef4-0d2d-4dae-b902-259812e68f7b.json`;
  - markdown report: `/tmp/newsportal-outsourcing-calibration-reindex-902d2ef4-0d2d-4dae-b902-259812e68f7b.md`;
  - feedback follow-up artifact: `/tmp/newsportal-outsourcing-calibration-feedback-followup-e8a4ed51-7886-4124-8576-bf238f3e5d7b.json`;
  - clean slate: not run for this calibration stage; existing clean live-run DB state from `d72bcd22-6dbf-4769-872b-2f13c08911ee` was retained intentionally;
  - MCP proof count: 103 calls/resources/RPC across main run and feedback follow-up;
  - MCP writes/read-back: 11 discovery feedback rows submitted, 5 system interests updated and read back, 2 `maintenance.reindex.request jobKind=backfill` chunks queued and completed;
  - reindex chunks: `weak_selected_seller_vendor_service_pages` job `b4f6a72c-215f-4ca7-b41f-20bba7ea6708` for 9 docIds, and `context_wrapper_portfolio_pages` job `85809dfa-fc2e-4a29-b328-ed7016d28cf8` for 16 docIds; both used `retroNotifications=skip`;
  - verification: `operator.selection.precision_audit`, `operator.report.verify` for `selection`, `selection_hold_quality`, `funnel_calibration`, and `operator.effect.verify` were run after bounded replay;
  - decision: `llm_templates.update` and system code fixes were deferred because repeated evidence supports feedback + `system_interests.update` calibration first; code changes are warranted only if later MCP evidence shows seller/vendor/wrapper SourceUnderstanding still routes to auto-register;
  - residual gap: MCP `articles.holds.list` returned no buyer/project/vendor-search hold bucket, so no `buyer_hold` replay chunk was queued in this pass.
- MCP tool gap closed on 2026-06-01:
  - added read-only `operator.selection.reindex_plan` to build bounded `weak_selected`, `buyer_hold`, and `context_only` docId buckets plus `maintenance.reindex.request` templates with `retroNotifications=skip`;
  - reason: the calibration run had enough primitive tools, but bucket planning for historical replay still required an external script;
  - proof: `pnpm unit_tests:ts -- mcp-control-plane` passed 408/408, `pnpm --filter @newsportal/mcp typecheck` passed, and `git diff --check -- .aidp/work.md services/mcp/src/tools.ts services/mcp/src/operating-intelligence.ts tests/unit/ts/mcp-control-plane.test.ts` passed.
- MCP full historical backfill reindex passed locally on 2026-06-02:
  - command path: scoped MCP token with `read,write.sequences`, then `maintenance.reindex.request`;
  - artifact: `/tmp/newsportal-mcp-backfill-reindex-7c2a1740-a22e-4b94-bf66-2e237a94c509.json`;
  - markdown report: `/tmp/newsportal-mcp-backfill-reindex-7c2a1740-a22e-4b94-bf66-2e237a94c509.md`;
  - reindex job: `a5c52fc0-67a4-4f8d-9950-466f0ff53369`;
  - status: `completed`; MCP calls: 11;
  - payload: `indexName=interest_centroids`, `jobKind=backfill`, `batchSize=100`, `replayExistingArticles=true`, `includeEnrichment=false`, `forceEnrichment=false`, `retroNotifications=skip`;
  - job read-back: processed 196 historical articles, criteria matches 980, LLM review failures/timeouts 0, retro notifications skipped;
  - verification: `operator.report.verify` for `selection` and `selection_hold_quality`, plus `operator.effect.verify domain=selection`;
  - runtime note: `operator.selection.reindex_plan` was not listed in the currently running MCP container, so this run used canonical `maintenance.reindex.request`; source code and tests for the missing planner already exist and require MCP container rebuild to expose at runtime.
- MCP runtime rebuild and planner verification passed locally on 2026-06-02:
  - command: `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml up -d --build mcp nginx`;
  - runtime artifact: `/tmp/newsportal-mcp-reindex-plan-verify-e27d0dce-e62a-4211-a089-7a4960c47c5a.json`;
  - runtime markdown report: `/tmp/newsportal-mcp-reindex-plan-verify-e27d0dce-e62a-4211-a089-7a4960c47c5a.md`;
  - `docker compose ps mcp nginx` showed both `docker-mcp-1` and `docker-nginx-1` healthy;
  - MCP `tools/list` exposed `operator.selection.reindex_plan` in a 220-tool surface;
  - `operator.selection.reindex_plan` read-only call passed and returned buckets `weak_selected=0`, `buyer_hold=0`, `context_only=0`, with `retroNotifications=skip` request template support;
  - interpretation: no bounded replay chunks are currently recommended after the full backfill, but the missing MCP planner tool is now available at runtime.
- Raw-article versus selected-signal count clarification implemented locally on 2026-06-02:
  - added API/SDK summary surface `/maintenance/articles/selection-summary` / `getArticleSelectionSummary` to distinguish raw `articles` observations from `final_selection_results` selected signals;
  - added read-only MCP tool `operator.selection.dashboard` so MCP operators can verify why a raw article total such as 185 can coexist with zero selected/public lead signals;
  - updated admin Articles triage to show global counters for article observations, selected article signals, visible content items, rejected rows, held/gray-zone rows and pending rows before page-local triage views;
  - proof: `pnpm unit_tests:py -- tests/unit/python/test_api_zero_shot_operator_surfaces.py tests/unit/python/test_api_sequence_management.py` passed 364/364;
  - proof: `pnpm unit_tests:ts -- mcp-control-plane` passed 409/409;
  - proof: `pnpm unit_tests:ts -- sdk-pagination` passed 410/410;
  - proof: `pnpm --filter @newsportal/mcp typecheck` passed;
  - proof: `pnpm --filter @newsportal/sdk typecheck` passed;
  - proof: `pnpm --filter @newsportal/admin typecheck` passed with 0 errors and existing Astro hints;
  - proof: `python3 -m py_compile services/api/app/article_list_read_model.py services/api/app/main.py services/api/app/routes/content_routes.py services/api/app/route_deps.py tests/unit/python/test_api_zero_shot_operator_surfaces.py tests/unit/python/test_api_sequence_management.py` passed;
  - proof: `git diff --check -- services/api/app/article_list_read_model.py services/api/app/main.py services/api/app/routes/content_routes.py services/api/app/route_deps.py packages/sdk/src/index.ts services/mcp/src/operating-intelligence.ts services/mcp/src/tools.ts apps/admin/src/pages/articles.astro tests/unit/python/test_api_zero_shot_operator_surfaces.py tests/unit/python/test_api_sequence_management.py tests/unit/ts/mcp-control-plane.test.ts tests/unit/ts/sdk-pagination.test.ts` passed.
  - runtime proof: `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml up -d --build api admin mcp nginx` completed and affected containers became healthy;
  - runtime proof: `curl -sS http://127.0.0.1:8000/maintenance/articles/selection-summary` returned `rawArticleObservations=196`, `selectedArticleSignals=0`, `rejectedRows=196`, proving the 185/196 display is raw corpus, not selected signal yield;
  - runtime proof: `curl -sS -I http://127.0.0.1:4322/articles` returned the expected admin auth redirect, `curl -sS http://127.0.0.1:4300/health` returned `{"service":"mcp","status":"ok"}`, and `docker exec docker-mcp-1 ... grep` confirmed `operator.selection.dashboard` is present in built MCP runtime.
- Public web selected-content bug fixed locally on 2026-06-02:
  - root cause: public web already used `/collections/system-selected`, but resource/listing rows entered that collection by active-interest content kind (`kind_enabled`) without a real `final_selection_results.is_selected=true` decision;
  - contract checked: `.aidp/contracts/content-model.md` and `.aidp/contracts/content-analysis-and-gating.md` define raw `articles`/resources as observations and `final_selection_results`/content items as the public selected surface;
  - fix: resource content items now require `web_resources.projected_article_id -> articles -> final_selection_results`, visible projected article, active kind, and `coalesce(fsr.is_selected, false)=true`; direct public `resource:*` detail uses the same selected gate;
  - guard fix: public content item ids are UUID-validated before DB access so invalid `editorial:*` ids return 404 instead of leaking a database cast error as 500;
  - proof: `pnpm unit_tests:py -- tests/unit/python/test_api_feed_dedup.py tests/unit/python/test_api_zero_shot_operator_surfaces.py tests/unit/python/test_api_sequence_management.py` passed 367/367;
  - proof: `python3 -m py_compile services/api/app/content_selection_read_model.py services/api/app/content_detail_read_model.py services/api/app/main.py tests/unit/python/test_api_feed_dedup.py tests/unit/python/test_api_zero_shot_operator_surfaces.py tests/unit/python/test_api_sequence_management.py` passed;
  - proof: `git diff --check -- services/api/app/content_selection_read_model.py services/api/app/content_detail_read_model.py services/api/app/main.py tests/unit/python/test_api_feed_dedup.py tests/unit/python/test_api_zero_shot_operator_surfaces.py tests/unit/python/test_api_sequence_management.py` passed;
  - runtime proof: `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml up -d --build api` completed and `curl -sS http://127.0.0.1:8000/health` returned `{"service":"api","status":"ok","checks":{"database":"ok"}}`;
  - runtime proof: `curl -sS 'http://127.0.0.1:8000/collections/system-selected?page=1&pageSize=3'` returned `total=0` with empty items, and `curl -sS http://127.0.0.1:4321/` rendered `0 content items in the system-selected collection` plus `No content yet`;
  - runtime proof: old public detail `curl -sS -i 'http://127.0.0.1:8000/content-items/resource%3A1260df1c-650f-4fdb-8ed5-df35d02d69cf'` returned 404, and invalid `editorial%3Adoc-does-not-exist` returned 404.
- MCP-only outsourcing buyer-signal rescue loops ran locally on 2026-06-02 against the current DB:
  - added reproducible runner `infra/scripts/run-outsourcing-buyer-signal-rescue.mjs`; product mutations inside the runner use MCP only, while bootstrap is limited to compose health/setup and scoped MCP token issuance;
  - first command: `DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS=250 node infra/scripts/run-outsourcing-buyer-signal-rescue.mjs --max-packs=5 --max-candidates=35 --max-probes=8 --selected-target=3`;
  - first artifacts: `/tmp/newsportal-outsourcing-buyer-signal-rescue-76590ab8-8b97-4124-b6b6-f0b0ac9b1a2a.json`, `/tmp/newsportal-outsourcing-buyer-signal-rescue-76590ab8-8b97-4124-b6b6-f0b0ac9b1a2a.md`;
  - first result: `needs_followup`, MCP calls `236`, selected signals `0/3`, source families with evidence `3`, routed/backlog `3`; hidden negative-first interests failed schema validation because `selection_profile_strictness=recall_first` is unsupported by MCP, then runner was fixed to keep negative-first semantics through negatives while using `balanced`;
  - second command: same command after runner fix;
  - second artifacts: `/tmp/newsportal-outsourcing-buyer-signal-rescue-19120168-4d80-4fab-9ca7-4f4822aa029b.json`, `/tmp/newsportal-outsourcing-buyer-signal-rescue-19120168-4d80-4fab-9ca7-4f4822aa029b.md`;
  - second result: `needs_followup`, MCP calls `374`, read-after-write true, selected signals `0/3`, source families with evidence `5`, routed/backlog `5`, reindex job `da0e83f4-3e08-40e8-9524-b825dcae255e` completed with `retroNotifications=skip`;
  - observed blocker after two loops: discovery/source recall exists, but fetched content is still source-context/directory/help/region pages and adapter backlog rather than item-level buyer/project/vendor-search records; public selected remains correctly `0`, so this is an acquisition-to-item/adapter/selection gap, not a web selected-count bug;
  - Codex heartbeat automation created: `outsourcing-mcp-buyer-signal-polish`, every 75 minutes, to continue MCP dashboard/residual/content inspection, feedback, bounded tuning and reindex without relaxing public selected semantics.
- MCP-created TED API adapter proof passed locally on 2026-06-02 and produced real public outsourcing buyer signals:
  - command: `DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS=250 node infra/scripts/run-ted-api-adapter-mcp-proof.mjs`;
  - artifact: `/tmp/newsportal-ted-api-adapter-mcp-proof-22c962e2-f7e2-47c0-b384-0705cb7da12c.json`;
  - markdown report: `/tmp/newsportal-ted-api-adapter-mcp-proof-22c962e2-f7e2-47c0-b384-0705cb7da12c.md`;
  - status: `passed`; MCP calls: `34`; dry-run TED API items: `5`; fetched articles: `10`; selected public content items: `5`; read-after-write proof: true;
  - MCP-created/updated adapter: `api.ted_eu_software_tender_search`;
  - MCP-created channel: `16aee162-9318-4fb2-a852-aa49dc651b8d`, bound through `ingress.bindings.set` with `selectionMode=mcp`;
  - MCP-created calibration interest: `f2ba3dfe-419a-475b-9292-637f7f376b5e`, `TED EU software procurement buyer signals [22c962e2]`;
  - bounded MCP backfill job: `034a43a3-e20d-4180-acfc-98608fce5735`, `jobKind=backfill`, `retroNotifications=skip`, completed before selection readback;
  - public user-facing proof: `curl -sS 'http://127.0.0.1:8000/collections/system-selected?page=1&pageSize=10'` returned `total=5`, and `curl -sS http://127.0.0.1:4321/` rendered `5 content items in the system-selected collection`;
  - selection dashboard after proof: raw article observations `326`, selected article signals `5`, visible content items `5`, rejected rows `307`, gray-zone rows `14`, pending rows `0`;
  - selected examples include item-level official buyer/project evidence from TED: Netherlands Rotterdam VRI software programming, Cyprus Department of Insolvency integrated system/IaaS implementation, Liechtenstein digital project leadership, Germany GTAI ECMS hosting/development/support, Norway real-time workplace availability system;
  - system fixes applied to support this proof: `places=["global"]` now behaves as worldwide wildcard instead of a literal place, and final selection can promote clean item-level `buyer_intent`/`project_intent` candidate-signal consensus to selected while preserving document-level technical vetoes for wrapper/directory/jobs/repo noise;
  - proof: `PYTHONPATH=. python3 -m unittest tests.unit.python.test_candidate_signal_text tests.unit.python.test_scoring tests.unit.python.test_worker_hard_filters tests.unit.python.test_final_selection` passed 56/56;
  - proof: `python3 -m py_compile services/workers/app/candidate_signal_text.py services/workers/app/scoring.py services/workers/app/final_selection.py tests/unit/python/test_candidate_signal_text.py tests/unit/python/test_scoring.py tests/unit/python/test_worker_hard_filters.py tests/unit/python/test_final_selection.py` passed;
  - proof: `node --check infra/scripts/run-ted-api-adapter-mcp-proof.mjs` passed and `git diff --check -- services/workers/app/scoring.py services/workers/app/final_selection.py tests/unit/python/test_scoring.py tests/unit/python/test_worker_hard_filters.py tests/unit/python/test_final_selection.py infra/scripts/run-ted-api-adapter-mcp-proof.mjs .aidp/work.md` passed before this `.aidp/work.md` sync;
  - residual risk: live Gemini criterion review rows still showed provider `HTTP Error 404: Not Found` in the article explain evidence, but deterministic item-level procurement evidence selected the items without pending LLM rows; LLM provider configuration should be checked separately so future quality-polishing loops can use LLM review instead of relying only on deterministic candidate-signal consensus.
- MCP discovery/web/API expansion for the outsourcing buyer-signal funnel continued locally on 2026-06-02:
  - World Bank official procurement API adapter proof added and run through MCP:
    - script: `infra/scripts/run-worldbank-procurement-mcp-proof.mjs`;
    - artifact: `/tmp/newsportal-worldbank-procurement-mcp-proof-40b62bb0-bbe8-46ad-854c-125455057e75.json`;
    - markdown report: `/tmp/newsportal-worldbank-procurement-mcp-proof-40b62bb0-bbe8-46ad-854c-125455057e75.md`;
    - result: `needs_selection_followup`; MCP-created channel `d9ae7114-ffd7-4372-85af-8b69afdda928`; MCP-created interest `58a36bb4-157e-4d08-b9fd-3bc87674b7c9`; reindex job `b5dcbcb0-9378-494e-b52d-efb22f1fc937`; 10 article observations, 0 channel-selected items, global selected remained 5;
    - follow-up tuning artifact: `/tmp/newsportal-worldbank-procurement-mcp-followup-c9f2be4e-36f3-4518-b798-ff1475e6ecae.json`;
    - follow-up markdown: `/tmp/newsportal-worldbank-procurement-mcp-followup-c9f2be4e-36f3-4518-b798-ff1475e6ecae.md`;
    - follow-up result: `needs_source_or_selection_followup`; MCP calls 26; read-after-write true; bounded reindex job `5d43fb55-8575-4f57-adad-55f7e25f6540` completed; World Bank channel selected stayed 0; `articles.feedback.submit`/`content_items.feedback.submit` remains an MCP tool gap for article-level useful/noise feedback.
  - generic API adapter runtime support expanded for item URL templates:
    - changed `ApiChannelConfig`/schema/declarative resolver/runtime to support `urlTemplate`;
    - proof: `pnpm unit_tests:ts -- ingress-adapter-contracts` passed, `node --check infra/scripts/run-worldbank-procurement-mcp-proof.mjs` passed, and `git diff --check` passed for the touched adapter/runtime/test/script files before this `.aidp/work.md` sync.
  - discovery expansion through MCP was rerun with additional web/API hypotheses:
    - added first-class web expansion packs to `infra/scripts/run-outsourcing-buyer-signal-rescue.mjs`: `official_open_contracting_web_apis`, `municipal_university_health_procurement`, and `project_ask_web_negative_first`;
    - fixed the rescue runner so `auto_register_probation` candidates go through `discovery.probation.handoff` and channel-specific `content_items.list`, instead of mixing global selected TED items into pack-level evidence;
    - corrected artifact: `/tmp/newsportal-outsourcing-buyer-signal-rescue-3137bd31-d908-489f-83e1-9ed2fa82a69a.json`;
    - corrected markdown report: `/tmp/newsportal-outsourcing-buyer-signal-rescue-3137bd31-d908-489f-83e1-9ed2fa82a69a.md`;
    - command: `DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS=300 node infra/scripts/run-outsourcing-buyer-signal-rescue.mjs --max-packs=3 --max-candidates=25 --max-probes=6 --selected-target=6`;
    - result: `needs_followup`; MCP calls 222; selected signals stayed `5/6`; 3/3 source families produced live candidates/provider evidence; 3/3 reached routed/backlog evidence; bounded reindex job `754aa8f0-b074-4301-b535-364fd676ba81` completed with `retroNotifications=skip`;
    - routed source evidence included probation channels for Orange County Procurement `448ed8c2-a35d-4f28-93c4-ac7eaaa626c0`, NYC PASSPort `7297280e-fb02-4107-b5e2-63c757abce56`, and FindRFP healthcare contracts `13d6615e-b06e-46be-bccd-131c7f35cffb`; Chicago procurement and multiple official/open-contracting surfaces landed in adapter backlog;
    - interpretation: discovery recall is now proven for web/API source families, but new routed web sources did not yet produce public selected item-level buyer/software signals; this is an acquisition-to-item/adapter/query-quality gap, not a public selected-content bug.
  - UK Contracts Finder official OCDS API adapter was added through MCP:
    - script: `infra/scripts/run-uk-contractsfinder-api-adapter-mcp-proof.mjs`;
    - successful ingestion artifact after URL dedupe fix: `/tmp/newsportal-uk-contractsfinder-mcp-proof-e17fd328-fb58-44f1-9acb-32d1487bf76d.json`;
    - markdown report: `/tmp/newsportal-uk-contractsfinder-mcp-proof-e17fd328-fb58-44f1-9acb-32d1487bf76d.md`;
    - result: `needs_selection_followup`; MCP calls 30; MCP-created channel `b73e3daf-60cf-45ab-96df-9404e439291d`; MCP-created interest `04125ae3-a3e3-444b-90b3-89fdb3c7ab0d`; bounded reindex job `003c9bbe-4f5e-4e4e-9b9d-893872330d5f` completed; 19 article observations; 0 channel-selected items; global selected remained 5;
    - residual evidence: early UK result was deduped to 1 article because the URL template used a fragment; the script now uses query-string `ocid` URLs so releases stay unique;
    - residual evidence: many current CPV 72000000 items are award/training/hardware/non-software records and are correctly rejected; a subsequent place-tuning rerun was blocked by provider throttling `429 Too Many Requests`, so the `places=["global"]` follow-up must wait for the endpoint rate-limit window or use a narrower official query/source;
    - residual adapter gap: current declarative path reader cannot extract OCDS array fields such as `tender.documents.0.url`; add numeric array path support or a first-document URL mapping before relying on Contracts Finder HTML/detail URLs.
- A fresh MCP-only discovery run with new outsourcing buyer-signal hypotheses completed locally on 2026-06-02:
  - added new negative-first/item-detail packs to `infra/scripts/run-outsourcing-buyer-signal-rescue.mjs`: `civic_case_management_permitting_rfp`, `erp_crm_migration_partner_procurement`, `website_portal_rebuild_official_rfp`, `healthcare_integration_patient_portal_rfp`, and `nonprofit_education_grant_digital_delivery`;
  - command: `DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS=400 node infra/scripts/run-outsourcing-buyer-signal-rescue.mjs --max-packs=5 --max-candidates=30 --max-probes=6 --selected-target=8`;
  - artifact: `/tmp/newsportal-outsourcing-buyer-signal-rescue-b6726b10-588d-4468-b45a-cd359489795d.json`;
  - markdown report: `/tmp/newsportal-outsourcing-buyer-signal-rescue-b6726b10-588d-4468-b45a-cd359489795d.md`;
  - result: `needs_followup`; MCP calls `346`; 5/5 new source families produced live candidates/provider evidence; 5/5 reached routing/backlog evidence; public selected stayed `5/8`;
  - reindex: bounded `maintenance.reindex.request jobKind=backfill` job `a0677299-8f1f-498e-a9fa-a35884968664` completed with `retroNotifications=skip`, processing 10 docIds;
  - public/MCP readback after the run: raw article observations increased `435 -> 569`, selected article signals stayed `5`, visible content items stayed `5`, rejected rows `544`, gray-zone rows `20`, pending rows `0`, source inventory `116`, adapter backlog `30`;
  - promising discovery candidates now include City of Selma bid detail, City of Monroe permitting PDF, City of Crestwood permitting/licensing software PDF, Durham Oracle ERP implementation partner PDF, OHR ERP RFP, Snoqualmie ERP implementation PDF, DCOE website redesign/CMS services, CoveredCA website redesign PDF, ISBH website redesign RFP, Owosso website redesign/hosting PDF, Lone Star EHR RFP, Hawaii HANDS attachment, Emergence Health EHR services PDF, BHCC LMS RFP, and MCCS LMS RFP;
  - routed/probation evidence included channels for City of Selma `71d94996-70b6-4fa3-bc23-571adfad9a55`, OHR ERP RFP `214e191c-6f51-491b-9e0f-0a7f2c098d9c`, ISBH website redesign `a2889c3e-e8e7-4713-8386-95997828890d`, CMS interoperability context `755c0ad3-9f24-469e-874b-b0487ebe7e66`, SAM.gov opportunities `395d9adb-d38c-401b-8e18-007c5461113d`, and Nonprofit Newsfeed RFP databases `87cfcc41-35c3-4668-8a06-71b22f3215ef`;
  - interpretation: the new hypotheses materially improved discovery recall and found more plausible buyer/project item URLs, but fetch/channel monitoring still collapses many sources into wrapper, directory, search, or context pages; current selection correctly rejects those rather than inflating public lead signals;
  - MCP `articles.explain` samples after the run showed `LGBTQIA+ Commission` rejected by `document_level_technical_filter` / `wrapper_directory_noise`, and `Find RFP Security & Safety Bids` rejected by `must_not:search`, despite project-intent candidate tiers; this supports adapter/source extraction work rather than relaxing selected-content semantics;
  - next actionable gap: build MCP-created/updated item extractors/adapters for specific high-signal PDF/API-style sources or add generic document/PDF item handling, then replay bounded backfill; do not count source homepages, category pages, paid aggregators, or context pages as selected signals.
- External review snapshot document was created on 2026-06-02:
  - path: `document/outsourcing-mcp-discovery-review.md`;
  - purpose: summarize all outsourcing buyer-signal hypotheses, system interests, found/probation channels, discovery flow, selected signals, adapter/source gaps, reindex evidence, and recommended next steps for external review;
  - proof: `git diff --check -- document/outsourcing-mcp-discovery-review.md` passed.
- External review evidence bundle was archived on 2026-06-03:
  - path: `document/newsportal-outsourcing-mcp-evidence-artifacts-2026-06-03.zip`;
  - contents: 11 `/tmp/newsportal-*` JSON/Markdown proof artifacts referenced by `document/outsourcing-mcp-discovery-review.md`;
  - archive verification: `unzip -l document/newsportal-outsourcing-mcp-evidence-artifacts-2026-06-03.zip` listed 11 files, uncompressed total `171171691` bytes;
  - archive size: `16M`;
  - sha256: `3aa9dd12ce731cc8fba390d5eecbbefc4fec8a8c8bb9e20751dadb75425d39fa`.

Implemented proof coverage includes SourceUnderstanding v2 schema/validation, context-only routing, invalid RSS handoff denial, stable provider-neutral source identity, deterministic full probe/understand/route orchestration, QueryQuality result-mix persistence, artifact lineage, MCP aliases, admin inventory/manual-review/policy surfaces, rollback safety and migration constraints.

## Cleanup Notes

- No generated `/tmp` evidence is required for the deterministic implementation stages.
- `pnpm test:discovery:vnext-flow` created/recreated local compose services and test database rows under isolated flow namespaces; the script performed namespace cleanup for fixture data and left the standard local compose stack running.

## Parked Previous Item

- id: `NEWSPORTAL-DISCOVERY-VNEXT-COMPLETION-1`
- lifecycle: `normal`
- route: `capability`
- status before parking: `done`
- reason parked: operator requested implementation of the broader Discovery vNext completion blueprint on 2026-05-31.
- last known proof status: live MCP outsourcing verification passed locally on 2026-05-30 with artifact `/tmp/newsportal-discovery-vnext-mcp-outsourcing-verification-7ce9dede-7012-4bb6-84be-17c43a095353.json`; see prior work state/history for full command details.

- id: `NEWSPORTAL-DOCS-VNEXT-PLUGIN-SYNC-1`
- lifecycle: `normal`
- route: `docs-operator`
- status before parking: `done`
- reason parked: operator requested implementation of live MCP outsourcing verification on 2026-05-30.
- last known proof status: docs/AIDP proof gates passed locally on 2026-05-30 for documentation sync.
