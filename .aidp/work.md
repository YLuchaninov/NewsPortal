# AIDP Work State

## Active Item

- id: `SIGNALOPS-MCP-CHANGE-INTENTS-1`
- lifecycle: `normal`
- route: `capability` with `docs-operator/bugfix` scope for MCP/control-plane advisory UX hardening.
- route phase: `operator-flow-change-intents`
- route-specific next step: implement advisory change/cleanup/tuning intent fields on MCP recommendations and report verification, update flow guidance/prompts, and add unit proof.
- route-specific proof: targeted MCP control-plane unit test, prompt/resource coverage, schema validation coverage, unit TS gate, lint, typecheck, domain-neutrality guard and diff check.
- status: `done`
- risk: `medium`
- approval: approved by operator request on 2026-06-07 to implement the MCP Change Intents For Operator Flow Modes plan.
- planning required: yes, because this changes MCP/control-plane guidance, public advisory schemas, operating-intelligence outputs and client-facing prompts.
- planning source: `tool-native`
- planning status: `accepted-for-this-item`
- blueprint context checked: `.aidp/blueprint.md` MCP/control-plane, operator/admin and selection/discovery boundaries; `.aidp/engineering.md` observable diagnostics, MCP trust boundary and no hidden domain logic rules; `.aidp/verification.md` and `.aidp/contracts/mcp-control-plane.md` MCP proof expectations.
- cleanup status: no runtime state mutation expected; proof limited to local tests/static checks.

## Scope

Add advisory intent/subtype fields under existing MCP flow modes so clients can distinguish system updates, config updates, tuning and cleanup without adding new top-level flow modes or domain-specific runtime logic.

In scope:

- optional advisory fields on `operator.tuning.recommend` and `operator.report.verify`: `changeIntent`, `cleanupIntent`, `tuningLayer`, `updateRisk`;
- intent-aware recommendation/report output fields: `intentSequence`, `intentGuardrails`, `intentProofRequired`, `intentBlockedUntil`, `intentWarnings`;
- `signalops://guide/playbooks/change-intents` or equivalent flow-mode guidance;
- server initialize instructions and prompts for `flowMode` plus relevant intent;
- unit tests for resources, prompts, schemas, recommendations and reports.

Out of scope:

- new top-level flow modes;
- selection/runtime algorithm changes;
- Discovery/fetcher/LLM/source runtime algorithm changes;
- domain-specific RFP, outsourcing or procurement runtime defaults;
- automatic source/channel/config writes;
- requiring intent fields on existing write tools.

Allowed paths:

- `.aidp/**`
- `services/mcp/**`
- `packages/contracts/**`
- `tests/unit/ts/**`

Protected boundaries:

- Intent fields are advisory and optional.
- Existing write tools remain compatible and do not require intent.
- Domain-specific tuning remains operator/admin/MCP configuration or scenario-pack evidence only.

## Context Manifest

- `.aidp/AGENTS.md`: lifecycle/work route and pre-write active item discipline.
- `.aidp/routes.md`: capability and MCP/control-plane proof obligations.
- `.aidp/blueprint.md`: MCP/control-plane, operator/admin and selection/discovery boundaries.
- `.aidp/engineering.md`: observable diagnostics and no hidden domain logic.
- `.aidp/verification.md`: MCP/control-plane proof and static guard expectations.
- `.aidp/contracts/mcp-control-plane.md`: schema validation, report/context and MCP proof rules.

## Implementation Expectations

- Keep existing six `operationMode` values unchanged.
- Add domain-neutral intent taxonomy for change/update/tuning/cleanup scenarios.
- Make recommendations and report verification echo intent fields and return intent-specific proof requirements.
- Keep source acquisition proof separate from selection proof and mutation responses separate from verified effect.

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
  - added `signalops://guide/playbooks/change-intents`;
  - extended `signalops://guide/playbooks/operator-flow-modes` with intent taxonomy and intent-aware recommendation/report contracts;
  - clarified `strict-next-steps` that diagnostic flow can carry advisory intent/tuningLayer while remaining diagnostic;
  - updated initialize instructions and session prompts to require/report `flowMode` plus relevant `changeIntent`, `cleanupIntent`, `tuningLayer` and `updateRisk` before mutation recommendations.
- MCP recommendations/reports:
  - `operator.tuning.recommend` and `operator.report.verify` accept advisory `changeIntent`, `cleanupIntent`, `tuningLayer` and `updateRisk`;
  - recommendations and supported report verification outputs now expose `intentSequence`, `intentGuardrails`, `intentProofRequired`, `intentBlockedUntil` and `intentWarnings`;
  - cleanup report verification exposes cleanup intent proof guardrails without changing destructive tool requirements.
- Proof passed:
  - `node --import tsx --test --test-concurrency=1 tests/unit/ts/mcp-control-plane.test.ts` (51/51);
  - `pnpm unit_tests:ts` (445/445);
  - `pnpm lint`;
  - `pnpm typecheck` (0 errors; existing Astro hints only);
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
