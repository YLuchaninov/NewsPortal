# Work

Это live execution document для репозитория.

Используй его для:

- short current memory;
- capability planning и stage breakdown;
- active work registry;
- active execution state;
- worktree coherence;
- test artifacts и cleanup state;
- known gaps;
- next recommended action;
- handoff state.

Не используй его как длинный журнал истории.
Durable completed detail переносится в `docs/history.md`.

## Current mode

- Operating mode: normal
- Why now: `C-MVP-MANUAL-READINESS` закрыт и перенесен в archive; live state должен снова показывать только truthful next work без pseudo-active closeout lane.

## Current memory

- Runtime core состоит из семи обязательных файлов; `docs/engineering.md` отделяет durable engineering rules от process contract, а `docs/contracts/test-access-and-fixtures.md` закрывает stateful test truth.
- `docs/blueprint.md` остается главным architectural source of truth для schema, queues, boundaries и service responsibilities.
- `docs/contracts/test-access-and-fixtures.md` является обязательным deep contract doc для stateful backend testing, Firebase identities, Mailpit delivery и persistent local fixtures.
- Astro browser/session/BFF surfaces живут в `/bff/*` и `/admin/bff/*`; public `/api/*` остается за Python API; redirect origin строится от `NEWSPORTAL_APP_BASE_URL`.
- `pnpm dev:mvp:internal` остается canonical compose baseline; lifecycle также включает `:no-build`, `:stop`, `:down`, `:down:volumes` и `:logs`.
- Root-level QA gates: `pnpm lint`, `pnpm unit_tests`, `pnpm integration_tests`; `pnpm integration_tests` остается thin alias на `pnpm test:mvp:internal`.
- RSS-first acceptance scope не расширился: `website`, `api` и `email_imap` ingest по-прежнему вне доказанного internal MVP gate.
- `C-MVP-MANUAL-READINESS` archived: README/manual bundle/env/runtime metadata и текущие public/admin entry surfaces приняты как truthful manual MVP baseline на green proof contour.
- Final manual-readiness closeout proof passed on the current tree: targeted app-routing/feed/pagination unit checks, `pnpm typecheck`, `git diff --check`, and `pnpm integration_tests`.
- Первый MVP bugfix lane уже дал shipped patch: public feed article cards теперь используют source URLs из `/feed`, runtime proof отдельно ловит возврат к `/articles/:doc_id/explain`, а internal web detail screen остается follow-up, а не частью этого patch.
- `C-ADMIN-UX` archived: admin теперь использует dedicated `/sign-in`, preserved `next` / `redirectTo` contracts, split list/create/edit surfaces для channels, LLM templates и interest templates, а destructive/fleet-wide actions идут через explicit confirmation.
- `pnpm integration_tests` теперь доказывает logged-out redirects для `/admin/`, `/admin/channels`, `/admin/templates/llm` и `/admin/templates/interests`, а также signed-in HTML for `/admin/channels`, `/admin/channels/new`, `/admin/templates/llm` и `/admin/templates/interests` под nginx-shaped `/admin` ingress.
- `C-LISTING-CONSISTENCY` теперь закрыт не только stage-local proof, но и full repo acceptance rerun plus signed-in `/admin/articles` HTML probe.
- `S-ADMIN-UX-1` закрыт и перенесен в archive: admin shell теперь показывает Help, dedicated help page стала discoverable, а interactive admin forms используют shared `FormField` / `Input` / `Textarea` / `Collapsible`.
- `P-FETCHERS-LINT-1` закрыт и больше не блокирует repo-level `pnpm lint`.
- `SW-WORKTREE-CLOSEOUT-1` завершил worktree closeout: archived product/doc/lint changes собраны в один staged lane без unstaged in-scope хвоста.
- `EXAMPLES.md`, `HOW_TO_USE.md` и `docs/data_scripts/*` теперь явно изолированы как user-owned residue и не должны случайно попадать в product closeout lane без отдельного решения пользователя.
- Public feed, dashboard feed backlog KPI и migrated server-backed tables теперь выровнены на canonical paginated read contracts с truthful totals.
- Legacy raw list responses без `page/pageSize` остаются только как documented rollout compatibility для старых callers; canonical contract для новых и migrated consumers — shared paginated envelope.
- Final glossary cleanup уже shipped: public feed copy больше не говорит `matched articles`, а admin article help объясняет exact `processing_state` вокруг `matched` и `notified`.
- Admin reindex now truthfully distinguishes rebuild-only versus historical backfill: backfill rematches already persisted DB rows, reruns gray-zone LLM review with current templates, and intentionally skips retro notification delivery.
- `criterion_match_results` и `interest_match_results` теперь защищены duplicate-safe semantics через one-row-per-target unique indexes и worker upserts; migration `0006_reindex_backfill_upserts.sql` deduplicates legacy rows before adding the indexes.
- Historical reindex/backfill proof passed on the current tree: `pnpm unit_tests:ts`, Python unit discovery, `pnpm typecheck`, `pnpm lint`, `pnpm db:migrate`, compose-backed `reindex-backfill` smoke, `pnpm integration_tests`, and `git diff --check`.
- Local compose runtime снова intentionally stopped после final historical-backfill smoke and internal MVP acceptance rerun.

