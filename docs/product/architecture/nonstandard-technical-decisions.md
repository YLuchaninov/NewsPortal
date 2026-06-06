# Nonstandard Technical Decisions

Last researched against repository reality: 2026-06-04.

This document explains the SignalOps decisions that are more opinionated than a default CRUD/news app. It is a research and orientation document, not a runtime contract. For agent/runtime truth use `.aidp/*`; for implementation truth use code, migrations and tests.

The framing is intentionally both technical and business-oriented:

- **Technical uniqueness** explains how the system is built differently.
- **Business meaning** explains why that difference matters commercially.
- **Implemented around** points to the code, migrations or contracts that make the claim checkable.

## 1. PostgreSQL Business Truth With Thin Queue Jobs

**Local decision:** PostgreSQL owns business state; Redis/BullMQ only transports thin jobs. Workers reload authoritative state from PostgreSQL instead of trusting queue payloads.

**Technical uniqueness:** the async system is not treated as a hidden second database. Queue messages are triggers, while content, source, selection, sequence, Discovery and audit truth remains queryable and replayable in PostgreSQL.

**Business meaning:** operators can explain and recover the product after failures. This matters for a content intelligence product because customers will not trust a lead/feed/signal if the system cannot show where it came from, why it was selected, and how to replay it.

**Implemented around:** `outbox_events`, `services/relay`, `q.sequence`, worker processors, `.aidp/blueprint.md`.

**Tradeoff:** more database reads and schema discipline; much clearer recovery, audit and proof.

