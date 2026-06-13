# AIDP Work State

## Completed Bugfix: SIGNALOPS-MAX-VERIFY-LINT-1

- id: `SIGNALOPS-MAX-VERIFY-LINT-1`
- lifecycle: `normal`
- route: `bugfix`
- route phase: `completed-maximum-local-release-verification`
- route-specific next step: none inside this bugfix; any production/staging rollout or live funnel retuning remains a separate operator action through MCP/admin.
- route-specific proof: maximum local release verification found two real blockers and both were fixed. `pnpm release:verify` first failed at `pnpm lint` with `F841 Local variable item_level_candidate_signal is assigned to but never used` in `services/workers/app/final_selection.py`; the dead assignment was removed. The next `pnpm release:verify` and standalone `pnpm integration_tests` reproduced `Timed out waiting for scheduled digest delivery`; live local DB inspection showed the scheduled digest worker wrote `skipped_empty` after the deterministic proof seed no longer satisfied the same selected/feed-eligible contract as the scheduled digest query. `infra/scripts/test-mvp-internal.mjs` now re-materializes the deterministic MVP match before forcing the due digest and waits on the exact scheduled-digest eligibility contract before delivery assertion.
- status: `done-local-proof`
- risk: `low`
- approval: explicit operator request to run maximum verification and fix blockers if verification finds them; no production/staging writes or destructive cleanup are approved.
- planning required: no, narrow verification-blocker bugfixes.
- planning source: `none`
- planning status: `absent`
- blueprint context checked: selection/worker neighborhood already checked by the completed Funnel Autopilot capability; this bugfix removes dead local assignment and stabilizes deterministic product proof seeding without changing selection runtime behavior.
- allowed paths: `.aidp/**`, `services/workers/app/final_selection.py`, `infra/scripts/test-mvp-internal.mjs`.
- cleanup status: `pnpm release:verify` completed final local cleanup; `docker ps --format '{{.Names}} {{.Status}}'` returned no running compose containers after verification.

### Proof

- `pnpm lint:py` passed after removing the unused final-selection local assignment.
- `pnpm unit_tests:py -- tests/unit/python/test_selection_write_repository.py` passed (`405` Python tests; existing historical replay timeout log is non-fatal in the test harness).
- Standalone `pnpm integration_tests` reproduced the scheduled digest blocker before the proof fix, then passed after re-seeding/preflight hardening.
- Final `pnpm release:verify` passed end-to-end; artifact dir: `/var/folders/gj/98r17hrj3kbbssygxmn76nlm0000gn/T/signalops-release-verify-fd0b9751`; summary: `/var/folders/gj/98r17hrj3kbbssygxmn76nlm0000gn/T/signalops-release-verify-fd0b9751/release-verify-summary.json`.
- Release proof included compliance/secret-leak check, operator truth parity, lint, typecheck, TS/Python unit tests, workspace/node/runtime builds, production compose image build/content/size checks, `product-local-core`, `product-local-full`, MCP deterministic scenarios including `funnel-autopilot-flows`, admin/website/automation compose proofs, web viewport proof, UI button audit, discovery-enabled proof, and live website matrix diagnostics.
- `pnpm check:domain-neutrality` passed after the release gate.
- `pnpm check:secret-leaks` passed after the release gate (`963` tracked files scanned).
- `git diff --check` passed after the release gate.

## Completed Capability: SIGNALOPS-FUNNEL-AUTOPILOT-2

- id: `SIGNALOPS-FUNNEL-AUTOPILOT-2`
- lifecycle: `normal`
- route: `capability` for Funnel Autopilot 2.0: multi-funnel MCP autopilot, manual funnel tuning, funnel-first admin, scoped routes/reports, and durable documentation.
- route phase: `completed-local-proof-runtime-read-routes-and-admin-stage`
- route-specific next step: no code next step inside this approved item; production/staging rollout, real funnel configuration, and precision/recall tuning remain separate operator actions through MCP/admin.
- route-specific proof: v2.0 implementation plan artifact, tests-first TS coverage for funnel planning/validation/staging/verification, guarded legacy writes, scoped bounded replay, funnel-bound tokens, funnel-scoped content reads, scoped Discovery vNext write provenance, audited admin lane editing, worker-side final-selection funnel runtime attribution, funnel-aware diagnostic read routes including `llm_budget.summary`, admin plan-page lane staging, MCP HTTP funnel autopilot scenario with lane staging, scoped discovery run create, scoped manual system-interest write, scoped content reads, scoped `maintenance.reindex.request` binding, selection report funnel scope and overlap audit, admin compose smoke, Python unit suite, `pnpm typecheck`, `pnpm check:domain-neutrality`, and `git diff --check`.
- status: `done-local-proof`
- risk: `medium-high`
- approval: explicit operator request to implement the accepted Funnel Autopilot 2.0 plan; no production/staging writes and no destructive cleanup are approved.
- planning required: yes for capability/API/data/admin boundary changes.
- planning source: `external-spec/tool-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` PostgreSQL business truth, MCP/control-plane/admin boundary, final-selection truth, source/discovery ownership; `.aidp/contracts/mcp-control-plane.md`, `.aidp/contracts/universal-selection-profiles.md`, `.aidp/contracts/zero-shot-interest-filtering.md`.
- allowed paths: `.aidp/**`, `docs/**`, `database/migrations/**`, `packages/contracts/**`, `packages/control-plane/**`, `services/mcp/**`, `services/workers/**`, `apps/admin/**`, `tests/unit/**`.
- cleanup status: MCP compose proof created temporary local canary funnel/interest state and cleaned it through scenario cleanup; proof artifacts are retained under `/tmp`; local compose services are intentionally left running and healthy for operator follow-up.

### Scope

Build Funnel Autopilot 2.0 as a first-class, domain-neutral product capability.

In scope:

- durable v2.0 plan file under `docs/plans`;
- multi-funnel data model and compatibility path for existing interests/templates/channels;
- shared control-plane funnel service reused by MCP and admin;
- MCP funnel tools and funnel-aware routing/reporting surfaces;
- manual tuning mode through existing interests/templates/channels/discovery/reindex routes;
- funnel-first admin cockpit and advanced inventory backlinks;
- documentation after proof positioning the feature as unique SignalOps functionality.

Out of scope:

- production/staging writes;
- destructive cleanup of existing local data;
- replacing `final_selection_results` as primary selection truth;
- runtime domain-specific hardcode.

### Current Proof Status

- Created durable plan artifact `docs/plans/funnel-autopilot-2.0-implementation.md` to preserve the agreed Funnel Autopilot 2.0 scope: multi-funnel model, novice MCP autopilot, manual tuning route, funnel-first admin, hard/hidden/mixed/context/unknown routing, guarded workflow, scoped replay/reports, and feature docs.
- Added migration `database/migrations/0064_funnel_autopilot_foundation.sql` with `operator_funnels`, `funnel_lanes`, funnel bindings for system interests/sources/templates, `operator_funnel_plans`, and a Legacy / Unassigned compatibility funnel that binds existing active interests/templates/channels without changing current behavior.
- Added migration `database/migrations/0065_funnel_reindex_job_bindings.sql` with `funnel_reindex_job_bindings`, linking bounded replay jobs to funnels, lanes, plans and verification targets without replacing `reindex_jobs`.
- Added migration `database/migrations/0066_mcp_token_funnel_scope.sql` with `mcp_access_tokens.funnel_scope_json`, preserving unrestricted legacy tokens by default while allowing new tokens to be scoped to explicit funnel ids.
- Added shared control-plane service `packages/control-plane/src/funnels.ts`, exported from `packages/control-plane/src/index.ts`, for list/read/create/update/archive, idea lane classification, autoplan, validate, stage, verify, and overlap audit. MCP and admin reuse this service instead of duplicating funnel business logic in handlers/pages.
- Added/extended MCP tools:
  - `operator.funnels.list/read/create/update/archive`;
  - `operator.funnel.autoplan/validate_plan/stage_plan/verify`;
  - `operator.funnels.overlap.audit`;
  - `operator.report.verify reportKind=selection` accepts `entityIds.funnelIds` and attaches funnel-scoped verification/read-back.
- Added funnel attribution read-back in `operator.funnel.verify includeSamples=true`: samples include funnel/lane, interest binding, source role, final decision, selected/blocker/hold reason, candidate-signal tier, and final-selection timestamps. `final_selection_results` remains the selection truth.
- Added funnel-first admin foundation:
  - primary nav `Funnels`;
  - BFF action scope `funnels`;
  - pages `/funnels`, `/funnels/new`, `/funnels/[funnelId]`, and `/funnels/[funnelId]/{plan,lanes,sources,rules,replay,reports,overlap}`;
  - old inventory pages remain available for expert/manual tuning.
- Preserved manual route through existing `system_interests.*`, `llm_templates.*`, `channels.*`, discovery and reindex tools; write schemas now have optional funnel context fields (`funnelId`, `laneId`, `changeMode`, `funnelPlanId`, `planFingerprint`, `operator_override_reason`, `verificationTarget`) for guarded follow-through.
- Added guarded MCP follow-through for legacy manual tuning routes:
  - `system_interests.create/update` require funnel/shared/global scope when `changeMode` is supplied, require `verificationTarget`, validate funnel/lane ids, audit scoped context, bind created/updated interests through `funnel_system_interest_bindings`, and return `funnelWriteContext`, `funnelBinding`, and funnel read-back guidance;
  - `llm_templates.create/update` apply the same guard/audit/binding pattern through `funnel_template_bindings`;
  - `channels.create/update/bulk_onboard.apply` apply the same guard/audit/binding pattern through `funnel_source_bindings`, with per-funnel `sourceRole` support and separate `funnelPlanFingerprint` for bulk onboarding plans.
- Added guarded MCP follow-through for scoped replay:
  - `operator.selection.reindex_plan` accepts funnel/lane/plan/fingerprint context and emits funnel-scoped `maintenance.reindex.request` templates;
  - `maintenance.reindex.request` validates funnel/lane/plan ids when funnel context is supplied, rejects unbounded funnel-scoped backfill unless `changeMode=expert_override`, stores funnel provenance in `options_json`, binds successful requests through `funnel_reindex_job_bindings`, audits the write context, and returns replay binding/read-back guidance.
- `operator.funnel.stage_plan` now materializes lane skeleton rows from validated plan lanes for the scoped funnel and returns staged `laneId`s, so old manual routes can safely bind writes to a real lane instead of a plan-only lane draft.
- Added MCP token scopes `read.funnels` and `write.funnels`; existing broad read tokens remain compatible.
- Added funnel-bound MCP token enforcement:
  - token issue/list/read-back normalizes sanitized `funnelScope.allowedFunnelIds`;
  - admin MCP token BFF/UI can issue unrestricted or funnel-bound tokens;
  - bound tokens cannot create new funnels and cannot read/update/archive/stage/verify/overlap/report/reindex outside their allowed funnel ids;
  - empty funnel scope preserves existing unrestricted token behavior and token secrets remain write-only.
- Added funnel-scoped content read support:
  - shared control-plane helpers list funnel-scoped content rows and read doc-level funnel attribution from `final_selection_results`, `interest_filter_results`, funnel bindings and source roles;
  - `signal_candidates.list` and `content_items.list` switch to DB-backed funnel-scoped rows when `funnelId`, `laneId` or a funnel-bound token is present;
  - `signal_candidates.read/explain` and `content_items.read/explain` attach `funnelAttribution` and reject bound-token reads when item-to-funnel attribution cannot be proven before backend detail fetch.
- Added guarded MCP follow-through for Discovery vNext writes:
  - `discovery.*` write schemas accept optional funnel/lane/change/plan/verification context while keeping old tool names;
  - scoped Discovery writes validate funnel/lane/plan ids, enforce funnel-bound token scope, strip MCP-only funnel metadata before backend API calls, audit discovery tool/result ids with `mcp_funnel_write_context_recorded`, and return `funnelWriteContext` plus funnel read-back guidance;
  - unrestricted legacy discovery writes remain compatible and domain-neutral.
- Added audited admin lane editing:
  - shared control-plane API `updateOperatorFunnelLane` edits lane name, lane type, routing mode, policy JSON and evidence-contract JSON while writing an `operator_funnel_lane_updated` audit event;
  - admin BFF `/bff/admin/funnels` supports signed `update_lane` writes with canonical lane/routing validation and JSON-object validation;
  - admin `/funnels/[funnelId]/lanes` now lets expert operators edit lane routing/policy/evidence contracts without leaving the funnel-first surface.
- Added worker/runtime attribution:
  - final-selection writes attach `explain_json.funnelRuntimeAttribution` when active funnel bindings are observable through evaluated system interests, source channel, `selection_review` templates or bounded replay jobs;
  - MCP/reporting surfaces expose the runtime attribution so external clients can explain which funnel/lane/source role/template/replay participated without inferring from inventory alone;
  - attribution remains explainability metadata and does not make source membership a semantic selection proof.
- Added funnel-aware diagnostic read routes:
  - `operator.flow.route`, `operator.tuning.recommend`, `operator.effect.verify`, `operator.selection.dashboard`, `operator.selection.precision_audit`, `operator.selection.reindex_plan`, `operator.report.verify`, `signal_candidates.*`, `content_items.*` and `llm_budget.summary` carry funnel/lane context where applicable;
  - single-funnel-bound tokens can default reads to that funnel, while multi-funnel-bound tokens must pass `funnelId`;
  - `llm_budget.summary` keeps global budget semantics but adds funnel-bound template/review participation and an explicit warning that it is not an isolated per-funnel cap.
- Added admin plan staging:
  - `/funnels/[funnelId]/plan` can stage autoplan lanes from the funnel goal through the existing shared control-plane `buildOperatorFunnelAutoplan` and `stageOperatorFunnelPlan` services;
  - staged lanes become editable on `/funnels/[funnelId]/lanes`, keeping novice setup and expert lane tuning in the same funnel-first admin surface.
- Updated contracts and feature documentation:
  - `.aidp/contracts/mcp-control-plane.md`;
  - `.aidp/contracts/universal-selection-profiles.md`;
  - `.aidp/contracts/zero-shot-interest-filtering.md`;
  - `docs/features/mcp-funnel-autopilot.md`.
- Fixed an admin schema trap found during UI audit: system-interest form boolean values for auto-select policy are normalized before strict BFF validation, so old manual template editing remains usable after adding Funnel Autopilot fields.
- Proof passed:
  - `pnpm unit_tests:ts -- funnel-autopilot` (`477` TS tests in the harness);
  - `pnpm unit_tests:py` (`404` Python tests);
  - `pnpm typecheck` (0 errors; existing Astro hints only);
  - `pnpm test:mcp:compose -- --scenario=funnel-autopilot-flows`, artifact `/tmp/signalops-mcp-http-deterministic-fbfe1bb7-3f0c-4d67-b24f-c23f8f77f14f.json` and `.md`;
  - `pnpm test:website:admin:compose`;
  - `pnpm test:web:ui-audit` (`ui-button-audit-ok`, run id `e1336357`);
  - `pnpm check:domain-neutrality`;
  - `git diff --check`.
- Additional guarded manual-route proof passed after the foundation slice:
  - `pnpm unit_tests:ts -- mcp-control-plane funnel-autopilot` (`480` TS tests);
  - `pnpm typecheck` (0 errors; existing Astro hints only);
  - `pnpm test:mcp:compose -- --scenario=funnel-autopilot-flows`, artifact `/tmp/signalops-mcp-http-deterministic-0e3adc6b-3686-41ec-b3ab-4eaf52b8c313.json` and `.md`;
  - `pnpm check:domain-neutrality`;
  - `git diff --check`;
  - local compose services were observed healthy after proof with `docker ps --format '{{.Names}} {{.Status}}'`.
- Additional scoped replay proof passed after replay binding slice:
  - `pnpm unit_tests:ts -- mcp-control-plane funnel-autopilot` (`481` TS tests);
  - `pnpm typecheck` (0 errors; existing Astro hints only);
  - `pnpm test:mcp:compose -- --scenario=funnel-autopilot-flows`, artifact `/tmp/signalops-mcp-http-deterministic-2c28665e-e919-4fbe-a79a-6ff6d84941b3.json` and `.md`.
- Additional funnel-bound token proof passed after token-scope slice:
  - `pnpm unit_tests:ts -- mcp-control-plane funnel-autopilot` (`481` TS tests);
  - `pnpm typecheck` (0 errors; existing Astro hints only);
  - `pnpm test:mcp:compose -- --scenario=funnel-autopilot-flows`, artifact `/tmp/signalops-mcp-http-deterministic-4fea0c29-92ad-4eee-89a3-176254da2bbe.json` and `.md`.
- Additional funnel-scoped content proof passed after content-scope slice:
  - `pnpm unit_tests:ts -- mcp-control-plane funnel-autopilot` (`482` TS tests);
  - `pnpm typecheck` (0 errors; existing Astro hints only);
  - `pnpm test:mcp:compose -- --scenario=funnel-autopilot-flows`, artifact `/tmp/signalops-mcp-http-deterministic-e8b05933-08b4-4ce9-a73f-3aa00b527a2b.json` and `.md`.
- Additional Discovery vNext provenance proof passed after discovery-provenance slice:
  - `pnpm unit_tests:ts -- mcp-control-plane funnel-autopilot` (`484` TS tests);
  - `pnpm typecheck` (0 errors; existing Astro hints only);
  - `pnpm test:mcp:compose -- --scenario=funnel-autopilot-flows`, artifact `/tmp/signalops-mcp-http-deterministic-892e1fb2-e183-42b3-8012-97ba6bcd823e.json` and `.md`;
  - `pnpm check:domain-neutrality`;
  - `git diff --check`.
- Additional admin lane editing proof passed after lane-editing slice:
  - `pnpm unit_tests:ts -- funnel-autopilot admin-action-kit schema-registry` (`485` TS tests);
  - `pnpm typecheck` (0 errors; existing Astro hints only);
  - `pnpm test:website:admin:compose` (`website-admin-ok`, channel `40bd19a9-5767-44eb-be5d-76e9eb4b02fc`, projected signal candidate `cee79f22-ea00-4b8b-b0df-43ba1638ebc0`).
- Additional runtime/read-route/admin-stage proof passed after completion slice:
  - `pnpm unit_tests:py -- tests/unit/python/test_selection_write_repository.py` (`405` Python tests);
  - `pnpm unit_tests:ts -- mcp-control-plane funnel-autopilot` (`486` TS tests);
  - `pnpm unit_tests:ts -- funnel-autopilot admin-action-kit schema-registry` (`486` TS tests);
  - `pnpm typecheck` (0 errors; existing Astro hints only);
  - `pnpm test:mcp:compose -- --scenario=funnel-autopilot-flows`, artifact `/tmp/signalops-mcp-http-deterministic-d7990657-376e-4f13-9771-446f77ef116d.json` and `.md`;
  - `pnpm test:website:admin:compose` (`website-admin-ok`, channel `69721371-fea0-4b52-8b91-5fa5147433ff`, projected signal candidate `e3708250-51e6-401c-85d9-d6e24bddcd4a`);
  - `pnpm test:web:ui-audit` (`ui-button-audit-ok`, run id `3a817df5`);
  - `pnpm check:domain-neutrality`;
  - `git diff --check`.
- Closure note: this item delivered the durable data model, shared control-plane service, MCP/admin vertical path, guarded validation/staging, guarded legacy/manual writes for system interests, LLM templates, channels, Discovery VNext writes and bounded replay, funnel-bound token enforcement, funnel-scoped reporting/read-back, worker runtime attribution, funnel-aware diagnostics, admin lane editing and admin lane staging. Actual production/staging rollout and domain-specific funnel configuration remain separate MCP/admin operator actions; no domain-specific runtime hardcode was introduced.

## Completed Operator Closure: SIGNALOPS-OUTSOURCING-AUTOSELECT-CONFIG-REPLAY-1

- id: `SIGNALOPS-OUTSOURCING-AUTOSELECT-CONFIG-REPLAY-1`
- lifecycle: `normal`
- route: `delivery` for local operator config application, bounded selection replay, and precision/recall report after the domain-neutral auto-select capability landed.
- route phase: `completed-local-mcp-admin-config-and-bounded-replay`
- route-specific next step: optional follow-up is to label/explain the remaining project/buyer-intent holds before broadening recall; no blind auto-select expansion is open under this item.
- route-specific proof: MCP/admin read-back of updated system interests, completed bounded reindex jobs `0bc954f6-2f3e-494d-8f3d-1b84d984814d` and `3085a773-2d52-4cea-b49c-c50d765155ab`, `operator.report.verify reportKind=selection includeSamples=true`, `operator.selection.precision_audit`, `operator.report.verify reportKind=selection_hold_quality includeSamples=true`, and read-only hold lists.
- status: `completed-with-recall-residual`
- risk: `medium`
- approval: explicit operator request to apply current outsourcing tuning, run bounded replay, and inspect precision/recall report; limited to local compose/MCP/admin state with no production/staging writes and no destructive source cleanup.
- planning required: yes for stateful operator workflow.
- planning source: `AIDP-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` PostgreSQL business truth, final-selection truth, API/control-plane/admin writes; `.aidp/contracts/mcp-control-plane.md`, `.aidp/contracts/universal-selection-profiles.md`, `.aidp/contracts/zero-shot-interest-filtering.md`.
- allowed files: `.aidp/**` only unless a blocking code/schema issue is found and separately approved.
- allowed runtime surfaces: local Docker Compose PostgreSQL/API/MCP/admin through declared MCP/admin/maintenance surfaces; read-only SQL allowed for diagnosis, but config writes must go through MCP/admin.
- cleanup status: completed for temporary MCP tokens; compose was already running before this item and was intentionally left running for the operator.

### Scope

Apply the newly implemented auto-select policy to current outsourcing-like local configuration without domain-specific runtime code.

In scope:

- read current local MCP/admin/system-interest state;
- update scoped system interests through MCP/admin canonical fields;
- run bounded selection replay over relevant docIds only;
- verify selected precision/recall samples and explain selected source (`semantic_match`, evidence-led candidate signals, LLM approve);
- record results in this item.

Out of scope:

- production/staging writes;
- destructive cleanup/archive of sources unless explicitly approved after report;
- direct SQL config writes that bypass MCP/admin;
- new code changes unless replay exposes a real blocking bug.

### Current Proof Status

- Local compose/MCP/admin stack was running and healthy; no production/staging writes were performed.
- Current local outsourcing interests were found via MCP/admin: `outsourcing_rfp_generic`, `outsourcing_qa_testing`, `outsourcing_web_mobile_dev`, `outsourcing_scale_pressure`, `outsourcing_cost_reduction`, `outsourcing_legacy_frustration`, `outsourcing_smb_digitalization`, and `outsourcing_ai_ml`.
- First MCP/admin write applied domain-neutral auto-select policy through canonical `system_interests.update` fields:
  - `outsourcing_rfp_generic`: `signalVisibility=explicit_marker`, `autoSelectMode=evidence_or_llm`, no-noise/no-technical-veto required;
  - hidden outsourcing interests: `signalVisibility=hidden_intent`, `autoSelectMode=llm_approved`;
  - all profiles: structured candidate-signal tiers and near-miss negative groups.
- First bounded replay `0bc954f6-2f3e-494d-8f3d-1b84d984814d` completed for 40 docIds. It improved precision but over-held explicit RFP-like items: selected moved `253 -> 213`, gray `35 -> 68`, rejected `735 -> 742`; bounded sample became `0 selected / 33 gray / 7 rejected`.
- Read-back/explain showed two config issues, not runtime domain hardcode issues:
  - `wrapper_directory_noise` cue `overview` was too broad and vetoed an explicit "Request for Proposals: Website Developer" item;
  - explicit RFP evidence was only two groups, while evidence-led auto-select requires strong item-level evidence (`evidenceLedUplift`), effectively three or more independent groups and four or more cue hits.
- Second MCP/admin tuning pass removed the broad `overview` noise cue, added explicit-RFP process/scope groups (`procurement_process_marker`, `technology_delivery_scope`), and added scoped negatives for `RFP NOT INCLUDED` and unrelated procurement. No product runtime code was changed.
- Second bounded replay `3085a773-2d52-4cea-b49c-c50d765155ab` completed for the same 40 docIds:
  - global local counts after replay: `selected=224`, `gray_zone=55`, `rejected=770`;
  - bounded sample after replay: `11 selected`, `20 gray_zone`, `9 rejected`;
  - selected reason breakdown includes `11 evidence_led_candidate_signal` and `213 strong_item_level_candidate_signal`;
  - Dev.to/tutorial/editorial noise did not enter `selected`;
  - explicit RFP/technology procurement samples selected via evidence-led candidate signals;
  - `INFO ONLY, RFP NOT INCLUDED` samples were rejected.
- Precision audit after replay: inspected selected sample `61` high-quality vs `39` weak selected, with bucket counts `strong_project_signal=60`, `probable_signal=1`, `context_only=39`, `noise=0`. This improves the initial audit (`53` high-quality, `47` weak, `7` noise) but does not make selected perfect.
- Hold-quality report remains `partial`: `55` holds remain, `49 project_intent` and `6 buyer_intent`, all `verificationState=weak`, with `llmReviewPending=0`. This is the current recall residual and should be handled by representative hold labeling/explain before expanding auto-select.
- Artifacts:
  - `/tmp/signalops-outsourcing-probe.json`;
  - `/tmp/signalops-outsourcing-apply.json`;
  - `/tmp/signalops-outsourcing-retune.json`;
  - `/tmp/signalops-outsourcing-read-reports.json`.

## Active Capability/Bugfix: SIGNALOPS-DOMAIN-NEUTRAL-AUTOSELECT-POLICY-1

