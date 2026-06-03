# Nonstandard Technical Decisions

Last researched: 2026-05-30.

This document lists NewsPortal decisions that are more opinionated than a default CRUD/news app. It is a research and orientation document, not a runtime contract. For agent/runtime truth use `.aidp/*`; for implementation truth use code, migrations and tests.

## 1. PostgreSQL Business Truth With Thin Queue Jobs

**Local decision:** PostgreSQL owns business state; Redis/BullMQ only transports thin jobs. Workers reload authoritative state from PostgreSQL instead of trusting queue payloads.

**Why:** source/content/selection/discovery flows need replay, audit, idempotency and operator diagnosis. Large queue payloads would make retries and backfills harder to reason about.

**Implemented around:** `outbox_events`, `services/relay`, `q.sequence`, worker processors, `.aidp/blueprint.md`.

**Tradeoff:** more database reads and schema discipline; much clearer recovery and proof.

**Comparable approaches:** Temporal separates orchestration state from worker processes and describes Workers as external pollers of Task Queues; Debezium records connector offsets/schema history so change capture can resume after restarts. See [Temporal Workers](https://docs.temporal.io/workers), [Temporal worker performance](https://docs.temporal.io/develop/worker-performance), and [Debezium state storage](https://debezium.io/documentation/reference/3.2/configuration/storage.html).

## 2. Sequence Runtime With Registered Task Plugins

**Local decision:** long workflows run as sequence definitions and task runs, but executable behavior comes from registered `TaskPlugin` classes with options/context/output contract metadata.

**Why:** operators need visible multi-step runs, retries and failures without allowing arbitrary code upload through admin/MCP.

**Implemented around:** `services/workers/app/task_engine/**`, `services/api/app/sequence_*`, `services/mcp/src/tools/sequences-tools.ts`, `docs/product/operator/mcp/README.md`.

**Tradeoff:** adding new executable behavior still requires code deployment; in exchange, plugin contracts are typed, testable and discoverable.

**Comparable approaches:** Airflow plugins extend a deployed runtime through registered plugin classes; Argo Workflows exposes DAG/step workflow composition. See [Airflow Plugins](https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/plugins.html) and [Argo Workflows](https://argoproj.github.io/workflows/).

## 3. MCP As Operator Control Plane, Not Just API Wrapper

**Local decision:** MCP exposes tools, resources and prompts with instructions, schemas, token scopes, strict payload validation, read-after-write guidance and `operator.report.verify`.

**Why:** operator agents need context and proof obligations, not only endpoints. The system should make wrong payload shapes fail before backend mutation and should steer clients toward verification.

**Implemented around:** `services/mcp/src/main.ts`, `services/mcp/src/tools.ts`, `services/mcp/src/resources.ts`, `services/mcp/src/prompts.ts`, `packages/contracts/src/mcp-schemas.ts`, `docs/product/operator/mcp/**`.

**Tradeoff:** more MCP-specific documentation and tests; better behavior for tool-only clients and safer remote operation.

**Comparable approaches:** MCP itself defines separate server capabilities for tools, resources and prompts. See [MCP Tools](https://modelcontextprotocol.io/specification/draft/server/tools), [MCP Resources](https://modelcontextprotocol.io/specification/draft/server/resources), and [MCP Prompts](https://modelcontextprotocol.io/specification/draft/server/prompts).

## 4. Discovery vNext As Typed Source Acquisition, Not Auto-Crawling

**Local decision:** discovery produces typed artifacts: brief, candidates, probe reports, source understanding, routing decisions, inventory, adapter backlog, replay and rollback. Promotion is policy-gated and probation handoff goes through existing source/outbox paths.

**Why:** source acquisition has live-search cost, LLM uncertainty and fetcher risk. Treating it as an auto-registration crawler would blur evidence, budget and operator responsibility.

**Implemented around:** `docs/discovery_vnext_blueprint.md`, `services/api/app/discovery_vnext_api.py`, `services/workers/app/discovery_vnext_*.py`, `services/mcp/src/tools/discovery/vnext-tools.ts`, migrations `0056`-`0059`.

**Tradeoff:** more intermediate records and review steps; much better explainability, rollback and budget control.

**Comparable approaches:** LangGraph human-in-the-loop interrupts persist state and pause for external decisions; Temporal keeps workflow progress durable while workers execute code externally. See [LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts), [LangChain human-in-the-loop](https://docs.langchain.com/oss/python/langchain/human-in-the-loop), and [Temporal Workers](https://docs.temporal.io/workers).

## 5. Ingress Adapter Catalog And Sticky Channel Binding

**Local decision:** adapter identity is centralized in `ingress_adapter_catalog`, and each channel can have a sticky `source_channel_adapter_binding`. Legacy RSS/API JSON hints are diagnostics, not current runtime selection.

**Why:** NewsPortal supports RSS, website, API and email sources. Without a catalog/binding layer, provider-specific options would leak across admin forms, MCP tools, fetchers and discovery.

**Implemented around:** `database/migrations/0055_ingress_adapter_catalog.sql`, `packages/contracts/src/ingress-adapters.ts`, `packages/control-plane/src/ingress-adapter-bindings.ts`, `services/fetchers/src/ingress-adapters/**`, `services/mcp/src/tools/ingress-adapters-tools.ts`, `/admin/ingress-adapters`.

**Tradeoff:** migration and UI complexity; clearer adapter identity, safer declarative adapters and better legacy fallback reporting.

**Comparable approaches:** Airbyte and Singer/Meltano separate connector definitions from runtime pipeline composition; Debezium standardizes source connector event shapes. See [Airbyte documentation](https://docs.airbyte.com/), [Singer spec via Meltano Hub](https://hub.meltano.com/singer/spec), [Meltano plugin concepts](https://docs.meltano.com/concepts/plugins/), and [Debezium source connectors](https://debezium.io/documentation/reference/3.2/connectors/index.html).

## 6. Website Resources As First-Class Truth

**Local decision:** website ingest persists `web_resources` separately from `articles`; editorial resources may project to articles, while documents/listings/entities can remain resource-only.

**Why:** many useful websites are not article feeds. Treating every URL as an article hides documents, listings, downloads and provenance.

**Implemented around:** website fetchers, `/admin/resources`, `docs/product/operator/examples/WEBSITE_SOURCES_TESTING.md`, `.aidp/contracts/content-model.md`.

**Tradeoff:** operators must inspect Resources and Articles separately; the model is more honest for mixed websites.

**Comparable approaches:** connector ecosystems distinguish source records, schemas and target outputs rather than forcing all source data into one display shape. See [Singer spec via Meltano Hub](https://hub.meltano.com/singer/spec) and [Airbyte documentation](https://docs.airbyte.com/).

## 7. System Selection Before Personalization

**Local decision:** `final_selection_results` and system-selected content are separate from user-personalized matches.

**Why:** a user interest should not bypass global quality, dedup, verification, safety and selection gates. Operators need to debug selection quality independently from personalization.

**Implemented around:** `final_selection_results`, content selection read models, web `/` vs `/matches`, `.aidp/contracts/zero-shot-interest-filtering.md`, `.aidp/contracts/universal-selection-profiles.md`.

**Tradeoff:** some user-specific recall waits on system selection; the feed remains explainable and safer.

**Comparable approaches:** workflow/connector systems often separate acquisition/normalization from downstream routing or targeting. The closest external analogy here is less one product and more the ETL pattern of staging normalized source truth before destination-specific use, as seen in Singer taps/targets and Airbyte source/destination separation.
