# Work

Это live execution document для репозитория.

Используй его для:

- short current memory;
- capability planning и active execution state;
- worktree coherence;
- known gaps и next recommended action;
- test artifacts и cleanup state;
- handoff state.

Не используй его как длинный журнал истории.
Durable completed detail переносится в `docs/history.md`.

## Current mode

- Operating mode: normal
- Why now: on 2026-04-23 the user asked to implement the new remote MCP admin control-plane capability end to end.

## Current memory

- Runtime core инициализирован; ordinary implementation work разрешен.
- On 2026-04-23 `PATCH-MCP-CLIENT-DOCS-AND-TESTING-GUIDES` completed and was archived after adding a dedicated `docs/mcp/` subfolder for NewsPortal MCP operator docs:
  - `docs/mcp/README.md` now indexes the NewsPortal MCP docs pack and records canonical local URLs, auth assumptions, and source references;
  - `docs/mcp/client-setups.md` now contains concrete NewsPortal MCP setup examples for Codex, OpenCode, Cursor, VS Code, Claude Code, and Claude Desktop notes;
  - `docs/mcp/http-smoke.md` now contains raw `curl` examples for `GET /mcp`, JSON-RPC discovery, resources, prompts, read-only tool calls, and failure checks;
  - `docs/mcp/testing.md` now separates canonical local compose proof from provider-backed local evidence and bounded non-local smoke guidance.
- On 2026-04-23 `PATCH-MCP-SCENARIO-PLAYBOOKS` completed and was archived after expanding the NewsPortal MCP orientation layer across the main bounded operator scenarios:
  - `services/mcp/src/resources.ts` now exposes explicit scenario guides for:
    - `sequences`
    - `discovery`
    - `system interests`
    - `LLM templates`
    - `channels`
    - `read-only observability`
    - `cleanup`
  - `services/mcp/src/prompts.ts` now exposes scenario start prompts for:
    - `sequences`
    - `discovery`
    - `system interests`
    - `LLM templates`
    - `channels`
    - `observability`
  - `docs/contracts/mcp-control-plane.md` now records that the shipped orientation layer should cover the main bounded operator scenarios explicitly, not just a generic overview;
  - `tests/unit/ts/mcp-control-plane.test.ts` now verifies the scenario resources and prompts remain discoverable through the MCP registries.
- On 2026-04-23 `PATCH-MCP-AGENT-ORIENTATION-GUIDANCE` completed and was archived after adding built-in server-orientation guidance to the MCP surface:
  - `services/mcp/src/resources.ts` now exposes `newsportal://guide/server-overview` and `newsportal://guide/operator-playbooks`;
  - `services/mcp/src/prompts.ts` now exposes `operator.session.start` as a starter prompt for safe NewsPortal MCP workflow;
  - `docs/contracts/mcp-control-plane.md` now records the orientation-layer contract explicitly;
  - `tests/unit/ts/mcp-control-plane.test.ts` now verifies the new guidance resources and prompt are discoverable through the MCP registries.
- On 2026-04-23 `PATCH-MCP-LIVE-RECALL-USEFULNESS-TUNING` completed and was archived after tightening the MCP live developer-news recall case around high-signal domains instead of generic release-note searches:
  - `infra/scripts/test-mcp-http-live.mjs` now uses targeted `site:` recall seed queries and classifier-relevant `negativeDomains` for the live developer-source case;
  - the new regression check in `tests/unit/ts/mcp-http-live-case.test.ts` locks that live-case contract;
  - the latest live MCP artifact is:
    - `/tmp/newsportal-mcp-http-live-4e8d9b19-55b6-4c91-82ea-13627ef52d2d.json`
    - `/tmp/newsportal-mcp-http-live-4e8d9b19-55b6-4c91-82ea-13627ef52d2d.md`
  - latest truthful outcome after the tuning:
    - `runtime verdict = healthy`
    - `usefulness verdict = healthy`
    - the live recall lane produced `3` candidates and successfully promoted one candidate into a bounded channel through MCP.
- On 2026-04-23 `PATCH-MCP-NGINX-LONG-REQUEST-TIMEOUT` completed and was archived after fixing the real product-side cause of the live MCP `504` residual:
  - the dedicated `/mcp` nginx route now carries explicit long-request proxy timeouts instead of inheriting the default ~60s cutoff;
  - the new regression check in `tests/unit/ts/mcp-nginx-route.test.ts` locks that timeout contract;
  - the latest live MCP artifact is:
    - `/tmp/newsportal-mcp-http-live-c5ab8a06-ae8f-43af-a074-279368b4796a.json`
    - `/tmp/newsportal-mcp-http-live-c5ab8a06-ae8f-43af-a074-279368b4796a.md`
  - latest truthful outcome after the fix:
    - `runtime verdict = healthy`
    - `usefulness verdict = yield-usefulness-weak-but-runtime-healthy`
    - the earlier nginx `504 Gateway Time-out` on `/mcp` is no longer present.