## Capability planning

### Active capabilities

| Capability ID | Title | Status | Full completion condition | Planned stages | Current next stage | Notes |
|---|---|---|---|---|---|---|
| C-MVP-BUGFIXES | Minimal working MVP bugfix lane | ready | User-confirmed blocker bugs for the minimal working MVP are fixed without regressing the current RSS-first acceptance flow | `P-MVP-BUGFIX-1`, future bounded MVP bugfix items TBD | next user-reported MVP bugfix item to be created | `P-MVP-BUGFIX-1` уже archived; internal web detail screens remain a follow-up candidate, not an implicit continuation of the archived patch |
| C-FETCHER-DUPLICATE-PREFLIGHT | Fetcher duplicate preflight | blocked | Fetcher batch precheck реализован и доказан unit + RSS smoke + multi-RSS compose proof | `S-FETCHER-DUPLICATE-PREFLIGHT-1`, `S-FETCHER-DUPLICATE-PREFLIGHT-2` | `S-FETCHER-DUPLICATE-PREFLIGHT-1` | Background work |

Rule: если capability active или ready и у нее нет truthful next stage, следующую stage нужно создать до implementation.
Rule: dependency truth и mixed worktree должны быть явно представлены, а не скрыты внутри dirty tree.

## Active execution state

### Primary active item

- ID: `none`
- Parent capability: `none`
- Why this is the primary active work: no implementation item is active after archiving `C-MVP-MANUAL-READINESS`; the next lane must be rebound explicitly before more product edits.

### Secondary active item

- ID: `none`
- Why it exists: no concurrent implementation item is active after the current sync.
- Allowed overlap paths: `none`
- Exit condition for returning to one primary item: already satisfied.

### Worktree coherence

- Worktree status: one staged archived product/doc/proof lane still exists, one unstaged historical-reindex/backfill lane now sits on top of it, and `EXAMPLES.md`, `HOW_TO_USE.md` и `docs/data_scripts/*` remain isolated as user-owned residue.
- Primary item alignment note: no active implementation lane currently owns the mixed staged/unstaged tree after archiving the manual-readiness closeout; bind the next item explicitly before editing on top of the archived closeout and historical-reindex residue.
- Mixed-change warning, if any: `docs/work.md`, `docs/history.md`, `docs/verification.md` и `apps/admin/src/pages/index.astro` currently carry both staged earlier closeout changes and newer archive-sync/historical-reindex edits; do not revert either layer implicitly.
- Required action before more implementation, if any: choose the next bounded work item first and avoid silently folding `EXAMPLES.md`, `HOW_TO_USE.md`, `docs/data_scripts/*`, or unrelated historical-reindex residue into a new product slice.

### Active risks

