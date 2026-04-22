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
- Why now: on 2026-04-22 the user asked to continue the admin UX/UI operator-console rollout and bring the plan to real code plus proof.

## Current memory

- Runtime core инициализирован; ordinary implementation work разрешен.
- On 2026-04-22 the user requested the next desktop-productivity implementation slice for admin: extend the shared pane contract into discovery list-heavy tabs, enrich compact sidebar rail UX, and strengthen shared pane resize accessibility without changing backend/API truth.
- On 2026-04-22 `STAGE-1-DISCOVERY-PANE-RAIL-A11Y-ROLLUP` landed its code changes in the shared admin shell/pane primitives plus `discovery` missions/candidates/sources, but the stage remains live because required proof is only partially green so far:
  - `pnpm typecheck` passed;
  - `git diff --check --` passed;
  - `pnpm test:discovery:admin:compose` passed after rebuilding the admin image;
  - `pnpm test:web:viewports` failed once with `Timed out waiting for system-selected collection row for viewport smoke`, and the immediate rerun remained stuck in the same downstream setup segment after deterministic RSS fetch, so the stage is not yet ready to close.
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
- Earlier discovery/downstream capabilities remain archived in `docs/history.md`; no older execution detail is required for the current live handoff.

## Capability planning

### Active capabilities

#### C-ADMIN-DISCOVERY-PANE-RAIL-A11Y

- Capability goal: deliver the next desktop-operator productivity slice for admin by bringing the shared pane contract into discovery’s list-heavy tabs, maturing compact desktop sidebar rail UX, and improving keyboard/accessibility semantics for pane resize.
- Capability outcome:
  - `discovery` missions/candidates/sources use the same persistent collapsible right workspace-pane pattern as the first-wave admin surfaces;
  - compact desktop sidebar becomes orientation-safe with tooltip labels, active section signaling, and a compact footer menu;
  - `AdminWorkspacePane` exposes a stronger resize accessibility contract with explicit width state, keyboard reset, and clearer assistive text.
- Full completion condition:
  - discovery list-heavy tabs ship with query-backed selected-state + right pane behavior;
  - compact sidebar rail ships with richer hover/focus/operator affordances on desktop;
  - shared pane resize semantics and a11y proof are green;
  - process files are synced and the stage is archived.
- Proposed stage breakdown:
  - `STAGE-1-DISCOVERY-PANE-RAIL-A11Y-ROLLUP` — implement the discovery pane rollout, compact rail UX upgrade, shared resize a11y, and proof them together.
- Immediate next stage:
  - `STAGE-1-DISCOVERY-PANE-RAIL-A11Y-ROLLUP`

### Current work items

#### STAGE-1-DISCOVERY-PANE-RAIL-A11Y-ROLLUP

- Kind: Stage
- Status: blocked
- Goal: implement the first end-to-end discovery pane rollout plus compact rail UX and shared pane resize accessibility.
- In scope:
  - `discovery.astro` pane rollout for `missions`, `candidates`, and `sources`;
  - shared `AdminWorkspacePane` resize/a11y contract;
  - compact desktop sidebar rail tooltip/footer/active-marker UX;
  - process sync after stage proof closes.
- Out of scope:
  - discovery route-model rewrite;
  - pane rollout for `profiles`, `recall`, `portfolio`, `hypotheses`, `feedback`, or dashboard;
  - mobile sidebar redesign;
  - backend/API/schema changes.
- Allowed paths:
  - `apps/admin/src/pages/discovery.astro`
  - `apps/admin/src/layouts/AdminShell.astro`
  - `apps/admin/src/components/AdminWorkspacePane.astro`
  - `apps/admin/src/components/AdminDesktopSidebarNav.tsx`
  - `docs/work.md`
  - `docs/history.md`
- Required proof:
  - `pnpm typecheck`
  - `pnpm test:web:viewports`
  - `pnpm test:discovery:admin:compose`
  - `git diff --check --`
- Risk:
  - medium; this stage changes shared desktop admin interaction primitives and a large discovery operator surface in one bounded rollout.

## Worktree coherence

- Current dirty worktree is expected and aligns with the active discovery/rail/a11y stage plus earlier archived admin UI work:
  - `apps/admin/**`
  - `docs/**`
- No secondary active item is currently tracked.

## Next recommended action

- investigate or rerun `pnpm test:web:viewports` until the viewport proof is either green or confidently classified as an unrelated/flaky downstream failure, then sync/archive the stage if no code changes are needed.

## Archive sync status

- Completed item or capability awaiting archive sync:
  none
- Why it is still live, if applicable:
  n/a
- Archive action required next:
  none

## Test artifacts and cleanup state

- This turn used transient compose/browser acceptance fixtures only.
- Proof status for the active stage:
  - `pnpm typecheck`
  - `git diff --check --`
- `pnpm test:discovery:admin:compose` is green for this stage and cleaned up its disposable discovery/admin acceptance fixtures before exit.
- `pnpm test:web:viewports` is currently unresolved for this stage:
  - first run failed with `Timed out waiting for system-selected collection row for viewport smoke`;
  - second run advanced through admin sign-in, web bootstrap, interest/channel creation, and deterministic RSS fetch, then stopped producing output before completion.
- No new long-lived manual cleanup is currently tracked for this cycle.

## Handoff state

- Active item: `STAGE-1-DISCOVERY-PANE-RAIL-A11Y-ROLLUP` is currently `blocked` on unresolved viewport proof, not on missing implementation.
- Code is already landed in `apps/admin/src/components/AdminWorkspacePane.astro`, `apps/admin/src/components/AdminDesktopSidebarNav.tsx`, `apps/admin/src/layouts/AdminShell.astro`, and `apps/admin/src/pages/discovery.astro`; the remaining blocker is truthful completion of the viewport proof.
- The parent admin UX capability, both admin copy sweeps, the docs consistency sweep, the admin UI polish sweep, the KPI follow-up patch, the resources KPI-label patch, the admin table-alignment sweep, the admin shell background patch, the admin header summary patch, the admin dark-theme patch, the authenticated theme switcher, the compact-sidebar/shared-pane patch, the pane full-right follow-up patch, the pane resize/width correction patch, the pane parent-width coverage patch, the pane grid-column correction patch, and the automation-hero consistency patch are archived in `docs/history.md`.
- The next agent should keep this work bounded to the declared discovery tabs plus shared shell/pane primitives unless the user explicitly widens scope.
