# Resilient Discovery Operator Guide

Resilient Discovery is the source-acquisition system for NewsPortal. It finds recurring sources, explains which coverage gap each source could close, verifies evidence, recommends actions and promotes only safe endpoints into `source_channels`.

The operating model is:

```text
coverage -> hypotheses -> evidence -> endpoints/signals -> actions -> source_channels -> coverage
```

## What Changed

Old discovery used missions, recall missions and candidates. The new model uses targets, coverage, evidence, endpoints, signal clusters and actions.

The practical difference:

- A target describes what the system is trying to monitor.
- Coverage tells what roles are already covered by existing sources.
- Hypotheses are structured acquisition plans, not final conclusions.
- Evidence comes from search providers, probes, source health and provider APIs.
- Endpoints are promotable direct source candidates.
- Signal clusters are hidden or weak-signal observations and are normally monitor-only.
- Actions are explicit operator/system decisions such as promote, reject, expand, replace or request config.

## Direct And Hidden Signals

Direct signals are explicit sources:

- RSS feeds;
- official blogs/newsrooms;
- changelogs/release notes;
- security advisories;
- procurement/tender portals;
- reports, datasets and APIs;
- official provider posts.

Hidden signals are early demand or pain signals:

- complaints and workarounds;
- "looking for alternative" discussions;
- community/forum trends;
- comments and social posts;
- hiring/procurement pressure.

Hidden signals are useful for finding what to search next. They are not enough to create an active ingestion source by themselves.

Hidden signals must become claim-backed before strong follow-up discovery. A hidden signal without claim support and control comparison cannot exceed confidence `0.70`. A confirmed hidden claim needs independent evidence and specificity above background noise.

## Provider Cards

Every provider needs a capability card before discovery can use it. A provider card says:

- how access works;
- whether auth is required;
- what object types can be searched;
- which query primitives exist;
- direct/hidden signal support;
- rate-limit and quota limits;
- compliance and retention rules;
- whether promotion is allowed.

If a provider has no card, discovery must not execute it. Restricted providers such as Meta-family, TikTok research access, X recent search or Reddit should default to `monitor_only` or `needs_config` until official access and policy are configured.

## Autopilot And LLM Decisions

Operators can start from a simple target prompt and an autopilot profile:

- `conservative`;
- `balanced`;
- `wide`;
- `research`;
- `social_early_signal`.

Autopilot simplifies budgets and defaults, but it does not bypass safety policy. LLM-assisted graph expansion, Constructive Skeptic review, endpoint review, hidden-signal mining, run diagnosis and config simplification must be recorded as LLM decisions. Each decision records schema status, fallback use, repair attempts, model/prompt metadata and cost metadata.

If schema validation fails, the gateway may attempt one repair. If repair fails, discovery must use the deterministic fallback. LLM output remains explanatory or proposal-only; probes, provider capabilities, contracts and deterministic thresholds remain final authority.

## Adversarial Planning

Discovery uses bounded reasoning roles:

- Explorer proposes broad direct and hidden-signal hypotheses.
- Constructive Skeptic attacks noise, hallucination, duplicates, compliance risk and provider mismatches, but may also add bounded missing angles, negative controls, provider warnings and repair tickets.
- Repairer patches hypotheses that can be safely improved.
- Verification Skeptic performs one short post-repair check.

A deterministic Referee then checks provider capability, signal mode, source role, risk and coverage alignment. Debate is not truth; it is only a way to generate and filter ideas before expensive execution.

The loop is intentionally bounded:

```text
max full repair rounds = 2
max verification rounds = 1
max skeptic-added hypotheses per round = 12
max skeptic-added hypotheses total = 20
max negative controls per run = 10
persistent disagreement -> manual review
```

## Denoising Loop

Discovery uses four stages:

- T3: generate many diverse candidates.
- T2: remove role/provider/compliance duplicates and noise.
- T1: collect evidence through search, validation and probes.
- T0: decide action from scores and thresholds.

Dropped candidates must keep a rejection reason so future self-healing can learn what failed.

## Promotion Rules

RSS is the only provider type with default auto-promotion, and only for very strong evidence:

```text
total_score >= 0.88
evidence_score >= 0.80
extraction_ready_score >= 0.90
compliance_score >= 0.95
valid_feed = true
sample_entries >= 3
duplicate = false
```

Website endpoints are manual by default. APIs require operator config. Social/email/video providers are monitor-only or needs-config unless a provider card and policy explicitly allow ingestion.

