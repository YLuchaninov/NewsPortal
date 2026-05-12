# Контракт resilient discovery agent

Этот contract обязателен, когда работа трогает `/maintenance/discovery/*`, admin discovery UI, MCP `discovery.*`, discovery schema, provider capability registry, source acquisition, source expansion/replacement, discovery LLM/search/social runtime, endpoint scoring or promotion into `source_channels`.

## Назначение

Discovery отвечает за evidence-bounded source acquisition:

```text
coverage -> adversarial hypotheses -> evidence -> endpoints/signals -> actions -> source_channels -> coverage
```

Старая модель `mission -> hypothesis -> candidate` и отдельная independent recall lane superseded. Новый runtime использует `discovery_targets`, coverage gaps, provider capability cards, direct/hidden signal separation, adversarial Explorer/Skeptic planning, deterministic Referee policy, endpoint evidence, promotion gates and self-healing repair recipes.

## Durable truth

- PostgreSQL остается единственным durable source of truth для discovery state.
- Redis/BullMQ/sequence/task-engine являются transport/runtime only.
- `DISCOVERY_ENABLED=false` остается safe default.
- Discovery does not ingest content itself. It creates endpoint candidates, signal clusters, monitor/request-config actions, and guarded promotions into `source_channels`.
- Existing ingestion truth remains outside the cutover: `source_channels`, `source_providers`, `source_channel_runtime_state`, `outbox_events`, fetchers, `articles`, `web_resources`, `interest_templates`, `user_interests`.
- Source registration always goes through PostgreSQL + source runtime state + `source.channel.sync.requested` outbox discipline.
- Fetchers own RSS/website URL validation and probe semantics. Workers may orchestrate probes but must not create a second feed/website parser with incompatible URL/date/content rules.
- LLM output is a proposal, never proof. Tool/provider/probe outputs are evidence. Deterministic policy decides actions.
- Every discovery LLM call must pass through the v3 LLM gateway: schema validation, at most one repair attempt, input-hash cache, deterministic fallback and `discovery_llm_decisions` logging.
- Discovery prompt/task text belongs in `discovery_llm_task_templates` or product docs, not hidden in ad hoc runtime strings without a logged task name.
- No provider card means no execution.
- No probe evidence means no promotion.
- Hidden/social signals never auto-promote `source_channels`; they create signal clusters, monitor-only watches, request-config actions or follow-up direct-source hypotheses.
- A newly promoted direct source starts in `probation`; it contributes `0.25` coverage and downstream weight `0.3` until its Source Evidence Contract passes.
- Rare-signal source priors are not promotion proof. A `rare_signal_source_prior` only proves that a source/channel/endpoint is worth longer observation when semantic/source-role/trust/fetch-health evidence is strong enough for a rare hidden-signal domain. Prior-only monitor/probation evidence is stored in `discovery_source_contracts.contract_json.rareSignalPrior` and/or `source_channels.config_json.discovery.rareSignalPrior`, keeps `coverageContribution=0.0` and `downstreamWeight=0.0`, and must not make any article web-selected.
- Provider failure is provider health evidence, not hypothesis failure. Auth/rate-limit/API degradation must update provider health/circuit-breaker state and avoid poisoning negative hypothesis history.
- Threshold, prompt or policy changes require replay evaluation before being described as quality improvements.

## Core entities

- `discovery_targets`: normalized interest/search task with seed fields, `graph_json`, `policy_json`, `autopilot_json`, current run/coverage pointers.
- `discovery_runs`: bounded execution attempt with run kind, trigger kind, budgets, status, summaries and diagnosis. Per-run live provider execution must be an explicit bounded operator approval such as `providerExecutionEnabled`; it must not be inferred globally from a domain, target title, or source prior.
- API/MCP run creation surfaces that claim to start discovery (`/maintenance/discovery/runs`, `targets/{id}/expand-gap`, and source expand/replace routes) must also dispatch a Sequence Runner job for `discovery.v3.run` through `q.sequence`, or return an explicit dispatch failure. A bare `discovery_runs` row in `queued` is durable state, not executable work by itself. Retained queued rows from older paths must be re-dispatched through the bounded maintenance surface instead of being deleted or silently ignored. If target-level hypothesis dedupe collides with an older queued/failed hypothesis, a later approved run may reuse that unexecuted hypothesis for execution; it must not delete, clone, or treat the old row as cleanup.
- `discovery_provider_capabilities`: provider cards, query primitives, object types, auth, rate limits, compliance, signal modes and promotion mode.
- `discovery_provider_health`: provider circuit-breaker state, auth/rate-limit/error/latency health and cooldown.
- `discovery_llm_task_templates`: versioned discovery prompt/task templates for graph compile, strategy, Explorer/Skeptic, endpoint review, hidden signal mining, diagnosis and config simplification.
- `discovery_llm_decisions`: audited LLM task calls with input hash, schema status, fallback/repair flags, model/prompt/cost metadata and optional target/run/hypothesis/endpoint/claim refs.
- `discovery_coverage_snapshots`: current source inventory, role coverage, gaps and scores.
- `discovery_hypotheses`: executable acquisition plans with source role, signal mode, provider, tactic, query/seed and adversarial scores.
- `discovery_debates`: Explorer/Skeptic/Repairer/Referee trace for high-impact planning/review decisions.
- `discovery_evidence_items`: normalized evidence from web search, probes, social/forum providers, provider errors and source health.
- `discovery_signal_clusters`: hidden signal clusters with independence, burst, risk and confidence scoring.
- `discovery_claims` and `discovery_claim_evidence`: claim graph for hidden/weak signals, including support, contradiction and independent evidence counts.
- `discovery_domain_inventory`: domain-level memory and trust/spam/authority state.
- `discovery_source_endpoints`: direct source candidates with endpoint kind, provider type, source role, scores, action and optional linked `source_channel_id`.
- `discovery_source_contracts`: expectations and probation/active/degraded state for promoted sources.
- `discovery_source_identities`: canonical organization/domain/feed identity memory and duplicate pressure control.
- `discovery_negative_evidence`: remembered failed branches, cooldowns and failure modes for queries/domains/endpoints/providers/clusters.
- `discovery_actions`: queued/running/completed operator or automatic actions such as promote, reject, expand, replace, request config.
- `discovery_repairs`: self-healing diagnosis and repair recipes after weak/failed runs.
- `discovery_eval_suites`, `discovery_eval_cases`, `discovery_eval_runs`: replay harness for threshold/prompt/policy calibration.

