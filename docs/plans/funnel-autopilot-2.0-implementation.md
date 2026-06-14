# SignalOps Funnel Autopilot 2.0 Implementation Plan

Status: accepted implementation plan for `SIGNALOPS-FUNNEL-AUTOPILOT-2`.

## Product Goal

Funnel Autopilot 2.0 makes SignalOps a self-configuring multi-funnel signal discovery system. An operator can describe a business goal in plain language, and the MCP/admin control plane plans, validates, applies and verifies one or more scoped funnels.

This capability is domain-neutral. Domain vocabulary may appear in operator input, scenario packs, examples, stored configuration and database rows, but not as runtime hardcode in selection, discovery or MCP logic.

## Core Principles

- Multiple funnels can be active at the same time.
- Sources and raw observations can be shared, but selection policy and reports are funnel-scoped.
- `final_selection_results` remains the primary selection truth.
- Funnel attribution is added through bindings, explain payloads and reports, not by creating a competing selection truth.
- MCP autopilot is the default path for operators who do not know what to configure.
- The old route through system interests, LLM templates, channels, Discovery and reindex remains available as manual funnel tuning for expert operators.
- Guarded workflow is mandatory for risky writes: unsafe changes are blocked unless a scoped expert override has a reason and verification target.

## Funnel Data Model

Add first-class funnel entities:

- `operator_funnels`
  - `funnel_id`
  - `name`
  - `goal`
  - `status`: `draft | active | paused | archived`
  - `owner_user_id`
  - `created_from_idea_json`
  - `default_policy_json`
  - timestamps

- `funnel_lanes`
  - `lane_id`
  - `funnel_id`
  - `lane_type`: `explicit_marker | hidden_intent | mixed_split | context_only | unknown`
  - `routing_mode`: `direct_select | evidence_led_review | llm_approved | hold_for_calibration | acquisition_only`
  - `policy_json`
  - `evidence_contract_json`

- Binding tables:
  - `funnel_system_interest_bindings`
  - `funnel_source_bindings`
  - `funnel_template_bindings`

- `operator_funnel_plans`
  - `plan_id`
  - `funnel_id`
  - `plan_fingerprint`
  - `live_state_hash`
  - `plan_json`
  - `validation_json`
  - `status`: `draft | validated | staged | applied | expired | blocked`
  - `expires_at`

Compatibility migration must create a `Legacy / Unassigned` funnel and bind existing active interests/templates/channels without changing current behavior.

## Lane Routing

Default routing by signal type:

- `explicit_marker`: direct/hard evidence such as formal request, procurement marker or direct buyer ask. Default `routing_mode=evidence_led_review`, auto-select can be `evidence_or_llm` only with strong independent evidence, no noise and no technical veto.
- `hidden_intent`: indirect signs of need, pain, capacity pressure, long-term partner intent or operational friction. Default `routing_mode=llm_approved`; deterministic evidence may recover to hold/review but cannot select alone by default.
- `mixed_split`: mixed direct and hidden signals must split into separate lanes. If split is not possible, auto-select remains disabled.
- `context_only`: useful acquisition/follow-up context. It cannot be selected alone.
- `unknown`: calibration mode. Auto-select disabled until operator/admin/MCP config says otherwise.

## Shared Control Plane

Implement the funnel service in `runtime/node/packages/control-plane` and reuse it from MCP and admin. Do not duplicate funnel business logic in Astro pages or MCP handlers.

Required service operations:

- list/read/create/update/archive funnels;
- classify an idea into lanes;
- generate an autoplan;
- validate a plan;
- stage a plan with `planFingerprint` and `liveStateHash`;
- verify funnel state;
- audit overlap/conflicts across funnels.

Core validation:

- hidden/unknown lanes cannot use hard lexical gates without mandatory marker proof;
- mixed signals must split;
- context-only lanes cannot select alone;
- `selection_review` templates must require canonical JSON fields `decision`, `score`, `reason`;
- extraction/classification/scoring templates cannot affect selected;
- candidate cues must be observable literal fragments, not conceptual labels;
- stale plans are blocked by `liveStateHash`;
- risky manual writes require funnel/lane context or explicit shared/global scope, plus override reason and verification target when unsafe.

## MCP 2.0 Tools

Add or extend:

- `operator.funnels.list`
- `operator.funnels.read`
- `operator.funnel.autoplan`
- `operator.funnel.validate_plan`
- `operator.funnel.stage_plan`
- `operator.funnel.verify`
- `operator.funnels.overlap.audit`

Make these surfaces funnel-aware:

- `operator.flow.route`
- `operator.tuning.recommend`
- `operator.effect.verify`
- `operator.report.verify`
- `operator.selection.dashboard`
- `operator.selection.reindex_plan`
- `operator.selection.precision_audit`
- `signal_candidates.*`
- `content_items.*`
- `channels.*`
- `discovery.*`
- `maintenance.reindex.request`
- `llm_budget.summary`