- On 2026-04-23 `PATCH-MCP-LIVE-HTTP-RESIDUAL-DIAGNOSTICS` completed and was archived after hardening the supplemental live MCP harness so residuals no longer collapse into opaque parse errors:
  - `infra/scripts/lib/mcp-http-testkit.mjs` now preserves structured HTTP diagnostics for non-JSON responses (`status`, `statusText`, `content-type`, `server`, `bodyKind`, `bodyPreview`, `sourceHint`) and structured MCP JSON-RPC diagnostics for tool errors;
  - `infra/scripts/test-mcp-http-live.mjs` now records those diagnostics in live `/tmp` artifacts and uses more realistic recall promotion logic by classifying/iterating candidates instead of blindly promoting the first one;
  - the latest live proof artifact is:
    - `/tmp/newsportal-mcp-http-live-0ea3186e-91aa-459b-9cb7-2dcbc510f035.json`
    - `/tmp/newsportal-mcp-http-live-0ea3186e-91aa-459b-9cb7-2dcbc510f035.md`
  - latest truthful live residual:
    - `POST /mcp` returned `504 Gateway Time-out` HTML during recall acquisition;
    - the artifact now preserves request metadata and body preview instead of only `Unexpected token '<'`.
- On 2026-04-23 `C-MCP-HTTP-REAL-WORLD-TEST-EXPANSION` completed and was archived after expanding MCP proof into a layered HTTP-only deterministic-plus-live contour:
  - deterministic `pnpm test:mcp:compose` now orchestrates realistic scenario modules with `/tmp` JSON/Markdown artifacts;
  - focused reruns were added for auth, reads, writes, and discovery-heavy MCP HTTP coverage;
  - supplemental `pnpm test:mcp:http:live` now records provider/runtime residuals as evidence instead of collapsing every weak external run into a false regression;
  - shipped-vs-deferred doc parity is explicit and unit-tested.
- The proof expansion exposed and fixed one truthful backend defect during closeout:
  - discovery mission list pagination now aliases `discovery_missions m` correctly in its count query, so MCP `discovery.missions.list` no longer fails with a `500` when filtering by status.
- Latest authoritative MCP proof results on 2026-04-23:
  - `pnpm unit_tests`
  - `pnpm typecheck`
  - `pnpm test:mcp:compose`
  - `pnpm test:mcp:http:live`
  - `git diff --check --`
- Latest deterministic MCP artifact:
  - `/tmp/newsportal-mcp-http-deterministic-d12c4908-9530-4d7d-bba9-666f50684f71.json`
  - `/tmp/newsportal-mcp-http-deterministic-d12c4908-9530-4d7d-bba9-666f50684f71.md`
- Latest live MCP artifact:
  - `/tmp/newsportal-mcp-http-live-1d114677-fbc8-4d46-bf4f-453bf233316c.json`
  - `/tmp/newsportal-mcp-http-live-1d114677-fbc8-4d46-bf4f-453bf233316c.md`
- Latest live MCP verdict:
  - `runtime verdict = external-runtime-residual`
  - `usefulness verdict = external-runtime-residual`
- On 2026-04-23 `C-MCP-REMOTE-ADMIN-CONTROL-PLANE` completed and was archived after shipping the remote HTTP MCP control plane end to end:
  - additive PostgreSQL persistence for `mcp_access_tokens` and `mcp_request_log`;
  - shared `packages/control-plane` orchestration for admin template/channel writes plus MCP token lifecycle;
  - admin `/automation/mcp` issuance/list/revoke workspace and thin BFF token routes;
  - standalone `services/mcp` HTTP server with bearer-token auth, tool/resource/prompt registry, audit/request logging, and operator write/read parity across the bounded surfaces;
  - compose/nginx delivery at `/mcp`;
  - MCP compose acceptance and full unit/type proof green.
- The acceptance cycle exposed and fixed one truthful backend defect before close: sequence retry now strips persisted runtime-only `_...` keys from failed-run context before validating retry overrides, so MCP/operator retry works against genuinely failed runs.
- Proof closed green on 2026-04-23 with:
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `pnpm test:mcp:compose`
  - `git diff --check --`