## Source roles

Minimum role vocabulary:

```text
authoritative_anchor
official_newsroom
technical_change
security_advisory
procurement_signal
primary_data
report_research
industry_niche
localized_media
community_early_signal
newsletter_digest
source_directory
vendor_ecosystem
regulatory_policy
social_pain_signal
social_intent_signal
social_trend_signal
sibling_endpoint
replacement_candidate
```

Coverage must be role-aware. New hypotheses are generated from missing/weak roles, strong-source expansion opportunities, weak-source replacement needs and confirmed hidden-signal clusters.

## Direct vs hidden signals

Direct signals are explicit source/content surfaces: official announcements, RSS feeds, changelogs, release notes, security advisories, procurement portals, reports, datasets, official APIs and official provider posts.

Hidden signals are weak/latent demand surfaces: complaints, pain, intent, workarounds, community trends, hiring pressure, social/forum discussion, comments or search-like provider evidence.

Rules:

- Every hypothesis, evidence item, endpoint and cluster carries `signal_mode`.
- Direct signal endpoints may become `source_channels` after evidence, compliance and duplicate gates.
- Hidden signals require clustering and independence thresholds before follow-up hypotheses.
- Hidden signal clusters must become claim candidates before strong follow-up discovery.
- A hidden signal without claim + control comparison cannot exceed confidence `0.70`.
- Control comparisons must estimate specificity against background noise; weak specificity keeps the signal monitor-only.
- Hidden signal clusters can be `monitor_only`, `confirmed_signal`, `rejected` or `needs_more_evidence`; they cannot directly become active ingestion sources.

## Provider capability registry

Every ingress/search provider needs a provider card before execution. Provider cards must include:

- provider id and kind;
- access mode and auth requirements;
- supported object types;
- query primitives;
- supported signal modes;
- rate limit and quota notes;
- compliance and retention/deletion constraints;
- promotion mode;
- default action.

Examples include `web_search`, `rss`, `website`, `custom_api`, `email_imap`, `youtube`, `x_recent_search`, `reddit`, `meta_content_library`, `facebook_pages`, `instagram_graph`, `tiktok_research`.

Restricted/social providers default to `monitor_only` or `needs_config` until official access, policy and ingestion support are explicit.

## Adversarial planning

Discovery uses a bounded adversarial loop:

```text
Explorer -> Constructive Skeptic -> Repairer -> Verification Skeptic -> deterministic Referee
```

Explorer maximizes recall and proposes structured hypotheses. Constructive Skeptic is not only a critic: it may add bounded missing angles, negative controls, provider warnings and repair tickets when they fix concrete weaknesses. Repairer applies safe patches and bounded additions. Verification Skeptic does one short post-repair check. Referee accepts only hypotheses that pass provider capability, source role, signal mode, tactic, risk and coverage-alignment checks.

Loop limits:

```text
max full repair rounds = 2
max verification rounds = 1
max skeptic-added hypotheses per round = 12
max skeptic-added hypotheses total = 20
max negative controls per run = 10
low meaningful-change score or repeated critique types stop repair
persistent disagreement -> manual_review
```

Debate output is not truth. It is planning evidence and must be persisted in `discovery_debates` when it affects execution or operator review.

## Denoising stages

Discovery uses diffusion-inspired denoising as an engineering loop, not as a required ML model:

- T3: broad candidate generation.
- T2: role/provider/compliance/dedupe filtering.
- T1: evidence and endpoint probe filtering.
- T0: action decision filtering.

Every dropped candidate must have a stage and rejection reason.

## Source evidence contracts and probation

Promotion does not mean a source is proven. Every promoted endpoint must create a Source Evidence Contract that defines:

