# MCP Control Plane Contract

## Scope

The remote MCP control plane is HTTP-only behind the app gateway and exposes strict, schema-validated operator tools. Discovery tools are vNext-only.

MCP resources are operator truth for MCP sessions. Product docs are developer/operator documentation truth, and `.aidp/*` remains agent-runtime truth. These layers must express the same shared invariants even when the audience-specific wording differs.

## Discovery Tools

`discovery.*` tools may cover:

- read: list/read vNext runs, run steps, query attempts, LLM gateway events, artifacts, candidates, source inventory, monitoring state, observations, policies, adapter backlog, feedback, replay runs, rollback groups/actions and eval runs;
- propose/probe/route/register/policy: execute policy-governed runs, create/validate artifacts, preview briefs, run LLM gateway audits, mega-loop batches, candidate normalization, probe plans, probe execution, source understanding, routing, routing apply, probation handoff and policy activation;
- replay/rollback: non-live replay start, rollback prepare and confirmed rollback apply.

Write payloads must be rejected by MCP schema validation before backend calls when malformed. Discovery writes require `write.discovery`; destructive rollback/cleanup also requires `write.destructive` and `confirm=true`.

## Report And Context Rules

Operating-intelligence reports must describe vNext artifacts, source inventory, adapter backlog, replay and rollback. They must not describe removed discovery generations or compatibility aliases.

Recommended actions must point to current tools such as `discovery.runs.execute`, `discovery.brief.preview`, `discovery.llm_gateway.run`, `discovery.mega_loop.preview`, `discovery.candidates.create`, `discovery.probe.execute`, `discovery.route.preview`, `discovery.routing.apply`, `discovery.probation.handoff`, `discovery.policies.activate`, `discovery.replay.start` and `discovery.rollback.prepare/apply`.

Selection recommendations and reports must distinguish `explicit_marker`, `hidden_intent`, `mixed` and `unknown` signal visibility when the client is diagnosing recall/precision or `0 selected`. They must explain that `must_have_terms` is any-of but still a hard pre-semantic gate, that `short_tokens_required` is an extracted-token requirement, and that hidden/unknown baselines use empty hard lexical gates unless mandatory-marker proof exists.

MCP guidance must route hidden and mixed signal recovery through representative samples, literal `candidateSignals` cue groups, near-miss negatives, content-kind/source-context evidence, bounded `docIds` replay and `operator.report.verify`. It must not recommend broad positive-term expansion, global hard gates, `strictness=broad`, LLM template rewrites, LLM budget changes or more source volume as the first response to hidden-signal `0 selected`.

Reindex proof must expose derived-state freshness. `maintenance.reindex_jobs.list` and report verification should inspect selection replay counters, enrichment counters and stale/mixed profile-version diagnostics; a completed job without replay proof is not final selected-signal proof.

## Proof

MCP changes require:

- tool list proof that discovery names are vNext-only;
- invalid-payload tests proving backend calls are not reached;
- permission tests for read/write/destructive paths;
- doc-parity/read-back proof when resources, prompts or operating-intelligence guidance change.