- `website`, `api` и `email_imap` ingest все еще не покрыты единым acceptance gate.
- Browser receipt для `web_push` остается manual-only proof item.
- `pnpm lint` для Python части зависит от отдельной host-side установки `ruff`.
- Пока staged closeout lane не landed/exported, следующий item должен особенно явно держать scope, чтобы не затянуть в product path `EXAMPLES.md`, `HOW_TO_USE.md` или `docs/data_scripts/*`.
- Full historical backfill over a large existing dataset доказан functionally, но не soak/perf-tested как отдельный operator workload; if operators need runtime estimates or chunk tuning, that should be a new explicit item.

### Known gaps

- Proof gap: Python services по-прежнему не имеют repo-level typecheck gate, сопоставимого с `pnpm typecheck`.
- Proof gap: `pnpm unit_tests` покрывает только deterministic pure logic; DB/Redis/queue/network boundaries доказываются integration/smoke path.
- Proof gap: multi-channel RSS proofs compose-backed и не имеют lightweight host-only variant.
- Product gap: repo хранит только RSS bundle template; curated real-feed bundle оператор должен собрать отдельно.
- Cleanup gap: local proof artifacts вроде Firebase alias users, RSS proof channels и notification subscriptions могут оставаться в local baseline, если cleanup не выполнен отдельным item или reset-ом среды.
- Product gap: admin UI exposes `rebuild` and `backfill`, but operator-only `repair` mode and doc-targeted backfill remain runtime capabilities rather than surfaced controls.

### Next recommended action

- Next step: open the next bounded MVP bugfix item if the user reports another product defect, or explicitly reprioritize another ready/blocking lane before more edits.
- Why this is next: manual-readiness closeout is archived, so there is no truthful active implementation slice left to continue implicitly.

### Archive sync status

- Completed item or capability awaiting archive sync:
  `none`
- Why it is still live, if applicable:
  `S-ADMIN-UX-1` и `P-FETCHERS-LINT-1` уже перенесены в `docs/history.md`; live doc держит только ready/blocked next work и current handoff.
- Archive action required next:
  none, если не появится новый completed detail.

### Test artifacts and cleanup state

- Users created:
  latest proofs created allowlisted Firebase admin aliases following repeatable patterns like `yluchaninov+internal-admin-<runId>@gmail.com` plus the dedicated help-probe alias `yluchaninov+internal-admin-uxprobe@gmail.com`; repeatable flows may also leave generic patterns like `internal-admin-<runId>` / `rss-admin-<runId>`, anonymous web users и `internal-user-<runId>@example.test`.
- Subscriptions or device registrations:
  local `web_push` subscriptions и notification channel rows могут оставаться после manual/integration verification.
- Tokens / keys / credentials issued:
  local dev VAPID keys живут в `.env.dev`; временные Firebase-issued tokens считаются ephemeral и не должны храниться как durable truth.
- Seeded or imported data:
  proof runs могут оставлять `Internal MVP RSS <runId>`, `RSS multi <runId> ...`, outbox smoke rows и worker smoke fixtures; current local Docker baseline itself was torn down after proof.
- Cleanup status:
  local compose runtime was torn down again by the canonical internal MVP acceptance script; PostgreSQL/Redis/Mailpit containers are gone, but Firebase alias identities created by repeatable proof flows may still remain as known local-test residue.

## Handoff state

- Current item status:
  `C-MVP-MANUAL-READINESS` is `archived`.
  `C-ADMIN-UX` is `archived`.
  `C-HISTORICAL-REINDEX` is `archived`.
  `P-MVP-BUGFIX-1` is `archived`.
  `SW-WORKTREE-CLOSEOUT-1` is `archived`.
  no primary active implementation item is bound.
  `S-FETCHER-DUPLICATE-PREFLIGHT-1` remains `blocked` background work.