- id: `SIGNALOPS-DOMAIN-NEUTRAL-AUTOSELECT-POLICY-1`
- lifecycle: `normal`
- route: `capability` with an initial `bugfix` slice for over-permissive candidate-signal selected behavior exposed by MCP audit evidence.
- route phase: `done-domain-neutral-autoselect-with-admin-parity`
- route-specific next step: no code next step; production/current DB tuning remains a separate MCP/admin operation after operator approval and bounded replay.
- route-specific proof: targeted and full Python final-selection tests, TS MCP/control-plane/admin-template tests, `pnpm check:domain-neutrality`, `pnpm typecheck`, `pnpm unit_tests:py`, `git diff --check`, and MCP compose proof.
- status: `done`
- risk: `medium`
- approval: explicit operator request to implement the accepted plan; no production writes, no destructive DB cleanup, and no domain-specific runtime hardcode.
- planning required: yes for capability/policy/interface change.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` PostgreSQL business truth, `final_selection_results` primary selection truth, system-selected/personalization separation, API/control-plane/MCP boundary, and no domain-specific runtime hardcode invariants.
- allowed paths: `.aidp/**`, `services/workers/app/**`, `services/mcp/src/**`, `packages/contracts/**`, `packages/control-plane/**`, `apps/admin/src/**`, `tests/unit/python/**`, `tests/unit/ts/**`, `database/migrations/**`, `database/ddl/**`.
- cleanup status: no runtime DB/config cleanup performed; outsourcing/current DB tuning remains a separate MCP/admin action after code proof.

### Scope

Implement configurable, domain-neutral automatic selection for matching signals.

In scope:

- selection profile policy for auto-select mode, signal visibility, and evidence thresholds;
- final-selection behavior that auto-selects only when configured evidence/LLM conditions are met;
- MCP/admin schema/read-back support for auto-select policy and structured candidate signal groups;
- tests proving explicit-marker auto-select, hidden-signal LLM-only auto-select, generic-noise rejection, and technical veto behavior.

Out of scope:

- hardcoding outsourcing, RFPMart, Dev.to, Reddit, RFP or other domain/source names in runtime logic;
- destructive cleanup of channels/interests/templates;
- production/staging writes;
- broad unrelated refactors.

### Current Proof Status

- Started after MCP audit of `docs/mcp_test/audit.log` and local PostgreSQL read-only inspection showed current selected rows can be driven by weak candidate-signal consensus.
- Implemented domain-neutral auto-select policy parsing in worker runtime and control-plane profile sync.
- Final selection now selects from candidate signals only through explicit evidence-led auto-select counts, or through LLM-approved auto-select counts; document-level technical veto and verification conflict still block selected.
- MCP/admin write schemas now expose canonical auto-select fields and structured candidate signal groups; invalid camelCase aliases are not advertised and return canonical-field errors.
- LLM prompt templates now have `purpose`; only `selection_review` templates are eligible for selection-review worker prompts, while structured extraction/classification/scoring templates are separated from selected decisions.
- MCP guidance/playbooks/reference text now says candidateSignals can auto-select only through explicit policy plus evidence thresholds/veto checks.
- Follow-up read-only audit found browser-admin duplicate implementation and partial-update hydration still lacked the new auto-select fields, so this item was reopened for parity repair before final closure.
- Browser-admin parity repair added auto-select policy controls to interest template create/edit, LLM `purpose` controls to prompt template create/edit, and update hydration that preserves structured candidate-signal group tiers, auto-select policy thresholds, and LLM purpose on partial edits.
- Proof passed:
  - `pnpm unit_tests:py -- tests/unit/python/test_selection_profiles.py tests/unit/python/test_final_selection.py`;
  - `pnpm unit_tests:ts -- mcp-control-plane admin-template-sync`;
  - `pnpm check:domain-neutrality`;
  - `pnpm typecheck`;
  - `pnpm unit_tests:py`;
  - `git diff --check`;
  - `pnpm test:mcp:compose` with artifacts `/tmp/signalops-mcp-http-deterministic-9ff4b60c-933e-4ef3-97ac-aae8d321aafb.json` and `.md`.

## Completed Delivery With Staging Residual: SIGNALOPS-LIVE-PROOF-CONSOLIDATION-1

- id: `SIGNALOPS-LIVE-PROOF-CONSOLIDATION-1`
- lifecycle: `normal`
- route: `delivery` for final verification/consolidation after live-signal proof passed.
- route phase: `completed-release-verified-with-staging-residual`
- route-specific next step: remote/disposable staging write/read-back lanes remain blocked until explicit staging URL/token/run namespace/cleanup policy/budget environment is provided; no product/source changes are open under this delivery item.
- route-specific proof: targeted live-signal proof passed; final consolidation ran static/unit/operator checks, selected compose smoke gates touched by recent fixes, full `pnpm release:verify`, `git diff --check`, cleanup/down, and `docker ps` empty proof.
- status: `completed-with-staging-residual`
- risk: `medium-high`
- approval: explicit operator request "давай делай все что надо"; no production/staging writes without explicit disposable staging configuration.
- planning required: yes for complex delivery consolidation.
- planning source: `AIDP-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` runtime/delivery boundary, PostgreSQL business truth, `final_selection_results` primary selection truth; `.aidp/verification.md` live/external-provider proof residual policy.
- allowed paths: `.aidp/**` for proof state; no product/source writes unless a failing gate opens a separate narrow bugfix item.
- cleanup status: completed; targeted cleanup wrote `/tmp/signalops-product-local-cleanup-55345f62.json` and `.md`; release cleanup wrote `/tmp/signalops-product-local-cleanup-f0268f61.json` and `.md`; `pnpm dev:mvp:internal:down` stopped/removed compose services and network, and `docker ps --format '{{.Names}} {{.Status}}'` returned no running containers after targeted and release proof.

## Scope

Consolidate the live-proof outcome after the live-signal lane was fixed and passed.

In scope:

- run available local/static/unit/operator/compose gates;
- classify unavailable staging lanes based on environment preflight;
- record exact artifacts and residuals;
- leave dirty worktree changes intact.

Out of scope:

- production writes;
- staging writes without explicit disposable credentials/policy;
- new behavior changes under this delivery item.

## Current Proof Status

- Staging preflight:
  - `SIGNALOPS_MCP_URL`, `SIGNALOPS_MCP_TOKEN`, `SIGNALOPS_STAGING_MCP_URL`, `SIGNALOPS_STAGING_API_URL`, `SIGNALOPS_STAGING_MCP_TOKEN`, `SIGNALOPS_STAGING_RUN_NAMESPACE`, `SIGNALOPS_STAGING_DISPOSABLE`, `SIGNALOPS_STAGING_CLEANUP_POLICY`, and `SIGNALOPS_STAGING_MAX_BUDGET_CENTS` were absent in the local environment.
  - Remote/disposable staging write/read-back proof was therefore blocked, not counted as pass.
- Static/operator/policy proof passed:
  - `pnpm check:operator-truth-parity`;
  - `pnpm check:domain-neutrality`;
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm check:dependency-compliance`;
  - `pnpm check:env-sync`;
  - `pnpm check:secret-leaks`.
- Build/release proof passed:
  - `pnpm check:compliance`;
  - `pnpm build`;
  - `pnpm build:node-runtime`;
  - `pnpm release:verify`;
  - release artifact directory `/var/folders/gj/98r17hrj3kbbssygxmn76nlm0000gn/T/signalops-release-verify-98b300be`;
  - release summary `/var/folders/gj/98r17hrj3kbbssygxmn76nlm0000gn/T/signalops-release-verify-98b300be/release-verify-summary.json`;
  - production image content and runtime image-size checks passed for web, admin, relay, migrate, fetchers, mcp, api, and worker images.
- Unit proof passed:
  - `pnpm unit_tests:ts` (`469` tests);
  - `pnpm unit_tests:py` (`399` tests; suite OK, with a non-fatal historical replay LLM review timeout log).
- Compose/UI/operator proof passed:
  - `pnpm test:mcp:compose`;
  - artifacts `/tmp/signalops-mcp-http-deterministic-920d1627-986d-42b3-8d14-fa5aa1b3c465.json` and `.md`;
  - `pnpm test:web:viewports`, including seeded `/collections/system-selected` item `signal_candidate:e57a7c72-253a-48fc-b926-7f0d00f5a4bd` across desktop/tablet/mobile;
  - `pnpm test:web:ui-audit`, status `ui-button-audit-ok`, run id `4e2aa9d1`; Web Push connect was skipped because the test browser had no active Service Worker, while the broader UI audit passed;
  - `pnpm test:website:admin:compose`, status `website-admin-ok`, with website resources projection and admin bulk update proof.
- Product-local release proof passed:
  - product local core artifacts `/tmp/signalops-product-local-core-2c65b966.json` and `.md`;
  - product local full artifacts `/tmp/signalops-product-local-full-2e40bc7c.json` and `.md`;
  - local core/full covered migrations smoke, relay, RSS ingest, normalize/dedup, interest compile, cluster/match/notify, browser web/admin auth, BFF/system-selected/digest/moderation/admin interests, historical backfill, signal candidate detail/enrichment retry, provider universality, website/admin, automation-admin, MCP compose, web viewports, and web UI audit lanes.
- External/live provider proof passed where local disposable credentials were available:
  - `DISCOVERY_ENABLED=1 DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS=500 pnpm test:discovery:vnext-mcp-live-signal-flow`;
  - artifact `/tmp/signalops-discovery-vnext-mcp-live-signal-flow-79dd66ad-ccd6-4f55-bb77-054e7f8c21fb.json`;
  - status `passed`, gaps `[]`, `packsWithContent=3`, `explainableItems=18`, `selectedOrContentItems=2`;
  - release discovery-enabled smoke used provider-backed local proof (`searchProvider=ddgs`, `llmModel=gemini-3.5-flash`, monthly budget `500` cents, deterministic fallback `false`);
  - release live website matrix artifact `/tmp/signalops-live-website-matrix-baseline-8eb745b8-2151-4d82-8acb-5400da607f99.json` covered 16 external sites; product proof passed with expected-shape observations and truthful unsupported/blocked classifications for captcha/403/unsupported external surfaces.
- Cleanup proof passed:
  - `git diff --check`;
  - `pnpm test:product:local:cleanup`;
  - `pnpm dev:mvp:internal:down`;
  - `docker ps --format '{{.Names}} {{.Status}}'` returned no running containers.

## Completed Bugfix: SIGNALOPS-LIVE-SIGNAL-PROOF-ISOLATION-FIX-1

- id: `SIGNALOPS-LIVE-SIGNAL-PROOF-ISOLATION-FIX-1`
- lifecycle: `normal`
- route: `bugfix` for live Discovery vNext signal proof isolation/calibration after `SIGNALOPS-LIVE-SIGNAL-SELECTION-CONVERSION-FIX-1` showed fetched/explainable evidence but no selected/content proof.
- route phase: `done-live-signal-proof-isolation`
- route-specific next step: live Discovery vNext signal lane is now validated locally under the approved external-provider budget; remaining staging proof still requires explicit disposable staging URL/token/run namespace/cleanup policy.
- route-specific proof: targeted TS unit test for harness logic, syntax check, `git diff --check`; rerun the live signal lane only after deterministic proof is green and within the already approved $5/500 cent envelope if remaining budget/credentials allow; always run cleanup/down proof after compose use.
- status: `done`
- risk: `medium-high`
- approval: explicit operator request "надо делай"; live-provider spend remains bounded by the prior `$5`/`500` cents approval, with no production/staging writes.
- planning required: conditional for bugfix; accepted from `SIGNALOPS-LIVE-SIGNAL-SELECTION-CONVERSION-FIX-1` residual.
- planning source: `AIDP-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` `final_selection_results` primary truth, system-selected/personalization separation, Discovery vNext operator truth; `.aidp/contracts/zero-shot-interest-filtering.md` forbids weakening selected gates and recoupling Discovery quality to selected outcomes.
- allowed paths: `.aidp/**`, `infra/scripts/**`, `tests/unit/ts/**`; product runtime/API/worker paths only if deterministic proof shows a product bug rather than proof harness calibration.
- cleanup status: completed after successful live rerun; `pnpm test:product:local:cleanup` wrote `/tmp/signalops-product-local-cleanup-1ada217a.json` and `.md`, `pnpm dev:mvp:internal:down` stopped/removed compose services and network, and `docker ps --format '{{.Names}} {{.Status}}'` returned no running containers.

## Scope

Fix the live-signal proof harness so it can fairly prove or reject selected-signal conversion without weakening product selection.

In scope:

- archive/delete or otherwise isolate old `live-mcp-signal-*` proof interests before a new signal proof run, using existing MCP/operator-safe tools where available;
- rank fetched downstream `signal_candidates`/`web_resources` by pack evidence before choosing docIds to reindex/explain;
- preserve strict success: at least one `final_selection_results.is_selected=true` or `content_items.list` item is still required;
- add regression tests for harness-only logic.

Out of scope:

- changing selection thresholds or `final_selection_results` semantics;
- counting wrapper/login/about pages as selected proof;
- auth/session changes;
- staging writes without explicit disposable staging credentials/policy.

## Current Proof Status

- Tests-first regression added/extended in `tests/unit/ts/discovery-live-signal-flow.test.ts`:
  - old active `live-mcp-signal-*` proof interests are selected for archive while the current run namespace and normal production interests are left alone;
  - signal-like candidates are ranked ahead of wrapper/login/about pages before reindex/explain proof.
- Harness implementation:
  - `infra/scripts/test-discovery-vnext-mcp-live-signal-flow.mjs` now exports pure proof helpers for unit coverage;
  - before running packs, the harness reads `system_interests.list` and archives old active `live-mcp-signal-*` interests through `system_interests.archive(confirm=true)`;
  - downstream signal candidates are ranked by pack evidence/selected state and wrapper-page penalty before bounded `docIds` replay and explain sampling;
  - `system_interests.list` pagination respects the MCP page-size contract (`<=100`).
- Targeted proof passed:
  - `node --import tsx --test --test-concurrency=1 tests/unit/ts/discovery-live-signal-flow.test.ts`;
  - `node --check infra/scripts/test-discovery-vnext-mcp-live-signal-flow.mjs`;
  - `git diff --check -- infra/scripts/test-discovery-vnext-mcp-live-signal-flow.mjs tests/unit/ts/discovery-live-signal-flow.test.ts .aidp/work.md`.
- Live proof:
  - first rerun after isolation implementation failed fast on harness page-size contract (`system_interests.list` requested `pageSize=200`, API requires `<=100`); fixed with paginated `pageSize=100`;
  - successful command: `DISCOVERY_ENABLED=1 DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS=500 pnpm test:discovery:vnext-mcp-live-signal-flow`;
  - successful artifact: `/tmp/signalops-discovery-vnext-mcp-live-signal-flow-79dd66ad-ccd6-4f55-bb77-054e7f8c21fb.json`;
  - status `passed`, gaps `[]`;
  - success criteria: `packsWithContent=3`, `explainableItems=18`, `selectedOrContentItems=2`;
  - proof isolation archived 9 old active proof interests and used current namespace `live-mcp-signal-79dd66ad`;
  - selected/content proof came through `content_items.list` for the security advisory pack while policy and software packs still supplied fetched/explainable live evidence.
- Cleanup proof passed:
  - `pnpm test:product:local:cleanup`;
  - `pnpm dev:mvp:internal:down`;
  - `docker ps --format '{{.Names}} {{.Status}}'` returned no running containers.

## Completed Bugfix With Residuals: SIGNALOPS-LIVE-SIGNAL-SELECTION-CONVERSION-FIX-1

- id: `SIGNALOPS-LIVE-SIGNAL-SELECTION-CONVERSION-FIX-1`
- lifecycle: `normal`
- route: `bugfix` for the live Discovery vNext signal lane failing to convert fetched/explainable live evidence into selected/content items.
- route phase: `completed-harness-diagnostics-with-selection-proof-residual`
- route-specific next step: open a separate narrow item for live signal proof isolation/selection calibration before rerunning external signal lanes; do not spend more live-provider budget on blind retries.
- route-specific proof: targeted regression/unit proof for the classified root cause, rerun `DISCOVERY_ENABLED=1 DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS=500 pnpm test:discovery:vnext-mcp-live-signal-flow`, cleanup/down proof, and `git diff --check`.
- status: `completed-with-residuals`
- risk: `medium-high`
- approval: explicit operator continuation after live proof exposed `downstream_selection_gap`; live-provider spend remains capped at the previously approved `$5`/`500` cents unless operator gives a new budget.
- planning required: conditional for bugfix; accepted from observed live-proof failure.
- planning source: `AIDP-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` PostgreSQL business truth, `final_selection_results` primary selection truth, Discovery vNext operator truth, and no domain-specific runtime hardcode invariants; `.aidp/verification.md` live proof and tests-first bugfix policy.
- allowed paths: `.aidp/**`, `infra/scripts/**`, `services/api/app/**`, `services/workers/app/**`, `services/mcp/**`, `packages/**`, `tests/unit/python/**`, `tests/unit/ts/**`.
- cleanup status: completed after reruns; `pnpm test:product:local:cleanup` wrote `/tmp/signalops-product-local-cleanup-a283da7f.json` and `.md`, `pnpm dev:mvp:internal:down` stopped and removed compose services/network, and `docker ps --format '{{.Names}} {{.Status}}'` returned no running containers.

## Scope

Fix or classify the live-signal downstream selection gap without weakening selected-content truth.

In scope:

- inspect failed live artifact `/tmp/signalops-discovery-vnext-mcp-live-signal-flow-3208e214-9ced-4409-baed-8dbd881b80f4.json`;
- inspect persisted rows if the local proof database still has them, otherwise use artifact evidence;
- determine whether fetched/explainable live items failed because of selection predicates, final-selection write path, item kind/classification, source quality, or harness expectation drift;
- add deterministic regression tests before source changes;
- preserve `final_selection_results` as primary selection truth.

Out of scope:

- auth/session changes;
- lowering public selected-content quality gates;
- counting wrapper/source/category pages as selected signals;
- restoring legacy queue/fallback behavior;
- staging writes without explicit disposable staging configuration.

## Current Proof Status

- Started on 2026-06-11 after `SIGNALOPS-LIVE-STAGING-PROOF-3`.
- Live signal artifact summary:
  - status `failed`;
  - gap `downstream_selection_gap`;
  - message `No item reached final_selection_results.selected or content_items.list.`;
  - `packsWithContent=2`;
  - `explainableItems=6`;
  - `selectedOrContentItems=0`;
  - pack statuses: `security_advisories=signal_content_fetched`, `policy_regulatory=signal_content_fetched`, `software_changelogs=no_fetchable_probation_signal`.
- Tests-first harness fix:
  - added `tests/unit/ts/discovery-live-signal-flow.test.ts`;
  - exported/import-guarded `infra/scripts/test-discovery-vnext-mcp-live-signal-flow.mjs` helpers so unit tests do not start compose on import;
  - fixed the live harness to continue through bounded routing attempts when an attempt is fetched/explainable but not selected, preserving the best fetched attempt for diagnostics;
  - strengthened proof-pack candidate signal groups from broad label lines to multiple named cue groups.
- Targeted proof passed:
  - `node --import tsx --test --test-concurrency=1 tests/unit/ts/discovery-live-signal-flow.test.ts`;
  - `node --check infra/scripts/test-discovery-vnext-mcp-live-signal-flow.mjs`;
  - `git diff --check -- infra/scripts/test-discovery-vnext-mcp-live-signal-flow.mjs tests/unit/ts/discovery-live-signal-flow.test.ts .aidp/work.md`.
- First rerun after continuation fix:
  - command: `DISCOVERY_ENABLED=1 DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS=500 pnpm test:discovery:vnext-mcp-live-signal-flow`;
  - artifact `/tmp/signalops-discovery-vnext-mcp-live-signal-flow-16da7ad1-352a-4d02-9469-502dd37f249b.json`;
  - status `failed`, gap `downstream_selection_gap`;
  - `packsWithContent=3`, `explainableItems=15`, `selectedOrContentItems=0`;
  - all three packs reached fetched/explainable content after 10 routing attempts each, which ruled out the earlier first-candidate stop as the sole failure.
- Second rerun after candidate-signal group calibration:
  - command: `DISCOVERY_ENABLED=1 DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS=500 pnpm test:discovery:vnext-mcp-live-signal-flow`;
  - artifact `/tmp/signalops-discovery-vnext-mcp-live-signal-flow-fba93249-58c0-417a-90d0-fee853601216.json`;
  - status `failed`, gap `downstream_selection_gap`;
  - `packsWithContent=3`, `explainableItems=12`, `selectedOrContentItems=0`;
  - security pack routed to a website source (`https://security.paloaltonetworks.com/`) with mixed wrapper/detail pages; policy pack routed to a broad Canada regulatory guide; software pack routed to GitHub blog RSS rather than a strict changelog feed.
- DB/artifact diagnosis:
  - final-selection write/read path is working: rejected rows are present in `final_selection_results` and exposed through `signal_candidates.explain`;
  - created proof interests and criteria were compiled/readable during the run;
  - residual is not MCP/fetch/runtime absence: channels, outbox events, fetch runs, web resources or signal candidates, reindex jobs and explain outputs were all readable;
  - residual is selection/proof calibration and isolation: live discovery sources often fetch wrapper/about/login/category pages or broad feeds, while the proof expects at least one item to satisfy strict selected/content gates; accumulated active proof interests from prior reruns also add noisy global criteria unless isolated or cleaned before replay.
- Acceptance interpretation:
  - current item improved live-signal diagnostics and harness behavior;
  - live-signal lane is still not accepted as pass;
  - next work should isolate proof interests/run namespace and/or use a deterministic disposable selected-signal fixture/source path without weakening `final_selection_results` quality gates.

## Completed Delivery With Residuals: SIGNALOPS-LIVE-STAGING-PROOF-3

- id: `SIGNALOPS-LIVE-STAGING-PROOF-3`
- lifecycle: `normal`
- route: `delivery` for previously blocked external Discovery vNext live/staging lanes.
- route phase: `completed-live-discovery-with-signal-selection-residual`
- route-specific next step: open a narrow capability/bugfix item for the live-signal downstream selection gap before trying to count the signal lane as pass; provide explicit disposable staging URL/token/run namespace/cleanup policy before staging write/read-back proof can run.
- route-specific proof: Discovery vNext live gap/signal preflight and full lanes, staging MCP/API write/read-back if disposable staging URL/token/run namespace/cleanup policy are configured, cleanup/down proof, and residual classification.
- status: `completed-with-residuals`
- risk: `high`
- approval: explicit operator request on 2026-06-11: "бюджет 5 долларов"; high-risk boundary is capped live-provider spend and disposable staging/test state only.
- planning required: `yes`
- planning source: `external-spec`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` runtime/delivery boundaries and `.aidp/verification.md` live/external-provider proof policy were checked during the preceding live-proof item and remain applicable.
- allowed paths: `.aidp/**` for proof state only; `/tmp/signalops-live-proof-*` and harness-owned `/tmp/signalops-*` artifacts. No product/source/test writes unless a separate narrow bugfix/capability item is opened after a concrete failure.
- cleanup status: completed for local runtime; `pnpm test:product:local:cleanup` wrote `/tmp/signalops-product-local-cleanup-3261f38b.json` and `.md`, `pnpm dev:mvp:internal:down` stopped/removed compose services and network, `docker ps --format '{{.Names}} {{.Status}}'` returned no running containers, and `git diff --check` passed.

## Scope

Run the previously blocked live-provider and disposable staging proof lanes with a $5 maximum provider budget.

In scope:

- use a 500 cent live budget for `DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS`;
- run Discovery vNext MCP live gap/signal preflights and full lanes when credentials are present;
- run remote/disposable staging MCP/API read/write/read-back only when explicit staging target, token, namespace and cleanup policy are configured;
- classify missing staging prerequisites as blocked, not pass;
- clean up local runtime and disposable proof artifacts/state where supported.

Out of scope:

- production writes;
- auth/session design changes;
- permanent new proof commands;
- DB migrations;
- weakening selected signal_candidate acceptance.

## Current Proof Status

- Started on 2026-06-11 after `SIGNALOPS-LIVE-STAGING-PROOF-2` completed local live proof with external/staging residuals.
- Operator supplied live-provider budget: `$5` / `500` cents.
- Environment preflight without secret disclosure:
  - `DISCOVERY_ENABLED=1`;
  - `DISCOVERY_SEARCH_PROVIDER=ddgs`;
  - Gemini-compatible key/base URL/model were configured;
  - `DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS` was supplied per command as `500`;
  - `SIGNALOPS_MCP_URL`, `SIGNALOPS_MCP_TOKEN`, `SIGNALOPS_STAGING_MCP_URL`, `SIGNALOPS_STAGING_API_URL`, `SIGNALOPS_STAGING_MCP_TOKEN`, `SIGNALOPS_STAGING_RUN_NAMESPACE`, `SIGNALOPS_STAGING_DISPOSABLE`, `SIGNALOPS_STAGING_CLEANUP_POLICY`, and `SIGNALOPS_STAGING_MAX_BUDGET_CENTS` were missing.
- Discovery vNext live preflights passed:
  - `DISCOVERY_ENABLED=1 DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS=500 pnpm test:discovery:vnext-mcp-live-gap-flow:preflight`;
  - artifact `/tmp/signalops-discovery-vnext-mcp-live-gap-flow-eb34a0f4-371e-4a70-966d-0fb462f222a0.json`, status `passed`, gaps `[]`;
  - `DISCOVERY_ENABLED=1 DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS=500 pnpm test:discovery:vnext-mcp-live-signal-flow:preflight`;
  - artifact `/tmp/signalops-discovery-vnext-mcp-live-signal-flow-4e4c3f93-49be-4c2a-9fac-1ab5822a6fd7.json`, status `preflight_passed`, gaps `[]`.
- Discovery vNext live gap full lane:
  - first full run artifact `/tmp/signalops-discovery-vnext-mcp-live-gap-flow-7aa96969-c80a-4d59-b563-c700d24b5b38.json` failed with a local MCP timeout during `policy_regulatory` probe: `Timed out waiting for http://127.0.0.1:8080/mcp`;
  - classified as transient local MCP/runtime timeout and retried once under the same 500-cent envelope;
  - retry command passed;
  - artifact `/tmp/signalops-discovery-vnext-mcp-live-gap-flow-1be580aa-9fd9-4578-98e6-d10b58e0a237.json`, status `passed`, gaps `[]`;
  - pack summary: `public_procurement`, `security_advisories`, `policy_regulatory`, `research_grants`, and `software_changelogs` all reached `candidates_found`; query attempts were 20 per pack, candidates were 100/100/100/99/100, and artifacts were 33 per pack.
- Discovery vNext live signal full lane:
  - command failed with one explicit gap;
  - artifact `/tmp/signalops-discovery-vnext-mcp-live-signal-flow-3208e214-9ced-4409-baed-8dbd881b80f4.json`;
  - status `failed`;
  - gap category `downstream_selection_gap`: `No item reached final_selection_results.selected or content_items.list.`;
  - success criteria readback: `packsWithContent=2`, `explainableItems=6`, `selectedOrContentItems=0`;
  - pack statuses: `security_advisories=signal_content_fetched`, `policy_regulatory=signal_content_fetched`, `software_changelogs=no_fetchable_probation_signal`;
  - provider/routing residual: `software_changelogs` did not produce a probation channel with fetched content; routing attempts included adapter backlog, blocked, inventory_context and one auto_register_probation decision.
- Staging write/read-back proof:
  - not run;
  - blocked because explicit disposable staging target/token/run namespace/cleanup policy are not configured.
- Cleanup proof passed:
  - `pnpm test:product:local:cleanup`;
  - `pnpm dev:mvp:internal:down`;
  - `docker ps --format '{{.Names}} {{.Status}}'` returned no running containers;
  - `git diff --check` passed.
- Current acceptance interpretation:
  - live Discovery gap-hunting lane is validated under the $5 budget envelope;
  - live signal lane is not validated because fetched/explainable evidence did not convert into selected/content items;
  - staging is still not validated because disposable staging credentials/policy are absent.

## Completed Bugfix: SIGNALOPS-RSS-MULTI-FIRST-FETCH-STATE-FIX-1

- id: `SIGNALOPS-RSS-MULTI-FIRST-FETCH-STATE-FIX-1`
- lifecycle: `normal`
- route: `bugfix` for RSS multi compose proof first-fetch state timeout surfaced after admin bulk action-token proof was fixed.
- route phase: `done-rss-multi-first-fetch-state-fix`
- route-specific next step: done; resume `SIGNALOPS-LIVE-STAGING-PROOF-2` with ingest soak.
- route-specific proof: keep-stack SQL diagnostics, `node --check infra/scripts/test-rss-multi-flow.mjs`, `pnpm test:ingest:multi:compose`.
- status: `done`
- risk: `medium`
- approval: implicit within explicit full live-proof request and accepted failure loop.
- planning required: conditional for bugfix; accepted from observed live-proof failure.
- planning source: `AIDP-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` ingest/proof boundary; auth/session behavior unchanged.
- allowed paths: `.aidp/**`, `infra/scripts/**`, `tests/unit/ts/**`; product/runtime paths only if direct evidence shows product behavior bug.
- cleanup status: `pnpm test:ingest:multi:compose` stopped compose stack and removed volumes after pass.

## Scope

Fix or classify the RSS multi compose proof timeout after the first fetch cycle.

In scope:

- inspect first-fetch readback counts for imported RSS channels;
- distinguish harness expectation drift from product fetch/runtime failure;
- preserve strict successful/failed/not-modified/duplicate expectations;
- keep admin/auth fixes separate from ingest state assertions.

Out of scope:

- auth/session design changes;
- weakening RSS multi acceptance criteria without evidence;
- runtime queue/sequence fallback restoration.

## Current Proof Status

- Diagnosis:
  - admin JSON action-token issue was already fixed, so bulk import created channels;
  - first fetch initially failed because `host.docker.internal` fixture URLs were blocked by fetchers private-host guard;
  - after allowlisting the fixture host, second-cycle 304 coverage was still flaky because the proof used synchronous compose exec while the fixture HTTP server ran in the same Node event loop and because global due polling is capped by per-host polite budget.
- Fix implemented:
  - RSS multi temporary compose override now sets `FETCHERS_ACQUISITION_PRIVATE_HOST_ALLOWLIST=host.docker.internal` for fetchers;
  - RSS multi fetch cycles now use async compose exec so the fixture server remains responsive;
  - duplicate/not-modified coverage uses deterministic targeted `run:once <channelId>` calls with bounded retry while keeping strict fixture assertions.
- Proof passed:
  - `node --check infra/scripts/test-rss-multi-flow.mjs`;
  - `git diff --check -- infra/scripts/test-rss-multi-flow.mjs infra/scripts/lib/mcp-http-testkit.mjs .aidp/work.md`;
  - `pnpm test:ingest:multi:compose`.

## Completed Bugfix: SIGNALOPS-COMPOSE-POSTJSON-ACTION-TOKEN-RETRY-FIX-1

- id: `SIGNALOPS-COMPOSE-POSTJSON-ACTION-TOKEN-RETRY-FIX-1`
- lifecycle: `normal`
- route: `bugfix` for compose proof admin JSON POST failures surfaced during full live-proof ingest multi repro.
- route phase: `done-compose-postjson-action-token-retry-fix`
- route-specific next step: done; RSS multi now reaches first fetch state assertions.
- route-specific proof: targeted TS helper test, direct compose admin bulk POST reached business validation, `pnpm test:ingest:multi:compose` advanced past admin bulk creation.
- status: `done`
- risk: `medium`
- approval: implicit within explicit full live-proof request and accepted failure loop.
- planning required: conditional for bugfix; accepted from observed live-proof failure.
- planning source: `AIDP-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` admin/API/test boundary; production auth/session behavior unchanged.
- allowed paths: `.aidp/**`, `infra/scripts/**`, `tests/unit/ts/**`.
- cleanup status: keep-stack repro left partial compose services running; final cleanup required.

## Scope

Fix compose proof helper behavior when an admin JSON POST receives the explicit `Invalid or expired admin action token` response.

In scope:

- characterize retryable action-token expiry for JSON requests;
- clear cached action tokens and retry `postJson()` once, matching the existing `postForm()` behavior;
- preserve direct status assertions and production token enforcement.

Out of scope:

- auth/session design changes;
- weakening admin route protections;
- changing product API routes.

## Current Proof Status

- Reproduced during `SIGNALOPS-LIVE-STAGING-PROOF-2` ingest multi keep-stack diagnosis:
  - `pnpm test:ingest:multi:compose -- --keep-stack` reached admin bulk channel creation;
  - `POST http://127.0.0.1:4322/bff/admin/channels/bulk` returned 403 with body `{"error":"Invalid or expired admin action token."}`;
  - previous action-token freshness fix covered `postForm()`, but this path uses `postJson()`.

## Completed Bugfix: SIGNALOPS-ENRICHMENT-SMOKE-CONTAINER-FIXTURE-URL-FIX-1

- id: `SIGNALOPS-ENRICHMENT-SMOKE-CONTAINER-FIXTURE-URL-FIX-1`
- lifecycle: `normal`
- route: `bugfix` for `test:enrichment:compose` failure surfaced during full live-proof.
- route phase: `tests-first-enrichment-smoke-container-fixture-url-fix`
- route-specific next step: done; enrichment smoke now makes fixture item/media URLs container-reachable and ensures the fetchers compose service has the required fixture host allowlist.
- route-specific proof: targeted TS helper test, `node --check --experimental-strip-types infra/scripts/fetchers/test-enrichment-smoke.ts`, `pnpm test:enrichment:compose`, then resume `SIGNALOPS-LIVE-STAGING-PROOF-2`.
- status: `done`
- risk: `medium`
- approval: implicit within explicit full live-proof request and accepted failure loop.
- planning required: conditional for bugfix; accepted from observed live-proof failure.
- planning source: `AIDP-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` provider/runtime/test boundary; auth/session and product behavior unchanged.
- allowed paths: `.aidp/**`, `infra/scripts/**`, `tests/unit/ts/**`.
- cleanup status: local compose stack remains up for resumed delivery proof and final cleanup.

## Scope

Fix enrichment compose smoke fixture reachability when feed polling runs on the host but sequence-driven extraction runs inside the fetchers container.

In scope:

- characterize container-reachable fixture URL conversion;
- keep the RSS feed URL host-readable as `127.0.0.1`;
- make item links/media URLs in the feed use `host.docker.internal` so container-side enrichment can fetch the fixture server;
- preserve enrichment behavior and assertions.

Out of scope:

- production enrichment runtime changes;
- auth/session changes;
- weakening short/long/failed enrichment assertions.

## Current Proof Status

- Reproduced during `SIGNALOPS-LIVE-STAGING-PROOF-2`:
  - `pnpm test:enrichment:compose` failed with `Timed out waiting for enrichment smoke assertions`;
  - DB readback for channel `1874bcb9-49a0-420d-83ce-a72070159b5e` showed 3 rows, but the short signal_candidate had `enrichment_state=failed`, `has_media=false`;
  - fetchers logs showed container-side `/internal/enrichment/signal-candidates/...` calls and extraction failures.
- Diagnosis:
  - the fixture feed is fetched by the host smoke process from `127.0.0.1`;
  - enrichment extraction is triggered through the worker/fetchers containers, where `127.0.0.1` does not point at the host fixture server.
- Fix implemented:
  - added `containerReachableFixtureUrl()` coverage and fixture URL rewrite for item/media URLs;
  - bound the fixture server to `0.0.0.0` while preserving host-readable `127.0.0.1` feed URL;
  - added compose preflight to recreate `fetchers` with `FETCHERS_ACQUISITION_PRIVATE_HOST_ALLOWLIST=host.docker.internal` for this smoke lane.
- Proof passed:
  - `node --import tsx --test --test-concurrency=1 tests/unit/ts/enrichment-smoke-fixture.test.ts`;
  - `node --check --experimental-strip-types infra/scripts/fetchers/test-enrichment-smoke.ts`;
  - `pnpm test:enrichment:compose`.

## Completed Bugfix Triage: SIGNALOPS-PRODUCT-MEGA-FLOW-VNEXT-LIVE-PROOF-FIX-1

- id: `SIGNALOPS-PRODUCT-MEGA-FLOW-VNEXT-LIVE-PROOF-FIX-1`
- lifecycle: `normal`
- route: `bugfix` for `test:product:total-live:compose` strict mega-flow failure surfaced during full live-proof.
- route phase: `tests-first-product-mega-flow-vnext-live-proof-fix`
- route-specific next step: done; no product/source code change applied because old A/B/C discovery proof cannot be truthfully mapped to current vNext signal packs. Resume delivery proof by running explicit vNext MCP live lanes and keep `product:total-live` failure classified.
- route-specific proof: artifact inspection of `/tmp/signalops-product-mega-flow-735a2c06.json` and source inspection of `infra/scripts/test-product-mega-flow.mjs`.
- status: `done-classified-no-code`
- risk: `medium`
- approval: implicit within explicit full live-proof request and accepted failure loop.
- planning required: conditional for bugfix; accepted from observed live-proof failure.
- planning source: `AIDP-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` delivery/proof boundary and Discovery vNext truth; `.aidp/verification.md` live proof policy.
- allowed paths: `.aidp/**`, `infra/scripts/**`, `tests/unit/ts/**`.
- cleanup status: local compose state may be up from failed total-live; verify after resumed delivery proof and final cleanup.

## Scope

Classify the product total-live strict mega-flow proof after Discovery vNext cutover.

In scope:

- characterize that retired discovery artifacts are not accepted as a passing strict mega-flow;
- keep strict product-total-live failure visible;
- resume current Discovery vNext live proof through the dedicated vNext MCP live lanes;
- preserve strict selected `signal_candidate` acceptance semantics.

Out of scope:

- product/runtime behavior changes;
- relaxing live selected signal_candidate requirements;
- auth/session changes;
- adding a permanent new live-proof command.

## Current Proof Status

- Reproduced during `SIGNALOPS-LIVE-STAGING-PROOF-2`:
  - `DISCOVERY_ENABLED=1 pnpm test:product:total-live:compose` failed;
  - artifact `/tmp/signalops-product-total-live-cffbd288.json` has `finalVerdict=fail`;
  - strict child artifact `/tmp/signalops-product-mega-flow-735a2c06.json` has `discoveryFinalVerdict=not_applicable_after_discovery_vnext_cutover` and all A/B/C live discovery scenarios failed with `live_discovery_not_passing`.
- Initial diagnosis:
  - `infra/scripts/test-product-mega-flow.mjs` currently returns a hardcoded retired-discovery `not_applicable_after_discovery_vnext_cutover` report;
  - therefore product total-live cannot pass its strict layer after Discovery vNext cutover even when deterministic provider/runtime/UI lanes pass.
- Decision:
  - do not invent a lossy A/B/C-to-vNext-signal-pack mapping;
  - do not relax selected signal_candidate acceptance;
  - classify this as a proof-surface blocker and run `test:discovery:vnext-mcp-live-*` lanes explicitly under `SIGNALOPS-LIVE-STAGING-PROOF-2`.

## Completed Bugfix: SIGNALOPS-WEBSITE-MATRIX-PUBLIC-API-READBACK-FIX-1

- id: `SIGNALOPS-WEBSITE-MATRIX-PUBLIC-API-READBACK-FIX-1`
- lifecycle: `normal`
- route: `bugfix` for `test:website:matrix:compose` fetch-run/web-resource readback failures surfaced during full live-proof.
- route phase: `tests-first-website-matrix-public-api-readback-fix`
- route-specific next step: done; matrix fetch-run/resource readbacks now use the public nginx `/api` helper.
- route-specific proof: targeted TS public API URL helper test already present, `pnpm test:website:matrix:compose`, resume `pnpm release:verify`, then resume `SIGNALOPS-LIVE-STAGING-PROOF-2`.
- status: `done`
- risk: `medium`
- approval: implicit within explicit full live-proof request and accepted failure loop.
- planning required: conditional for bugfix; accepted from observed live-proof failure.
- planning source: `AIDP-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` API/runtime/test boundary.
- allowed paths: `.aidp/**`, `infra/scripts/**`, `tests/unit/ts/**`.
- cleanup status: local stack is up from targeted website matrix proof; stop/down after proof or before close.

## Scope

Fix website live matrix readback failures where fetch-run and web-resource API reads use direct API port paths and return `Not Found` in compose proof.

In scope:

- use `publicApiUrl()` for website matrix API readbacks that should go through nginx `/api`;
- keep direct service health checks unchanged;
- preserve live matrix verdict policy.

Out of scope:

- provider behavior changes;
- auth/session design changes;
- weakening expected live matrix verdicts.

## Current Proof Status

- Reproduced after `SIGNALOPS-WEBSITE-MATRIX-ACTION-TOKEN-FRESHNESS-FIX-1` removed token expiry failures:
  - `pnpm test:website:matrix:compose` still failed;
  - `/tmp/signalops-website-matrix-token-fix.log` shows `unexpected_failure` for static editorial candidates with `Timed out waiting for fetch run ... Last error: Not Found`;
  - source inspection showed `listFetchRuns()` and `listResources()` using direct `http://127.0.0.1:8000/...` paths.
- Fix implemented:
  - changed matrix fetch-run, web-resource list and web-resource detail readbacks to `publicApiUrl()`.
- Proof passed:
  - `node --import tsx --test --test-concurrency=1 tests/unit/ts/compose-proof-testkit.test.ts tests/unit/ts/mcp-http-live-diagnostics.test.ts`;
  - `pnpm test:website:matrix:compose`.

## Completed Bugfix: SIGNALOPS-WEBSITE-MATRIX-ACTION-TOKEN-FRESHNESS-FIX-1

- id: `SIGNALOPS-WEBSITE-MATRIX-ACTION-TOKEN-FRESHNESS-FIX-1`
- lifecycle: `normal`
- route: `bugfix` for `product-local-full` / `test:website:matrix:compose` failure surfaced during full live-proof.
- route phase: `tests-first-website-matrix-token-freshness-fix`
- route-specific next step: done; compose proof HTTP helper now refreshes cached action tokens and retries once on explicit admin action token expiry.
- route-specific proof: targeted TS helper/harness test, `pnpm test:website:matrix:compose`, resume `pnpm release:verify`, then resume `SIGNALOPS-LIVE-STAGING-PROOF-2`.
- status: `done`
- risk: `medium`
- approval: implicit within explicit full live-proof request and accepted failure loop.
- planning required: conditional for bugfix; accepted from observed live-proof failure.
- planning source: `AIDP-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` admin/API/auth boundary; auth design unchanged, proof harness refreshes token/session around existing enforcement.
- allowed paths: `.aidp/**`, `infra/scripts/**`, `tests/unit/ts/**`.
- cleanup status: `release:verify` already ran product-local cleanup and stack down after failure; verify again after targeted proof.

## Scope

Fix website live matrix harness failures where long-running site iteration causes admin mutations/cleanup to fail with `Invalid or expired admin action token`, producing unexpected failures and fetch-run readback `Not Found`.

In scope:

- characterize retryable admin action token expiry detection;
- refresh admin sign-in/cookie and retry affected matrix mutations once;
- preserve production admin action token enforcement.

Out of scope:

- auth/session design changes;
- production source changes;
- weakening expected website matrix verdicts.

## Current Proof Status

- Reproduced during `SIGNALOPS-LIVE-STAGING-PROOF-2` after `product-local-core` was fixed:
  - `pnpm release:verify` rerun passed `product-local-core`;
  - `product-local-full` failed at `website-matrix-compose`;
  - `/tmp/signalops-product-local-full-296c13f6.json` shows `website-matrix-compose` failed;
  - release log shows many matrix candidates with `verdict: unexpected_failure`, `error: Invalid or expired admin action token`, and fetch-run readback `Not Found`.
- Fix implemented:
  - added retryable admin action token expiry detector;
  - changed `postForm()` to clear cached action tokens and retry once for the same cookie/origin when the server explicitly returns `Invalid or expired admin action token.`
- Proof passed:
  - `node --import tsx --test --test-concurrency=1 tests/unit/ts/mcp-http-live-diagnostics.test.ts`;
  - downstream `pnpm test:website:matrix:compose` passed after the readback surface fix.

## Completed Bugfix: SIGNALOPS-MVP-INTERNAL-SYSTEM-SELECTED-SURFACE-FIX-1

- id: `SIGNALOPS-MVP-INTERNAL-SYSTEM-SELECTED-SURFACE-FIX-1`
- lifecycle: `normal`
- route: `bugfix` for `integration_tests` / `test:mvp:internal` product-local-core failure surfaced during full live-proof.
- route phase: `tests-first-mvp-internal-api-surface-fix`
- route-specific next step: done; deterministic public API URL helper coverage added and MVP internal readbacks now use nginx `/api`.
- route-specific proof: targeted TS helper test, `pnpm integration_tests`, resume `pnpm release:verify`, then resume `SIGNALOPS-LIVE-STAGING-PROOF-2`.
- status: `done`
- risk: `medium`
- approval: implicit within explicit operator request for full live-proof and the accepted failure loop: concrete proof failure must be fixed in a narrow bugfix item before continuing.
- planning required: conditional for bugfix; accepted from observed live-proof failure.
- planning source: `AIDP-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` API/runtime/test boundary and `.aidp/verification.md` product-local/release proof policy.
- allowed paths: `.aidp/**`, `infra/scripts/**`, `tests/unit/ts/**`.
- cleanup status: `release:verify` already ran product-local cleanup and stack down after failure; verify again after targeted proof.

## Scope

Fix the deterministic `product-local-core` failure where `pnpm integration_tests` reaches the system-selected collection readback and receives `Not Found` from direct API port path `/collections/system-selected`.

In scope:

- characterize the public nginx `/api` URL builder for compose proof scripts;
- update `test-mvp-internal.mjs` readback URLs that should use the public API surface;
- keep product API, auth and read-model behavior unchanged.

Out of scope:

- product source/API changes;
- auth/session changes;
- broad proof harness refactor beyond the failing surface.

## Current Proof Status

- Reproduced during `SIGNALOPS-LIVE-STAGING-PROOF-2`:
  - `pnpm release:verify` failed at `product-local-core`;
  - artifact `/tmp/signalops-product-local-core-9a8d263c.json` shows `integration_tests` failed and later product-local lanes passed;
  - log points to `infra/scripts/test-mvp-internal.mjs:1623`, direct fetch of `http://127.0.0.1:8000/collections/system-selected?page=1&pageSize=100`, with `Error: Not Found`.
- Fix implemented:
  - added shared `publicApiUrl()` helper for compose proof scripts;
  - added TS regression coverage proving public API proof URLs use nginx `/api`;
  - changed MVP internal system-selected and maintenance signal-candidate readbacks to use `publicApiUrl()`.
- Proof passed:
  - `node --import tsx --test --test-concurrency=1 tests/unit/ts/compose-proof-testkit.test.ts`;
  - `pnpm integration_tests`.

## Completed Delivery With Residuals: SIGNALOPS-LIVE-STAGING-PROOF-2

- id: `SIGNALOPS-LIVE-STAGING-PROOF-2`
- lifecycle: `normal`
- route: `delivery` for full local/live/staging validation proof.
- route phase: `completed-local-live-proof-with-external-staging-residuals`
- route-specific next step: do not count this as full external/staging validation until a positive `DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS` and disposable staging URL/token/run namespace/cleanup policy are provided; then rerun the blocked vNext live/staging lanes.
- route-specific proof: static/release baseline, full local total-live compose proof, external Discovery/MCP live lanes if credentials/budget are present, provider/runtime/UI/index/staging lanes, cleanup proof, and residual classification.
- status: `completed-with-residuals`
- risk: `high`
- approval: explicit operator request: "давай full live-proof и все по полной".
- planning required: `yes`
- planning source: `external-spec`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` runtime/delivery baseline, PostgreSQL truth, discovery/live-provider risk, API/MCP/admin/runtime boundaries; `.aidp/verification.md` live/external-provider gates and delivery proof policy.
- allowed paths: `.aidp/**` for proof state only; `/tmp/signalops-live-proof-*` for temporary logs/artifacts. No product/source/test writes unless a separate narrow bugfix/capability item is opened after a concrete failure.
- cleanup status: completed; `pnpm test:product:local:cleanup` wrote `/tmp/signalops-product-local-cleanup-7a205854.json` and `.md`, `pnpm dev:mvp:internal:down` stopped/removed compose services and network, and `docker ps --format '{{.Names}} {{.Status}}'` returned no running containers.

## Scope

Run the strictest feasible full proof across local runtime, live-provider discovery lanes, MCP/operator flows, provider/runtime/UI/index lanes and staging/external gaps.

In scope:

- preflight current environment and scripts;
- run deterministic static/release/local proof gates;
- run compose/runtime/provider/UI/index lanes sequentially;
- run live Discovery/MCP/staging lanes only when explicit credentials, disposable target and positive budget are present;
- classify every failure as environment/credential, provider transient, staging data, product/runtime bug, test harness gap or unsupported surface;
- stop and open a narrow bugfix/capability item before source/test fixes if a product bug is found.

Out of scope:

- permanent new live-proof commands;
- auth/session design changes;
- production writes;
- DB migrations;
- silent acceptance of skipped live/staging provider lanes.

## Current Proof Status

- Started on 2026-06-10 after targeted MCP/UI/website-admin residuals were fixed and their final lanes passed.
- Full local/static/provider/runtime/UI proof resumed and completed on 2026-06-11 up to the external/staging prerequisites boundary.
- Static/release baseline passed before targeted bugfix loop:
  - `pnpm check:compliance`;
  - `pnpm check:dependency-compliance`;
  - `pnpm check:env-sync`;
  - `pnpm check:secret-leaks`;
  - `pnpm check:operator-truth-parity`;
  - `pnpm check:domain-neutrality`;
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm unit_tests`;
  - `pnpm build`;
  - `pnpm build:node-runtime`;
  - `pnpm release:verify`;
  - `git diff --check`.
- `DISCOVERY_ENABLED=1 pnpm test:product:total-live:compose` remains a classified proof-surface blocker, not a product pass:
  - product total-live artifact `/tmp/signalops-product-total-live-cffbd288.json` had `finalVerdict=fail`;
  - strict child artifact `/tmp/signalops-product-mega-flow-735a2c06.json` reported `discoveryFinalVerdict=not_applicable_after_discovery_vnext_cutover`;
  - decision preserved: no lossy A/B/C-to-vNext mapping and no relaxation of selected signal_candidate acceptance.
- Live-provider/staging preflight residuals:
  - `DISCOVERY_ENABLED=1`, live provider `ddgs`, and Gemini key were present;
  - positive `DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS` was missing;
  - disposable staging URL/token/run namespace/cleanup policy were missing;
  - vNext live gap/signal lanes are therefore blocked rather than accepted as pass.
- Bugfixes opened and completed during this delivery proof:
  - `SIGNALOPS-ENRICHMENT-SMOKE-CONTAINER-FIXTURE-URL-FIX-1`;
  - `SIGNALOPS-COMPOSE-POSTJSON-ACTION-TOKEN-RETRY-FIX-1`;
  - `SIGNALOPS-RSS-MULTI-FIRST-FETCH-STATE-FIX-1`;
  - earlier classified/proof-surface fixes listed below remain part of this same resumed live-proof chain.
- Provider/runtime/UI lanes passed after fixes:
  - `pnpm test:mcp:http:matrix`, artifact `/tmp/signalops-mcp-http-deterministic-8d9407f7-e887-441e-936c-8dd3fd6d7fd2.json`;
  - `pnpm test:mcp:compose`, artifacts `/tmp/signalops-mcp-http-deterministic-1d08b923-843f-4814-9d20-413589b6ec08.json` and `.md`;
  - `pnpm test:mcp:http:auth`, artifacts `/tmp/signalops-mcp-http-deterministic-d28e70ce-2c9f-4139-8a71-421ebc1dbe68.json` and `.md`;
  - `pnpm test:providers:compose`;
  - `pnpm test:channel-auth:compose`;
  - `pnpm test:website:compose`;
  - `pnpm test:website:admin:compose`;
  - `pnpm test:website:matrix:compose`, artifact `/tmp/signalops-live-website-matrix-baseline-71176827-47e9-446a-8248-a98b92b447b5.json`, exit 0 with 7 expected-shape sites, 8 truthful upstream blocked/unsupported sites, 1 partial/empty shape, and no cleanup residuals;
  - `pnpm test:hard-sites:compose`;
  - `pnpm test:enrichment:compose`;
  - `pnpm test:ingest:multi:compose`;
  - `pnpm test:ingest:soak:compose`;
  - `pnpm test:relay:compose`;
  - `pnpm test:relay:phase3:compose`;
  - `pnpm test:relay:phase45:compose`;
  - `pnpm test:web:viewports`;
  - `pnpm test:web:ui-audit`.
- Index invariants passed inside the worker container after rebuilding the missing event-cluster centroid registry row:
  - `python -m services.indexer.app.main rebuild-event-cluster-centroids`;
  - `check-derived-vectors`;
  - `check-interest-centroids`;
  - `check-event-cluster-centroids`.
- Post-fix full gates passed:
  - `pnpm unit_tests:ts` passed 464/464;
  - `pnpm unit_tests:py` passed 399/399;
  - `pnpm lint`;
  - `pnpm typecheck` completed with existing Astro hints only, no errors;
  - `pnpm check:operator-truth-parity`;
  - `pnpm check:domain-neutrality`;
  - `pnpm check:dependency-compliance`;
  - `git diff --check`.
- Current acceptance interpretation:
  - local runtime, MCP/operator, provider fixtures/live matrix, relay/sequence, UI/admin/web, ingest, enrichment and index lanes are green;
  - full external Discovery vNext and staging write/read-back cannot be claimed until the missing positive live budget and disposable staging credentials/policy are supplied;
  - strict `product:total-live` remains a known proof command mismatch after Discovery vNext cutover and is not counted as pass.
- Cleanup proof passed:
  - `pnpm test:product:local:cleanup`;
  - `pnpm dev:mvp:internal:down`;
  - `docker ps --format '{{.Names}} {{.Status}}'` returned no running containers.

## Completed Bugfix: SIGNALOPS-WEBSITE-ADMIN-STACK-FRESHNESS-FIX-1

- id: `SIGNALOPS-WEBSITE-ADMIN-STACK-FRESHNESS-FIX-1`
- lifecycle: `normal`
- route: `bugfix` for website-admin compose preflight route freshness failure.
- route phase: `tests-first-website-admin-stack-freshness-fix`
- route-specific next step: done; route inventory characterized, website-admin compose proof rebuilds code-bearing services before preflight, and maintenance API reads use the public nginx `/api` surface.
- route-specific proof: `pnpm test:website:admin:compose`, `pnpm test:website:compose` if shared helpers are touched, `pnpm unit_tests:ts` if TS harness unit tests are added, `git diff --check`.
- status: `done`
- risk: `low-medium`
- approval: explicit operator request to implement the planned three-item bugfix sequence.
- planning required: conditional for bugfix; accepted from the user-provided plan.
- planning source: `external-spec`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` website/admin/API proof boundaries and read-model route boundaries.
- cleanup status: final cleanup completed with `pnpm dev:mvp:internal:down`; `docker ps` returned no running containers.

## Scope

Fix the targeted website-admin compose proof failure where preflight reported missing `/maintenance/web-resources` despite the route being registered in source.

In scope:

- characterize route registration for `/maintenance/web-resources` and `/maintenance/web-resources/{resource_id}`;
- make website-admin proof rebuild or refresh code-bearing services before preflight;
- keep stale-stack diagnostics, but only after rebuild/readiness has been attempted.

Allowed paths:

- `.aidp/**`
- `infra/scripts/**`
- `tests/unit/ts/**`
- `tests/unit/python/**` for route inventory characterization
- `services/api/app/**` only if route registration is proven broken

Protected boundaries:

- No auth/session changes.
- No DB migrations.
- No API route behavior changes unless direct route inventory proof fails.
- Existing dirty worktree content is treated as prior work and must not be reverted.

## Current Proof Status

- Started on 2026-06-10 after `SIGNALOPS-UI-SYSTEM-SELECTED-PROJECTION-FIX-1` passed targeted read-model, viewport and UI-audit proof.
- Known diagnosis target from prior live proof: `test:website:admin:compose` preflight reported missing `/maintenance/web-resources`.
- Diagnosis:
  - route inventory confirmed `/maintenance/web-resources` and `/maintenance/web-resources/{resource_id}` are registered as GET routes;
  - website-admin harness was only doing `compose up -d` before preflight and had multiple direct `127.0.0.1:8000` maintenance reads that could observe the wrong/non-public surface in compose proof.
- Fix implemented:
  - strengthened route inventory test with GET method assertions;
  - changed `ensureComposeStack()` to `docker compose up -d --build ...` through the existing helper;
  - routed website-admin maintenance/channel readbacks through nginx `/api`, while keeping direct API health as a service readiness check.
- Proof passed:
  - `PYTHONPATH=tests/unit/python:. .venv/bin/python -m unittest tests.unit.python.test_api_web_resources`;
  - `pnpm test:website:admin:compose`.

## Final Three-Item Verification

- Completed on 2026-06-10 after the three requested bugfix items.
- Final proof passed:
  - `pnpm test:mcp:compose`;
  - `pnpm test:web:viewports`;
  - `pnpm test:web:ui-audit`;
  - `pnpm test:website:admin:compose`;
  - `pnpm unit_tests:py`;
  - `pnpm unit_tests:ts`;
  - `git diff --check`.
- Cleanup proof passed:
  - `pnpm dev:mvp:internal:down`;
  - `docker ps` returned no running project containers.
- Remaining live-proof residuals from these three items: none observed in targeted/final lanes.

## Completed Bugfix: SIGNALOPS-UI-SYSTEM-SELECTED-PROJECTION-FIX-1

- id: `SIGNALOPS-UI-SYSTEM-SELECTED-PROJECTION-FIX-1`
- lifecycle: `normal`
- route: `bugfix` for UI/system-selected projection proof timeouts.
- route phase: `tests-first-system-selected-projection-fix`
- route-specific next step: done; distinguished route surface failure from projection predicates, characterized selected visible signal-candidate read-model behavior, and fixed proof harness seed/public API reads without changing auth.
- route-specific proof: targeted API/read-model tests, `pnpm test:web:viewports`, `pnpm test:web:ui-audit`, `pnpm unit_tests:py` if API code changes, `git diff --check`.
- status: `done`
- risk: `medium`
- approval: explicit operator request to implement the planned three-item bugfix sequence.
- planning required: conditional for bugfix; accepted from the user-provided plan.
- planning source: `external-spec`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` API/UI/read-model boundaries and selection truth; `.aidp/contracts/signal-candidate-pipeline-core.md` and `.aidp/contracts/universal-selection-profiles.md` remain relevant because `final_selection_results` must remain the primary selection truth.
- cleanup status: compose stack is already up from MCP proof and may be reused by targeted UI lanes; run `pnpm dev:mvp:internal:down` after the three-item sequence.

## Scope

Fix the targeted UI proof failure where `test:web:viewports` and `test:web:ui-audit` time out waiting for `/collections/system-selected` to include the seeded `content_item_id`.

In scope:

- characterize `/collections/system-selected` for visible, final-selected signal candidates;
- cover title search with expected `content_item_id = signal_candidate:<doc_id>`;
- preserve required predicates: visible candidate, final selection selected, active source channel;
- add a negative case for non-visible or non-selected candidates;
- inspect harness failure status/body before changing implementation.

Allowed paths:

- `.aidp/**`
- `services/api/app/**`
- `infra/scripts/**`
- `tests/unit/python/**`
- `tests/unit/ts/**`

Protected boundaries:

- No auth/session changes.
- No DB migrations.
- `final_selection_results` remains primary selection truth.
- Existing dirty worktree content is treated as prior work and must not be reverted.

## Current Proof Status

- Started on 2026-06-10 after `SIGNALOPS-MCP-CONFIRM-SCOPE-CONTRACT-FIX-1` passed targeted unit proof and `pnpm test:mcp:compose`.
- Known diagnosis target from prior live proof: viewport/UI audit waits for `/collections/system-selected?page=1&pageSize=100&q=...` to contain seeded selected content.
- Diagnosis:
  - production read-model already required `visibility_state = 'visible'` and `final_selection_results.is_selected = true`;
  - `test:web:viewports` failure was `Last error: Not Found`, caused by proof harness reading the wrong direct API surface instead of nginx `/api`;
  - `test:web:ui-audit` seed did not explicitly make its selected primary candidate visible/family-primary before waiting on `/collections/system-selected`.
- Fix implemented:
  - added read-model characterization for searched `signal_candidate:<doc_id>` system-selected items backed by visible candidates and `final_selection_results`;
  - changed both UI harnesses to read `/collections/system-selected` through `http://127.0.0.1:8080/api/...`;
  - completed the UI audit deterministic seed by setting visible/family-primary duplicate flags before final selection readback.
- Proof passed:
  - `PYTHONPATH=tests/unit/python:. .venv/bin/python -m unittest tests.unit.python.test_api_feed_dedup`;
  - `pnpm test:web:viewports`;
  - `pnpm test:web:ui-audit`.

## Completed Bugfix: SIGNALOPS-MCP-CONFIRM-SCOPE-CONTRACT-FIX-1

- id: `SIGNALOPS-MCP-CONFIRM-SCOPE-CONTRACT-FIX-1`
- lifecycle: `normal`
- route: `bugfix` for deterministic MCP/source-inventory confirmation proof failure.
- route phase: `tests-first-confirm-scope-contract-fix`
- route-specific next step: done; deterministic coverage added for readable `confirm_scope` response confirmation and public API surface routing.
- route-specific proof: targeted TS/Python unit coverage, `pnpm test:mcp:compose`, `git diff --check`.
- status: `done`
- risk: `medium`
- approval: explicit operator request to implement the planned three-item bugfix sequence.
- planning required: conditional for bugfix; accepted from the user-provided plan.
- planning source: `external-spec`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` API/control-plane/admin writes and test/runtime boundaries; `.aidp/contracts/mcp-control-plane.md` is relevant if MCP tool behavior changes, but this item targets deterministic proof/API response readback.
- cleanup status: compose stack intentionally remains up for the next targeted bugfix lanes; run `pnpm dev:mvp:internal:down` after the three-item sequence.

## Scope

Fix the deterministic MCP compose failure where `confirm_scope` persists `scopeStatus = confirmed` in PostgreSQL but the immediate API/harness response assertion fails.

In scope:

- characterize `apply_source_inventory_action(confirm_scope)` response shape;
- characterize MCP HTTP harness extraction of source inventory scope confirmation from snake_case and camelCase response shapes;
- keep both immediate response assertion and DB readback assertion strict;
- preserve discovery routing and source inventory semantics.

Allowed paths:

- `.aidp/**`
- `infra/scripts/**`
- `services/api/app/**`
- `tests/unit/python/**`
- `tests/unit/ts/**`

Protected boundaries:

- No auth/session changes.
- No DB migrations.
- No Discovery algorithm changes.
- No weakening of destructive rollback safety.
- Existing dirty worktree content is treated as prior work and must not be reverted.

## Current Proof Status

- Started on 2026-06-10 after the prior live-proof residual list identified MCP `confirm_scope` as the next deterministic blocker.
- Reproduced evidence from latest MCP compose artifact:
  - `/tmp/signalops-mcp-http-deterministic-98d4606d-2e90-49c8-b6df-ba833af68ba2.json`
  - scenario `discovery-operator-flows` included DB-backed evidence `scopeStatus: confirmed`;
  - command failed at immediate assertion: `confirm_scope action must confirm scope without destructive rollback.`
- Initial diagnosis: likely response-shape mismatch in deterministic harness or API serialization, not a DB write failure.
- Fix implemented:
  - added TS harness coverage for snake_case, camelCase and JSON-encoded scope confirmation payloads;
  - added Python unit coverage proving `apply_source_inventory_action(confirm_scope)` returns readable `sourceInventory.scope_confirmation_json.scopeStatus = confirmed` and `destructiveConfirmationRequired = false`;
  - fixed the deterministic harness to call the public nginx `/api` surface for the admin action and require HTTP 200, while keeping the DB readback assertion strict.
- Proof passed:
  - `node --import tsx --test --test-concurrency=1 tests/unit/ts/mcp-http-scenarios.test.ts`;
  - `PYTHONPATH=tests/unit/python:. .venv/bin/python -m unittest tests.unit.python.test_discovery_vnext_foundation`;
  - `pnpm test:mcp:compose`.

## Completed Bugfix: SIGNALOPS-MCP-HTTP-DOC-PARITY-COVERAGE-FIX-1

- id: `SIGNALOPS-MCP-HTTP-DOC-PARITY-COVERAGE-FIX-1`
- lifecycle: `normal`
- route: `bugfix` for live-proof failure in MCP HTTP doc-parity coverage.
- route phase: `minimal-coverage-fix`
- route-specific next step: add real deterministic HTTP MCP coverage for shipped `operator.flow.route` instead of weakening the doc-parity matrix.
- route-specific proof: `pnpm test:mcp:compose`, TS doc-parity unit coverage if touched, and resume the paused live-proof failed lane.
- status: `done`
- risk: `medium`
- approval: implicit operator approval from "запускай и тестируй"; this is the next narrow bugfix surfaced by the same live-proof MCP compose lane.
- planning required: conditional for bugfix; accepted inline from the observed live failure.
- planning source: `AIDP-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` and `.aidp/contracts/mcp-control-plane.md` MCP operator proof boundaries; change is limited to deterministic HTTP proof harness coverage.
- cleanup status: failed MCP compose run may have left local compose state; cleanup will be verified after rerun.

## Scope

Fix the live-proof failure where `pnpm test:mcp:compose` reaches the `doc-parity-matrix` scenario and reports shipped HTTP surface `tool:operator.flow.route` without coverage.

In scope:

- add a real read-only MCP HTTP call for `operator.flow.route` in existing deterministic operator/read scenario;
- keep doc-parity full-coverage assertion strict;
- preserve MCP tool behavior, docs and registry.

Allowed paths:

- `.aidp/**`
- `infra/scripts/**`
- `tests/unit/ts/**` only if doc-parity test coverage needs adjustment.

Protected boundaries:

- No MCP tool/schema behavior changes.
- No auth/session changes.
- No product runtime changes.
- Existing dirty worktree content is treated as prior user/agent work and must not be reverted.

## Current Proof Status

- Started on 2026-06-10 after the Discovery preview fix allowed `pnpm test:mcp:compose` to pass `discovery-operator-flows` and `discovery-vnext-full-flow`.
- Failure observed: `doc-parity-matrix` reported `MCP doc-parity matrix found shipped HTTP surfaces without coverage: tool:operator.flow.route`.
- Diagnosis: `operator.flow.route` is shipped and required by MCP operator guidance, so deterministic HTTP compose should exercise it rather than marking it not-yet-tested.
- Fix implemented: deterministic MCP read/operator coverage now calls `operator.flow.route` through HTTP MCP.
- Proof passed:
  - `pnpm test:mcp:compose`;
  - artifact `/tmp/signalops-mcp-http-deterministic-8cfce5c0-0ee3-4a0f-b0f1-af77dc534a4c.json`.

## Completed Bugfix: SIGNALOPS-MCP-DISCOVERY-BRIEF-PREVIEW-FIX-1

- id: `SIGNALOPS-MCP-DISCOVERY-BRIEF-PREVIEW-FIX-1`
- lifecycle: `normal`
- route: `bugfix` for live-proof failure in MCP Discovery brief preview HTTP contract.
- route phase: `regression-then-minimal-fix`
- route-specific next step: add a deterministic regression proving FastAPI binds `/maintenance/discovery/brief/preview` request body to `DiscoveryVNextBriefPreviewPayload`, then fix the facade wrapper signature without changing Discovery behavior.
- route-specific proof: targeted Python Discovery vNext route/facade tests, `pnpm test:mcp:compose`, and resume the paused live-proof failed lane.
- status: `done`
- risk: `medium`
- approval: implicit operator approval from "запускай и тестируй"; this is a narrow bugfix required by the live proof failure before continuing the high-risk proof.
- planning required: conditional for bugfix; accepted inline from the observed live failure.
- planning source: `AIDP-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` API/MCP/operator boundary context already checked for the live proof and Discovery vNext facade split; fix is limited to API route binding/facade compatibility.
- cleanup status: no new live/staging state created by this bugfix item yet.

## Scope

Fix the live-proof failure where `pnpm test:mcp:compose` calls MCP tool `discovery.brief.preview` and the backend returns `422 Unprocessable Entity` requiring `query.args` and `query.kwargs`.

In scope:

- add/strengthen deterministic regression coverage for the Discovery brief preview API route binding;
- preserve the `services.api.app.discovery_vnext_api` public facade and monkeypatch-compatible wrappers;
- preserve MCP tool names, schemas and behavior;
- rerun the failed MCP compose lane and targeted proof.

Allowed paths:

- `.aidp/**`
- `services/api/app/**`
- `tests/unit/python/**`
- `infra/scripts/**` only if the failure proves to be a harness bug.

Protected boundaries:

- No auth/session changes.
- No Discovery algorithm changes.
- No DB migrations.
- No permanent live-proof command.
- Existing dirty worktree content is treated as prior user/agent work and must not be reverted.

## Current Proof Status

- Started on 2026-06-10 after `release:verify` failed inside `product-local-core`.
- Failure reproduced by live proof output: `pnpm test:mcp:compose` scenario `discovery-operator-flows` failed on MCP tool `discovery.brief.preview` with `422 Unprocessable Entity`; backend error required `query.args` and `query.kwargs`.
- Initial diagnosis: MCP sends `tools/call.params.arguments` correctly; SDK posts the payload to `/maintenance/discovery/brief/preview`; FastAPI appears to inspect the compatibility wrapper as `*args, **kwargs` instead of the wrapped payload signature.
- Fix implemented: `discovery_vnext_api` compatibility wrappers now preserve the wrapped function signature for FastAPI route binding while keeping monkeypatch synchronization.
- Proof passed:
  - targeted regression for `preview_brief` facade route signature;
  - full `test_discovery_vnext_foundation.py`;
  - `pnpm test:mcp:compose` passed the previous `discovery-operator-flows` failure point before surfacing the next doc-parity coverage failure.

## Completed Bugfix: SIGNALOPS-CRITERION-REVIEW-DIRECT-EVENT-CONSTANT-FIX-1

- id: `SIGNALOPS-CRITERION-REVIEW-DIRECT-EVENT-CONSTANT-FIX-1`
- lifecycle: `normal`
- route: `bugfix` for live-proof LLM cost review direct processor failure.
- route phase: `tests-first-direct-event-constant-fix`
- route-specific next step: add a deterministic regression proving criterion review persistence dispatches the criteria-matched event without reading constants from old worker `main`, then replace the legacy-main constant lookup with the explicit queue/event contract import.
- route-specific proof: targeted Python selection write repository test, `docker compose ... python -m infra.scripts.workers.smoke llm-cost-proof`, `pnpm unit_tests:py`.
- status: `done`
- risk: `medium`
- approval: implicit operator approval from "запускай и тестируй"; this narrow bugfix surfaced while validating the adjacent LLM live-proof smoke after the system-feed proof invariant fix.
- planning required: conditional for bugfix; accepted inline from observed live failure.
- planning source: `AIDP-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` and `.aidp/contracts/universal-task-engine.md` direct processor/runtime trimming boundaries.
- cleanup status: local compose stack is still running for targeted proof and will be stopped before close.

## Scope

Fix the compose smoke failure where `llm-cost-proof` crashes with `AttributeError: module 'services.workers.app.main' has no attribute 'SIGNAL_CANDIDATE_CRITERIA_MATCHED_EVENT'`.

In scope:

- characterize that `persist_criterion_review_resolution` dispatches the criteria-matched event through an explicit event constant;
- remove the legacy-main constant lookup from this direct repository path;
- preserve event name and runtime behavior.

Allowed paths:

- `.aidp/**`
- `services/workers/**`
- `tests/unit/python/**`

Protected boundaries:

- No queue fallback restoration.
- No selection algorithm changes.
- No DB migrations.
- No broad worker refactor.
- Existing dirty worktree content is treated as prior user/agent work and must not be reverted.

## Current Proof Status

- Started on 2026-06-10 after `SIGNALOPS-SYSTEM-FEED-PROOF-INVARIANT-FIX-1` made `pnpm test:llm-budget-stop:compose` pass.
- Adjacent direct smoke command failed:
  - `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml exec -T worker python -m infra.scripts.workers.smoke llm-cost-proof`
  - error: `AttributeError: module 'services.workers.app.main' has no attribute 'SIGNAL_CANDIDATE_CRITERIA_MATCHED_EVENT'`.
- Diagnosis: `selection_write_repository.persist_criterion_review_resolution` still reads the event constant from legacy worker `main` instead of the explicit `worker_queues` contract.
- Fix implemented: `persist_criterion_review_resolution` now imports `SIGNAL_CANDIDATE_CRITERIA_MATCHED_EVENT` from `services.workers.app.worker_queues`.
- Proof passed:
  - `PYTHONPATH=tests/unit/python:. .venv/bin/python -m unittest tests.unit.python.test_selection_write_repository tests.unit.python.test_worker_smoke_system_feed_invariant tests.unit.python.test_final_selection`
  - `PYTHONPATH=tests/unit/python:. .venv/bin/python -m unittest tests.unit.python.test_task_engine_scheduler tests.unit.python.test_task_engine tests.unit.python.test_task_engine_pipeline_plugins tests.unit.python.test_worker_bootstrap_runtime`
  - `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml exec -T worker python -m infra.scripts.workers.smoke llm-cost-proof`
  - `pnpm test:llm-budget-stop:compose`
  - `pnpm unit_tests:py`

## Completed Bugfix: SIGNALOPS-SYSTEM-FEED-PROOF-INVARIANT-FIX-1

- id: `SIGNALOPS-SYSTEM-FEED-PROOF-INVARIANT-FIX-1`
- lifecycle: `normal`
- route: `bugfix` for live-proof selection/system-feed proof invariant drift.
- route phase: `tests-first-compatibility-projection-proof-fix`
- route-specific next step: add a deterministic regression for `system_feed_results` compatibility projection rows whose stored decision intentionally differs from raw criteria-count summary, then update the smoke invariant without weakening final-selection truth.
- route-specific proof: targeted Python proof helper test, `pnpm test:llm-budget-stop:compose`, `pnpm unit_tests:py` if touched broadly, and resume the failed total-live lane only after the narrow lane is green.
- status: `done`
- risk: `medium`
- approval: implicit operator approval from "запускай и тестируй"; this narrow bugfix is required by the live-proof failure loop after the sequence FK failure was fixed.
- planning required: conditional for bugfix; accepted inline from observed live failure.
- planning source: `AIDP-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` and `.aidp/contracts/signal-candidate-pipeline-core.md` final-selection truth boundaries; `system_feed_results` is compatibility/read projection while `final_selection_results` is primary selection truth.
- cleanup status: broad total-live rerun was manually stopped after separate failures surfaced; local compose cleanup is pending after this narrow diagnosis/fix.

## Scope

Fix the live-proof failure where `pnpm test:llm-budget-stop:compose` reports `System feed verification failed: stored decision drifted from criteria counts` even though the current writer intentionally stores `system_feed_results.decision` as a compatibility projection sourced from `final_selection_results`.

In scope:

- characterize compatibility-projection system feed rows in deterministic tests;
- update the smoke/proof helper to accept explicit `compatibilityDecisionOverride` evidence while still rejecting unexplained drift;
- keep `final_selection_results` as primary selection truth;
- preserve runtime selection/LLM-review behavior.

Allowed paths:

- `.aidp/**`
- `infra/scripts/workers/**`
- `tests/unit/python/**`

Protected boundaries:

- No runtime selection algorithm changes.
- No API/UI/read-model behavior changes in this item.
- No DB migrations.
- No broad live-proof command changes.
- Existing dirty worktree content is treated as prior user/agent work and must not be reverted.

## Current Proof Status

- Started on 2026-06-10 during resumed `SIGNALOPS-LIVE-STAGING-PROOF-1`.
- Sequence FK fix targeted tests passed and the broad total-live rerun progressed past relay/sequence lanes without repeating the FK crash.
- New failure observed in `llm-budget-stop-compose`:
  - `RuntimeError: System feed verification failed: stored decision drifted from criteria counts.`
- Diagnosis:
  - `services/workers/app/selection_write_repository.py` writes `system_feed_results.decision` from `final_selection_results.compatSystemFeedDecision`.
  - When that compatibility decision differs from raw criteria-count summary, the writer records `explain_json.compatibilityDecisionOverride`.
  - `infra/scripts/workers/smoke.py` still expects the old criteria-only `system_feed_results.decision`, so the proof invariant is stale.
- Fix implemented:
  - `fetch_system_feed_result()` now reads `explain_json` for proof read-back.
  - `verify_system_feed_result_consistency()` accepts drift only when the row explicitly proves a `final_selection_results` compatibility projection override.
  - the synthetic LLM cost/budget fixture now includes item-level project candidate signal evidence so the accept-gray-zone branch still proves modern final-selection eligibility.
- Proof passed:
  - `PYTHONPATH=tests/unit/python:. .venv/bin/python -m unittest tests.unit.python.test_worker_smoke_system_feed_invariant`
  - `PYTHONPATH=tests/unit/python:. .venv/bin/python -m unittest tests.unit.python.test_worker_smoke_system_feed_invariant tests.unit.python.test_final_selection`
  - `pnpm test:llm-budget-stop:compose`
  - `pnpm unit_tests:py`

## Completed Bugfix: SIGNALOPS-SEQUENCE-RUN-FK-LIVE-FIX-1

- id: `SIGNALOPS-SEQUENCE-RUN-FK-LIVE-FIX-1`
- lifecycle: `normal`
- route: `bugfix` for live-proof sequence runtime integrity failure.
- route phase: `tests-first-sequence-run-parent-integrity`
- route-specific next step: add a deterministic regression for `q.sequence` jobs whose parent `sequence_runs` row is missing, then fix the runtime path that allows `sequence_task_runs` FK violations and resume the failed live lane.
- route-specific proof: targeted Python task-engine/worker sequence tests, `pnpm unit_tests:py` if touched broadly, and rerun the failed `DISCOVERY_ENABLED=1 pnpm test:product:total-live:compose` lane.
- status: `done`
- risk: `high`
- approval: implicit operator approval from "запускай и тестируй"; this narrow bugfix is required by the live-proof failure loop before continuing maximal proof.
- planning required: conditional for bugfix; accepted inline from observed live failure.
- planning source: `AIDP-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` PostgreSQL business truth and sequence runtime boundaries; `.aidp/verification.md` failure-loop discipline.
- cleanup status: failed `product-total-live` compose stack was stopped with `pnpm dev:mvp:internal:down`; no staging writes were performed.

## Scope

Fix the live-proof failure where `DISCOVERY_ENABLED=1 pnpm test:product:total-live:compose` hangs after the worker logs a `sequence_task_runs_run_id_fkey` violation for a `run_id` not present in `sequence_runs`.

In scope:

- characterize the missing parent `sequence_runs` behavior in deterministic worker/task-engine tests;
- prevent `sequence_task_runs` inserts for missing parent runs, with explicit failure/skip behavior rather than raw FK crashes;
- preserve sequence routing as the only runtime path for sequence-managed events;
- rerun targeted proof and resume the failed total-live lane.

Allowed paths:

- `.aidp/**`
- `services/workers/**`
- `services/relay/**` only if diagnosis proves the bad job is produced there
- `services/api/**` only if sequence command/API dispatch is the producer
- `tests/unit/python/**`
- `tests/unit/ts/**` only if relay producer tests are needed
- `infra/scripts/**` only for deterministic harness proof if the failure is harness-created

Protected boundaries:

- No auth/session changes.
- No DB migrations unless diagnosis proves schema is wrong.
- No fallback/legacy queue restoration.
- No broad refactor.
- Existing dirty worktree content is treated as prior user/agent work and must not be reverted.

## Current Proof Status

- Started on 2026-06-10 during `SIGNALOPS-LIVE-STAGING-PROOF-1`.
- `pnpm release:verify` passed before this lane.
- `DISCOVERY_ENABLED=1 pnpm test:product:total-live:compose` was started after Docker escalation and then hung inside `product-mega-flow:compose`.
- Worker log evidence:
  - `ForeignKeyViolation('insert or update on table "sequence_task_runs" violates foreign key constraint "sequence_task_runs_run_id_fkey"... Key (run_id)=(51710bf7-063c-4b3b-980e-50bc81a1c1a0) is not present in table "sequence_runs".')`
- No current-run total-live JSON artifact was produced before manual stop; only the earlier sandbox-denied artifact existed.
- Cleanup performed:
  - killed hanging total-live/mega-flow node processes;
  - `pnpm dev:mvp:internal:down` removed the compose stack.
- Fix implemented:
  - sequence executor now fail-closes missing parent `sequence_runs` jobs as `missing_run` instead of inserting orphan `sequence_task_runs`;
  - repository catches the concrete parent-run FK miss and raises an explicit task-engine exception.
- Proof passed:
  - `PYTHONPATH=tests/unit/python:. .venv/bin/python -m unittest tests.unit.python.test_task_engine_scheduler.SequenceRunJobProcessorTests`
  - `PYTHONPATH=tests/unit/python:. .venv/bin/python -m unittest tests.unit.python.test_task_engine_scheduler`
  - `PYTHONPATH=tests/unit/python:. .venv/bin/python -m unittest tests.unit.python.test_task_engine tests.unit.python.test_task_engine_pipeline_plugins tests.unit.python.test_worker_bootstrap_runtime`
  - broad total-live rerun progressed through relay phase 3 and phase 4/5 sequence routing without repeating the FK crash before surfacing separate selection/UI/MCP failures.

## Paused Item

- id: `SIGNALOPS-LIVE-STAGING-PROOF-1`
- lifecycle: `normal`
- route: `delivery` with `live-audit` phase for one-off maximal live/staging proof.
- route phase: `blocked-on-new-live-proof-residuals`
- route-specific next step: open separate narrow items for remaining deterministic blockers before rerunning broad total-live: MCP `confirm_scope` assertion/response contract, UI `system-selected` projection availability, and website-admin maintenance web-resources route/stale-stack proof.
- route-specific proof: static/release baseline, full local total-live proof, external Discovery/MCP live flows, provider/runtime/UI/index lanes, staging read-after-write proof where configured, cleanup proof and explicit residual gap review.
- status: `active`
- risk: `high`
- approval: approved by operator request on 2026-06-10 to implement the “План Максимально Валидной Live/Staging Проверки”; high-risk boundary is limited to disposable staging/test state and configured real external provider budgets.
- planning required: yes, because this is a complex high-risk delivery/live-audit proof with external/staging state.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/routes.md`; `.aidp/verification.md` high-risk/stateful proof and cleanup gates; `.aidp/contracts/test-access-and-fixtures.md`; `.aidp/blueprint.md` runtime/data truth boundaries.
- cleanup status: local compose state was stopped with `pnpm dev:mvp:internal:down --remove-orphans`; `docker ps` returned no running containers; no `/tmp/signalops-live-proof-*` scripts remained.

## Scope

Run a one-off maximal live/staging proof without adding a permanent verification command.

In scope:

- preflight current git/worktree, Docker, ports, `.env.dev`, real-provider credentials and disposable staging readiness;
- run existing static, release, local live, external Discovery/MCP, provider/runtime/UI/index proof commands until the first hard fail or through full completion;
- use only temporary `/tmp/signalops-live-proof-*` scripts if a real API/IMAP/staging gap harness is needed;
- classify failures as env/credential, provider transient, staging data, product/runtime bug, test harness gap or unsupported surface;
- cleanup local/temp/staging state and record proof/residuals.

Allowed paths:

- `.aidp/**`

Protected boundaries:

- Do not add a permanent `package.json` command.
- Do not change `release:verify`.
- Do not write product/source/config/test files under this delivery item.
- If a product/runtime bug requires source changes, stop this item and open a narrow `bugfix`/`capability` item first.
- Existing dirty worktree content is treated as prior user/agent work and must not be reverted.

## Context Manifest

- `.aidp/AGENTS.md`: high-risk route, active item and cleanup discipline.
- `.aidp/routes.md`: delivery route and high-risk approval behavior.
- `.aidp/verification.md`: high-risk proof, stateful proof and cleanup requirements.
- `.aidp/contracts/test-access-and-fixtures.md`: discovery fixture and smoke proof boundaries.
- `docs/product/operator/local-product-testing.md`: current product live/local proof layers.
- `infra/scripts/test-product-total-live-audit.mjs`: widest existing local/live audit harness.
- `infra/scripts/test-discovery-vnext-mcp-live-gap-flow.mjs`: real external Discovery/MCP gap flow harness.
- `infra/scripts/test-discovery-vnext-mcp-live-signal-flow.mjs`: real external Discovery/MCP signal flow harness.

## Proof Gates

Planned gates:

- preflight: git/worktree, Docker, ports, `.env.dev`, credentials, staging disposability, secret-artifact safety;
- static/release baseline: compliance, dependency/env/secret/truth/domain checks, lint, typecheck, unit tests, builds, `release:verify`, diff check;
- local live runtime: `DISCOVERY_ENABLED=1 pnpm test:product:total-live:compose`;
- external Discovery/MCP: live gap and live signal flow preflight plus full commands;
- provider/runtime/UI/index lanes listed in the accepted plan;
- cleanup: local cleanup, stack down, token/entity cleanup, temporary `/tmp` script cleanup and residual recording.

## Current Proof Status

- Started on 2026-06-10.
- Dirty worktree observed before this item and preserved.
- Docker availability confirmed via `docker info`.
- `.env.dev` exists.
- Preflight status: blocked before static/release/live/staging gates.
- Preflight passed:
  - Docker is available;
  - no repo-tracked live harness or permanent command was added;
  - no stale `/tmp/signalops-live-proof-*` scripts were present.
- Preflight failures:
  - `DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS` is not configured, so real Discovery/MCP live budget is not explicitly bounded;
  - `SIGNALOPS_MCP_URL` and `SIGNALOPS_MCP_TOKEN` are not configured, so remote/staging MCP smoke cannot run;
  - no explicit disposable staging target is configured (`SIGNALOPS_STAGING_MCP_URL`, `SIGNALOPS_STAGING_API_URL`, disposable flag, run namespace, max budget and cleanup policy are absent);
  - `API_LIVE_TEST_URL` is not configured, so real external API source proof cannot run;
  - `IMAP_HOST`, `IMAP_USERNAME` and `IMAP_PASSWORD` are not configured, so real external IMAP source proof cannot run.
- Commands intentionally not run because preflight hard-failed:
  - static/release baseline;
  - `DISCOVERY_ENABLED=1 pnpm test:product:total-live:compose`;
  - external Discovery/MCP live gap and signal flows;
  - staging read-after-write harness;
  - provider/runtime/UI/index lanes.
- Residual status: system is not live/staging-validated by this item; missing env/staging inputs must be supplied before a valid maximal live proof can start.
- Operator follow-up on 2026-06-10: requested to run and test anyway. Scope adjusted to run available local/static/live-provider gates without claiming unavailable staging/API/IMAP lanes as passed.

## Historical Archive: Completed Hotspot Refactor Consolidation 1

- id: `SIGNALOPS-HOTSPOT-REFACTOR-CONSOLIDATION-1`
- lifecycle: `normal`
- route: `capability` with `refactor/docs-operator` scope for hotspot refactor roadmap consolidation.
- route phase: `hotspot-refactor-consolidation-1`
- route-specific next step: run final roadmap proof gates and update completed slice state plus residual parked items.
- route-specific proof: TS unit gate, Python unit gate, lint, typecheck, operator truth parity, domain-neutrality and diff check.
- status: `done`
- risk: `medium`
- approval: approved by operator request on 2026-06-10 to implement final consolidation after all roadmap refactor slices passed.
- planning required: yes, because this item closes a multi-slice roadmap and records proof state.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md`; `.aidp/engineering.md`; `.aidp/verification.md`; `.aidp/contracts/mcp-control-plane.md`; `.aidp/contracts/discovery-agent.md`; `.aidp/contracts/feed-ingress-adapters.md`; `.aidp/contracts/signal-candidate-pipeline-core.md`; `.aidp/contracts/universal-selection-profiles.md`.
- cleanup status: no production/operator DB mutation performed; proof created only local caches/build artifacts as expected.

## Scope

Consolidate the completed hotspot refactor roadmap and run final proof gates.

In scope:

- run final proof gates across TS/Python/lint/typecheck/operator-truth/domain-neutrality/diff;
- update `.aidp/work.md` with completed slice list and residual parked items;
- avoid additional refactors or behavior changes.

Allowed paths:

- `.aidp/**`

Protected boundaries:

- No source/product behavior changes in this item.
- Existing completed slice changes are preserved.
- Existing dirty worktree content is treated as prior user/agent work and must not be reverted.

## Context Manifest

- `.aidp/AGENTS.md`: lifecycle/work route and write-ahead active item discipline.
- `.aidp/routes.md`: capability/refactor proof obligations.
- `.aidp/blueprint.md`: architecture and boundary context.
- `.aidp/engineering.md`: behavior-preserving refactor, proof and hotspot discipline.
- `.aidp/verification.md`: final proof gate policy.
- Completed slice archive in this file.

## Implementation Expectations

- Do not refactor further in this item.
- Run and record proof gates.
- Park any residual cleanup that is outside the approved roadmap.

## Proof Gates

Required gates:

- `pnpm unit_tests:ts`;
- `pnpm unit_tests:py`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm check:operator-truth-parity`;
- `pnpm check:domain-neutrality`;
- `git diff --check`.

## Current Proof Status

- Implemented and locally proofed on 2026-06-10.
- Dirty worktree observed before writes and preserved.
- Completed slice list:
  - `SIGNALOPS-MCP-RESOURCES-SLICE-1`;
  - `SIGNALOPS-MCP-PROMPTS-SLICE-1`;
  - `SIGNALOPS-DISCOVERY-VNEXT-API-SLICE-1`;
  - `SIGNALOPS-SOURCE-CONTRACTS-SLICE-1`;
  - `SIGNALOPS-SELECTION-READMODEL-SLICE-1`;
  - `SIGNALOPS-HOTSPOT-REFACTOR-CONSOLIDATION-1`.
- Residual parked items:
  - no additional refactor was opened during consolidation;
  - any broad cleanup beyond the approved roadmap remains a separate future AIDP item.
- Proof passed:
  - `pnpm unit_tests:ts`;
  - `PYTHON_TEST_PYTHON=.venv/bin/python pnpm unit_tests:py`;
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm check:operator-truth-parity`;
  - `pnpm check:domain-neutrality`;
  - `git diff --check`.

## Historical Archive: Completed Selection ReadModel Slice 1

- id: `SIGNALOPS-SELECTION-READMODEL-SLICE-1`
- lifecycle: `normal`
- route: `capability` with `refactor` scope for selection read-model extraction.
- route phase: `selection-readmodel-slice-1`
- route-specific next step: add characterization coverage for current selection read-model payload shape and final selection truth, then split helper clusters behind `content_selection_read_model.py`.
- route-specific proof: targeted Python selection/read-model tests before and after extraction, then Python unit gate, lint, typecheck where applicable and diff check.
- status: `done`
- risk: `medium`
- approval: approved by operator request on 2026-06-10 to implement the Roadmap Следующих Refactor Slices plan after MCP resources/prompts, Discovery vNext API and source contracts slices passed.
- planning required: yes, because this is a multi-file structural refactor around public API read-model payload shape.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` selection/read-model and final-selection truth boundaries; `.aidp/engineering.md` behavior-preserving refactor and public facade discipline; `.aidp/verification.md` API/read-model proof policy; `.aidp/contracts/signal-candidate-pipeline-core.md`; `.aidp/contracts/universal-selection-profiles.md`.
- cleanup status: no production/operator DB mutation performed; proof created only local caches/build artifacts as expected.

## Scope

Split selection read-model helper clusters into focused modules while preserving `services/api/app/content_selection_read_model.py` as the public import facade.

In scope:

- add or strengthen characterization tests for signal_candidate/resource/content selection payload fields;
- cover `final_selection_results` truth, fallback blocker payloads, diagnostics/guidance and content item ID parsing;
- keep existing imports from `services.api.app.content_selection_read_model` working;
- add internal `services/api/app/content_selection/` modules for SQL fragments, payload builders and projection helpers;
- preserve all API payload keys and current query behavior;
- avoid MCP, Discovery API, contracts, runtime, auth, DB migrations or behavior changes in this item.

Allowed paths:

- `.aidp/**`
- `services/api/app/**`
- `tests/unit/python/**`

Protected boundaries:

- Existing imports from `content_selection_read_model.py` remain valid.
- API payload keys remain unchanged.
- `final_selection_results` remains the primary selection truth.
- `reindex_read_model.py` stayed out of this refactor.
- Existing dirty worktree content is treated as prior user/agent work and must not be reverted.

## Context Manifest

- `.aidp/AGENTS.md`: lifecycle/work route and write-ahead active item discipline.
- `.aidp/routes.md`: capability/refactor proof obligations.
- `.aidp/blueprint.md`: selection/read-model and API boundaries.
- `.aidp/engineering.md`: behavior-preserving refactor, public facade and proof discipline.
- `.aidp/verification.md`: API/read-model and structural proof expectations.
- `.aidp/contracts/signal-candidate-pipeline-core.md`: final selection and signal_candidate payload semantics.
- `.aidp/contracts/universal-selection-profiles.md`: universal selection truth boundaries.
- `services/api/app/content_selection_read_model.py`: hotspot and public facade target.
- selection/read-model tests under `tests/unit/python/`: characterization and regression boundary.

## Implementation Expectations

- Tests-first: add/strengthen selection payload characterization before extraction.
- Extract helper clusters and preserve public callable names through the facade.
- Keep SQL predicates, final-selection precedence and payload keys unchanged.
- Prefer behavior identity over perfect final module boundaries.

## Proof Gates

Required gates:

- targeted selection/read-model Python tests before extraction;
- targeted selection/read-model Python tests after extraction;
- `pnpm unit_tests:py`;
- `pnpm lint`;
- `pnpm typecheck`;
- `git diff --check`.

## Current Proof Status

- Implemented and locally proofed on 2026-06-10.
- Dirty worktree observed before writes and preserved.
- Characterization coverage added before extraction for final-selection precedence, fallback blocker diagnostics, guidance, resource selection payload and content item ID parsing.
- Refactor completed:
  - `services/api/app/content_selection_read_model.py` remains the public facade/import target;
  - added internal `services/api/app/content_selection/payloads.py`, `projection.py`, `sql_fragments.py` and `__init__.py`;
  - SQL predicates, final-selection precedence and payload keys were preserved;
  - `services/api/app/content_selection_read_model.py` reduced from 1232 lines to 79 lines.
- Proof passed:
  - targeted selection/read-model Python tests before extraction;
  - targeted selection/read-model Python tests after extraction;
  - `PYTHON_TEST_PYTHON=.venv/bin/python pnpm unit_tests:py`;
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `git diff --check`.

## Historical Archive: Completed Source Contracts Slice 1

- id: `SIGNALOPS-SOURCE-CONTRACTS-SLICE-1`
- lifecycle: `normal`
- route: `capability` with `refactor` scope for source contract provider-config extraction.
- route phase: `source-contracts-slice-1`
- route-specific next step: add characterization coverage for provider-specific source channel config parsing, then split `packages/contracts/src/source.ts` behind its existing public facade.
- route-specific proof: targeted TS source contract tests before and after extraction, then TS unit gate, lint, typecheck and diff check.
- status: `done`
- risk: `medium`
- approval: approved by operator request on 2026-06-10 to implement the Roadmap Следующих Refactor Slices plan after MCP resources/prompts and Discovery vNext API slices passed.
- planning required: yes, because this is a multi-file structural refactor around public source contract exports and validation defaults.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` source/channel and contracts boundaries; `.aidp/engineering.md` behavior-preserving refactor and public facade discipline; `.aidp/verification.md` contracts/source proof policy; `.aidp/contracts/feed-ingress-adapters.md`.
- cleanup status: no production/operator DB mutation performed; proof created only local caches/build artifacts as expected.

## Scope

Split provider-specific source channel config parsing into focused modules while preserving `packages/contracts/src/source.ts` as the public compatibility facade.

In scope:

- add or strengthen characterization tests for `parseRssChannelConfig`, `parseWebsiteChannelConfig`, `parseApiChannelConfig`, `parseEmailImapChannelConfig` and `parseSourceChannelConfig`;
- cover auth/header safety, adapter metadata, schedule defaults and resource-kind config behavior;
- keep existing public exports from `packages/contracts/src/source.ts` working;
- add internal `packages/contracts/src/source/` modules for provider parsers and shared helpers;
- preserve all validation/default behavior;
- avoid MCP, Discovery API, selection read-model, runtime, auth, DB migrations or behavior changes in this item.

Allowed paths:

- `.aidp/**`
- `packages/contracts/**`
- `tests/unit/ts/**`

Protected boundaries:

- Existing imports from `packages/contracts/src/source.ts` remain valid.
- No config default or validation behavior changes.
- No public source contract export removals.
- Existing dirty worktree content is treated as prior user/agent work and must not be reverted.

## Context Manifest

- `.aidp/AGENTS.md`: lifecycle/work route and write-ahead active item discipline.
- `.aidp/routes.md`: capability/refactor proof obligations.
- `.aidp/blueprint.md`: source/channel and contract boundaries.
- `.aidp/engineering.md`: behavior-preserving refactor, public facade and proof discipline.
- `.aidp/verification.md`: contracts/source and structural proof expectations.
- `.aidp/contracts/feed-ingress-adapters.md`: source/provider adapter boundaries.
- `packages/contracts/src/source.ts`: hotspot and public facade target.
- source contract tests under `tests/unit/ts/`: characterization and regression boundary.

## Implementation Expectations

- Tests-first: add/strengthen source parser characterization before extraction.
- Extract provider parser clusters and preserve public exports through the facade.
- Keep validation, defaults and adapter metadata behavior unchanged.
- Prefer behavior identity over perfect final module boundaries.

## Proof Gates

Required gates:

- targeted source contract TS tests before extraction;
- targeted source contract TS tests after extraction;
- `pnpm unit_tests:ts`;
- `pnpm lint`;
- `pnpm typecheck`;
- `git diff --check`.

## Current Proof Status

- Implemented and locally proofed on 2026-06-10.
- Dirty worktree observed before writes and preserved.
- Characterization coverage added before extraction for provider dispatch, auth/header safety, schedule defaults and API adapter resource-kind metadata.
- Refactor completed:
  - `packages/contracts/src/source.ts` remains the public facade/import target;
  - added internal `packages/contracts/src/source/model.ts`, `shared.ts`, `rss.ts`, `website.ts`, `api.ts` and `email-imap.ts`;
  - public source exports and provider parser behavior were preserved;
  - `packages/contracts/src/source.ts` reduced from 1380 lines to 82 lines.
- Proof passed:
  - focused provider/source tests before extraction;
  - focused provider/source tests after extraction;
  - `pnpm unit_tests:ts`;
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `git diff --check`.

## Historical Archive: Completed Discovery VNext API Slice 1

- id: `SIGNALOPS-DISCOVERY-VNEXT-API-SLICE-1`
- lifecycle: `normal`
- route: `capability` with `refactor/bugfix` scope for Discovery vNext API facade extraction.
- route phase: `discovery-vnext-api-slice-1`
- route-specific next step: strengthen Discovery vNext characterization around payload validation and facade behavior, then split `services/api/app/discovery_vnext_api.py` into internal modules while keeping existing imports stable.
- route-specific proof: targeted Python Discovery tests before and after extraction, then Python unit gate, lint, typecheck where applicable and diff check.
- status: `done`
- risk: `medium`
- approval: approved by operator request on 2026-06-10 to implement the Roadmap Следующих Refactor Slices plan after MCP resources/prompts slices passed.
- planning required: yes, because this is a multi-file structural refactor around API payload/orchestration behavior.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` Discovery/API/control-plane and source/resource boundaries; `.aidp/engineering.md` behavior-preserving refactor and API boundary discipline; `.aidp/verification.md` Discovery vNext and API proof policy; `.aidp/contracts/discovery-agent.md`; `.aidp/contracts/feed-ingress-adapters.md`.
- cleanup status: no production/operator DB mutation performed; proof created only local caches/build artifacts as expected.

## Scope

Split Discovery vNext API internals into focused modules while preserving `services/api/app/discovery_vnext_api.py` as the public compatibility facade.

In scope:

- add or strengthen characterization tests for payload model validation, list/get facade behavior, probation handoff, source identity key and probe/understand/route orchestration;
- keep existing imports from `services.api.app.discovery_vnext_api` working;
- add internal `services/api/app/discovery_vnext/` modules for models, repository helpers, source inventory, provider helpers and orchestration;
- preserve existing route/API payload shapes and runtime/provider behavior;
- avoid MCP resources/prompts changes, contracts split, selection read-model split, auth, DB migrations or behavior changes in this item.

Allowed paths:

- `.aidp/**`
- `services/api/app/**`
- `tests/unit/python/**`

Protected boundaries:

- Existing imports from `discovery_vnext_api.py` remain valid.
- No route/API payload shape changes.
- No runtime/provider behavior changes.
- Existing dirty worktree content is treated as prior user/agent work and must not be reverted.

## Context Manifest

- `.aidp/AGENTS.md`: lifecycle/work route and write-ahead active item discipline.
- `.aidp/routes.md`: capability/refactor proof obligations.
- `.aidp/blueprint.md`: Discovery/API/control-plane and source/resource boundaries.
- `.aidp/engineering.md`: behavior-preserving refactor, API boundary and proof discipline.
- `.aidp/verification.md`: Discovery vNext, API and structural proof expectations.
- `.aidp/contracts/discovery-agent.md`: Discovery vNext contracts and operator-facing source acquisition boundaries.
- `.aidp/contracts/feed-ingress-adapters.md`: source/provider adapter boundaries.
- `services/api/app/discovery_vnext_api.py`: hotspot and public facade target.
- `tests/unit/python/test_discovery_vnext_foundation.py`: characterization and regression boundary.

## Implementation Expectations

- Tests-first: add/strengthen characterization before extraction.
- Extract by behavior cluster and preserve public callable names through the facade.
- Keep route payloads and database/runtime behavior unchanged.
- Prefer behavior identity over perfect final module boundaries.

## Proof Gates

Required gates:

- targeted Discovery Python tests before extraction;
- targeted Discovery Python tests after extraction;
- `pnpm unit_tests:py`;
- `pnpm lint`;
- `pnpm typecheck`;
- `git diff --check`.

## Current Proof Status

- Implemented and locally proofed on 2026-06-10.
- Dirty worktree observed before writes and preserved.
- Characterization coverage added before extraction for facade public symbols, payload alias validation and extra-field rejection.
- Refactor completed:
  - `services/api/app/discovery_vnext_api.py` remains the public compatibility facade;
  - added internal `services/api/app/discovery_vnext/models.py`, `repository.py`, `providers.py`, `source_inventory.py` and `orchestration.py`;
  - public imports from `discovery_vnext_api.py` continue working through facade wrappers;
  - route/API payload shapes and runtime/provider behavior were not intentionally changed.
- Proof passed:
  - `PYTHONPATH=tests/unit/python:. .venv/bin/python -m unittest tests.unit.python.test_discovery_vnext_foundation` before extraction;
  - `PYTHONPATH=tests/unit/python:. .venv/bin/python -m unittest tests.unit.python.test_discovery_vnext_foundation` after extraction;
  - `PYTHON_TEST_PYTHON=.venv/bin/python pnpm unit_tests:py`;
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `git diff --check`.

## Historical Archive: Completed MCP Prompts Slice 1

- id: `SIGNALOPS-MCP-PROMPTS-SLICE-1`
- lifecycle: `normal`
- route: `capability` with `refactor/docs-operator` scope for MCP prompts hotspot extraction.
- route phase: `mcp-prompts-slice-1`
- route-specific next step: add characterization coverage for the MCP prompt registry and critical render outputs, then split prompt groups behind the existing public `services/mcp/src/prompts.ts` facade without changing behavior.
- route-specific proof: targeted MCP control-plane test before and after extraction, then TS unit gate, lint, typecheck, operator truth parity, domain-neutrality and diff check.
- status: `done`
- risk: `medium`
- approval: approved by operator request on 2026-06-10 to implement the Roadmap Следующих Refactor Slices plan after the resources slice passed.
- planning required: yes, because this is a multi-file structural refactor around MCP public prompt/operator guidance.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` MCP/operator and control-plane boundaries; `.aidp/engineering.md` behavior-preserving refactor and hotspot pressure discipline; `.aidp/verification.md` MCP/control-plane, docs-operator and domain-neutral proof policy; `.aidp/contracts/mcp-control-plane.md`.
- cleanup status: no production/operator DB mutation performed; proof created only local caches/build artifacts as expected.

## Scope

Split MCP prompt definitions into internal modules while preserving the public MCP prompt facade and behavior.

In scope:

- add or strengthen characterization tests for `MCP_PROMPTS` names/descriptions/argument names and representative prompt render outputs;
- keep `services/mcp/src/prompts.ts` as the public import facade;
- add internal `services/mcp/src/prompts/` modules for sessions, operations, selection, discovery, channels, templates and cleanup;
- preserve `MCP_PROMPTS`, `listMcpPrompts()` and `resolveMcpPrompt()` public behavior;
- avoid resources split follow-up, Discovery API split, contracts split, selection read-model split, runtime, auth, DB migrations or behavior changes in this item.

Allowed paths:

- `.aidp/**`
- `services/mcp/**`
- `tests/unit/ts/**`

Protected boundaries:

- Existing imports from `./prompts` remain valid.
- No new MCP prompts are introduced.
- Prompt names, descriptions, argument names and render behavior remain behavior-compatible.
- No caller outside `services/mcp/src/prompts.ts` should import internal `services/mcp/src/prompts/*` modules.
- Existing dirty worktree content is treated as prior user/agent work and must not be reverted.

## Context Manifest

- `.aidp/AGENTS.md`: lifecycle/work route and write-ahead active item discipline.
- `.aidp/routes.md`: capability/refactor proof obligations.
- `.aidp/blueprint.md`: MCP/operator and control-plane boundaries.
- `.aidp/engineering.md`: behavior-preserving refactor, hotspot and proof discipline.
- `.aidp/verification.md`: MCP/control-plane, docs-operator and domain-neutral proof expectations.
- `.aidp/contracts/mcp-control-plane.md`: MCP prompt/operator truth and read-back proof semantics.
- `services/mcp/src/prompts.ts`: current hotspot and public facade target.
- `services/mcp/src/context.ts`, `services/mcp/src/tools.ts`, `services/mcp/src/main.ts`: existing MCP surfaces that must keep using the facade.
- `tests/unit/ts/mcp-control-plane.test.ts`: characterization and regression boundary.

## Implementation Expectations

- Tests-first: add/strengthen prompt characterization before extraction.
- Extract by prompt group and preserve existing array order.
- Re-export through the existing facade and do not update external callers to internal module paths.
- Prefer behavior identity over perfect final module boundaries.

## Proof Gates

Required gates:

- targeted MCP control-plane test before extraction;
- targeted MCP control-plane test after extraction;
- `pnpm unit_tests:ts`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm check:operator-truth-parity`;
- `pnpm check:domain-neutrality`;
- `git diff --check`.

## Current Proof Status

- Implemented and locally proofed on 2026-06-10.
- Dirty worktree observed before writes and preserved.
- Characterization coverage added before extraction:
  - full `MCP_PROMPTS` name/description/argument-name order is pinned;
  - critical render outputs are covered for operator session, Discovery session, selection tuning, channel review, LLM budget review and cleanup guidance;
  - known and unknown `resolveMcpPrompt()` behavior is covered.
- Refactor completed:
  - `services/mcp/src/prompts.ts` remains the public facade/import target;
  - added internal `services/mcp/src/prompts/types.ts`, `sessions.ts`, `operations.ts`, `selection.ts`, `discovery.ts`, `channels.ts`, `templates.ts` and `cleanup.ts`;
  - `MCP_PROMPTS` order is preserved through grouped arrays;
  - no new MCP prompts were introduced;
  - `services/mcp/src/prompts.ts` reduced from 734 lines to 60 lines.
- Proof passed:
  - `node --import tsx --test --test-concurrency=1 tests/unit/ts/mcp-control-plane.test.ts` before extraction;
  - `node --import tsx --test --test-concurrency=1 tests/unit/ts/mcp-control-plane.test.ts` after extraction;
  - no external caller imports internal `services/mcp/src/prompts/*` modules outside the facade;
  - `pnpm unit_tests:ts`;
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm check:operator-truth-parity`;
  - `pnpm check:domain-neutrality`;
  - `git diff --check`.

## Historical Archive: Completed MCP Resources Slice 1

- id: `SIGNALOPS-MCP-RESOURCES-SLICE-1`
- lifecycle: `normal`
- route: `capability` with `refactor/docs-operator` scope for MCP resources hotspot extraction.
- route phase: `mcp-resources-slice-1`
- route-specific next step: add characterization coverage for the MCP resource registry and key resource reads, then split resource groups behind the existing public `services/mcp/src/resources.ts` facade without changing behavior.
- route-specific proof: targeted MCP control-plane test before and after extraction, then TS unit gate, lint, typecheck, operator truth parity, domain-neutrality and diff check.
- status: `done`
- risk: `medium`
- approval: approved by operator request on 2026-06-10 to implement the Roadmap Следующих Refactor Slices plan.
- planning required: yes, because this is a multi-file structural refactor around MCP public resources/operator guidance.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` MCP/operator and control-plane boundaries; `.aidp/engineering.md` behavior-preserving refactor and hotspot pressure discipline; `.aidp/verification.md` MCP/control-plane, docs-operator and domain-neutral proof policy; `.aidp/contracts/mcp-control-plane.md`.
- cleanup status: no production/operator DB mutation performed; proof created only local caches/build artifacts as expected.

## Scope

Split MCP resource definitions into internal modules while preserving the public MCP resource facade and behavior.

In scope:

- add or strengthen characterization tests for complete `MCP_RESOURCES` metadata, representative resource reads and `resolveMcpResource()` known/unknown behavior;
- keep `services/mcp/src/resources.ts` as the public import facade;
- add internal `services/mcp/src/resources/` modules for playbooks, reference resources, scenarios, ops resources, generated guides and server guides;
- preserve `MCP_RESOURCES`, `listMcpResources()` and `resolveMcpResource()` public behavior;
- avoid prompt split, Discovery API split, contracts split, selection read-model split, runtime, auth, DB migrations or behavior changes in this item.

Allowed paths:

- `.aidp/**`
- `services/mcp/**`
- `tests/unit/ts/**`

Protected boundaries:

- Existing imports from `./resources` remain valid.
- No new MCP resources are introduced.
- Resource URI/name/title/description/mime/read behavior remains behavior-compatible.
- No caller outside `services/mcp/src/resources.ts` should import internal `services/mcp/src/resources/*` modules.
- Existing dirty worktree content is treated as prior user/agent work and must not be reverted.

## Context Manifest

- `.aidp/AGENTS.md`: lifecycle/work route and write-ahead active item discipline.
- `.aidp/routes.md`: capability/refactor proof obligations.
- `.aidp/blueprint.md`: MCP/operator and control-plane boundaries.
- `.aidp/engineering.md`: behavior-preserving refactor, hotspot and proof discipline.
- `.aidp/verification.md`: MCP/control-plane, docs-operator and domain-neutral proof expectations.
- `.aidp/contracts/mcp-control-plane.md`: MCP resource/operator truth and read-back proof semantics.
- `services/mcp/src/resources.ts`: current hotspot and public facade target.
- `services/mcp/src/context.ts`, `services/mcp/src/tools.ts`, `services/mcp/src/main.ts`: existing MCP surfaces that must keep using the facade.
- `tests/unit/ts/mcp-control-plane.test.ts`: characterization and regression boundary.

## Implementation Expectations

- Tests-first: add/strengthen resource characterization before extraction.
- Extract by resource group and preserve existing array order.
- Re-export through the existing facade and do not update external callers to internal module paths.
- Prefer behavior identity over perfect final module boundaries.

## Proof Gates

Required gates:

- targeted MCP control-plane test before extraction;
- targeted MCP control-plane test after extraction;
- `pnpm unit_tests:ts`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm check:operator-truth-parity`;
- `pnpm check:domain-neutrality`;
- `git diff --check`.

## Current Proof Status

- Implemented and locally proofed on 2026-06-10.
- Dirty worktree observed before writes and preserved.
- Characterization coverage added before extraction:
  - full `MCP_RESOURCES` URI/name/title order is pinned;
  - representative reads are covered for server overview, client contract, flow-routing playbook, reference guide, Discovery scenario, operator playbooks and ops resources;
  - known and unknown `resolveMcpResource()` behavior is covered.
- Refactor completed:
  - `services/mcp/src/resources.ts` remains the public facade/import target;
  - added internal `services/mcp/src/resources/types.ts`, `server-guides.ts`, `playbooks.ts`, `generated-guides.ts`, `ops.ts`, `reference.ts` and `scenarios.ts`;
  - `MCP_RESOURCES` order is preserved through grouped arrays;
  - no new MCP resources were introduced;
  - `services/mcp/src/resources.ts` reduced from 1737 lines to 49 lines.
- Proof passed:
  - `node --import tsx --test --test-concurrency=1 tests/unit/ts/mcp-control-plane.test.ts` before extraction;
  - `node --import tsx --test --test-concurrency=1 tests/unit/ts/mcp-control-plane.test.ts` after extraction;
  - no external caller imports internal `services/mcp/src/resources/*` modules outside the facade;
  - `pnpm unit_tests:ts`;
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm check:operator-truth-parity`;
  - `pnpm check:domain-neutrality`;
  - `git diff --check`.

## Historical Archive: Completed MCP Operating Intelligence Slice 1

- id: `SIGNALOPS-MCP-OPERATING-INTELLIGENCE-SLICE-1`
- lifecycle: `normal`
- route: `capability` with `refactor/docs-operator` scope for MCP operating-intelligence hotspot extraction.
- route phase: `mcp-operating-intelligence-slice-1`
- route-specific next step: add characterization coverage for MCP flow routing/guides, then extract flow-routing, guide helpers and shared model constants from the public operating-intelligence facade without changing behavior.
- route-specific proof: targeted MCP control-plane test before and after extraction, then TS unit gate, lint, typecheck, operator truth parity, domain-neutrality and diff check.
- status: `done`
- risk: `medium`
- approval: approved by operator request on 2026-06-10 to implement the MCP Operating Intelligence Hotspot Slice 1 plan.
- planning required: yes, because this is a multi-file structural refactor around MCP public guidance/tool behavior.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` MCP/operator, API/control-plane and docs/operator truth boundaries; `.aidp/engineering.md` behavior-preserving refactor and hotspot pressure discipline; `.aidp/verification.md` MCP/control-plane, docs-operator and domain-neutral proof policy; `.aidp/contracts/mcp-control-plane.md`.
- cleanup status: no production/operator DB mutation performed; proof created only local caches/build artifacts as expected.

## Scope

Extract MCP flow-routing and operator guide logic from the large operating-intelligence module while keeping public imports and MCP behavior stable.

In scope:

- add or strengthen characterization tests for `operator.flow.route`, operating/diagnostics/tuning guide resources and `operator.tuning.recommend` route block behavior;
- keep `services/mcp/src/operating-intelligence.ts` as the public import facade;
- add internal `services/mcp/src/operating-intelligence/` modules for model constants/types/domain registry, shared helpers, flow routing and guides;
- preserve exported MCP operating constants/types and public helper functions;
- avoid changes to resources/prompts split, Discovery vNext API, selection read-model, runtime, auth, docs truth or product behavior.

Allowed paths:

- `.aidp/**`
- `services/mcp/**`
- `tests/unit/ts/**`

Protected boundaries:

- Existing imports from `./operating-intelligence` remain valid.
- No new MCP tools/resources/prompts are introduced.
- Returned JSON keys, enum values, guide URIs and prompt/resource text remain behavior-compatible.
- Existing dirty worktree content is treated as prior user/agent work and must not be reverted.

## Context Manifest

- `.aidp/AGENTS.md`: lifecycle/work route and write-ahead active item discipline.
- `.aidp/routes.md`: capability/refactor proof obligations.
- `.aidp/blueprint.md`: MCP/operator and control-plane boundaries.
- `.aidp/engineering.md`: behavior-preserving refactor, hotspot and proof discipline.
- `.aidp/verification.md`: MCP/control-plane, docs-operator and domain-neutral proof expectations.
- `.aidp/contracts/mcp-control-plane.md`: MCP read-first/read-back/proof semantics.
- `services/mcp/src/operating-intelligence.ts`: current hotspot and public facade target.
- `services/mcp/src/tools.ts`, `services/mcp/src/resources.ts`, `services/mcp/src/context.ts`: existing callers that must keep importing the facade.
- `tests/unit/ts/mcp-control-plane.test.ts`: characterization and regression boundary.

## Implementation Expectations

- Tests-first: add/strengthen characterization before extraction.
- Extract by behavior cluster, not by broad rewrite.
- Re-export through the existing facade and do not update external callers to internal module paths.
- Move shared helpers only when required by both extracted modules and remaining logic.
- Prefer behavior identity over perfect final module boundaries.

## Proof Gates

Required gates:

- targeted MCP control-plane test before extraction;
- targeted MCP control-plane test after extraction;
- `pnpm unit_tests:ts`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm check:operator-truth-parity`;
- `pnpm check:domain-neutrality`;
- `git diff --check`.

## Current Proof Status

- Implemented and locally proofed on 2026-06-10.
- Dirty worktree observed before writes and preserved.
- Characterization coverage added before extraction:
  - `operator.flow.route` now covers mixed hidden/recall hard-gate guardrails in addition to existing zero-selected/source/planned/cleanup/expert-override routes;
  - operating/diagnostics/tuning guide facade shapes are covered;
  - `operator.tuning.recommend` route block shape is covered through the public MCP tool path.
- Refactor completed:
  - `services/mcp/src/operating-intelligence.ts` remains the public facade/import target;
  - added internal `services/mcp/src/operating-intelligence/model.ts`, `shared.ts`, `flow-routing.ts` and `guides.ts`;
  - external MCP callers still import from `./operating-intelligence`;
  - no new MCP tools/resources/prompts were introduced;
  - `services/mcp/src/operating-intelligence.ts` reduced from 6142 lines to 4557 lines.
- Proof passed:
  - `node --import tsx --test --test-concurrency=1 tests/unit/ts/mcp-control-plane.test.ts` before extraction;
  - `node --import tsx --test --test-concurrency=1 tests/unit/ts/mcp-control-plane.test.ts` after extraction;
  - no external caller imports internal `services/mcp/src/operating-intelligence/*` modules outside the facade;
  - `pnpm unit_tests:ts`;
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm check:operator-truth-parity`;
  - `pnpm check:domain-neutrality`;
  - `git diff --check`.

## Historical Archive: Completed Runtime Trimming And Truth Parity Item

- id: `SIGNALOPS-RUNTIME-TRIMMING-PARITY-1`
- lifecycle: `normal`
- route: `capability` with `sweep/docs-operator/bugfix` scope for runtime legacy removal, operator truth parity and dependency policy alignment.
- route phase: `runtime-trimming-truth-parity`
- route-specific next step: remove runtime-only legacy queue/fallback switches, add operator truth parity proof, align dependency compliance with fixed-version policy, and perform only tests-first hotspot extraction where needed for this work.
- route-specific proof: targeted queue/relay/worker/task-engine/dependency/parity tests first, then TS/Python unit gates, lint, typecheck, dependency/domain/truth parity checks, relay proof as feasible and diff check.
- status: `done`
- risk: `medium`
- approval: approved by operator request on 2026-06-10 to implement the Runtime Legacy, Truth Drift and Hotspot Complexity plan.
- planning required: yes, because this changes queue/runtime compatibility, worker runtime, proof commands, docs/operator truth checks and dependency policy.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` PostgreSQL/derived-state, async pipeline routing, MCP/operator, source/resource and selection boundaries; `.aidp/engineering.md` dependency, compatibility/deprecation, god-module and proof discipline; `.aidp/verification.md` relay/queue, worker, MCP/control-plane, dependency and docs-operator proof policy; `.aidp/contracts/universal-task-engine.md`; `.aidp/contracts/mcp-control-plane.md`.
- cleanup status: no production/operator DB mutation performed; compose proof stopped the dev stack and removed dev volumes, with only local build/cache artifacts expected.

## Scope

Remove unsupported runtime fallback paths while preserving current sequence/task-engine behavior and audience-specific truth ownership.

In scope:

- relay sequence routing becomes mandatory for sequence-managed events;
- worker runtime stops creating old per-stage BullMQ consumers;
- task-engine processor adapters stop falling back to old `services.workers.app.main` handler lookup;
- old runtime fallback env flags are removed from config, compose and docs;
- `check:operator-truth-parity` proof is added for MCP/product/AIDP invariant alignment;
- dependency compliance rejects mutable Node dependency specs and manifests are aligned to exact installed versions;
- hotspot work is limited to tests-first extraction required by this item.

Out of scope:

- auth/session behavior;
- ingress adapter legacy diagnostics/readers;
- cosmetic renaming of every internal `legacy` symbol when it is not runtime fallback;
- broad Discovery/API/selection source refactors beyond characterization guards needed by this item;
- production/operator DB mutation.

Allowed paths:

- `.aidp/**`
- `packages/**`
- `services/relay/**`
- `services/workers/**`
- `services/mcp/**`
- `services/api/**`
- `docs/product/**`
- `infra/scripts/**`
- `infra/docker/**`
- `.env.example`
- `.env.dev`
- `.env.prod`
- `README.md`
- `package.json`
- workspace package manifests
- `tests/**`

Protected boundaries:

- PostgreSQL remains business truth; Redis/BullMQ/queues/indexes/cache remain transport or derived state.
- Sequence-managed events must route through `q.sequence` only and fail closed when no active route exists.
- Processor functions remain executable sequence task-engine steps.
- MCP truth remains for MCP operators, product docs for developer/operator docs, and AIDP for agent runtime; parity proof prevents contradictory claims.
- Existing dirty worktree content is treated as prior user/agent work and must not be reverted.

## Context Manifest

- `.aidp/AGENTS.md`: lifecycle/work route and pre-write active item discipline.
- `.aidp/routes.md`: capability/sweep/docs-operator proof obligations.
- `.aidp/blueprint.md`: PostgreSQL truth, derived-state, async routing, MCP/operator and source/resource boundaries.
- `.aidp/engineering.md`: fixed dependency specs, compatibility removal, proof-before-claim and module pressure rules.
- `.aidp/verification.md`: relay/queue, worker, MCP/control-plane, dependency and docs proof expectations.
- `.aidp/contracts/universal-task-engine.md`: sequence runtime, `q.sequence`, relay handoff and task plugin boundary.
- `.aidp/contracts/mcp-control-plane.md`: MCP operator guidance and doc parity/read-back proof.
- `packages/contracts/src/queue.ts`, `services/relay/src/**`, `services/workers/app/**`: runtime trimming targets.
- `infra/scripts/check-dependency-compliance.mjs`, package manifests and `pnpm-lock.yaml`: dependency policy targets.
- `services/mcp/src/context.ts`, `services/mcp/src/resources.ts`, `services/mcp/src/prompts.ts`, `docs/product/**`, `.aidp/**`: truth parity surfaces.

## Implementation Expectations

- Add or update characterization tests before deleting fallback behavior.
- Remove runtime fallback flags rather than preserving no-op compatibility.
- Keep sequence task graph semantics stable except for removal of hidden handler fallback.
- Preserve public facade imports where refactor slices are needed.
- Use exact installed dependency versions; do not opportunistically upgrade packages.

## Proof Gates

Required gates:

- targeted queue/relay runtime tests;
- targeted Python worker bootstrap/runtime tests;
- targeted task-engine plugin handler tests;
- dependency spec validator tests;
- `pnpm check:operator-truth-parity`;
- `pnpm check:dependency-compliance`;
- `pnpm check:domain-neutrality`;
- `pnpm unit_tests:ts`;
- `pnpm unit_tests:py`;
- `pnpm lint`;
- `pnpm typecheck`;
- relay/worker smoke or compose proof as feasible for routing semantics;
- `git diff --check`.

## Current Proof Status

- Implemented and locally proofed on 2026-06-10.
- Dirty worktree observed before writes and preserved.
- Runtime legacy trimming:
  - removed relay sequence-routing disable flag/config and made sequence routing mandatory for sequence-managed outbox events;
  - removed embed/sequence runtime fallback env flags from documented/dev compose env surfaces;
  - removed worker bootstrap creation of old per-stage BullMQ consumers while preserving processor functions as sequence task-engine steps;
  - removed task-engine fallback lookup into old `services.workers.app.main` handlers and now requires the explicit direct processor registry.
- Truth/dependency proof:
  - added `pnpm check:operator-truth-parity` and wired it into compliance/release verification;
  - aligned MCP/product/AIDP invariant wording for PostgreSQL truth, `q.sequence` routing, MCP read/read-back/report verification, selection/discovery/resource truth and domain-neutral configuration;
  - extracted dependency-spec validation helper and made dependency compliance reject mutable/range/tag/git/url Node specs except `workspace:*`;
  - converted workspace direct Node dependency specs to exact versions from the current lockfile/installed metadata and refreshed `pnpm-lock.yaml`.
- Hotspot handling: broad MCP/API/discovery/selection splits were not bundled into this runtime trimming item; the new parity/dependency/characterization checks are in place so later slices can stay tests-first and behavior-preserving.
- Proof passed:
  - `node --import tsx --test --test-concurrency=1 tests/unit/ts/queue.test.ts tests/unit/ts/relay-sequence-routing.test.ts tests/unit/ts/dependency-specs.test.ts`;
  - `PYTHONPATH=. python3 -m unittest tests.unit.python.test_worker_entrypoint_runtime_deps tests.unit.python.test_worker_bootstrap_runtime tests.unit.python.test_task_engine_pipeline_plugins`;
  - `pnpm check:operator-truth-parity`;
  - `pnpm check:dependency-compliance`;
  - `pnpm check:domain-neutrality`;
  - `pnpm check:compliance`;
  - `pnpm unit_tests:ts`;
  - `pnpm unit_tests:py`;
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test:relay:compose`;
  - `pnpm test:relay:phase3:compose`;
  - `pnpm test:relay:phase45:compose`;
  - `pnpm verify:local-smoke`;
  - `git diff --check`.

## Historical Archive: Completed MCP Flow Routing Layer Item

- id: `SIGNALOPS-MCP-FLOW-ROUTING-LAYER-1`
- lifecycle: `normal`
- route: `capability` with `docs-operator/bugfix` scope for MCP control-plane routing guidance and proof hardening.
- route phase: `mcp-flow-routing-layer`
- route-specific next step: implemented read-only `operator.flow.route` MCP tool, consolidated flow/intent routing into a shared operating-intelligence helper, strengthened MCP entrypoint instructions/prompts/resources, and added targeted control-plane regression tests.
- route-specific proof: targeted MCP control-plane unit tests, TS unit gate as feasible, lint, typecheck, domain-neutrality guard and diff check.
- status: `done`
- risk: `medium`
- approval: approved by operator request on 2026-06-10 to implement the MCP Flow Routing Layer plan.
- planning required: yes, because this changes MCP public read tools, server instructions, resources/prompts and operating-intelligence advisory outputs.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` API/control-plane, MCP/operator and selection/discovery boundaries; `.aidp/engineering.md` trust boundary, observable diagnostics and compatibility rules; `.aidp/verification.md` MCP/control-plane proof policy; `.aidp/contracts/mcp-control-plane.md`.
- cleanup status: no production/operator DB mutation planned; proof limited to local tests/static checks. If tests create caches/build artifacts, no repo-tracked cleanup expected.

## Scope

Add active MCP flow routing so clients can discover the correct operator flow before recommendations, writes or final claims without needing to know the guide resources upfront.

In scope:

- `operator.flow.route` read-only MCP tool and schema;
- shared operating-intelligence routing helper reused by `operator.tuning.recommend`;
- MCP server instructions and relevant prompts/resources;
- targeted TS control-plane tests and domain-neutrality proof.

Out of scope:

- selection/runtime algorithm changes;
- domain-specific runtime defaults, prompts or required tests;
- automatic source/channel/config writes;
- requiring `operationMode` or intent fields on write tools;
- destructive cleanup or operator DB mutation.

Allowed paths:

- `.aidp/**`
- `services/mcp/**`
- `tests/unit/ts/**`

Protected boundaries:

- `operator.flow.route` is advisory/read-only and must not mutate state.
- Existing write tools remain backward-compatible and do not require `operationMode`.
- Expert override can skip parts of diagnosis only as advisory flow; it cannot skip read-back or final report verification.
- Domain-specific scenario/config remains only MCP/admin/scenario-pack config, never runtime defaults.

## Context Manifest

- `.aidp/AGENTS.md`: lifecycle/work route and pre-write active item discipline.
- `.aidp/routes.md`: capability proof obligations.
- `.aidp/blueprint.md`: API/control-plane, MCP/operator and selection/discovery boundaries.
- `.aidp/engineering.md`: trust boundary, observable diagnostics, compatibility and no hidden domain logic.
- `.aidp/verification.md`: MCP/control-plane proof expectations.
- `.aidp/contracts/mcp-control-plane.md`: MCP read-back/proof semantics.
- `services/mcp/src/context.ts`: server instructions and tool metadata.
- `services/mcp/src/operating-intelligence.ts`: flow/intent/recommendation logic.
- `services/mcp/src/tools.ts`: MCP tool schemas/registration.
- `services/mcp/src/resources.ts`, `services/mcp/src/prompts.ts`: operator guidance entrypoints.
- `tests/unit/ts/mcp-control-plane.test.ts`: MCP control-plane regression tests.

## Implementation Expectations

- Add `operator.flow.route` as the lightweight routing entrypoint before deeper recommendations.
- Reuse existing flow mode, intent, signal visibility, hard-gate and strict-level logic instead of duplicating divergent copy.
- Make server instructions and session prompts tell autonomous/default clients to call `operator.flow.route` or use an equivalent route block before mutations/final claims.
- Keep `operator.tuning.recommend` as the deeper recommendation tool and include/align with the same route block.
- Keep all guidance domain-neutral.

## Proof Gates

Required gates:

- targeted MCP control-plane unit test;
- `pnpm unit_tests:ts`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm check:domain-neutrality`;
- `git diff --check`.

## Current Proof Status

- Implemented and locally proofed on 2026-06-10.
- MCP flow routing layer:
  - added read-only `operator.flow.route` with symptom/domain/objective/flow/intent/signal-visibility routing schema;
  - added shared `buildOperatorFlowRoute` operating-intelligence helper and included its route block in `operator.tuning.recommend`;
  - added `signalops://guide/playbooks/flow-routing`;
  - updated MCP server instructions and session prompts so default/autonomous clients call `operator.flow.route` or use an equivalent route block before mutations/final claims;
  - added TS tests for tool exposure, invalid schema values, zero-selected, zero-LLM, source failure, planned change, cleanup and expert override routes.
- Proof passed:
  - `node --import tsx --test --test-concurrency=1 tests/unit/ts/mcp-control-plane.test.ts`;
  - `pnpm unit_tests:ts`;
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm check:domain-neutrality`;
  - `git diff --check`.

## Historical Archive: Completed Hidden-Signal Docs Consolidation Item

- id: `SIGNALOPS-HIDDEN-SIGNAL-DOCS-CONSOLIDATION-1`
- lifecycle: `normal`
- route: `docs-operator`
- route phase: `hidden-signal-selection-docs-consolidation`
- route-specific next step: document the implemented hidden-signal selection, admin/API/MCP guidance and replay-readback repairs in operator and architecture docs, including the three signal visibility types and their approaches in the unique technical decisions document.
- route-specific proof: owner-file alignment review, domain-neutrality guard and diff check.
- status: `done`
- risk: `medium`
- approval: approved by operator request on 2026-06-10 to document the implemented fixes and add the three signal types to the unique-system document.
- planning required: yes, because this updates durable operator/architecture docs and consolidates implementation truth.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` selection, operator/admin, API/MCP and derived-state boundaries; `.aidp/contracts/zero-shot-interest-filtering.md`; `.aidp/contracts/universal-selection-profiles.md`; `.aidp/contracts/mcp-control-plane.md`; `.aidp/contracts/runtime-migrations-and-derived-state.md`.
- cleanup status: docs-only work; no runtime state mutation planned.
- proof passed: `pnpm check:domain-neutrality`; `git diff --check`.

## Historical Archive: Completed Admin/API Hidden-Signal Parity Item

- id: `SIGNALOPS-HIDDEN-SIGNAL-ADMIN-API-PARITY-1`
- lifecycle: `normal`
- route: `capability` with `bugfix/docs-operator` scope for admin/API hidden-signal guardrail parity.
- route phase: `admin-api-hidden-signal-guardrail-parity`
- route-specific next step: expose hidden-signal safety guidance in admin interest forms and API/read-model outputs where needed, surface reindex replay freshness counters through API read-back, add targeted regression proof without removing legacy fields.
- route-specific proof: targeted admin/API unit tests, targeted reindex read-model tests, TS/Python unit gates as feasible, lint, typecheck, domain-neutrality guard and diff check.
- status: `done`
- risk: `medium`
- approval: approved by operator request on 2026-06-10 to implement necessary admin/API follow-through from the hidden-signal repair.
- planning required: yes, because this changes admin/API/operator-facing public read surfaces and guidance.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` operator/admin, API/control-plane and derived-state boundaries; `.aidp/engineering.md` MCP trust boundary, observable diagnostics, state/data boundary and no hidden domain logic rules; `.aidp/verification.md`; `.aidp/contracts/mcp-control-plane.md`; `.aidp/contracts/runtime-migrations-and-derived-state.md`; `.aidp/contracts/zero-shot-interest-filtering.md`; `.aidp/contracts/universal-selection-profiles.md`.
- cleanup status: no production/operator DB mutation planned; proof limited to local tests/static checks. If tests create caches/build artifacts, no repo-tracked cleanup expected.

## Scope

Add the necessary admin/API parity for hidden-signal safety without changing selection semantics or adding domain defaults.

In scope:

- admin/web interest form guidance for `must_have_terms`, `short_tokens_required`, `positive_texts`, `candidateSignals` and hidden/mixed signal hard-gate safety;
- API/read-model advisory warnings for system-interest configurations where the API already returns profile/config read-back;
- API/reindex job read-back fields for selection replay/enrichment target counters added by the replay freshness repair;
- targeted tests for the changed admin/API surfaces.

Out of scope:

- removing or renaming legacy fields such as `must_have_terms`, `short_tokens_required`, `positive_texts` or `candidateSignals`;
- selection/runtime algorithm changes;
- making `signalVisibility` or operation modes required on write tools;
- automatic source/channel/config writes;
- domain-specific outsourcing/RFP/procurement runtime defaults;
- destructive cleanup.

Allowed paths:

- `.aidp/**`
- `apps/admin/**`
- `apps/web/**`
- `packages/control-plane/**`
- `packages/contracts/**`
- `services/api/**`
- `tests/unit/ts/**`
- `tests/unit/python/**`

Protected boundaries:

- Hidden-signal guardrails are advisory/read-back proof helpers in this item; write schemas remain backward-compatible.
- Runtime `must_have_terms` remains any-of, and `short_tokens_required` remains extracted-token matching.
- Domain-specific tuning remains operator/admin/MCP configuration or scenario-pack evidence only.
- PostgreSQL remains business truth; reindex/read models expose derived-state freshness but do not become selection truth.

## Context Manifest

- `.aidp/AGENTS.md`: lifecycle/work route and pre-write active item discipline.
- `.aidp/routes.md`: capability and admin/API proof obligations.
- `.aidp/blueprint.md`: operator/admin, API/control-plane and derived-state ownership.
- `.aidp/engineering.md`: observable diagnostics, state/data boundary, trust boundary and no hidden domain logic.
- `.aidp/verification.md`: medium-risk proof, API/admin test expectations and cleanup policy.
- `.aidp/contracts/mcp-control-plane.md`: read-back/proof semantics reused by admin/API guidance.
- `.aidp/contracts/runtime-migrations-and-derived-state.md`: reindex derived-state read-back rules.
- `.aidp/contracts/zero-shot-interest-filtering.md`: selection truth and final-selection ownership.
- `.aidp/contracts/universal-selection-profiles.md`: selection profile boundary.

## Implementation Expectations

- Put hidden-signal warnings where operators edit interests, not only in MCP docs.
- Expose advisory warnings on API read-back where existing system-interest read models already return config.
- Surface replay target counters from reindex jobs so API/admin clients can verify selection replay was not skipped by enrichment state.
- Keep all examples domain-neutral.

## Proof Gates

Required gates:

- targeted admin/API unit tests;
- targeted reindex read-model unit tests;
- `pnpm unit_tests:ts`;
- `pnpm unit_tests:py`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm check:domain-neutrality`;
- `git diff --check`.

## Current Proof Status

- Implemented and locally proofed on 2026-06-10.
- Admin/API parity:
  - API system-interest read-back now returns `candidate_signals_quality_warnings`, `hard_gate_safety_warnings`, and candidate signal warning counts.
  - API reindex job read-back now returns normalized `selection_replay` / `selectionReplay` counters for selection replay targets, replayed rows, enrichment targets, processed enrichment rows and enrichment-state selection skips.
  - Admin system-interest editor now shows persisted guardrail warnings and clearer guidance for positive prototypes, hard lexical gates, short tokens and literal candidate cue fragments.
  - Admin per-user interest editor copy now warns that must-have terms are any-of but hard pre-semantic gates, and that short tokens are extracted-token requirements rather than broad keyword OR lists.
  - Admin reindex UI/live updates now display selection replay and enrichment counters.
- Proof passed:
  - `pnpm unit_tests` (TS 445/445, Python 385/385);
  - `pnpm unit_tests:py` (385/385);
  - `pnpm unit_tests:ts` (445/445);
  - `pnpm typecheck` (0 errors; existing Astro hints/warnings only);
  - `pnpm lint`;
  - `pnpm check:domain-neutrality`;
  - `git diff --check`.

## Historical Archive: Completed Hidden-Signal Selection Repair Item

- id: `SIGNALOPS-HIDDEN-SIGNAL-SELECTION-REPAIR-1`
- lifecycle: `normal`
- route: `bugfix/capability` with `docs-operator` scope for hidden-signal MCP/control-plane diagnostics, replay freshness and operator guidance hardening.
- route phase: `hidden-signal-evidence-lanes-hard-gate-safety-replay-freshness`
- route-specific next step: create implementation reference, add hidden-signal evidence-lane guidance, candidateSignals quality diagnostics, hard-gate safety recommendations, replay freshness repair, selection/LLM/Discovery report diagnostics and regression proof.
- route-specific proof: targeted MCP control-plane unit tests, targeted Python worker/reindex tests, unit TS/Python gates as feasible, lint, typecheck, domain-neutrality guard and diff check.
- status: `done`
- risk: `high`
- approval: approved by operator request on 2026-06-10 to implement the Hidden-Signal Selection Repair Plan.
- planning required: yes, because this changes MCP/control-plane public advisory schemas, operator-facing guidance, reports/recommendations, selection diagnostics and replay/backfill behavior.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` MCP/control-plane, operator/admin, selection/discovery and derived-state boundaries; `.aidp/engineering.md` observable diagnostics, MCP trust boundary, state/data boundary and no hidden domain logic rules; `.aidp/verification.md`; `.aidp/contracts/mcp-control-plane.md`; `.aidp/contracts/zero-shot-interest-filtering.md`; `.aidp/contracts/universal-selection-profiles.md`; `.aidp/contracts/runtime-migrations-and-derived-state.md`.
- cleanup status: no production/operator DB mutation planned; proof limited to local tests/static checks. If tests create caches/build artifacts, no repo-tracked cleanup expected.

## Scope

Implement domain-neutral hidden-signal selection repair so MCP clients can distinguish explicit, hidden and mixed evidence paths, avoid unsafe hard lexical gates, diagnose candidateSignals/replay freshness/LLM absence correctly and verify outcomes through read-back.

In scope:

- reference plan document under `docs/mcp_test/`;
- MCP resources/prompts/server instructions for hidden-signal evidence lanes, hard-gate safety and candidateSignals literal cue contracts;
- optional advisory fields on `operator.tuning.recommend` and `operator.report.verify`: `signalVisibility`, `evidenceLaneType`, `hardGatePolicy`;
- recommendation/report outputs for evidence-lane guidance, mandatory marker proof, candidateSignals quality, replay freshness, score thresholds and proof blocking;
- `operator.selection.dashboard`, `signal_candidates.residuals.summary/list`, `operator.report.verify`, `operator.tuning.recommend` diagnostics;
- system-interest write/read-back warnings for label-like candidateSignals and unsafe hidden-signal hard gates;
- replay freshness repair so selection replay is not narrowed by enrichment rerun eligibility;
- LLM diagnostics for `no_reviewable_path` and `historical_backfill_skip`;
- Discovery/source report interpretation hardening where reachable through MCP/control-plane;
- deterministic unit/regression tests.

Out of scope:

- domain-specific outsourcing/RFP/procurement runtime defaults;
- LLM bypass of semantic rejection;
- automatic source/channel/config writes;
- production/external credentials;
- full native multi-lane runtime selection algorithm rewrite;
- destructive cleanup or operator DB config mutation.

Allowed paths:

- `.aidp/**`
- `docs/mcp_test/**`
- `services/mcp/**`
- `packages/contracts/**`
- `packages/control-plane/**`
- `services/workers/**`
- `services/indexer/**`
- `tests/unit/ts/**`
- `tests/unit/python/**`

Protected boundaries:

- Evidence lanes are advisory/configuration-level in this stage; no native multi-lane selection algorithm rewrite.
- Runtime `must_have_terms` remains any-of, but guidance treats it as unsafe hard pre-semantic gate for hidden intent unless mandatory marker proof exists.
- Existing write tools remain backward-compatible; new advisory fields are optional.
- Domain-specific tuning remains operator/admin/MCP configuration or scenario-pack evidence only.
- PostgreSQL remains business truth; HNSW/snapshots/reindex outputs are derived state and must be explained as such.

## Context Manifest

- `.aidp/AGENTS.md`: lifecycle/work route and pre-write active item discipline.
- `.aidp/routes.md`: capability and MCP/control-plane proof obligations.
- `.aidp/blueprint.md`: MCP/control-plane, operator/admin, selection/discovery and derived-state boundaries.
- `.aidp/engineering.md`: observable diagnostics, state/data boundary, MCP trust boundary and no hidden domain logic.
- `.aidp/verification.md`: high-risk proof, worker/selection/MCP proof expectations and cleanup policy.
- `.aidp/contracts/mcp-control-plane.md`: schema validation, report/context and MCP proof rules.
- `.aidp/contracts/zero-shot-interest-filtering.md`: selection truth and final-selection ownership.
- `.aidp/contracts/universal-selection-profiles.md`: selection profile boundary.
- `.aidp/contracts/runtime-migrations-and-derived-state.md`: HNSW/reindex derived-state boundary.
- `docs/mcp_test/audit_trail.md`: current run evidence, not runtime canon.

## Implementation Expectations

- Keep hidden/explicit/mixed signal behavior domain-neutral.
- Make `must_have_terms` guidance clear: any-of but still hard pre-semantic gate.
- Make hidden/unknown signal baseline empty hard gates unless mandatory marker proof exists.
- Diagnose candidateSignals literal cue quality and hit rate before positive-term or LLM tuning.
- Fix replay freshness so selection replay is not skipped for already-enriched candidates.
- Report score thresholds, stale profile versions, candidateSignals hit rate and LLM historical skip/no-reviewable-path reasons.

## Proof Gates

Required gates:

- targeted MCP control-plane unit test;
- targeted Python worker/reindex unit tests;
- `pnpm unit_tests:ts`;
- `pnpm unit_tests:py`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm check:domain-neutrality`;
- `git diff --check`.

## Current Proof Status

- Implemented and locally proofed on 2026-06-10.
- Added reference plan document `docs/mcp_test/hidden_signal_selection_repair_plan.md`.
- MCP/control-plane:
  - added advisory `signalVisibility`, `evidenceLaneType` and `hardGatePolicy` fields to `operator.tuning.recommend` and `operator.report.verify`;
  - added `signalops://guide/reference/hidden-signal-evidence-lanes`;
  - updated server instructions, strict-next-steps, change-intents, flow modes, selection calibration and system-interest guidance;
  - added candidateSignals literal cue warnings, hard-gate safety warnings, score threshold diagnostics, stale profile diagnostics and selection report proof warnings.
- Replay freshness:
  - changed historical backfill snapshot selection so selection replay targets are not filtered by enrichment eligibility;
  - reindex backfill results now expose selection/enrichment target/replayed counters and `skippedSelectionDueToEnrichmentState=0`.
- Proof passed:
  - `node --import tsx --test --test-concurrency=1 tests/unit/ts/mcp-control-plane.test.ts` (51/51);
  - `pnpm unit_tests:ts` (445/445);
  - `pnpm unit_tests:py` (384/384);
  - `pnpm lint`;
  - `pnpm typecheck` (0 errors; existing Astro hints/warnings only);
  - `pnpm check:domain-neutrality`;
  - `git diff --check`.

## Historical Archive: Previous Completed Item

- id: `SIGNALOPS-MCP-OPERATOR-FLOW-MODES-1`
- lifecycle: `normal`
- route: `capability` with `bugfix/docs-operator` scope for MCP/control-plane UX hardening.
- route phase: `operator-flow-modes-and-proof-playbooks`
- route-specific next step: implement MCP operator flow modes, advisory proof contracts, prompt/resource guidance, operating-intelligence report/recommendation fields, and unit proof.
- route-specific proof: targeted MCP control-plane unit test, prompt/resource coverage, unit TS gate, lint, typecheck, domain-neutrality guard and diff check.
- status: `done`
- risk: `medium`
- approval: approved by operator request on 2026-06-07 to implement the MCP Operator Flow Modes And Proof Playbooks plan.
- planning required: yes, because this changes MCP/control-plane guidance, public advisory schemas, operating-intelligence outputs and client-facing prompts.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` MCP/control-plane, operator/admin and selection/discovery boundaries; `.aidp/engineering.md` observable diagnostics, MCP trust boundary and no hidden domain logic rules; `.aidp/verification.md` and `.aidp/contracts/mcp-control-plane.md` MCP proof expectations.
- cleanup status: no runtime state mutation expected; proof limited to local tests/static checks.

## Scope

Add explicit MCP operator flow modes so strict diagnostic sequencing remains the default for autonomous MCP clients while planned operator changes and expert overrides remain possible with read-back/proof.

In scope:

- `signalops://guide/playbooks/operator-flow-modes` MCP resource;
- strict-next-steps clarification for diagnostic, planned-change and expert-override modes;
- server initialize instructions and prompts for flowMode selection;
- `operator.tuning.recommend` advisory input fields and flow/proof outputs;
- `operator.report.verify` flow/proof outputs for relevant report kinds;
- unit tests for resources, prompts, recommendations and report verification.

Out of scope:

- selection/runtime algorithm changes;
- Discovery/fetcher/LLM/source runtime algorithm changes;
- domain-specific RFP, outsourcing or procurement runtime defaults;
- automatic source/channel/config writes;
- mode-dependent requirements on existing write tools.

Allowed paths:

- `.aidp/**`
- `services/mcp/**`
- `packages/contracts/**`
- `tests/unit/ts/**`

Protected boundaries:

- Advisory + Proof means clients are guided and reports block strong claims without proof, but normal write schemas are not made mode-dependent in this stage.
- Domain-specific tuning remains operator/admin/MCP configuration or scenario-pack evidence only.

## Context Manifest

- `.aidp/AGENTS.md`: lifecycle/work route and pre-write active item discipline.
- `.aidp/routes.md`: capability and MCP/control-plane proof obligations.
- `.aidp/blueprint.md`: MCP/control-plane, operator/admin and selection/discovery boundaries.
- `.aidp/engineering.md`: observable diagnostics and no hidden domain logic.
- `.aidp/verification.md`: MCP/control-plane proof and static guard expectations.
- `.aidp/contracts/mcp-control-plane.md`: schema validation, report/context and MCP proof rules.

## Implementation Expectations

- Add six domain-neutral flow modes: diagnostic, planned_change, expert_override, source_onboarding, scenario_pack_rollout and cleanup.
- Keep strict diagnostic guidance mandatory for default/autonomous MCP recommendations in diagnostic states.
- Allow expert operator override only with explicit reason, affected scope, read-back target, verification target and rollback/previous-state hint.
- Make report verification distinguish sufficient/partial/blocked proof without mutating runtime state.

## Proof Gates

Required gates:

- targeted MCP control-plane unit test;
- `pnpm unit_tests:ts`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm check:domain-neutrality`;
- `git diff --check`.

## Current Proof Status

- Implemented and locally proofed on 2026-06-07.
- MCP resources/prompts/server instructions:
  - added `signalops://guide/playbooks/operator-flow-modes` with diagnostic, planned_change, expert_override, source_onboarding, scenario_pack_rollout and cleanup flows;
  - clarified `signalops://guide/playbooks/strict-next-steps` as mandatory for autonomous/default diagnostic recommendations but not a ban on expert operator action;
  - updated initialize instructions and operator/session prompts to require/report `flowMode` before mutation recommendations.
- MCP recommendations/reports:
  - `operator.tuning.recommend` accepts advisory `operationMode`, `operatorOverrideReason` and `affectedScope`;
  - `operator.tuning.recommend` returns `flowMode`, `flowSequence`, `operator_override_allowed`, `operator_override_requires`, `proofRequired`, `proofStatus`, `missingProof` and override notes while preserving `must_do_next`, `allowed_after`, `do_not_do_yet` and `blocked_until`;
  - `operator.report.verify` surfaces flow/proof fields for selection, LLM budget, source bottleneck and hold-quality reports.
- Proof passed:
  - `node --import tsx --test --test-concurrency=1 tests/unit/ts/mcp-control-plane.test.ts` (48/48);
  - `pnpm unit_tests:ts` (442/442);
  - `pnpm lint`;
  - `pnpm typecheck` (0 errors; existing Astro hints only);
  - `pnpm check:domain-neutrality`;
  - `git diff --check`.

## Historical Archive: Previous Completed Item

- id: `SIGNALOPS-MCP-STRICT-NEXT-STEPS-1`
- lifecycle: `normal`
- route: `bugfix/capability`
- route phase: `strict-next-step-playbook-and-readback-hardening`
- route-specific next step: implement strict MCP next-step playbook, recommendation levels, system-interest write/read-back verification, canonical write-field guidance, and Discovery/selection audit guardrails.
- route-specific proof: targeted MCP control-plane unit test, prompt/resource coverage, unit TS gate, lint, typecheck, domain-neutrality guard and diff check.
- status: `done`
- risk: `medium`
- approval: approved by operator request on 2026-06-07 to implement the MCP Strict Next-Step Playbook For Selection/Discovery Audits.
- planning required: yes, because this changes MCP/control-plane guidance, recommendation contracts, write validation/read-back UX, report verification and client-facing prompts.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` MCP/control-plane, operator/admin, Discovery and selection pipeline boundaries; `.aidp/engineering.md` observable diagnostics, MCP trust boundary and no hidden domain logic rules; `.aidp/verification.md` and `.aidp/contracts/mcp-control-plane.md` MCP proof expectations.
- cleanup status: no runtime state mutation expected; proof limited to local tests/static checks.

## Scope

Harden MCP guidance and control-plane read/write UX so external clients follow a strict read-back -> classify -> bounded write -> bounded replay -> verify sequence for selection, LLM review and Discovery/source audits.

In scope:

- MCP strict next-step playbook resource;
- operator tuning recommendation strict levels (`must_do_next`, `allowed_after`, `do_not_do_yet`, `blocked_until`);
- system-interest create/update validation and read-back verification;
- MCP resources, prompts, report verification and server instructions;
- unit tests for MCP resources/prompts/recommendations/write UX.

Out of scope:

- selection algorithm/runtime behavior changes;
- domain-specific RFP, outsourcing or procurement runtime defaults;
- automatic source/channel writes, trust decisions or source deactivation;
- changing external provider credentials or live provider state.

Allowed paths:

- `.aidp/**`
- `services/mcp/**`
- `packages/contracts/**`
- `packages/control-plane/**`
- `tests/unit/ts/**`

Protected boundaries:

- `outsourcing_client_signals_audit.md` is evidence only, not canonical product truth.
- Domain-specific tuning remains operator/admin/MCP configuration or scenario-pack evidence only.

## Context Manifest

- `.aidp/AGENTS.md`: lifecycle/work route and pre-write active item discipline.
- `.aidp/routes.md`: `bugfix/capability` route and MCP/control-plane proof obligations.
- `.aidp/blueprint.md`: MCP/control-plane, operator/admin and selection pipeline boundaries.
- `.aidp/engineering.md`: observable diagnostics and no hidden domain logic.
- `.aidp/verification.md`: MCP/control-plane proof and static guard expectations.
- `docs/mcp_test/outsourcing_client_signals_audit.md`: evidence of external-client misinterpretation, not runtime canon.

## Implementation Expectations

- Add one prescriptive MCP playbook for strict next steps across selection, LLM review absence and Discovery/source repair.
- Ensure system-interest writes reject confusing camelCase/nested fields and return persisted profile/candidate-signal read-back.
- Make tuning recommendations and report verification expose strict next-step levels and block premature mass tuning.
- Keep guidance domain-neutral and avoid RFP/outsourcing runtime logic.

## Proof Gates

Required gates:

- targeted MCP control-plane unit test;
- `pnpm unit_tests:ts`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm check:domain-neutrality`;
- `git diff --check`.

## Current Proof Status

- Implemented and locally proofed on 2026-06-07.
- MCP resources/prompts/server instructions:
  - added `signalops://guide/playbooks/strict-next-steps` with prescriptive selection, LLM-review-absent and Discovery/source-repair sequences;
  - linked strict next-step guidance from server instructions, operator session prompt, selection tuning prompt and Discovery session prompt;
  - guidance states `discovery.brief.preview` is diagnostic only and not a bypass for `domain_contamination` or persisted DiscoveryBrief validation.
- MCP recommendations/reports:
  - `operator.tuning.recommend` now returns `must_do_next`, `allowed_after`, `do_not_do_yet` and `blocked_until`;
  - selection and LLM-budget report verification expose strict next-step fields and proof warnings;
  - suggested system-interest write examples use canonical fields `candidate_positive_signals`, `candidate_negative_signals`, `selection_profile_llm_review_mode` and `allowed_content_kinds`.
- System-interest write UX:
  - `system_interests.create/update` reject confusing camelCase/nested aliases such as `candidateSignals`, `selectionProfile`, `allowedContentKinds` and `llmReviewMode` with MCP `-32602` plus canonical-field hints;
  - successful system-interest writes return `readBackVerification` with persisted profile, candidate signal group counts, allowed content kinds, criterion/profile ids, compile status and warnings when requested fields differ from persisted state.
- Proof passed:
  - `node --import tsx --test --test-concurrency=1 tests/unit/ts/mcp-control-plane.test.ts` (46/46);
  - `pnpm unit_tests:ts` (440/440);
  - `pnpm lint`;
  - `pnpm typecheck` (0 errors; existing Astro hints only);
  - `pnpm check:domain-neutrality`;
  - `git diff --check`.

## Historical Archive: Previous Completed Item

- id: `SIGNALOPS-MCP-SELECTION-DIAGNOSTICS-HARDENING-1`
- lifecycle: `normal`
- route: `bugfix/capability`
- route phase: `mcp-selection-counter-semantics-hardening`
- route-specific next step: implemented MCP/control-plane diagnostics and guidance so clients distinguish filter result rows from distinct candidates, avoid stale report/channel conclusions, and use bounded proof before tuning.
- route-specific proof: targeted MCP control-plane unit test, prompt/resource coverage, unit TS gate, lint, typecheck, domain-neutrality guard and diff check.
- status: `done`
- risk: `medium`
- approval: approved by operator request on 2026-06-06 to implement the accepted MCP Selection Diagnostics Hardening Plan.
- planning required: yes, because this changes MCP/control-plane diagnostics, report verification, operator recommendations and client-facing guidance.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` MCP/control-plane, operator/admin and selection pipeline boundaries; `.aidp/engineering.md` observable diagnostics, configuration and no hidden domain logic rules; `.aidp/verification.md` MCP/control-plane proof expectations.
- cleanup status: no runtime state mutation expected; proof limited to local tests/static checks.
- Proof passed:
  - `node --import tsx --test --test-concurrency=1 tests/unit/ts/mcp-control-plane.test.ts` (44/44);
  - `pnpm unit_tests:ts` (438/438);
  - `pnpm lint`;
  - `pnpm typecheck` (0 errors; existing Astro hints only);
  - `pnpm check:domain-neutrality`;
  - `git diff --check`.

## Historical Archive: Previous Completed Item

- id: `SIGNALOPS-WEB-GOOGLE-FIREBASE-AUTH-SETUP-DOC-1`
- lifecycle: `normal`
- route: `docs-operator`
- route phase: `google-firebase-auth-setup-runbook`
- route-specific next step: created operator documentation for configuring Firebase project, Google Cloud OAuth client, environment variables, allowed domain, and known Google Sign-In console errors.
- route-specific proof: docs source inspection and diff check.
- status: `done`
- risk: `low`
- approval: approved by operator request on 2026-06-06 to create setup documentation after successful auth.
- planning required: no, because this is a narrow operator documentation addition.
- blueprint context checked: not applicable; no architecture/API/session boundary change.
- cleanup status: no external runtime state expected.

## Scope

Create a concise operator runbook for Google-gated web auth setup.

In scope:

- Firebase project / Google Cloud project relationship;
- Firebase Authentication Google provider setup;
- OAuth Web Client ID and Authorized JavaScript origins;
- SignalOps env variables;
- allowed email domain configuration;
- explanation of common Google Sign-In/Firebase console errors.

Out of scope:

- changing code or external Google/Firebase state;
- production deployment.

Allowed paths:

- `.aidp/**`
- `docs/product/operator/setup/**`

## Current Proof Status

- Implemented and locally proofed on 2026-06-06.
- Passed:
  - source inspection of `docs/product/operator/setup/google_firebase_web_auth_setup.md`;
  - source inspection of the cross-link in `docs/product/operator/setup/firebase_setup.md`;
  - `git diff --check`.
- Notes:
  - Document includes the current `The given origin is not allowed for the given client ID` warning and explains Authorized JavaScript origins.

## Historical Archive: Previous Completed Item

- id: `SIGNALOPS-WEB-GOOGLE-INVALID-IDP-FRIENDLY-ERROR-1`
- lifecycle: `normal`
- route: `bugfix`
- route phase: `google-invalid-idp-response-error-mapping`
- route-specific next step: mapped Firebase `INVALID_IDP_RESPONSE` Google auth failures to friendly toast text while keeping full Firebase detail in browser console.
- route-specific proof: targeted web auth session unit test plus lint/typecheck/diff check.
- status: `done`
- risk: `low`
- approval: approved by operator report of live Google/Firebase error on 2026-06-06.
- planning required: no, because this is a narrow extension of existing Google auth error mapping.
- blueprint context checked: not applicable; no architecture/API/session boundary change.
- cleanup status: no external runtime state expected.

## Scope

Firebase `INVALID_IDP_RESPONSE` from Google sign-in should not appear as raw UI text. The user sees a friendly configuration message; the raw Firebase detail remains in browser console through `technicalError`.

In scope:

- Google auth BFF error payload mapping;
- web auth unit regression for `INVALID_IDP_RESPONSE`;
- static proof gates.

Out of scope:

- changing Google/Firebase console configuration;
- changing Google auth success behavior;
- broad rewrite of auth/session flow.

Allowed paths:

- `.aidp/**`
- `apps/web/src/lib/server/auth.ts`
- `tests/unit/ts/**`

## Historical Proof Status

- Implemented and locally proofed on 2026-06-06.
- Passed:
  - `pnpm unit_tests:ts -- web-auth-session`
  - `pnpm typecheck`
  - `pnpm lint`
  - `git diff --check`
- Notes:
  - Targeted TS command executed the full TS unit suite and passed 430 tests.
  - `INVALID_IDP_RESPONSE` now returns toast-facing `Google sign-in is not configured for this Firebase project.` with the raw Firebase detail only in `technicalError`.

## Historical Archive: Previous Completed Item

- id: `SIGNALOPS-WEB-ADMIN-LOOSE-ERROR-TEXT-TOAST-1`
- lifecycle: `normal`
- route: `bugfix`
- route phase: `loose-browser-error-text-to-toast`
- route-specific next step: removed loose action error text outside specialized panels while preserving panel-local validation/status errors.
- route-specific proof: targeted source inspection plus lint, typecheck and diff check.
- status: `done`
- risk: `low`
- approval: approved by operator clarification on 2026-06-06.
- planning required: no, because this is a narrow browser UX cleanup of existing error rendering.
- blueprint context checked: not applicable; no architecture/API/session boundary change.
- cleanup status: no external runtime state expected.

## Scope

Loose browser action errors should be toast-only when they are outside specialized panels. Specialized panels may keep inline error/status text when it is part of the panel's workflow.

In scope:

- remove loose admin/web action error text outside specialized panels;
- preserve panel-local error/status text for dry-run/result/editor/credential panels;
- avoid duplicate toasts for errors already reported by shared BFF helpers;
- targeted source checks and static proof.

Out of scope:

- Firebase/Google provider configuration;
- changing Google auth success behavior;
- removing specialized panel-local validation/status text.

Allowed paths:

- `.aidp/**`
- `apps/web/**`
- `apps/admin/**`
- `packages/ui/**`
- `tests/unit/ts/**`

## Historical Proof Status

- Implemented and locally proofed on 2026-06-06.
- Passed:
  - targeted `rg` source inspection for `setErrorMessage`, `setActionError`, `actionError`, and rose/destructive error text;
  - `pnpm typecheck`;
  - `pnpm lint`;
  - `git diff --check`.
- Notes:
  - Remaining inline error text is scoped to specialized panels or persisted execution data, not loose action error display.
  - Admin `postJson` already emits toast/console for BFF failures; added `reportAdminActionError` to avoid duplicate toasts while still reporting local client-only failures.

## Historical Archive: Previous Completed Item

- id: `SIGNALOPS-WEB-ADMIN-TOAST-UX-FOLLOWUP-1`
- lifecycle: `normal`
- route: `micro-patch`
- route phase: `toast-duration-and-google-inline-error-cleanup`
- route-specific next step: removed duplicate Google sign-in inline auth error text after toast reporting and made browser error toasts stay visible for about seven seconds.
- route-specific proof: targeted TS unit tests for client error reporting and Google sign-in component source inspection plus diff check.
- status: `done`
- risk: `low`
- approval: approved by operator follow-up request on 2026-06-06.
- planning required: no, because this is a small local UX patch within the existing browser error reporting implementation.
- blueprint context checked: not applicable; no architecture/API/session boundary change.
- cleanup status: no external runtime state expected.

## Scope

Fix browser toast UX follow-up from the friendly error reporting item.

In scope:

- default client error toast duration around 7 seconds;
- Google sign-in component should not leave the same auth error text rendered on the page after toast reporting;
- targeted tests/source checks and diff check.

Out of scope:

- Firebase/Google provider configuration;
- changing Google auth success behavior;
- broad rewrite of inline error panels outside the sign-in duplicate message case.

Allowed paths:

- `.aidp/**`
- `apps/web/src/components/GoogleSignInButton.tsx`
- `packages/ui/**`
- `tests/unit/ts/**`

## Historical Proof Status

- Implemented and locally proofed on 2026-06-06.
- Passed:
  - `pnpm unit_tests:ts -- client-error-reporting`
  - `pnpm typecheck`
  - `pnpm lint`
  - `git diff --check`
- Notes:
  - `rg` source inspection confirmed `GoogleSignInButton` no longer renders inline auth error state.
  - Targeted TS command executed the full TS unit suite and passed 429 tests.

## Historical Archive: Previous Completed Item

- id: `SIGNALOPS-WEB-ADMIN-FRIENDLY-ERROR-TOASTS-1`
- lifecycle: `normal`
- route: `bugfix`
- route phase: `web-admin-browser-error-reporting`
- route-specific next step: normalize browser-facing BFF/client errors so web/admin show friendly toast messages and log technical details to the browser console.
- route-specific proof: targeted TS unit tests for error reporting and Google auth mapping plus lint, typecheck and diff check.
- status: `done`
- risk: `medium`
- approval: approved by operator request on 2026-06-06 to implement the accepted unified web/admin error-display plan.
- planning required: yes, because this touches shared browser UI error handling and BFF JSON error contracts across web/admin.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- accepted plan: operator-provided unified web/admin error display plan from 2026-06-06.
- blueprint context checked: auth/session and UI/BFF boundaries from prior Google-gated web work; current scope is browser-facing error reporting only.
- cleanup status: no external runtime state expected; proof artifacts limited to local test/build output.

## Scope

Browser-facing technical errors on web/admin should show friendly toast messages while logging technical detail to browser console. The current Google/Firebase `OPERATION_NOT_ALLOWED` case must not surface raw Firebase text in the UI.

In scope:

- shared client-side error reporter in `@signalops/ui`;
- web/admin client fetch/catch sites that surface BFF/API action errors;
- web/admin BFF JSON error shape for friendly `error`, optional `errorCode`, and sanitized `technicalError`;
- Google auth Firebase error mapping for `OPERATION_NOT_ALLOWED`;
- targeted unit tests and static gates.

Out of scope:

- enabling Firebase/Google provider configuration;
- server-only, worker, CLI, MCP or background runtime error display;
- changing admin auth behavior or Google auth success behavior.

Allowed paths:

- `.aidp/**`
- `apps/web/**`
- `apps/admin/**`
- `packages/ui/**`
- `tests/unit/ts/**`

Protected boundaries:

- Toast text is user-facing and friendly.
- Technical details are browser-console-only and must not include request payloads or secrets.
- Existing flash redirect behavior remains compatible.

## Context Manifest

- `.aidp/AGENTS.md`: lifecycle/work route and pre-write active item discipline.
- `.aidp/routes.md`: `bugfix` route and proof obligations.
- `.aidp/work.md`: current active item and proof status.
- Accepted operator plan in the current request from 2026-06-06.

## Implementation Expectations

- Prefer one shared browser helper over per-component ad hoc logging.
- Preserve inline error state where it already exists, but also call shared reporter for toast and console.
- Keep JSON `error` friendly and put raw/sanitized technical strings in `technicalError`.

## Proof Gates

Required gates:

- `pnpm unit_tests:ts -- web-auth-session admin-action-kit web-action-kit`;
- `pnpm lint`;
- `pnpm typecheck`;
- `git diff --check`.

## Current Proof Status

- Implemented and locally proofed on 2026-06-06.
- Passed:
  - `pnpm unit_tests:ts -- web-auth-session admin-action-kit web-action-kit client-error-reporting`
  - `pnpm lint`
  - `pnpm typecheck`
  - `git diff --check`
- Notes:
  - Targeted TS command executed the full TS unit suite and passed 428 tests.
  - `pnpm typecheck` completed with existing Astro hints and no errors.

## Historical Archive: Previous Completed Item

- id: `SIGNALOPS-MCP-CLIENT-BEST-PRACTICES-1`
- lifecycle: `normal`
- route: `docs-operator`
- route phase: `mcp-client-best-practices-repair`
- route-specific next step: update MCP initialize/client-contract/server guidance, resources, prompts and unit coverage for zero-selected selection calibration workflows.
- route-specific proof: targeted MCP resources/prompts unit tests plus requested static proof gates.
- status: `done`
- risk: `medium`
- approval: approved by operator request on 2026-06-05 to implement the accepted MCP Client Best Practices Repair Plan.
- planning required: yes, because this updates MCP operator guidance, server instructions, prompt contracts and proof expectations for external clients.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- accepted plan: operator-provided MCP Client Best Practices Repair Plan from 2026-06-05.
- blueprint context checked: `.aidp/blueprint.md` API/control-plane/operator boundaries; `.aidp/engineering.md` MCP/operator workflow observability; `.aidp/verification.md` docs-operator and MCP proof rules.
- cleanup status: no external runtime state expected; proof artifacts limited to local test output unless compose/live gates are run.

## Scope

Add domain-neutral MCP client guidance for diagnosing `0 selected signals`, `semantic_rejected/no_system_match`, absent LLM calls and live Discovery without runtime credentials. External clients must classify the failing layer first and run bounded one-interest/one-candidate calibration with MCP read-back and bounded replay proof.

In scope:

- add `signalops://guide/scenarios/selection-calibration`;
- strengthen MCP initialize/client-contract/server instructions for zero-selected selection calibration anti-patterns;
- update selection diagnostics/tuning/system-interest resources and operator prompts to prefer candidateSignals-first recovery;
- document live Discovery credential/preflight behavior and LLM review diagnostics for MCP clients;
- add unit coverage for MCP resources/prompts/instructions touched by this guidance.

Out of scope:

- changing the runtime selection algorithm;
- adding production/external provider credentials;
- applying outsourcing or any other domain-specific configuration to runtime defaults;
- fixing the product mega-flow live A/B/C residual beyond guidance for proper diagnosis.

Allowed paths:

- `.aidp/**`
- `services/mcp/**`
- `tests/unit/ts/**`
- `docs/**` if operator-facing notes require alignment

Protected boundaries:

- Domain examples from `docs/mcp_test/session-report.md` remain evidence only, not mandatory product behavior.
- Admin/MCP writes remain the only path for operator calibration and require read-back proof.
- RSS/channel volume is acquisition evidence, not selected-signal proof.
- Live Discovery without credentials is preflight/not-applicable, not a budget-tuning problem.

## Context Manifest

- `.aidp/AGENTS.md`: lifecycle/work route and pre-write active item discipline.
- `.aidp/routes.md`: `docs-operator` route, planning and proof obligations.
- `.aidp/blueprint.md`: MCP/control-plane and operator/admin boundaries checked.
- `.aidp/engineering.md`: MCP/operator workflow diagnostics and observable failure taxonomy checked.
- `.aidp/verification.md`: docs-operator and MCP proof obligations checked.
- `docs/mcp_test/session-report.md`: evidence for client guidance failure modes, not canonical runtime truth.
- accepted tool-native plan in the operator message from 2026-06-05.

## Implementation Expectations

- Teach external MCP clients to diagnose the layer of failure before changing configuration.
- Prefer one-interest/one-candidate bounded calibration using residual summaries, representative explains, read-back and bounded `docIds` replay.
- Make clear that `llmReviewMode=always` does not bypass semantic rejection.
- Avoid domain-specific rescue instructions or source-specific recommendations in runtime guidance.

## Proof Gates

Required gates:

- targeted TS MCP resources/prompts test;
- `pnpm unit_tests`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm check:domain-neutrality`;
- `git diff --check`.

## Current Proof Status

- Implemented and locally proofed on 2026-06-05.
- Passed:
  - `node --import tsx --test --test-concurrency=1 tests/unit/ts/mcp-control-plane.test.ts`
  - `pnpm unit_tests`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm check:domain-neutrality`
  - `git diff --check`
- Notes:
  - `pnpm typecheck` completed with existing Astro hints and no errors.
  - Worktree remains dirty from this item plus prior in-progress domain-neutral repair changes and operator evidence docs; no cleanup/destructive action was taken.

## Historical Archive: Previous Implemented Item Pending Archive

- id: `SIGNALOPS-MCP-DOMAIN-NEUTRAL-REPAIR-1`
- lifecycle: `normal`
- route: `capability`
- route phase: `mcp-discovery-domain-neutral-repair`
- status: `implemented-with-residual-proof`
- risk: `high`
- approval: approved by operator request on 2026-06-05 to implement the accepted domain-neutral MCP/Discovery repair plan.
- planning required: yes, because this changes MCP/control-plane schemas, Discovery vNext runtime behavior, source/channel writes, proof harness shape and executable domain-neutrality guards.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- accepted plan: operator-provided Domain-Neutral MCP/Discovery Repair Plan from 2026-06-05.

## Scope

Repair issues observed in `docs/mcp_test/session-report.md` as universal MCP/control-plane, Discovery vNext, ingestion and proof-harness defects. Domain-specific tuning for outsourcing or any other domain must live only in operator/admin/MCP configuration or explicit scenario-pack fixtures, not runtime code, default policies or mandatory proofs.

In scope:

- align MCP Discovery schemas with API payloads for brief previews and scenario-proof inputs;
- improve MCP write UX for templates, interests and channel create/update/sync flows;
- repair Discovery vNext budget propagation, live-runtime error taxonomy and HypothesisBatch validation behavior;
- improve RSS/RDF parsing fallback without introducing source-specific adapters;
- make executable proof harnesses domain-neutral and move domain tuning into scenario-pack configuration;
- add a static guard against domain vocabulary in runtime/proof code outside documented allowlists;
- update targeted tests and operator docs/contracts for the repaired behavior.

Out of scope:

- applying the outsourcing configuration from `docs/mcp_test/session-report.md` to live runtime state;
- adding production or external provider credentials;
- adding source-specific UNDP/SAM/TED/World Bank hardcoded adapters unless represented through generic declarative adapter configuration;
- changing web end-user auth/session behavior;
- destructive cleanup of existing operator-created channels, interests, templates, policies or report files.

Allowed paths:

- `.aidp/**`
- `package.json`
- `apps/admin/**`
- `packages/config/**`
- `packages/contracts/**`
- `packages/control-plane/**`
- `packages/sdk/**`
- `services/api/**`
- `services/fetchers/**`
- `services/mcp/**`
- `services/workers/**`
- `infra/**`
- `tests/**`
- `docs/**`

Protected boundaries:

- PostgreSQL remains source of truth for operator-configured channels, interests, templates, policies, discovery artifacts and source inventory.
- MCP/admin/control-plane writes must share schemas and read-back proof; no hidden direct-write bypass.
- Discovery live provider execution remains safe-by-default and fail-closed without explicit budget and runtime credentials.
- Domain vocabulary belongs in admin/MCP configuration or explicit scenario-pack fixtures, not runtime logic/default proof gates.

## Context Manifest

- `.aidp/AGENTS.md`: lifecycle/work route, pre-write active item and canonicalization rules.
- `.aidp/routes.md`: `capability` route, planning and high-risk approval obligations.
- `.aidp/blueprint.md`: Discovery acquisition, source/channel management, operator/admin control plane and public/admin API boundaries checked.
- `.aidp/engineering.md`: MCP/admin writes, external provider/runtime config, error taxonomy, magic string and proof-harness discipline checked.
- `.aidp/verification.md`: Discovery, MCP/control-plane, fetcher/provider, worker and domain-neutral guard proof expectations checked.
- `.aidp/contracts/mcp-control-plane.md`: MCP schema validation, Discovery vNext-only tools and write guardrails checked.
- `.aidp/contracts/discovery-agent.md`: Discovery vNext artifact/run/source-inventory and live-provider invariants checked.
- `.aidp/contracts/feed-ingress-adapters.md`: RSS adapter selection and runtime binding truth checked.
- `.aidp/contracts/universal-selection-profiles.md`: profile-driven selection and no domain lock-in checked.
- `.aidp/contracts/content-analysis-and-gating.md`: policy/template MCP/admin surfaces and external provider behavior checked.
- accepted tool-native plan in the operator message from 2026-06-05.

## Implementation Expectations

- Treat `docs/mcp_test/session-report.md` as evidence only; confirm each defect by repo reality and targeted tests.
- Keep outsourcing/procurement examples as operator reference or explicit scenario-pack fixture only.
- Do not introduce source-specific runtime code where a generic schema, provider shape, declarative adapter or admin/MCP setting is the correct boundary.
- Preserve existing user changes in `docs/mcp_test/**`.

## Proof Gates

Required gates:

- targeted TS MCP/control-plane tests;
- targeted Python Discovery vNext tests;
- targeted TS RSS parser tests;
- `pnpm test:mcp:http:discovery` if compose is available;
- `pnpm test:mcp:http:writes` if compose is available;
- `pnpm test:feed-ingress-adapters:smoke` if fetcher compose/runtime dependencies are available;
- `pnpm test:discovery-enabled:smoke`;
- `pnpm test:product:mega-flow:compose` after generic scenario matrix changes if compose is available;
- `pnpm check:env-sync`;
- `pnpm check:secret-leaks`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm unit_tests`;
- `git diff --check`.

## Current Proof Status

- Implemented and locally proofed on 2026-06-05.
- Passed:
  - `pnpm unit_tests`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm check:env-sync`
  - `pnpm check:secret-leaks`
  - `pnpm check:domain-neutrality`
  - `git diff --check`
  - `pnpm test:discovery:vnext-mcp-scenario-verification:preflight`
  - `pnpm test:mcp:http:discovery`
  - `pnpm test:mcp:http:writes`
  - `pnpm test:feed-ingress-adapters:smoke`
  - `DISCOVERY_ENABLED=1 PYTHONPATH=. .venv/bin/python -m infra.scripts.workers.smoke discovery-enabled` with local loopback bind approval.
- Residual:
  - `pnpm test:product:mega-flow:compose --skip-stack-build` passed all child proof commands but final verdict remained `fail` because strict live A/B/C acceptance still requires selected live-discovery signal candidates without live provider credentials/evidence. Artifact: `/tmp/signalops-product-mega-flow-d35231ac.md`.
  - The package script `pnpm test:discovery-enabled:smoke` still assumes a `python` shell alias; the same smoke module passes through `.venv/bin/python`.

## Cleanup Notes

- MCP/Discovery/channel proofs may create local channels, interests, templates, policies, discovery artifacts, source inventory rows and `/tmp/signalops-*` artifacts; cleanup or record residual state if compose/live proof is run.

## Historical Archive: Previous Completed Item

- id: `SIGNALOPS-WEB-GOOGLE-GATED-ACCESS-1`
- lifecycle: `normal`
- route: `capability`
- route phase: `web-google-gated-access`
- status: `done`
- risk: `high`
- approval: approved by operator request on 2026-06-05 to implement the accepted Google-gated user web access plan.
- planning required: yes, because this changes auth/session semantics, user web access, optional API content-read authorization, env/runtime config and proof harness behavior.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- accepted plan: operator-provided Google-gated user web access plan from 2026-06-05.

## Historical Archive: Previous Completed Item

- id: `SIGNALOPS-PROJECT-RENAME-SWEEP-1`
- lifecycle: `normal`
- route: `sweep`
- route phase: `project-identity-breaking-rename`
- status: `done`
- risk: `high`
- approval: approved by operator request on 2026-06-04 to implement the accepted plan for a maximal former-identity to SignalOps rename without backward compatibility.
- planning required: yes, because this is a broad breaking structural rename across package scope, env/runtime contracts, MCP URI/server identity, docs, proof harnesses and AIDP runtime truth.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- accepted plan: operator-provided project rename plan from 2026-06-04.

## Scope

Rename repository identity to SignalOps without legacy aliases or backward-compatible contract shims.

In scope:

- replace current project identifiers with SignalOps casing, `signalops` package/env/runtime identifiers and `@signalops/*` package scope;
- update workspace manifests, package imports, lockfile, TypeScript path aliases, Playwright commands and Docker package filters;
- update runtime/env defaults, compose, Docker Linux user/group, DB/user/password defaults, user agents, local domains and notification sender defaults;
- update public/operator contracts without aliases: MCP server name, MCP URI scheme, MCP docs/client env vars, SDK exports/types, error taxonomy names, browser globals/events and localStorage keys;
- update UI/product docs, fixtures, proof scripts, `/tmp` artifact prefixes and artifact kind strings;
- update `.aidp/*` current canonical project identity and this active work item while preserving immutable historical proof references only when clearly historical.

Out of scope:

- physically renaming the repository folder path;
- preserving former env vars, package scope, SDK exports, MCP server names or URI scheme resources as aliases;
- production deployment or external-state migration;
- changing product behavior beyond the intentional breaking identity rename.

Allowed paths:

- `.aidp/**`
- `.env.example`
- `.env.dev`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tsconfig*.json`
- `playwright.config.mjs`
- `apps/**`
- `packages/**`
- `services/**`
- `infra/**`
- `database/**`
- `tests/**`
- `docs/**`
- `README.md`

Protected boundaries:

- PostgreSQL remains business source of truth; this rename may change local default database/user names but must not introduce schema/data ownership changes.
- The MCP/control-plane contract is intentionally breaking and must consistently use `signalops://` and `signalops-mcp` after the sweep.
- AIDP runtime truth stays in `.aidp/*`; root routers remain thin.

## Context Manifest

- `.aidp/AGENTS.md`: lifecycle/work route, pre-write active item and canonicalization rules.
- `.aidp/routes.md`: `sweep` route, high-risk approval and proof obligations.
- `.aidp/blueprint.md`: project identity, runtime/delivery baseline, AIDP/process truth and durable boundaries.
- `.aidp/engineering.md`: route-aware sweep discipline, breaking contract/deprecation rules and runtime/config naming discipline.
- `.aidp/verification.md`: broad sweep proof, env/runtime guards and release verification gates.
- accepted tool-native plan in the operator message from 2026-06-04.

## Implementation Expectations

- Perform a repo-wide mechanical rename, then repair semantic fallout around exported names, env lookup names, MCP resource constants, tests and docs.
- Do not keep compatibility aliases for former project identity contracts.
- Keep the worktree folder name unchanged.
- Treat old AIDP proof artifact paths as historical evidence only; current commands and docs must use SignalOps naming.

## Proof Gates

Required gates:

- static/name sweep for former project identity literals;
- `pnpm install --lockfile-only` if workspace manifest/package scope changes require lockfile regeneration;
- `pnpm check:env-sync`;
- `pnpm check:scaffold`;
- `pnpm check:runtime-artifacts`;
- `pnpm check:test-layout`;
- `pnpm check:secret-leaks`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm unit_tests`;
- `pnpm test:migrations:smoke`;
- `pnpm test:mcp:http:matrix`;
- `pnpm test:product:local:core`;
- `pnpm release:verify`;
- `git diff --check`.

## Current Proof Status

- passed locally on 2026-06-04 for `project-identity-breaking-rename`.
- Implemented:
  - workspace/package/runtime rename across manifests, lockfile, package imports, env defaults, Docker/compose user and DB defaults, SDK exports, MCP server identity, MCP URI scheme, docs, proof harness names and `/tmp/signalops-*` artifact prefixes;
  - `.aidp/AGENTS.md`, `.aidp/os.yaml`, `.aidp/blueprint.md`, `.aidp/engineering.md`, `.aidp/verification.md` and `.aidp/contracts/**` current canonical identity updated to SignalOps;
  - local Python unit blocker resolved by simplifying the two affected `tests/unit/python/test_interest_auto_repair.py` context-manager tests so local Python 3.12.3 no longer segfaults during compile;
  - website compose blockers resolved by serving valid PDF fixtures in website proof harnesses and externalizing `pdfjs-dist` from the fetchers runtime bundle so worker resolution uses the installed package path.
- Proof passed:
  - `pnpm install --lockfile-only`;
  - `pnpm install`;
  - `pnpm check:env-sync`;
  - `pnpm check:scaffold`;
  - `pnpm check:runtime-artifacts`;
  - `pnpm check:test-layout`;
  - `pnpm check:secret-leaks`;
  - `pnpm lint`;
  - `pnpm typecheck` with existing Astro hints only and 0 errors;
  - `pnpm unit_tests` (`pnpm unit_tests:ts` 417/417 and `pnpm unit_tests:py` 376/376);
  - `pnpm test:migrations:smoke`;
  - `pnpm test:mcp:http:matrix`, artifacts including `/tmp/signalops-mcp-http-deterministic-90e647fb-f3e8-4b27-a570-ff376ef648f3.json`;
  - `pnpm test:website:compose`;
  - `pnpm test:website:admin:compose`;
  - `pnpm test:product:local:core`, artifacts `/tmp/signalops-product-local-core-b8dc3ca3.json` and `/tmp/signalops-product-local-core-b8dc3ca3.md`;
  - `pnpm build:node-runtime`;
  - `pnpm release:verify`, artifact directory `/var/folders/gj/98r17hrj3kbbssygxmn76nlm0000gn/T/signalops-release-verify-2cf1b3c9` and summary `/var/folders/gj/98r17hrj3kbbssygxmn76nlm0000gn/T/signalops-release-verify-2cf1b3c9/release-verify-summary.json`;
  - full release proof included live website matrix artifact `/tmp/signalops-live-website-matrix-baseline-a8d22d17-a764-4cb6-917c-07c23dc2db0a.json`; external 403/captcha/block responses were recorded as truthful unsupported-or-blocked verdicts and did not fail the gate;
  - static visible name sweep: no former-name hits outside hidden AIDP history;
  - final hidden/static name sweep: remaining former-name hits are only in this `.aidp/work.md` historical archive as immutable past evidence;
  - `git diff --check`.

## Cleanup Notes

- Existing local Docker/Postgres state using former defaults was treated as disposable and recreated during the rename proof.
- New runtime proof artifacts use `/tmp/signalops-*` prefixes. Historical archive entries below may retain former-name artifact paths, package scopes and work item ids as immutable past evidence.

## Historical Archive: Previous Completed Item

- id: `NEWSPORTAL-PUBLIC-ALPHA-CLEANUP-SWEEP-1`
- lifecycle: `normal`
- route: `sweep`
- route phase: `public-alpha-audit-driven-cleanup`
- status: `done`
- risk: `medium`
- approval: approved by operator request on 2026-06-04 to clean according to the operator-edited public alpha cleanup audit.
- planning required: yes, because this is a destructive tracked-file cleanup across docs and proof scripts.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- accepted plan: operator-edited public alpha cleanup audit from 2026-06-04; the audit file itself was removed after the operator explicitly requested deleting it too.

## Scope

Clean the repository public-alpha surface according to the operator-edited cleanup audit.

In scope:

- remove tracked docs/scripts still listed as direct archive/remove candidates in the operator-edited audit;
- update references that would otherwise point at removed public-alpha files;
- preserve files the operator removed from the cleanup candidate list;
- preserve scripts listed only for classification when they are backed by `package.json` or current architecture/proof docs;
- clean ignored local `.DS_Store` clutter if present.

Out of scope:

- modifying product/source/config/test/runtime behavior;
- dependency pruning;
- changing public APIs, package interfaces, migrations, Docker/runtime surfaces or active proof commands.
- deleting tests, glob-driven unit suites, package-script-backed proof harnesses, shared packages, compatibility code, data assets, `old_examples` or `aidp-monitor`.

Allowed paths:

- `.aidp/work.md`
- `docs/documentation-inventory.md`
- `docs/product/architecture/nonstandard-technical-decisions.md`
- `docs/next step/discovery_vnext_system_completion_plan.md`
- `docs/next step/discovery_vnext_system_configuration_playbook.md`
- `docs/discovery_vnext_completion_blueprint.md`
- `docs/discovery_vnext_p0_p1_plan.md`
- `infra/scripts/run-live-website-outsourcing.mjs`
- `infra/scripts/tune-worldbank-procurement-mcp-followup.mjs`
- `infra/scripts/lib/outsource-example-c.bundle.mjs`
- ignored local `.DS_Store` files

Protected boundaries:

- Product docs can explain cleanup outcomes, but `.aidp/*` remains the agent runtime owner.
- Existing tests and compatibility code are not dead solely because they contain `legacy` strings or lack direct per-file references; glob-based runners and compatibility paths must be respected.
- Discovery live proof scripts with package scripts remain active proof surfaces unless a separate proof-harness deprecation sweep removes them.

## Context Manifest

- `.aidp/AGENTS.md`: audit route, pre-write active item and observation/canonicalization rules.
- `.aidp/routes.md`: `sweep` route and pre-write active item rules.
- `.aidp/blueprint.md`: product docs vs AIDP runtime truth, delivery/runtime and test/runtime boundaries.
- `.aidp/engineering.md`: route-aware audit discipline, surgical changes, deprecation/compatibility rules.
- `.aidp/verification.md`: sweep proof and behavior-preservation expectations.
- `docs/documentation-inventory.md`: current docs classification and historical-example status.
- `package.json`: root script and glob-based test/proof command map.
- operator-edited public alpha cleanup audit: cleanup source for this sweep; removed from the working tree after implementation.

## Implementation Expectations

- Remove only files still directly listed as cleanup candidates or their now-orphaned private dependency.
- Do not remove large data assets, `old_examples`, `aidp-monitor`, tests, shared packages, compatibility code or package-script-backed proof harnesses.
- Keep docs and AIDP references coherent after removals.
- Preserve behavior: this sweep must not modify runtime/source logic.

## Proof Gates

Required gates:

- `pnpm check:test-layout`;
- `pnpm check:runtime-artifacts`;
- `pnpm check:scaffold`;
- `git diff --check`.

No runtime tests are required because this sweep removes public docs and unsupported/manual-only proof artifacts without changing product/source/config/test behavior.

## Current Proof Status

- passed locally on 2026-06-04 for `public-alpha-audit-driven-cleanup`:
  - removed public-alpha cleanup candidates that remained in the operator-edited audit: historical Discovery plan docs, `docs/next step` plan docs, orphaned outsourcing website runner, its private bundle, and the unreferenced World Bank tuning follow-up script;
  - removed the audit file itself after the operator explicitly requested it;
  - retained tests, large data assets, `old_examples`, `aidp-monitor`, shared packages, compatibility code and package-script-backed Discovery live proof harnesses;
  - updated `docs/product/architecture/nonstandard-technical-decisions.md` and this work state so active refs point at surviving Discovery docs/contracts rather than removed plan files;
  - removed ignored local `.DS_Store` files;
  - proof passed: `pnpm check:test-layout`, `pnpm check:runtime-artifacts`, `pnpm check:scaffold`, and `git diff --check`.

## Cleanup Notes

- Ignored local `.DS_Store` files were removed.
- No runtime artifacts were created.

## Parked Previous Item

- id: `NEWSPORTAL-PUBLIC-ALPHA-CLEANUP-AUDIT-1`
- lifecycle: `normal`
- route: `audit`
- status before parking: `done`
- reason parked: operator edited the resulting audit and requested implementing cleanup according to the remaining candidates.
- last known proof status: `git diff --check` passed locally on 2026-06-04 for the audit report item.

- id: `NEWSPORTAL-DISCOVERY-VNEXT-COMPLETION-2`
- lifecycle: `normal`
- route: `capability`
- route phase: `discovery-vnext-system-scope-resolution-completion`
- status: `active`
- parked status: `paused for public-alpha cleanup audit`
- parked reason: operator requested the separate public alpha cleanup audit on 2026-06-04; resume this capability only after the audit report item is closed or explicitly superseded.
- risk: `medium`
- approval: approved by operator request on 2026-05-31 to implement the Discovery vNext completion plan; the public copy of the historical plan doc was removed by `NEWSPORTAL-PUBLIC-ALPHA-CLEANUP-SWEEP-1` and remains available through git history.
- planning required: yes
- planning source: `external-spec` + `tool-native`
- planning status: `accepted-for-this-item`
- accepted plan: historical Discovery vNext completion and P0-P1 implementation plans accepted by operator requests on 2026-05-31 and 2026-06-03; public working-tree copies were removed by `NEWSPORTAL-PUBLIC-ALPHA-CLEANUP-SWEEP-1` and remain available through git history. Current active Discovery specification remains `docs/discovery_vnext_blueprint.md` plus `.aidp/contracts/discovery-agent.md`.

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
- complete P0-P1 Discovery vNext hardening: authoritative structural `SourceScopeResolution`, resolved-scope handoff, fail-visible full-run quality gates, individual hypothesis-aware probe caps, generic item-level conversion foundations, canonical `SourceUnderstanding` v2, coverage-policy MegaLoop, post-scope QueryQuality, bounded source-scope re-resolution, and operator verification gates.
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
- `docs/discovery_vnext_blueprint.md`
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
  - MCP-only backfill replay completed after the wide live-gap run: job `7e78b48d-2f95-424f-9776-964b8f928859`, `jobKind=backfill`, `retroNotifications=skip`, processed 1281 signal_candidates, found 87108 criteria matches, and recorded 0 LLM review failures/timeouts; dashboard showed one weak/noisy selected row before adapter proof, confirming selected-content gates were still strict rather than forced open;
  - fixed a generic fetchers startup/runtime bug in PDF extraction: `pdfjs-dist` is now lazy-loaded after Node-safe DOMMatrix/ImageData/Path2D fallbacks are installed, avoiding the prior fetchers crash-loop from PDF.js top-level `DOMMatrix` access while keeping PDF extraction fetcher-owned and without adding native canvas or OCR dependencies;
  - item-level live proof passed after the fetchers fix: `DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS=250 node infra/scripts/run-ted-api-adapter-mcp-proof.mjs`, artifact `/tmp/newsportal-ted-api-adapter-mcp-proof-cc3511be-9c0b-4362-ae6c-4c962ad5278b.json`, with 5 dry-run official API items, 10 fetched signal_candidates, 1 selected visible content item, and `operator.report.verify selection` reporting `highQualityCount=1` and no weak/noise selected warning;
  - proof gates passed: `python3 -m py_compile services/workers/app/discovery_vnext_artifacts.py services/workers/app/discovery_vnext_scope_resolution.py services/workers/app/discovery_vnext_understanding.py services/workers/app/discovery_vnext_routing.py services/workers/app/discovery_vnext_candidates.py services/workers/app/discovery_vnext_megaloop.py services/workers/app/discovery_vnext_probe.py services/workers/app/discovery_vnext_handoff.py services/api/app/discovery_vnext_api.py`, `node --check infra/scripts/test-discovery-vnext-mcp-live-signal-flow.mjs`, `node --check infra/scripts/test-discovery-vnext-mcp-live-gap-flow.mjs`, `pnpm unit_tests:py -- tests/unit/python/test_discovery_vnext_foundation.py` (376/376), `pnpm unit_tests:ts -- tests/unit/ts/discovery-vnext-contracts.test.ts tests/unit/ts/mcp-control-plane.test.ts` (repo TS suite 417/417), `pnpm --filter @newsportal/fetchers typecheck`, `pnpm unit_tests:ts -- tests/unit/ts/resource-enrichment-website.test.ts tests/unit/ts/document-observations.test.ts` (repo TS suite 417/417), `pnpm lint:ts`, `pnpm lint:py`, `pnpm typecheck` (existing Astro hints only, no errors), `pnpm test:migrations:smoke`, `pnpm test:discovery:vnext-flow` with report `/tmp/newsportal-discovery-vnext-flow-dvf-e9850815-cf3.json`, and `pnpm test:mcp:http:discovery` with artifacts `/tmp/newsportal-mcp-http-deterministic-f5e614bc-c0ca-4b6a-bab5-787f9c220889.json` and `.md`;
  - conclusion: the full funnel is proven for at least one item-level official buyer signal through MCP/runtime paths; remaining zero-selected outcomes in broad source-discovery runs are quality/conversion outcomes, not evidence to weaken selected-content gates or add domain-specific core shortcuts.
- passed locally on 2026-06-03 for `strict-rss-source-gate`:
  - implemented domain-neutral productive RSS semantics: `validFeed` remains parseable feed metadata, while `productiveFeed` requires sample entries and is now required for RSS auto-register/probation handoff;
  - routing/handoff proof: parseable empty RSS feeds route away from channel creation and direct handoff returns `rss_feed_not_productive`; RSS handoff uses validated `feedFinalUrl` as the operational channel/feed URL when available;
  - harness proof: live-signal report now records channel provider, channel URL, fetch run adapter/status/count summaries, RSS downstream evidence via `signal_candidates.list`, and RSS zero-output as `rss_feed_not_productive`;
  - targeted proof passed: `python3 -m py_compile services/workers/app/discovery_vnext_probe.py services/workers/app/discovery_vnext_understanding.py services/workers/app/discovery_vnext_routing.py services/workers/app/discovery_vnext_handoff.py tests/unit/python/test_discovery_vnext_foundation.py`, `pnpm unit_tests:py -- tests/unit/python/test_discovery_vnext_foundation.py` (376/376), `node --check infra/scripts/test-discovery-vnext-mcp-live-signal-flow.mjs`, `pnpm lint:ts`, and `git diff --check` for touched files;
  - full rebuilt live MCP proof completed: `DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS=500 pnpm test:discovery:vnext-mcp-live-signal-flow`, artifacts `/tmp/newsportal-discovery-vnext-mcp-live-signal-flow-b499d52c-102b-4354-8cd1-12a876899f43.json` and `.md`; result still failed only on `downstream_selection_gap`, but RSS source readiness passed with 2 fetched content families, 10 explainable items, productive RSS fetch counts 20/20 and 10/10, and no empty-RSS downstream timeout gap;
  - DB read-back confirmed operational RSS channel URLs were validated feed URLs (`https://www.yazoul.net/advisory/rss.xml`, `https://www.regcompliancewatch.com/feed/`), not raw signal_candidate/candidate URLs.
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
  - residual gap: MCP `signal_candidates.holds.list` returned no buyer/project/vendor-search hold bucket, so no `buyer_hold` replay chunk was queued in this pass.
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
  - payload: `indexName=interest_centroids`, `jobKind=backfill`, `batchSize=100`, `replayExistingSignal Candidates=true`, `includeEnrichment=false`, `forceEnrichment=false`, `retroNotifications=skip`;
  - job read-back: processed 196 historical signal_candidates, criteria matches 980, LLM review failures/timeouts 0, retro notifications skipped;
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
- Raw-signal_candidate versus selected-signal count clarification implemented locally on 2026-06-02:
  - added API/SDK summary surface `/maintenance/signal-candidates/selection-summary` / `getSignalCandidateSelectionSummary` to distinguish raw `signal_candidates` observations from `final_selection_results` selected signals;
  - added read-only MCP tool `operator.selection.dashboard` so MCP operators can verify why a raw signal_candidate total such as 185 can coexist with zero selected/public lead signals;
  - updated admin Signal Candidates triage to show global counters for signal_candidate observations, selected signal_candidate signals, visible content items, rejected rows, held/gray-zone rows and pending rows before page-local triage views;
  - proof: `pnpm unit_tests:py -- tests/unit/python/test_api_zero_shot_operator_surfaces.py tests/unit/python/test_api_sequence_management.py` passed 364/364;
  - proof: `pnpm unit_tests:ts -- mcp-control-plane` passed 409/409;
  - proof: `pnpm unit_tests:ts -- sdk-pagination` passed 410/410;
  - proof: `pnpm --filter @newsportal/mcp typecheck` passed;
  - proof: `pnpm --filter @newsportal/sdk typecheck` passed;
  - proof: `pnpm --filter @newsportal/admin typecheck` passed with 0 errors and existing Astro hints;
  - proof: `python3 -m py_compile services/api/app/signal_candidate_list_read_model.py services/api/app/main.py services/api/app/routes/content_routes.py services/api/app/route_deps.py tests/unit/python/test_api_zero_shot_operator_surfaces.py tests/unit/python/test_api_sequence_management.py` passed;
  - proof: `git diff --check -- services/api/app/signal_candidate_list_read_model.py services/api/app/main.py services/api/app/routes/content_routes.py services/api/app/route_deps.py packages/sdk/src/index.ts services/mcp/src/operating-intelligence.ts services/mcp/src/tools.ts apps/admin/src/pages/signal-candidates.astro tests/unit/python/test_api_zero_shot_operator_surfaces.py tests/unit/python/test_api_sequence_management.py tests/unit/ts/mcp-control-plane.test.ts tests/unit/ts/sdk-pagination.test.ts` passed.
  - runtime proof: `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml up -d --build api admin mcp nginx` completed and affected containers became healthy;
  - runtime proof: `curl -sS http://127.0.0.1:8000/maintenance/signal-candidates/selection-summary` returned `rawSignalCandidateObservations=196`, `selectedSignalCandidateSignals=0`, `rejectedRows=196`, proving the 185/196 display is raw corpus, not selected signal yield;
  - runtime proof: `curl -sS -I http://127.0.0.1:4322/signal-candidates` returned the expected admin auth redirect, `curl -sS http://127.0.0.1:4300/health` returned `{"service":"mcp","status":"ok"}`, and `docker exec docker-mcp-1 ... grep` confirmed `operator.selection.dashboard` is present in built MCP runtime.
- Public web selected-content bug fixed locally on 2026-06-02:
  - root cause: public web already used `/collections/system-selected`, but resource/listing rows entered that collection by active-interest content kind (`kind_enabled`) without a real `final_selection_results.is_selected=true` decision;
  - contract checked: `.aidp/contracts/content-model.md` and `.aidp/contracts/content-analysis-and-gating.md` define raw `signal_candidates`/resources as observations and `final_selection_results`/content items as the public selected surface;
  - fix: resource content items now require `web_resources.projected_signal_candidate_id -> signal_candidates -> final_selection_results`, visible projected signal_candidate, active kind, and `coalesce(fsr.is_selected, false)=true`; direct public `resource:*` detail uses the same selected gate;
  - guard fix: public content item ids are UUID-validated before DB access so invalid `signal_candidate:*` ids return 404 instead of leaking a database cast error as 500;
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
  - status: `passed`; MCP calls: `34`; dry-run TED API items: `5`; fetched signal_candidates: `10`; selected public content items: `5`; read-after-write proof: true;
  - MCP-created/updated adapter: `api.ted_eu_software_tender_search`;
  - MCP-created channel: `16aee162-9318-4fb2-a852-aa49dc651b8d`, bound through `ingress.bindings.set` with `selectionMode=mcp`;
  - MCP-created calibration interest: `f2ba3dfe-419a-475b-9292-637f7f376b5e`, `TED EU software procurement buyer signals [22c962e2]`;
  - bounded MCP backfill job: `034a43a3-e20d-4180-acfc-98608fce5735`, `jobKind=backfill`, `retroNotifications=skip`, completed before selection readback;
  - public user-facing proof: `curl -sS 'http://127.0.0.1:8000/collections/system-selected?page=1&pageSize=10'` returned `total=5`, and `curl -sS http://127.0.0.1:4321/` rendered `5 content items in the system-selected collection`;
  - selection dashboard after proof: raw signal_candidate observations `326`, selected signal_candidate signals `5`, visible content items `5`, rejected rows `307`, gray-zone rows `14`, pending rows `0`;
  - selected examples include item-level official buyer/project evidence from TED: Netherlands Rotterdam VRI software programming, Cyprus Department of Insolvency integrated system/IaaS implementation, Liechtenstein digital project leadership, Germany GTAI ECMS hosting/development/support, Norway real-time workplace availability system;
  - system fixes applied to support this proof: `places=["global"]` now behaves as worldwide wildcard instead of a literal place, and final selection can promote clean item-level `buyer_intent`/`project_intent` candidate-signal consensus to selected while preserving document-level technical vetoes for wrapper/directory/jobs/repo noise;
  - proof: `PYTHONPATH=. python3 -m unittest tests.unit.python.test_candidate_signal_text tests.unit.python.test_scoring tests.unit.python.test_worker_hard_filters tests.unit.python.test_final_selection` passed 56/56;
  - proof: `python3 -m py_compile services/workers/app/candidate_signal_text.py services/workers/app/scoring.py services/workers/app/final_selection.py tests/unit/python/test_candidate_signal_text.py tests/unit/python/test_scoring.py tests/unit/python/test_worker_hard_filters.py tests/unit/python/test_final_selection.py` passed;
  - proof: `node --check infra/scripts/run-ted-api-adapter-mcp-proof.mjs` passed and `git diff --check -- services/workers/app/scoring.py services/workers/app/final_selection.py tests/unit/python/test_scoring.py tests/unit/python/test_worker_hard_filters.py tests/unit/python/test_final_selection.py infra/scripts/run-ted-api-adapter-mcp-proof.mjs .aidp/work.md` passed before this `.aidp/work.md` sync;
  - residual risk: live Gemini criterion review rows still showed provider `HTTP Error 404: Not Found` in the signal candidate explain evidence, but deterministic item-level procurement evidence selected the items without pending LLM rows; LLM provider configuration should be checked separately so future quality-polishing loops can use LLM review instead of relying only on deterministic candidate-signal consensus.
- MCP discovery/web/API expansion for the outsourcing buyer-signal funnel continued locally on 2026-06-02:
  - World Bank official procurement API adapter proof added and run through MCP:
    - script: `infra/scripts/run-worldbank-procurement-mcp-proof.mjs`;
    - artifact: `/tmp/newsportal-worldbank-procurement-mcp-proof-40b62bb0-bbe8-46ad-854c-125455057e75.json`;
    - markdown report: `/tmp/newsportal-worldbank-procurement-mcp-proof-40b62bb0-bbe8-46ad-854c-125455057e75.md`;
    - result: `needs_selection_followup`; MCP-created channel `d9ae7114-ffd7-4372-85af-8b69afdda928`; MCP-created interest `58a36bb4-157e-4d08-b9fd-3bc87674b7c9`; reindex job `b5dcbcb0-9378-494e-b52d-efb22f1fc937`; 10 signal_candidate observations, 0 channel-selected items, global selected remained 5;
    - follow-up tuning artifact: `/tmp/newsportal-worldbank-procurement-mcp-followup-c9f2be4e-36f3-4518-b798-ff1475e6ecae.json`;
    - follow-up markdown: `/tmp/newsportal-worldbank-procurement-mcp-followup-c9f2be4e-36f3-4518-b798-ff1475e6ecae.md`;
    - follow-up result: `needs_source_or_selection_followup`; MCP calls 26; read-after-write true; bounded reindex job `5d43fb55-8575-4f57-adad-55f7e25f6540` completed; World Bank channel selected stayed 0; `signal_candidates.feedback.submit`/`content_items.feedback.submit` remains an MCP tool gap for signal_candidate-level useful/noise feedback.
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
    - result: `needs_selection_followup`; MCP calls 30; MCP-created channel `b73e3daf-60cf-45ab-96df-9404e439291d`; MCP-created interest `04125ae3-a3e3-444b-90b3-89fdb3c7ab0d`; bounded reindex job `003c9bbe-4f5e-4e4e-9b9d-893872330d5f` completed; 19 signal_candidate observations; 0 channel-selected items; global selected remained 5;
    - residual evidence: early UK result was deduped to 1 signal_candidate because the URL template used a fragment; the script now uses query-string `ocid` URLs so releases stay unique;
    - residual evidence: many current CPV 72000000 items are award/training/hardware/non-software records and are correctly rejected; a subsequent place-tuning rerun was blocked by provider throttling `429 Too Many Requests`, so the `places=["global"]` follow-up must wait for the endpoint rate-limit window or use a narrower official query/source;
    - residual adapter gap: current declarative path reader cannot extract OCDS array fields such as `tender.documents.0.url`; add numeric array path support or a first-document URL mapping before relying on Contracts Finder HTML/detail URLs.
- A fresh MCP-only discovery run with new outsourcing buyer-signal hypotheses completed locally on 2026-06-02:
  - added new negative-first/item-detail packs to `infra/scripts/run-outsourcing-buyer-signal-rescue.mjs`: `civic_case_management_permitting_rfp`, `erp_crm_migration_partner_procurement`, `website_portal_rebuild_official_rfp`, `healthcare_integration_patient_portal_rfp`, and `nonprofit_education_grant_digital_delivery`;
  - command: `DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS=400 node infra/scripts/run-outsourcing-buyer-signal-rescue.mjs --max-packs=5 --max-candidates=30 --max-probes=6 --selected-target=8`;
  - artifact: `/tmp/newsportal-outsourcing-buyer-signal-rescue-b6726b10-588d-4468-b45a-cd359489795d.json`;
  - markdown report: `/tmp/newsportal-outsourcing-buyer-signal-rescue-b6726b10-588d-4468-b45a-cd359489795d.md`;
  - result: `needs_followup`; MCP calls `346`; 5/5 new source families produced live candidates/provider evidence; 5/5 reached routing/backlog evidence; public selected stayed `5/8`;
  - reindex: bounded `maintenance.reindex.request jobKind=backfill` job `a0677299-8f1f-498e-a9fa-a35884968664` completed with `retroNotifications=skip`, processing 10 docIds;
  - public/MCP readback after the run: raw signal_candidate observations increased `435 -> 569`, selected signal_candidate signals stayed `5`, visible content items stayed `5`, rejected rows `544`, gray-zone rows `20`, pending rows `0`, source inventory `116`, adapter backlog `30`;
  - promising discovery candidates now include City of Selma bid detail, City of Monroe permitting PDF, City of Crestwood permitting/licensing software PDF, Durham Oracle ERP implementation partner PDF, OHR ERP RFP, Snoqualmie ERP implementation PDF, DCOE website redesign/CMS services, CoveredCA website redesign PDF, ISBH website redesign RFP, Owosso website redesign/hosting PDF, Lone Star EHR RFP, Hawaii HANDS attachment, Emergence Health EHR services PDF, BHCC LMS RFP, and MCCS LMS RFP;
  - routed/probation evidence included channels for City of Selma `71d94996-70b6-4fa3-bc23-571adfad9a55`, OHR ERP RFP `214e191c-6f51-491b-9e0f-0a7f2c098d9c`, ISBH website redesign `a2889c3e-e8e7-4713-8386-95997828890d`, CMS interoperability context `755c0ad3-9f24-469e-874b-b0487ebe7e66`, SAM.gov opportunities `395d9adb-d38c-401b-8e18-007c5461113d`, and Nonprofit Newsfeed RFP databases `87cfcc41-35c3-4668-8a06-71b22f3215ef`;
  - interpretation: the new hypotheses materially improved discovery recall and found more plausible buyer/project item URLs, but fetch/channel monitoring still collapses many sources into wrapper, directory, search, or context pages; current selection correctly rejects those rather than inflating public lead signals;
  - MCP `signal_candidates.explain` samples after the run showed `LGBTQIA+ Commission` rejected by `document_level_technical_filter` / `wrapper_directory_noise`, and `Find RFP Security & Safety Bids` rejected by `must_not:search`, despite project-intent candidate tiers; this supports adapter/source extraction work rather than relaxing selected-content semantics;
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