- source role and signal mode;
- expected data shape/evidence;
- minimum useful yield per window;
- noise/duplicate/staleness/extraction thresholds;
- degradation triggers;
- allowed repair actions.

`source_channels.config_json.discovery` must include `trustStage`, `coverageContribution`, `downstreamWeight` and `evidenceContract`.
`source_channels.config_json.discovery.rareSignalPrior` may additionally record a rare-signal observation prior. This field is an exploration/monitoring hint only; coverage and downstream selection must continue to use Source Evidence Contract state and real article/claim evidence.

Defaults:

```text
new direct source -> trustStage=probation, coverageContribution=0.25, downstreamWeight=0.3
contract passed -> trustStage=active, coverageContribution=1.0, downstreamWeight=1.0
contract failed/degraded -> trustStage=degraded, coverageContribution=0.0, downstreamWeight=0.0
rare-signal prior only -> trustStage unchanged, coverageContribution=0.0, downstreamWeight=0.0
```

Coverage must count source identities and contract state, not raw endpoint count.

## Promotion policy

Promotion requires endpoint evidence, provider capability, compliance score, duplicate check, source role and extraction config.

Defaults:

- RSS may auto-promote only when very strong.
- Website is manual by default.
- API requires operator config.
- Email/social/video providers are monitor-only or needs-config unless an explicit provider card and policy allow more.
- Weak-source replacement recommendations must not pause or disable old sources automatically.

Hard gates:

```text
no provider card -> no execution
no probe evidence -> no promotion
hidden signal -> no direct source_channel promotion
restricted provider -> needs_config or monitor_only
duplicate endpoint -> reject
high compliance risk -> reject or needs_config
LLM confidence alone cannot promote
global/target kill switch or blast-radius limit -> no auto-promotion
```

## Negative evidence and identity

Discovery must remember failures: no results, SEO/social noise, duplicate branches, provider mismatch, auth/rate-limit/provider error, blocked domains, dead endpoints, failed probes, unconfirmed hidden signals and contract failures.

Negative evidence with active cooldown suppresses repeated bad hypotheses. It must not be used to penalize hypotheses when the real cause is provider health failure.

Source identity resolution must dedupe exact normalized endpoint URLs, feed proxy/self-link variants, same domain+endpoint kind+role, RSS title/site link and known source-channel links. Coverage counts distinct source identities, not five feeds from the same source as five strong sources.

## Self-healing

After each run, discovery records health metrics: coverage delta, new endpoints, promotable/review/reject counts, duplicate rate, provider/probe errors, average evidence/score, social noise, hidden-signal confirmation and source health.

Self-healing may create repair runs for broadening/narrowing queries, adding localized terms, switching providers, extracting source directories, refreshing graph, expanding strong sources or replacing weak sources. It cannot create risky provider access, disable sources or perform destructive cleanup without operator policy/approval.

## Replay evaluation

Replay eval is mandatory for threshold, prompt and policy tuning. Eval suites use stored provider/search/probe fixtures and report precision, recall, noise and cost without live external calls. Do not claim an improvement from prompt/threshold/policy changes until a relevant replay suite exists and has been run.

## Public surfaces

API is the FastAPI maintenance surface under `/maintenance/discovery/*`.

MCP is a strict typed control plane with `discovery.*` tools/resources/prompts. MCP must expose provider capabilities, provider health, coverage, endpoints, actions, signal clusters, claims, source contracts, negative evidence, source identities, eval suites, source inventory and report verification. MCP must reject malformed write payloads at schema boundary before backend calls.

Admin UI must show operator workspace views for targets, coverage, runs, endpoints, claims, source contracts, negative evidence, eval runs and source/provider inventory. It must show why a source was found, why it was not promoted, missing evidence, probation status, contract health, claim support/contradictions and provider circuit-breaker status. UI actions must use app-owned confirmation states, not native browser dialogs.

## Proof expectations

- Schema changes: `pnpm test:migrations:smoke` plus affected API/worker proof.
- Pure discovery policy modules: targeted Python unit proof.
- API changes: targeted Python/API proof and SDK/admin read-model proof.
- MCP changes: targeted MCP unit proof and `pnpm test:mcp:compose` or relevant HTTP group.
- Admin discovery UI: `pnpm test:discovery:admin:compose` plus TS lint/typecheck and viewport/UI proof when layout changes.
- Runtime/provider execution: bounded discovery smoke/compose proof; live external provider residuals must be explicit.
- Live calibration/polishing: `pnpm test:discovery:live-calibration:compose` for diagnostic tuning evidence, `pnpm test:discovery:live-acceptance:compose` for strict MVP web/RSS/Atom acceptance, and `pnpm test:discovery:live-soak:compose` for manual repeated polishing runs.
- Promotion/source-channel integration: proof that `source_channels`, `source_channel_runtime_state` and `outbox_events` are written through the registrar path.

## Update triggers

Update this contract when discovery schema, source roles, provider cards, direct/hidden signal semantics, adversarial planning, denoising thresholds, promotion policy, MCP/API/admin surfaces, or proof contours change.