Promotion creates a probation source first, not a fully trusted source. Promotion payloads must place this under `source_channels.config_json.discovery`:

```json
{
  "trustStage": "probation",
  "coverageContribution": 0.25,
  "downstreamWeight": 0.3,
  "evidenceContract": {}
}
```

When the Source Evidence Contract passes, the source becomes active with coverage contribution `1.0` and downstream weight `1.0`. If the contract fails or degrades, both become `0.0`.

Hard rules:

- no probe evidence means no promotion;
- hidden signal means no direct promotion;
- duplicate endpoint means reject;
- restricted provider means needs-config or monitor-only;
- LLM confidence alone cannot promote;
- kill switches and blast-radius limits can block otherwise valid auto-promotion.

## Source Evidence Contracts

Every promoted endpoint must carry a Source Evidence Contract. The contract says what the source is expected to produce, how much useful yield is enough, which noise/duplicate/staleness/extraction thresholds apply, and which repair actions should run when it degrades.

Operators should treat probation sources as promising but unproven. They partially help coverage, but they do not fully close a gap until fetch/yield metrics prove the contract.

## Negative Evidence

Discovery records failed branches so it does not keep repeating them:

- no results;
- SEO/social noise;
- duplicate endpoints;
- provider mismatch;
- provider auth/rate-limit/error;
- blocked domains;
- dead endpoints;
- failed probes;
- hidden signal not confirmed;
- contract failed.

Provider failure must be shown as provider health or circuit-breaker state, not as a bad hypothesis.

## Provider Health

Provider health protects the system from confusing outages with discovery quality:

```text
error_rate >= 0.50 -> degraded, reduce budget by 70%
auth_failed -> stop provider and create repair_provider_auth
rate_limited -> cooldown provider
```

Hypotheses using a provider on cooldown should be skipped or rerouted until the provider is repaired.

## Identity And Duplicates

Coverage counts source identities, not raw endpoint rows. The system should dedupe:

- exact normalized endpoint matches;
- feed proxy/self-link variants;
- same domain + endpoint kind + source role;
- same RSS title + site link;
- known source-channel links.

This prevents one site with five feed variants from looking like five strong sources.

## Replay Evaluation

Threshold, prompt and policy changes require replay eval. Replay suites use stored search/provider/probe fixtures and measure precision, recall, noise and cost without live external calls. Do not report a threshold or prompt change as an improvement until a relevant replay suite has been run.

## Self-Healing

After each run, discovery diagnoses what happened:

- no search results;
- many results but no endpoints;
- many low-quality results;
- too many duplicates;
- hidden signal noise;
- provider/probe errors;
- coverage not improving;
- stale or broken existing sources.

Self-healing may create repair runs that broaden/narrow queries, add localized terms, switch providers, extract source directories, expand good sources or find replacements for weak sources. It must not disable sources or create risky provider access without operator policy.

## What Operators Should Review

The admin discovery workspace should show:

- target coverage by source role;
- latest run status and diagnosis;
- endpoint evidence and scores;
- signal clusters and claims with support/contradictions/control comparisons;
- source contract and probation health;
- negative evidence cooldowns;
- provider circuit-breaker state;
- provider capability and config state;
- source inventory with fit, yield, freshness and health.

Promote endpoints only when the evidence explains what role they close and why the provider is safe to ingest.

## Cutover Runbook

The destructive v3 schema cutover is operator-gated. Before applying `0052_resilient_discovery_rebuild.sql` to any shared or production database:

1. Check `schema_migrations` for `0052_resilient_discovery_rebuild.sql`.
2. If `0052` is already present, stop. Do not edit the applied migration; prepare a repair migration plan instead.
3. Run migration smoke against a disposable database or restored copy.
4. Verify that old discovery tables are archived into `discovery_legacy_archive_batches` and then removed.
5. Verify retained ingestion tables are untouched: `source_channels`, `source_providers`, `source_channel_runtime_state`, `outbox_events`, fetchers, `articles`, `web_resources`, `interest_templates` and `user_interests`.
6. Verify v3 tables, indexes, checks and `discovery_source_inventory_view` exist.
7. Record explicit operator approval in `.aidp/work.md`.
8. Apply the migration.
9. Run read-back proof for archived batches, retained ingestion tables, v3 routes/MCP tools and admin discovery workspace.

Do not remove old runtime code or announce capability completion until v3 API, MCP, admin, worker, contract/probation, provider-health and replay-eval proof all pass. Production deploy is separate from local capability proof and needs its own operator approval.