Existing write tools keep their names and manual usefulness, but gain optional funnel context:

```json
{
  "payload": {},
  "funnelId": "...",
  "laneId": "...",
  "changeMode": "autopilot_setup | manual_tuning | expert_override",
  "funnelPlanId": "...",
  "planFingerprint": "...",
  "operator_override_reason": "...",
  "verificationTarget": "selection | source_health | llm_review | replay"
}
```

Manual route remains supported through `system_interests.*`, `llm_templates.*`, `channels.*`, `discovery.*` and `maintenance.reindex.request`.

## Admin Redesign

Admin becomes funnel-first while preserving old inventory screens for expert/manual work.

Primary nav:

- Funnels
- Signals
- Sources
- Discovery
- Rules
- System

New pages:

- `/funnels`
- `/funnels/new`
- `/funnels/[funnelId]`
- `/funnels/[funnelId]/plan`
- `/funnels/[funnelId]/lanes`
- `/funnels/[funnelId]/sources`
- `/funnels/[funnelId]/rules`
- `/funnels/[funnelId]/replay`
- `/funnels/[funnelId]/reports`
- `/funnels/[funnelId]/overlap`

Existing pages remain:

- System Interests
- LLM Templates
- Channels
- Discovery
- Signal Candidates
- Reindex
- Observability

Those pages must gain funnel filters, funnel attribution and backlinks to the owning funnel.

Novice UX:

1. Enter idea.
2. Review proposed funnel and lanes.
3. Validate plan.
4. Approve staged plan.
5. Apply scoped writes.
6. Run bounded replay.
7. Read verified report and next safe action.

Expert UX:

- edit interests/templates/channels manually;
- see funnel impact;
- unsafe edits require override reason;
- read-back and verification links are always shown.

## Discovery, Sources And Replay

Discovery vNext must carry funnel context for runs, artifacts, candidates, source inventory, routing decisions, probation handoff, replay, rollback and feedback.

Channels support funnel source bindings:

- one channel may feed multiple funnels;
- source role is per funnel;
- source health is not semantic proof;
- cleanup/archive must not delete shared sources by accident.

Reindex:

- bounded replay is preferred;
- full replay requires explicit override;
- replay jobs should link to funnel, plan or manual change.

## MCP Tokens And Audit

Add scopes:

- `read.funnels`
- `write.funnels`
- optional `write.funnel_plans`

Support funnel-bound tokens:

- token may manage only selected funnel ids;
- audit rows include token id, actor, funnel id, plan id, before/after and verification target.

Secret hygiene:

- MCP audit/log exports redact bearer tokens by default;
- tests must ensure MCP tokens are not written into docs artifacts.

## Documentation

After proof, document this as a unique SignalOps feature:

- `docs/features/mcp-funnel-autopilot.md`
- admin guide: funnel-first operations
- MCP guide: self-configuring multi-funnel setup
- scenario pack docs
- release notes/changelog

Positioning:

> Self-configuring multi-funnel signal discovery: an operator describes a business goal, and SignalOps builds safe funnel lanes, configures selection through MCP/admin, verifies replay quality, and explains why each signal was selected.

Docs must state:

- multiple funnels can run together;
- sources are shared, selection is funnel-scoped;
- hidden/mixed signals avoid broad keyword gates;
- manual expert tuning remains supported;
- runtime is domain-neutral.

## Tests

Tests-first coverage:

- autoplan creates hard/hidden/mixed/context/unknown lanes;
- multiple funnels can be active simultaneously;
- duplicate idea asks create/attach/split;
- mixed without split is blocked;
- hidden unsafe hard gates are blocked;
- bad `selection_review` template is blocked;
- manual tuning still works through old tools;
- risky manual write requires override;
- shared source feeds multiple funnels with different roles;
- funnel-scoped template does not affect other funnels;
- selected report filters by funnel/lane;
- stale staged plan is blocked;
- legacy migration does not change behavior;
- token redaction works.

Required commands as the capability matures:

- `pnpm check:domain-neutrality`
- `pnpm unit_tests:py`
- `pnpm unit_tests:ts -- mcp-control-plane admin-template-sync`
- `pnpm typecheck`
- `pnpm test:mcp:compose`
- `pnpm test:website:admin:compose`
- `pnpm test:web:ui-audit`
- `git diff --check`

## Acceptance Criteria

- MCP client can configure one or many funnels from unclear operator ideas.
- Manual route through interests/templates/channels remains available.
- Admin is funnel-first, while advanced inventory pages still work.
- Hard, hidden, mixed, context-only and unknown signals route safely.
- Funnels do not leak rules/templates/source semantics into each other.
- Reports explain funnel, lane, source role, evidence and selected reason.
- Existing data migrates without behavior regression.
- Documentation presents Funnel Autopilot 2.0 as a unique SignalOps feature.
- No domain-specific runtime hardcode is introduced.