- What is already proven:
  `C-MVP-MANUAL-READINESS` is archived in `docs/history.md` after the final runtime/docs/manual-pack audit found no further in-scope drift and the closeout proof passed: targeted `app-routing` + `article-card-links` + `sdk-pagination` tests, `pnpm typecheck`, `git diff --check`, and `pnpm integration_tests`.
  `P-MVP-BUGFIX-1` is fully archived in `docs/history.md`.
  `C-ADMIN-UX` is archived in `docs/history.md` with dedicated admin sign-in, preserved return-path contracts, split CRUD surfaces for channels / LLM templates / interest templates, and safe confirmation flows for destructive operations.
  `C-LISTING-CONSISTENCY` remains fully archived in `docs/history.md`.
  `C-HISTORICAL-REINDEX` is archived in `docs/history.md` with duplicate-safe backfill semantics, explicit no-retro-notification policy, and admin rebuild/backfill controls.
  Current-tree proof passed: targeted `node --import tsx --test tests/unit/ts/app-routing.test.ts tests/unit/ts/article-card-links.test.ts tests/unit/ts/sdk-pagination.test.ts`, `pnpm typecheck`, `git diff --check`, and `pnpm integration_tests`; the historical reindex proof set from the archived capability also remains recorded in `docs/history.md`.
  Public feed runtime proof now includes `/feed` source `url` exposure plus web HTML confirmation that the user-facing feed no longer points at `/articles/:doc_id/explain`.
  Targeted admin unit proof passed for redirect normalization and RSS delete-vs-archive semantics, while `pnpm integration_tests` now covers dedicated `/admin/sign-in`, signed-out redirects for `/admin/*` CRUD pages, and signed-in HTML for `/admin/channels`, `/admin/channels/new`, `/admin/templates/llm`, and `/admin/templates/interests`.
  Admin shell now exposes Help navigation, split CRUD forms reuse shared `packages/ui` field/dialog primitives, and IMAP fetcher lint no longer blocks repo-level lint.
  Historical backfill smoke proved that existing DB rows can be rematched without duplicating `criterion_match_results` / `interest_match_results`, while notification counts remain unchanged.
  Worktree closeout proof from the previous archived lane still holds for the staged set; the current tree now adds an explicit unstaged historical-reindex lane on top.
- What is still unproven or blocked:
  the next MVP bugfix item after the archived manual-readiness closeout is not chosen yet.
  `website`, `api` и `email_imap` ingest остаются вне current RSS-first acceptance gate.
  Browser receipt для `web_push` по-прежнему manual-only.
  Full-dataset historical backfill throughput remains unbenchmarked beyond the bounded compose smoke and full acceptance rerun.
- Scope or coordination warning for the next agent:
  `EXAMPLES.md`, `HOW_TO_USE.md` и `docs/data_scripts/*` now form isolated user-owned residue; don't overwrite or silently fold them into product scope.
  The staged archived lane and the unstaged historical-reindex lane both remain unexported, so bind the next active item explicitly before more edits on top of either one.
  Historical reindex work must keep DB repair and retro-delivery policy explicit; do not quietly widen it into resend behavior without a new approved item.
  Do not reopen archived `S-ADMIN-UX-1`, `P-FETCHERS-LINT-1`, or listing-consistency scope implicitly.
  Internal web article detail screens remain a blueprint follow-up candidate, but they were intentionally left out of `P-MVP-BUGFIX-1`; reopen them only via a new explicit item.

### Recently changed

