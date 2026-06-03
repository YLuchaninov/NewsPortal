# MCP Control Plane Contract

## Scope

The remote MCP control plane is HTTP-only behind the app gateway and exposes strict, schema-validated operator tools. Discovery tools are vNext-only.

## Discovery Tools

`discovery.*` tools may cover:

- read: list/read vNext runs, run steps, query attempts, LLM gateway events, artifacts, candidates, source inventory, monitoring state, observations, policies, adapter backlog, feedback, replay runs, rollback groups/actions and eval runs;
- propose/probe/route/register/policy: execute policy-governed runs, create/validate artifacts, preview briefs, run LLM gateway audits, mega-loop batches, candidate normalization, probe plans, probe execution, source understanding, routing, routing apply, probation handoff and policy activation;
- replay/rollback: non-live replay start, rollback prepare and confirmed rollback apply.

Write payloads must be rejected by MCP schema validation before backend calls when malformed. Discovery writes require `write.discovery`; destructive rollback/cleanup also requires `write.destructive` and `confirm=true`.

## Report And Context Rules

Operating-intelligence reports must describe vNext artifacts, source inventory, adapter backlog, replay and rollback. They must not describe removed discovery generations or compatibility aliases.

Recommended actions must point to current tools such as `discovery.runs.execute`, `discovery.brief.preview`, `discovery.llm_gateway.run`, `discovery.mega_loop.preview`, `discovery.candidates.create`, `discovery.probe.execute`, `discovery.route.preview`, `discovery.routing.apply`, `discovery.probation.handoff`, `discovery.policies.activate`, `discovery.replay.start` and `discovery.rollback.prepare/apply`.

## Proof

MCP changes require:

- tool list proof that discovery names are vNext-only;
- invalid-payload tests proving backend calls are not reached;
- permission tests for read/write/destructive paths;
- doc-parity/read-back proof when resources, prompts or operating-intelligence guidance change.