- On 2026-04-22 `PATCH-ADMIN-PANE-GRID-COLUMN-CORRECTION` completed and was archived after reverting the failed flex experiment and fixing the real shared-pane bug: in open state a separate pane-width grid column remained empty on the right while the pane itself rendered in the second column.
- On 2026-04-22 `PATCH-ADMIN-PANE-PARENT-WIDTH-COVERAGE` completed and was archived after switching the shared open desktop pane contract to a parent-covering flex layout so main content and the right pane fill the full workspace width together.
- On 2026-04-22 `PATCH-ADMIN-PANE-RESIZE-AND-WIDTH-CORRECTION` completed and was archived after correcting the shared pane follow-up so resize behavior feels predictable again and open panes initialize at a more truthful desktop width.
- On 2026-04-22 `PATCH-ADMIN-PANE-FULL-RIGHT-WORKSPACE` completed and was archived after widening the shared right workspace-pane contract so expanded panes use the full usable right-side area instead of reading like narrow floating cards.
- On 2026-04-22 `PATCH-AUTOMATION-HERO-CONSISTENCY` completed and was archived after tightening the automation overview hero so it uses the same surface language and density as the other authenticated admin top sections.
- On 2026-04-22 `PATCH-ADMIN-COMPACT-SIDEBAR-AND-WORKSPACE-PANES` completed and was archived after adding a persistent compact desktop sidebar rail to the authenticated shell plus a shared collapsible/resizable right-pane contract for `articles`, `clusters`, `resources`, and `user-interests`.
- On 2026-04-22 `PATCH-ADMIN-THEME-SWITCHER` completed and was archived after adding authenticated admin `light / dark / system` switching with browser persistence, early shell bootstrap, and explicit light/dark token layers while leaving sign-in fixed dark.
- On 2026-04-22 `C-ADMIN-UX-OPERATOR-CONSOLE-REDESIGN` reached capability-level completion and was archived into `docs/history.md`.
- On 2026-04-22 `SWEEP-ADMIN-MICROCOPY-CONSISTENCY` completed and was archived after normalizing the highest-traffic admin copy surfaces.
- On 2026-04-22 `SWEEP-ADMIN-LOW-TRAFFIC-COPY-QA` completed and was archived after cleaning up remaining low-traffic admin empty states, fallback text, and confirm copy on discovery/resources/automation surfaces.
- On 2026-04-22 a new follow-up docs sweep started for admin wording consistency:
  - goal: make repo docs and examples match the shipped admin labels, routes, and wording after the operator-console redesign plus both microcopy sweeps;
  - intended touch set: `EXAMPLES.md`, `README.md`, relevant `docs/**` operator docs, and synced process files if the live work state changes.
- On 2026-04-22 `SWEEP-ADMIN-DOCS-LABEL-CONSISTENCY` completed and was archived after updating the live admin/operator docs to match the shipped labels, routes, and provider coverage.
- On 2026-04-22 a new admin UI polish follow-up started for layout alignment and disclosure-indicator consistency after the operator-console rollout:
  - goal: fix visible alignment drift on shipped admin cards/panels and normalize hidden or inconsistent expand/collapse indicators across the operator UI;
  - intended touch set: relevant `apps/admin/**` UI components plus synced process files if the sweep closes.
- On 2026-04-22 `SWEEP-ADMIN-UI-ALIGNMENT-AND-DISCLOSURE-POLISH` completed and was archived after normalizing admin KPI/action alignment and making disclosure indicators visible and consistent across affected operator surfaces.
- On 2026-04-22 a small admin KPI follow-up patch started after screenshot review exposed two remaining narrow-card edge cases:
  - goal: keep compound and money KPI values readable inside narrow cards instead of wrapping awkwardly or splitting separators across lines;
  - intended touch set: the affected admin KPI surfaces plus synced process files if the patch closes.
- On 2026-04-22 `PATCH-ADMIN-KPI-NARROW-CARD-WRAP` completed and was archived after stabilizing the two remaining narrow-card KPI values on discovery and channels.
- On 2026-04-22 a tiny follow-up patch started after screenshot review exposed one more narrow KPI-card label case on the resources surface:
  - goal: keep long KPI labels readable and rhythmically aligned inside narrow cards instead of breaking at awkward points;
  - intended touch set: the affected resources KPI surface plus synced process files if the patch closes.
- On 2026-04-22 `PATCH-ADMIN-RESOURCE-KPI-LABEL-WRAP` completed and was archived after stabilizing the remaining narrow KPI-card labels on the resources surface.
- On 2026-04-22 a new admin table-alignment follow-up started after screenshot review exposed inconsistent content rhythm inside operator table/list rows:
  - goal: normalize content alignment across admin tables and dense list rows so labels, badges, metrics, and action stacks share a clearer row rhythm;
  - intended touch set: relevant `apps/admin/**` table/list surfaces plus synced process files if the sweep closes.