- 2026-03-25 — `C-MVP-MANUAL-READINESS` archived after the final runtime/docs/manual-pack audit found no remaining in-scope drift and reran targeted app-routing/feed/pagination tests, `pnpm typecheck`, `git diff --check`, and `pnpm integration_tests` green.
- 2026-03-25 — `C-ADMIN-UX` archived after landing dedicated admin sign-in, preserved redirect/return-path contracts, split channels and template CRUD screens, confirm-dialog coverage for destructive flows, new single-record admin reads, updated proof docs, green targeted unit tests, and green `pnpm integration_tests`.
- 2026-03-25 — `C-HISTORICAL-REINDEX` archived after admin reindex gained rebuild/backfill modes, worker backfill replay became duplicate-safe and retro-notification-safe, `0006_reindex_backfill_upserts.sql` landed, compose-backed `reindex-backfill` smoke passed, and full `pnpm integration_tests` reran green.
- 2026-03-25 — `P-MVP-BUGFIX-1` archived after `/feed` began projecting source `url`, public feed cards switched from explain/debug links to safe external source links, `tests/unit/ts/article-card-links.test.ts` passed, and `pnpm integration_tests` gained a feed-link assertion.
- 2026-03-25 — `S-ADMIN-UX-1` archived after admin Help/nav/shared-form closeout plus `pnpm typecheck`, `pnpm lint`, `git diff --check`, `pnpm integration_tests`, and a signed-in `/admin/help` + `/admin/templates` probe all passed on the current tree.
- 2026-03-25 — `P-FETCHERS-LINT-1` archived after removing the IMAP fetcher lint blocker and rerunning `pnpm lint` / `pnpm typecheck`.
- 2026-03-25 — `SW-WORKTREE-CLOSEOUT-1` archived after isolating the staged archived product/doc/lint lane from user-owned residue via the git index and syncing live handoff state.

## Operating limits

Keep this file operationally small.

- Keep `Current memory` roughly within 20-40 lines.
- Keep `Recently changed` to at most 5-8 concise bullets.
- Keep only active capabilities и decision-relevant live state.
- Do not let the worktree become semantically broader than the active execution state recorded here.
- Move durable completed detail into `docs/history.md`.
- Do not let a fully completed capability remain here as durable detail after the current sync cycle.

## Automatic compression triggers

Run context compression when any are true:

- an item moved to `done`
- an item is about to be archived
- the primary active item changed
- this file exceeds the operating limits above
- more than 8 recent change bullets are present
- completed detail is still occupying live space here
- a capability line has become stale after stage completion or replanning
- all stages for a capability are done and it now needs durable archival detail
- a handoff or session end is about to happen after meaningful changes

## Compression checklist

When compressing context:

1. keep the active item accurate and schema-complete
2. keep active capability lines accurate and concise
3. preserve only current mode, current memory, active capabilities, active items, worktree coherence, active risks, known gaps, next recommended action, test artifacts, handoff state, and concise recent changes
4. move durable completed detail into `docs/history.md`
4a. if a capability has no truthful next stage and no open completion layer, archive it now instead of leaving durable detail here
5. delete stale temporary notes after preserving their durable meaning
6. keep enough current memory that the next agent can continue without chat history
7. if the worktree is mixed, either reframe it honestly here or reduce it before handoff

## Active work index

| ID | Kind | Title | Parent capability | Status | Depends on | Allowed paths | Risk | Proof status | Owner | Summary |
|---|---|---|---|---|---|---|---|---|---|---|
| S-FETCHER-DUPLICATE-PREFLIGHT-1 | Stage | Fetcher-side duplicate suppression before insert/outbox | C-FETCHER-DUPLICATE-PREFLIGHT | blocked | - | `services/fetchers/`, `tests/unit/ts/fetcher-duplicate-preflight.test.ts`, `docs/work.md`, `docs/blueprint.md` | medium | partial | unassigned | Capability remains blocked background work and should stay isolated from current manual-readiness close path. |

## Item detail

### S-FETCHER-DUPLICATE-PREFLIGHT-1

- Kind: `Stage`
- Status: `blocked`
- Goal: добавить fetcher-side duplicate suppression до insert/outbox path без нарушения current ingest contract
- In scope:
  `services/fetchers/`, `tests/unit/ts/fetcher-duplicate-preflight.test.ts`, `docs/work.md`, `docs/blueprint.md`
- Out of scope:
  worker normalize/dedup behavior, admin/browser flow fixes, manual readiness runtime sync, broader ingest redesign
- Allowed paths:
  `services/fetchers/`, `tests/unit/ts/fetcher-duplicate-preflight.test.ts`, `docs/work.md`, `docs/blueprint.md`
- Required proof:
  unit coverage plus RSS smoke и multi-RSS compose proof на финальной implementation stage
- Risk: `medium`