**Comparable approaches:** Temporal separates orchestration state from worker processes and describes Workers as external pollers of Task Queues; Debezium records connector offsets/schema history so change capture can resume after restarts. See [Temporal Workers](https://docs.temporal.io/workers), [Temporal worker performance](https://docs.temporal.io/develop/worker-performance), and [Debezium state storage](https://debezium.io/documentation/reference/3.2/configuration/storage.html).

## 2. Sequence Runtime With Registered Task Plugins

**Local decision:** long workflows run as sequence definitions and task runs, but executable behavior comes from registered `TaskPlugin` classes with options/context/output contract metadata.

**Technical uniqueness:** operators can configure and inspect multi-step workflows, but cannot upload arbitrary runtime code through admin or MCP. Executable steps are deployed code with explicit contracts.

**Business meaning:** this supports enterprise-style automation without turning the product into an unsafe script runner. It lets the system schedule repeatable monitoring, reindexing, enrichment and reporting while keeping support/debugging realistic.

**Implemented around:** `services/workers/app/task_engine/**`, `services/api/app/sequence_*`, `services/mcp/src/tools/sequences-tools.ts`, `docs/product/operator/mcp/README.md`.

**Tradeoff:** adding new executable behavior still requires code deployment; in exchange, plugin contracts are typed, testable and discoverable.

**Comparable approaches:** Airflow plugins extend a deployed runtime through registered plugin classes; Argo Workflows exposes DAG/step workflow composition. See [Airflow Plugins](https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/plugins.html) and [Argo Workflows](https://argoproj.github.io/workflows/).

## 3. MCP As Operator Control Plane, Not Just API Wrapper

**Local decision:** MCP exposes tools, resources and prompts with instructions, schemas, token scopes, strict payload validation, read-after-write guidance and `operator.report.verify`.

**Technical uniqueness:** MCP is treated as an operational interface with proof obligations. Tools reject malformed writes early, resources explain how to operate safely, and verification tools force DB-backed readback instead of trusting mutation responses.

**Business meaning:** this turns an LLM/MCP client into a controlled operator surface. The product can be run from an agent without giving the agent unbounded database or admin power, and without relying on chat memory as proof.

**Implemented around:** `services/mcp/src/main.ts`, `services/mcp/src/tools.ts`, `services/mcp/src/resources.ts`, `services/mcp/src/prompts.ts`, `services/mcp/src/tools/discovery/vnext-tools.ts`, `services/mcp/src/tools/sequences-tools.ts`, `packages/contracts/src/mcp-schemas.ts`, `docs/product/operator/mcp/**`.

**Tradeoff:** more MCP-specific documentation and tests; better behavior for tool-only clients and safer remote operation.

**Comparable approaches:** MCP itself defines separate server capabilities for tools, resources and prompts. See [MCP Tools](https://modelcontextprotocol.io/specification/draft/server/tools), [MCP Resources](https://modelcontextprotocol.io/specification/draft/server/resources), and [MCP Prompts](https://modelcontextprotocol.io/specification/draft/server/prompts).

## 4. Discovery vNext As Typed Source Acquisition, Not Auto-Crawling

**Local decision:** Discovery produces typed artifacts: `DiscoveryBrief`, `HypothesisBatch`, `ProbeReport`, `SourceScopeResolution`, `SourceUnderstanding`, `RoutingDecision`, inventory, adapter backlog, feedback, replay and rollback. Promotion is policy-gated and probation handoff goes through existing source/outbox paths.

**Technical uniqueness:** Discovery is an evidence pipeline, not a crawler. Every important transition is represented as a typed artifact with lineage and validation. Search results are treated as evidence, not as source identity.

**Business meaning:** the product can search widely for unusual source families without polluting the customer-facing feed. This is crucial for "hidden signal" use cases: the system can explore aggressively while only publishing signals that pass downstream gates.

**Implemented around:** `docs/discovery_vnext_blueprint.md`, `.aidp/contracts/discovery-agent.md`, `services/api/app/discovery_vnext_api.py`, `services/workers/app/discovery_vnext_*.py`, `services/mcp/src/tools/discovery/vnext-tools.ts`, migrations `0056`-`0062`.

**Tradeoff:** more intermediate records and review steps; much better explainability, rollback and budget control.

**Comparable approaches:** LangGraph human-in-the-loop interrupts persist state and pause for external decisions; Temporal keeps workflow progress durable while workers execute code externally. See [LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts), [LangChain human-in-the-loop](https://docs.langchain.com/oss/python/langchain/human-in-the-loop), and [Temporal Workers](https://docs.temporal.io/workers).

## 5. SourceScopeResolution Between Candidate URL And Monitorable Source

**Local decision:** a discovered URL must pass through `SourceScopeResolution` before `SourceUnderstanding`, routing, source inventory or channel creation. The resolver separates `candidateUrl`, `seedItemUrl`, `resolvedSourceUrl`, `sourceScopeType` and `monitoringEntryUrls`.

**Technical uniqueness:** the system explicitly models the difference between "the page search found" and "the source scope worth monitoring." It can classify `feed`, `api_endpoint`, `listing_page`, `section`, `document_collection`, `single_item`, `context_page`, `blocked_or_unusable` and `unknown` without domain-specific enums.

**Business meaning:** this prevents expensive false positives. A random RFP detail page, vendor service page, PDF or search wrapper is not accidentally turned into a recurring source. The business gets a cleaner source graph and fewer noisy channels to support.

**Implemented around:** `services/workers/app/discovery_vnext_scope_resolution.py`, `services/workers/app/discovery_vnext_understanding.py`, `services/workers/app/discovery_vnext_routing.py`, `services/api/app/discovery_vnext_api.py`, `packages/contracts/src/discovery-vnext.ts`, migration `0061_discovery_vnext_source_scope_resolution.sql`, migration `0062_discovery_vnext_p0_p1_hardening.sql`.

**Key mechanics:**

- URL normalization removes trackers/fragments and can use canonical-link evidence.
- Multiple scope candidates are generated and scored.
- Date bucket parents are not accepted unless listing/archive evidence exists.
- PDFs/documents do not become ordinary website channels.
- Static guide/service/about/vendor pages become context unless recurring evidence exists.

**Tradeoff:** source acquisition becomes slower and more opinionated; channel creation becomes much safer.

## 6. Routing Is A Policy Decision About Next Action, Not A Relevance Score

**Local decision:** `RoutingDecision` decides the next safe action: `auto_register_probation`, `cheap_watch`, `inventory`, `inventory_context`, `adapter_backlog`, `manual_review`, `blocked` or lower-priority inventory. It does not treat high topical relevance as permission to create a channel.

**Technical uniqueness:** routing combines source scope, source voice, freshness, signal production mode, provider validation, access pattern, risk and active policy. Hard gates override score.

**Business meaning:** this protects product quality. The system can retain a promising source without presenting it as a lead, can send unsupported sources to adapter backlog, and can prevent vendor/context/single-item pages from leaking into customer-facing selected content.

**Implemented around:** `services/workers/app/discovery_vnext_routing.py`, `services/workers/app/discovery_vnext_handoff.py`, `services/api/app/discovery_vnext_api.py`, `tests/unit/python/test_discovery_vnext_foundation.py`.

**Key gates:**

- `single_item` and `context_page` cannot auto-register as channels.
- `api_endpoint` goes to adapter backlog unless an adapter path exists.
- `document_collection` goes to parser/document adapter backlog unless supported.
- RSS auto-register requires `productiveFeed=true`, not only parseable feed metadata.
- `blocked_or_unusable` cannot enter ordinary monitoring.

**Tradeoff:** selected counts can stay low even when discovery found many candidates; the returned signals are more trustworthy.

## 7. Source Inventory As Primary Truth, Channels As Operational Projection

**Local decision:** `source_inventory` is the durable truth for discovered source scopes. `source_channels` are optional operational projections created only when routing and handoff gates allow monitoring.

**Technical uniqueness:** discovery can remember, explain and re-resolve sources without creating active polling channels. Inventory, context and adapter backlog are first-class outcomes, not failures.

**Business meaning:** this gives the product a compounding source-intelligence asset. Even when a source cannot yet produce selected items, the system can remember why it matters, what adapter is missing, and how it relates to past discovery runs.

**Implemented around:** `source_inventory`, `source_observations`, `adapter_backlog`, `source_channels`, `services/api/app/discovery_vnext_api.py`, `services/mcp/src/tools/discovery/vnext-tools.ts`.

**Tradeoff:** operators must understand multiple intermediate states; the system avoids hiding uncertainty behind fake channels.

## 8. Adapter Backlog As Product Roadmap, Not Error Bucket

**Local decision:** unsupported API, document collection, list-detail, search endpoint, auth-required or parser-required sources go to `adapter_backlog` with evidence and lineage.

**Technical uniqueness:** the product captures conversion gaps as structured work, not as logs. The backlog sits between source discovery and item-level ingestion.

**Business meaning:** this turns live market/source exploration into an implementation roadmap. If many valuable sources require the same adapter class, the business can prioritize that adapter with evidence instead of guessing.

**Implemented around:** `adapter_backlog`, `services/api/app/discovery_vnext_api.py`, `services/workers/app/discovery_vnext_routing.py`, `services/mcp/src/operating-intelligence.ts`, `services/mcp/src/tools/discovery/vnext-tools.ts`.

**Tradeoff:** discovery can honestly report "partially proven" instead of pretending every found source is ready to monetize.

## 9. Declarative Ingress Adapters With Sticky Channel Binding

**Local decision:** adapter identity is centralized in `ingress_adapter_catalog`, and each channel can have a sticky `source_channel_adapter_binding`. Legacy RSS/API JSON hints are diagnostics, not current runtime selection.

**Technical uniqueness:** adapter selection is explicit and durable. Declarative API mappings support bounded JSON/NDJSON, numeric array paths, helper fields and dry-run preview, but do not allow uploaded code, JS/WASM execution or secret-bearing config.

**Business meaning:** new source families can be onboarded faster without turning every source into a custom code project. At the same time, runtime safety remains high enough for operator-managed acquisition.

**Implemented around:** `database/migrations/0055_ingress_adapter_catalog.sql`, `packages/contracts/src/ingress-adapters.ts`, `packages/control-plane/src/ingress-adapter-bindings.ts`, `services/fetchers/src/ingress-adapters/**`, `services/fetchers/src/ingress-adapters/declarative-api-runtime.ts`, `services/mcp/src/tools/ingress-adapters-tools.ts`, `/admin/ingress-adapters`.

**Tradeoff:** migration and UI complexity; clearer adapter identity, safer declarative adapters and better legacy fallback reporting.

**Comparable approaches:** Airbyte and Singer/Meltano separate connector definitions from runtime pipeline composition; Debezium standardizes source connector event shapes. See [Airbyte documentation](https://docs.airbyte.com/), [Singer spec via Meltano Hub](https://hub.meltano.com/singer/spec), [Meltano plugin concepts](https://docs.meltano.com/concepts/plugins/), and [Debezium source connectors](https://debezium.io/documentation/reference/3.2/connectors/index.html).

## 10. Website Resources As First-Class Truth

**Local decision:** website ingest persists `web_resources` separately from `signal_candidates`; editorial resources may project to signal_candidates, while documents/listings/entities can remain resource-only.

**Technical uniqueness:** the model does not force every URL into a signal candidate shape. Resource kind, projection state, document evidence and source provenance can remain visible.

**Business meaning:** many high-value signals live in PDFs, listings, downloads, tender pages, static resources or mixed portals. Treating them as resource truth preserves future conversion value and avoids misleading signal_candidate rows.

**Implemented around:** website fetchers, `services/fetchers/src/resource-pdf-extraction.ts`, `/admin/resources`, `docs/product/operator/examples/WEBSITE_SOURCES_TESTING.md`, `.aidp/contracts/content-model.md`.

**Tradeoff:** operators must inspect Resources and Signal Candidates separately; the model is more honest for mixed websites.

**Comparable approaches:** connector ecosystems distinguish source records, schemas and target outputs rather than forcing all source data into one display shape. See [Singer spec via Meltano Hub](https://hub.meltano.com/singer/spec) and [Airbyte documentation](https://docs.airbyte.com/).

## 11. Fetcher-Owned PDF And Document Extraction

**Local decision:** PDF text extraction belongs to `services/fetchers`, not Python discovery workers. It uses the already URL-guarded/resource-owned fetch path, bounded parsing and exact pinned `pdfjs-dist`.

**Technical uniqueness:** PDF extraction is treated as source/resource enrichment, not as generic LLM or worker-side scraping. The implementation bounds bytes/pages/text/time, records parser/version/metadata, and skips image-only PDFs without OCR hallucination.

**Business meaning:** procurement, grants, regulatory and official notices often arrive as documents. Safe document extraction expands addressable source coverage without weakening security or adding heavy native dependencies.

**Implemented around:** `services/fetchers/src/resource-pdf-extraction.ts`, `tests/unit/ts/resource-enrichment-website.test.ts`, `tests/unit/ts/document-observations.test.ts`, `services/fetchers/package.json`.

**Tradeoff:** scanned PDFs remain a known gap until a separate OCR security/dependency plan exists.

## 12. System Selection Before Personalization

**Local decision:** `final_selection_results` and system-selected content are separate from user-personalized matches.

**Technical uniqueness:** public selected content is owned by final selection, not by raw signal_candidates, resources, user interest matches or content kind. Personalization consumes already-gated content.

**Business meaning:** this keeps the customer-facing feed credible. A user interest cannot accidentally turn vendor noise, wrapper pages or weak matches into public "signals."

**Implemented around:** `final_selection_results`, `services/api/app/content_selection_read_model.py`, `services/api/app/content_detail_read_model.py`, `services/workers/app/selection_*`, web `/` vs `/matches`, `.aidp/contracts/zero-shot-interest-filtering.md`, `.aidp/contracts/universal-selection-profiles.md`.

**Tradeoff:** some user-specific recall waits on system selection; the feed remains explainable and safer.

**Comparable approaches:** workflow/connector systems often separate acquisition/normalization from downstream routing or targeting. The closest external analogy here is the ETL pattern of staging normalized source truth before destination-specific use, as seen in Singer taps/targets and Airbyte source/destination separation.

## 13. Broad Discovery Does Not Force Selected Count

**Local decision:** a Discovery run can be mechanically successful while selected count remains zero. Quality gates distinguish source discovery, conversion, and selected item proof.

**Technical uniqueness:** `inventory`, `inventory_context` and `adapter_backlog` are valid outputs. `operator.report.verify` and selection dashboards distinguish raw observations from selected public signals.

**Business meaning:** this is a rare but important product stance: the system optimizes for trustworthy signal yield, not vanity counts. It can tell a customer "we found sources but need conversion work" instead of selling noise as leads.

**Implemented around:** `services/mcp/src/operating-intelligence.ts`, `services/mcp/src/tools.ts`, `services/api/app/signal_candidate_list_read_model.py`, `services/api/app/content_selection_read_model.py`, `infra/scripts/test-discovery-vnext-mcp-live-*.mjs`.

**Tradeoff:** demos can look less flashy when broad discovery finds no selected items; long-term trust is higher.

## 14. Universal MegaLoop And Domain-Neutral Interests

**Local decision:** Discovery uses universal source-acquisition lenses and domain-specific meaning lives in `DiscoveryBrief`, system interest config, query seeds, negative signals, feedback and eval fixtures, not in core enums or branches.

**Technical uniqueness:** the same core can search for procurement, security advisories, changelogs, grants, regulatory changes or outsourcing buyer signals without adding domain-specific source types like `procurement_portal` or `outsourcing_buyer`.

**Business meaning:** the platform is not just a vertical scraper. It can be configured for new signal markets without rebuilding the core each time.

**Implemented around:** `services/workers/app/discovery_vnext_megaloop.py`, `services/workers/app/discovery_vnext_brief.py`, `services/workers/app/discovery_vnext_candidates.py`, `docs/discovery_vnext_blueprint.md`, `tests/unit/python/test_discovery_vnext_foundation.py`.

**Tradeoff:** domain pack design becomes important. Good results require calibrated interests, feedback and adapter coverage rather than hidden hardcode.

## 15. Bounded Live Search, Replay And Backfill Discipline

**Local decision:** live Discovery/search/LLM execution is gated by env, credentials, policies and explicit budget. Historical replay/backfill goes through `maintenance.reindex.request`, records job state and skips retro notifications by default.

**Technical uniqueness:** live provider cost and nondeterminism are visible runtime state, not background behavior. Backfill is an operator-visible maintenance job, not a hidden side effect of config changes.

**Business meaning:** the product can be operated in cost-sensitive environments and can safely recalibrate old content after changing interests or templates. This matters when customers expect repeatable reports and no surprise notifications.

**Implemented around:** `discovery_query_attempts`, `discovery_llm_gateway_events`, `reindex_jobs`, `services/mcp/src/tools/sequences-tools.ts`, `services/mcp/src/operating-intelligence.ts`, `services/workers/app/reindex_backfill_runtime.py`.

**Tradeoff:** operators must explicitly run and verify replay; the system avoids accidental spend and notification mistakes.

## 16. Live Proof Harnesses As Product Evidence

**Local decision:** live verification scripts exercise MCP-only operator flows and write JSON/Markdown artifacts under `/tmp` with run ids, gaps, counts and recommendations.

**Technical uniqueness:** proof harnesses are not just tests. They encode product acceptance criteria: read-after-write, source family coverage, routing/backlog outcomes, downstream content evidence, selected quality and no unsafe selected leaks.

**Business meaning:** this gives the team a way to prove the funnel works from idea to source discovery to selected signal, and to honestly label gaps as source recall, adapter conversion, selection quality, LLM health or provider quality.

**Implemented around:** `infra/scripts/test-discovery-vnext-mcp-live-gap-flow.mjs`, `infra/scripts/test-discovery-vnext-mcp-live-signal-flow.mjs`, `infra/scripts/test-discovery-vnext-mcp-scenario-verification.mjs`, `pnpm test:mcp:http:discovery`, `pnpm test:discovery:vnext-flow`.

**Tradeoff:** live proof depends on local runtime, credentials and provider behavior; deterministic proofs still remain necessary for CI-style confidence.

## 17. Operator Feedback As Configuration, Not Core Rewrite

**Local decision:** noisy results are reduced through MCP/admin configuration, typed feedback, bounded replay and adapter work before changing core logic. Domain-specific behavior is not added to the core resolver/routing/selection pipeline.

**Technical uniqueness:** feedback is structured: source scope correctness, routing correctness, source usefulness, lead usefulness, adapter gaps and false positives can be recorded separately.

**Business meaning:** this supports product learning without creating a brittle pile of customer-specific code branches. It also makes tuning auditable: the operator can explain which feedback/config changes improved or failed to improve quality.

**Implemented around:** `discovery_feedback_events`, `services/mcp/src/tools/discovery/vnext-tools.ts`, `services/mcp/src/operating-intelligence.ts`, `system_interests.*`, `operator.tuning.recommend`, `maintenance.reindex.request`.

**Tradeoff:** tuning takes iterations. The payoff is a system that can generalize across markets instead of only working for one hand-coded domain.

## What Makes The Overall System Unusual

Most news/content systems optimize for one of three simpler models:

1. fetch known feeds and rank signal_candidates;
2. crawl/search broadly and show many matches;
3. build custom scrapers for one vertical.

SignalOps's more unusual bet is different:

```text
discover possible source surfaces
-> resolve the monitorable source scope
-> understand source capability
-> route to inventory, context, backlog, watch or channel
-> convert sources into item-level observations
-> select only high-quality public signals
-> replay and verify through MCP/operator surfaces
```

The technical differentiation is the typed, auditable boundary between source discovery and selected content. The business differentiation is that the platform can build a reusable source-intelligence asset while keeping customer-facing signal quality strict.