- On 2026-04-22 `SWEEP-ADMIN-TABLE-CONTENT-ALIGNMENT` completed and was archived after normalizing the repeated table-row rhythm across dense admin catalogs, status cells, and action columns.
- On 2026-04-22 a small admin shell visual follow-up started after the user reported that the dark decorative background was only still visible on the sign-in screen:
  - goal: restore a polished dark shell background for the authenticated admin workspace without reopening broader layout or color-token work;
  - intended touch set: `apps/admin/src/layouts/AdminShell.astro` plus synced process files if the patch closes.
- On 2026-04-22 `PATCH-ADMIN-SHELL-BACKGROUND-RESTORE` completed and was archived after restoring the decorative dark background on the authenticated admin shell.
- On 2026-04-22 a tiny admin header follow-up started after the user reported that the middle summary line in the authenticated header is redundant and hurts the layout:
  - goal: remove the redundant section-summary line from the shared admin header while preserving a functional section label plus breadcrumb/title composition;
  - intended touch set: `apps/admin/src/layouts/AdminShell.astro` plus synced process files if the patch closes.
- On 2026-04-22 `PATCH-ADMIN-HEADER-SUMMARY-REMOVE` completed and was archived after removing the redundant middle summary line from the shared admin header.
- On 2026-04-22 a small admin theme follow-up started after the user rebuilt the admin and confirmed that token-based surfaces were still rendering in a light palette:
  - goal: make the shared admin token palette truly dark by default so cards, chrome, and content surfaces all render consistently dark instead of mixing a dark shell with light `bg-card` surfaces;
  - intended touch set: `apps/admin/src/styles/globals.css` plus synced process files if the patch closes.
- On 2026-04-22 `PATCH-ADMIN-DARK-THEME-BASELINE` completed and was archived after switching the shared admin token baseline to dark-first so token-based surfaces render consistently dark after rebuild.
- The shipped admin now follows the approved operator IA across:
  - shell/navigation;
  - dashboard;
  - channels/resources/discovery;
  - articles/clusters;
  - templates/user-interests;
  - observability/reindex/automation/help.
