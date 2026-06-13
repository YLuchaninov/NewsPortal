# MCP Funnel Autopilot

SignalOps supports self-configuring multi-funnel signal discovery: an operator describes a business goal, and Funnel Autopilot builds safe lanes, configures selection through MCP/admin, verifies replay quality and explains why each signal was selected.

## What It Does

- Runs multiple funnels side by side without leaking rules, templates or source semantics between them.
- Splits ideas into safe lanes: explicit markers, hidden intent, mixed signals, context-only acquisition and unknown calibration.
- Keeps sources shared while making selection funnel-scoped through bindings and source roles.
- Uses `selection_review` LLM templates only when review can legitimately affect selection.
- Keeps the old expert route through system interests, LLM templates, channels, discovery and reindex, with optional funnel/lane context for scoped tuning.
- Stages and validates plans with live-state fingerprints so stale or risky writes are blocked before application.
- Materializes staged lane skeletons so subsequent MCP/admin writes can bind to a real lane, not only to a plan draft.
- Links bounded replay jobs back to the funnel and plan that requested them, so replay quality is auditable instead of being a loose background maintenance event.
- Carries funnel provenance through Discovery vNext writes, so candidate acquisition, probes, routing, policies and replay can be traced back to the funnel/lane that requested them.
- Writes worker-side funnel runtime attribution into final-selection explain data, so reports can show which funnel, lane, source role, selection-review template and bounded replay job participated in a decision.
- Supports funnel-bound MCP tokens so an external client can be delegated to one or more specific funnels instead of receiving workspace-wide funnel authority.
- Carries funnel scope through diagnostic read routes such as `operator.flow.route`, `operator.tuning.recommend`, `operator.effect.verify`, `operator.selection.dashboard`, `operator.selection.precision_audit`, `operator.report.verify` and `llm_budget.summary`.
- Makes signal/content reads funnel-aware: scoped `signal_candidates.*` and `content_items.*` calls return funnel/lane attribution and funnel-bound tokens cannot read arbitrary items outside their allowed funnels.
- Lets expert operators edit lane type, routing mode, policy JSON and evidence contracts from the funnel-first admin lane page with signed actions and audit events.

## Operator Flow

1. Describe the goal in MCP or admin.
2. Review the proposed funnel and lanes.
3. Validate the plan and fix blockers.
4. Stage the plan against the current live-state hash.
5. Apply scoped writes for interests, templates, sources and replay.
6. Run bounded replay with `docIds` and funnel/lane/plan context.
7. Read a verified report showing selected, rejected and held rows with funnel/lane attribution.

## Safety Rules

Hidden and unknown signals default away from hard lexical gates. Mixed ideas must split into lanes. Context-only evidence can feed acquisition but cannot select by itself. Broad words such as `ai`, `partner` or `development` are not enough to auto-select a row.

Runtime logic remains domain-neutral. Domain words may live in admin/MCP config, scenario packs, examples or database rows, but not in hardcoded selection branches.

## Manual Tuning

Expert operators can still edit system interests, LLM templates, channels, discovery policies and reindex requests directly. When those writes include `changeMode`, MCP requires funnel/lane context or explicit shared/global scope plus a `verificationTarget`. Scoped system-interest, LLM-template, channel and bounded reindex writes return `funnelWriteContext`, funnel binding details and funnel/report read-back guidance so clients can verify the blast radius immediately.

The admin funnel lane page is the manual control point for lane-level routing. Operators can adjust lane type, routing mode, policy JSON and evidence contracts while staying inside the funnel surface; each successful edit is audited as a funnel-lane change.

Discovery vNext tools keep their old names, but scoped writes accept the same funnel context fields. MCP strips those metadata fields before calling the backend Discovery API, records the discovery tool/result ids in audit with the funnel write context, and returns funnel read-back guidance. Funnel-bound tokens must pass an allowed `funnelId` for discovery writes; they cannot silently create shared/global discovery state.

Funnel-scoped backfill replay is intentionally bounded by default. `maintenance.reindex.request` requires `payload.options.docIds` for funnel-scoped backfill unless the operator uses `changeMode=expert_override` with an override reason; successful scoped requests are recorded in `funnel_reindex_job_bindings`.

MCP tokens may include `funnelScope.allowedFunnelIds`. Empty scope keeps legacy unrestricted behavior; a non-empty list limits funnel list/read/update/stage/verify/report/replay access to those funnel ids. Creating a brand-new funnel requires an unrestricted token or the admin UI followed by issuing a funnel-bound token.

Diagnostic reads preserve the same context. A token bound to one funnel can default `operator.flow.route`, tuning recommendations, selection dashboards, precision audits and effect checks to that funnel. A token bound to multiple funnels must pass `funnelId`, which prevents the MCP client from accidentally diagnosing global workspace state while acting on one funnel.

When a client passes `funnelId`/`laneId`, or uses a funnel-bound token, `signal_candidates.list` and `content_items.list` read from funnel-scoped selection truth instead of global inventory. Detail and explain calls attach `funnelAttribution`; if attribution cannot prove access for a bound token, MCP rejects the read before fetching backend item details.

`llm_budget.summary` remains a global account view. With funnel context it adds bound-template and review-log participation, and explicitly warns that the global cap should not be treated as an isolated per-funnel budget.

## Explainability

Reports should answer:

- which funnel and lane selected or blocked the item;
- which source role fed it;
- which interest/profile and LLM template participated;
- which bounded replay job or staged plan produced the current runtime evidence, when the decision came from scoped replay;
- whether selection came from semantic match, evidence-led candidate signals or LLM approve;
- which technical veto, noise group or calibration gap blocked the item;
- what next action is safe.