- Final capability proof is green:
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm test:web:viewports`
  - `pnpm test:website:admin:compose`
  - `pnpm test:discovery:admin:compose`
  - `pnpm integration_tests`
  - `git diff --check --`
- On 2026-04-22 `C-ADMIN-DISCOVERY-PANE-RAIL-A11Y` reached capability-level completion and was archived into `docs/history.md` after:
  - shipping the discovery right-pane rollout on `missions`, `candidates`, and `sources`;
  - upgrading compact desktop sidebar rail UX with richer tooltip/footer/orientation affordances;
  - strengthening shared pane resize keyboard/a11y semantics;
  - closing the last product-side gap with true row click / keyboard open behavior on discovery rows;
  - finally turning the previously flaky viewport proof green with:
    - `pnpm typecheck`
    - `pnpm test:web:viewports`
    - `pnpm test:discovery:admin:compose`
    - `git diff --check --`
- Earlier discovery/downstream capabilities remain archived in `docs/history.md`; no older execution detail is required for the current live handoff.

## Capability planning

### Active capabilities
- none

### Current work items
- none

## Worktree coherence

- Current dirty worktree is mixed but truthful:
  - the previously completed but uncommitted MCP rollout remains present across docs, admin, schema, shared control-plane services, SDK, MCP service, infra, and tests;
  - the just-completed MCP proof expansion intentionally overlaps that same bounded MCP area, especially `infra/scripts`, `package.json`, proof docs, and the discovery backend files needed for one blocking regression fix.

## Next recommended action

- none; wait for the next user request.

## Archive sync status

- Completed item or capability awaiting archive sync:
  none
- Why it is still live, if applicable:
  n/a
- Archive action required next:
  none

## Test artifacts and cleanup state

- This turn used transient compose/browser acceptance fixtures plus additive PostgreSQL request-log/token rows from the MCP proof.
- Cleanup completed during the final proof cycle:
  - the transient Firebase alias admin used by `pnpm test:mcp:compose` was deleted in-script after the run;
  - deterministic and live MCP proof runs revoked or archived the bounded fixtures they owned when the shipped surfaces allowed it;
  - the explicit revoke-check token was revoked during proof;
  - expired token fixtures remained expired additive rows by design.
- Remaining additive state that does not require cleanup:
  - `mcp_request_log` and related audit rows produced by the proof;
  - revoked/expired MCP token rows that truthfully represent lifecycle history;
  - `/tmp/newsportal-mcp-http-deterministic-*.json|md` and `/tmp/newsportal-mcp-http-live-*.json|md` artifacts left intentionally for operator review.
- Most recent completed admin discovery/rail/a11y proof cycle:
  - `pnpm typecheck`
  - `pnpm test:web:viewports`
  - `pnpm test:discovery:admin:compose`
  - `git diff --check --`
- No new long-lived manual cleanup is currently tracked for this cycle.

## Handoff state

- Active item: none.
- Latest completed work:
  - `PATCH-MCP-CLIENT-DOCS-AND-TESTING-GUIDES` is archived in `docs/history.md` with the new `docs/mcp/` index, client setup guides, HTTP smoke examples, and local-vs-remote testing guide.
  - `PATCH-MCP-SCENARIO-PLAYBOOKS` is archived in `docs/history.md` with the new scenario guide resources, session-start prompts, contract sync, and unit/type proof closeout.
  - `PATCH-MCP-AGENT-ORIENTATION-GUIDANCE` is archived in `docs/history.md` with the new guide resources, starter prompt, contract sync, and unit-proof closeout.
  - `PATCH-MCP-LIVE-RECALL-USEFULNESS-TUNING` is archived in `docs/history.md` with the targeted recall seed/policy tuning, regression test, and green live proof closeout.
  - `PATCH-MCP-NGINX-LONG-REQUEST-TIMEOUT` is archived in `docs/history.md` with the nginx boundary fix, regression test, and live proof closeout.
  - `PATCH-MCP-LIVE-HTTP-RESIDUAL-DIAGNOSTICS` is archived in `docs/history.md` with the live-proof hardening details for HTTP and MCP diagnostics plus the recall-promotion selection fix.
  - `C-MCP-HTTP-REAL-WORLD-TEST-EXPANSION` is archived in `docs/history.md` with deterministic/live proof details, doc-parity behavior, focused reruns, and the discovery mission count-query backend fix.
  - `C-MCP-REMOTE-ADMIN-CONTROL-PLANE` is archived in `docs/history.md` with full implementation and proof detail.
- Current repo state:
  - the MCP rollout is implemented but not yet committed;
  - the MCP proof expansion is also implemented and verified inside that same uncommitted MCP area.
- The parent admin UX capability, both admin copy sweeps, the docs consistency sweep, the admin UI polish sweep, the KPI follow-up patch, the resources KPI-label patch, the admin table-alignment sweep, the admin shell background patch, the admin header summary patch, the admin dark-theme patch, the authenticated theme switcher, the compact-sidebar/shared-pane patch, the pane full-right follow-up patch, the pane resize/width correction patch, the pane parent-width coverage patch, the pane grid-column correction patch, and the automation-hero consistency patch are archived in `docs/history.md`.
- The next agent must preserve the shipped MCP boundary:
  - admin-issued bearer tokens only;
  - no browser-cookie reuse as MCP auth;
  - no direct DB-bypass writes around existing maintenance/control-plane owners.
- The next agent must also preserve proof layering:
  - deterministic compose MCP HTTP proof remains the canonical gate;
  - live/provider-backed MCP evidence should stay supplemental and must classify external residuals honestly.
- Latest supplemental proof truth:
  - live MCP residuals now carry enough evidence to distinguish gateway/upstream HTML from opaque parse failures, and recall promotion in the live harness now searches for promotable candidates instead of assuming the first recall row is valid.
- Latest boundary truth:
  - the shipped `/mcp` ingress now allows long-lived MCP requests to complete, so future live residuals should no longer be attributed to nginx's default proxy timeout on this route.
- Current patch evidence:
  - the previous generic recall seeds were dominated by low-signal search results (`rss.app`, `feedspot`, `wikipedia`, explainers, and unrelated release-note pages), but the latest targeted live case now closes green with a real promoted recall candidate.
- Current guidance gap:
  - the MCP surface now exposes both:
    - an explicit “what this server is for / how to start / safe workflow” layer through guide resources and a starter prompt;
    - domain-specific scenario playbooks for the main bounded operator flows instead of expecting clients to infer concrete workflow only from tool names.
- Current docs truth:
  - a dedicated `docs/mcp/` subfolder now explains:
    - how to connect major MCP clients to NewsPortal, including OpenCode;
    - how to smoke-test the raw HTTP surface;
    - how to distinguish canonical local proof from bounded remote smoke.
