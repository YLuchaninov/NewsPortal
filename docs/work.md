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
- Why now: process package refresh завершен и архивирован; ближайшим honest next item снова остается product-facing blocker в `C-MVP-MANUAL-READINESS`.

## Current memory

- Runtime core теперь состоит из семи обязательных файлов; `docs/engineering.md` отделяет durable engineering rules от process contract, а `docs/contracts/test-access-and-fixtures.md` закрывает stateful test truth.
- `docs/blueprint.md` остается главным architectural source of truth для schema, queues, boundaries и service responsibilities.
- `docs/contracts/test-access-and-fixtures.md` является текущим deep contract doc для stateful backend testing, Firebase identities, Mailpit delivery и persistent local fixtures.
- `C-MVP-MANUAL-READINESS` уже доставил `source_channel_runtime_state`, `channel_fetch_runs`, exact Gemini usage fields, admin/API scheduling observability, `web_push` flow и notification preferences.
- `poll_interval_seconds` остается base/min interval в `source_channels`; adaptive scheduler truth живет отдельно в runtime state.
- Astro browser/session/BFF surfaces теперь живут в `/bff/*` и `/admin/bff/*`; public `/api/*` остается за Python API; redirect origin строится от `NEWSPORTAL_APP_BASE_URL`.
- `pnpm dev:mvp:internal` остается canonical compose baseline; lifecycle также включает `:no-build`, `:stop`, `:down`, `:down:volumes` и `:logs`.
- Root-level QA gates: `pnpm lint`, `pnpm unit_tests`, `pnpm integration_tests`; `pnpm integration_tests` все еще thin alias на `pnpm test:mvp:internal`.
- RSS-first acceptance scope не расширился: `website`, `api` и `email_imap` ingest по-прежнему вне доказанного internal MVP gate.
- `pnpm integration_tests` сейчас падает вне auth scope в `test:normalize-dedup:compose`: smoke ожидает `article.normalized=pending`, а фактический compose run возвращает `published`.
- Root runtime core повторно синхронизирован с package logic: archive-sync semantics выровнены, `docs/contracts/` теперь включает reusable subsystem template, временный source package удален после passed transfer audit.
- Worktree остается mixed: в нем одновременно присутствуют manual-readiness, duplicate-preflight, auth/BFF hardening, UI redesign residue и уже завершенный process-refresh doc sync.

## Capability planning

### Active capabilities

| Capability ID | Title | Status | Full completion condition | Planned stages | Current next stage | Notes |
|---|---|---|---|---|---|---|
| C-MVP-MANUAL-READINESS | Manual MVP readiness | blocked | Schema/code/runtime docs синхронизированы; integration tests, typecheck проходят | `S-MVP-MANUAL-READINESS-1`, `S-MVP-MANUAL-READINESS-2`, `S-MVP-MANUAL-READINESS-3` | `S-MVP-MANUAL-READINESS-3` | Blocked unrelated `test:normalize-dedup:compose` failure |
| C-FETCHER-DUPLICATE-PREFLIGHT | Fetcher duplicate preflight | blocked | Fetcher batch precheck реализован и доказан unit + RSS smoke + multi-RSS compose proof | `S-FETCHER-DUPLICATE-PREFLIGHT-1`, `S-FETCHER-DUPLICATE-PREFLIGHT-2` | `S-FETCHER-DUPLICATE-PREFLIGHT-1` | Dirty tree already contains work for stage 1 |

Rule: если capability active и у нее нет truthful ready stage, следующую stage нужно создать до implementation.
Rule: dependency truth и mixed worktree должны быть явно представлены, а не скрыты внутри dirty tree.

## Active execution state

### Primary active item

- ID: `S-MVP-MANUAL-READINESS-3`
- Parent capability: `C-MVP-MANUAL-READINESS`
- Why this is the primary active work: после завершения process refresh ближайшим product-facing blocker снова остается honest close manual MVP readiness, который упирается в unrelated `test:normalize-dedup:compose`.

### Secondary active item

- ID: `S-FETCHER-DUPLICATE-PREFLIGHT-1`
- Why it exists: dirty worktree уже содержит meaningful fetcher duplicate-preflight changes вне текущего primary item scope; этот overlap должен оставаться явным, пока worktree не будет разрулен.
- Allowed overlap paths:
  `services/fetchers/`, `tests/unit/ts/fetcher-duplicate-preflight.test.ts`, `docs/work.md`, `docs/blueprint.md`
- Exit condition for returning to one primary item:
  либо duplicate-preflight получает собственный clean proof-backed close path, либо его changes выносятся из текущего mixed worktree.

### Worktree coherence

- Worktree status: mixed
- Primary item alignment note:
  primary item truthfully covers manual-readiness docs/runbook/runtime-sync residue, но текущий dirty tree шире и содержит product/runtime changes из duplicate-preflight, auth/BFF hardening, UI redesign и уже завершенного process refresh.
- Mixed-change warning, if any:
  tree по-прежнему не single-threaded; следующий агент не должен делать вид, что работает только с одним untouched capability или что завершенный process refresh исчез из dirty tree сам собой.
- Required action before more implementation, if any:
  перед следующей meaningful product implementation work нужно либо закрыть/block-trace overlaps честно, либо вынести их в clean branch/worktree, либо reframe active items еще раз.

### Active risks

- `test:normalize-dedup:compose` сейчас блокирует honest close для `C-MVP-MANUAL-READINESS`, хотя auth/BFF targeted proofs уже green.
- `website`, `api` и `email_imap` ingest все еще не покрыты единым acceptance gate.
- Browser receipt для `web_push` остается manual-only proof item.
- `pnpm lint` для Python части зависит от отдельной host-side установки `ruff`.
- Mixed worktree увеличивает риск accidental scope drift, если следующее изменение не будет явно привязано к primary/secondary item framing.

### Known gaps

- Proof gap: repo-wide green acceptance на текущем tree временно отсутствует из-за `test:normalize-dedup:compose`.
- Proof gap: Python services по-прежнему не имеют repo-level typecheck gate, сопоставимого с `pnpm typecheck`.
- Proof gap: `pnpm unit_tests` покрывает только deterministic pure logic; DB/Redis/queue/network boundaries доказываются integration/smoke path.
- Proof gap: multi-channel RSS proofs compose-backed и не имеют lightweight host-only variant.
- Product gap: repo хранит только RSS bundle template; curated real-feed bundle оператор должен собрать отдельно.
- Cleanup gap: local proof artifacts вроде Firebase alias users, RSS proof channels и notification subscriptions могут оставаться в local baseline, если cleanup не выполнен отдельным item или reset-ом среды.

### Next recommended action

- Next step:
  классифицировать и устранить blocker в `pnpm integration_tests` / `test:normalize-dedup:compose`, затем повторно прогнать full acceptance и только после этого закрывать `S-MVP-MANUAL-READINESS-3`.
- Why this is next:
  process refresh уже завершен, но capability close gate для manual readiness по-прежнему упирается в unrelated red integration suite.

### Archive sync status

- Completed item or capability awaiting archive sync:
  `none`
- Why it is still live, if applicable:
  n/a
- Archive action required next:
  keep newly completed capabilities/items out of live context by the end of the current sync cycle.

### Test artifacts and cleanup state

- Users created:
  internal proofs могут создавать allowlisted Firebase admin aliases `internal-admin-<runId>` / `rss-admin-<runId>`, anonymous web users и `internal-user-<runId>@example.test`.
- Subscriptions or device registrations:
  local `web_push` subscriptions и notification channel rows могут оставаться после manual/integration verification.
- Tokens / keys / credentials issued:
  local dev VAPID keys живут в `.env.dev`; временные Firebase-issued tokens считаются ephemeral и не должны храниться как durable truth.
- External registrations or webhooks:
  в текущем baseline не зафиксированы как обязательные fixtures.
- Seeded or imported data:
  proof runs могут оставлять `Internal MVP RSS <runId>`, `RSS multi <runId> ...`, outbox smoke rows и worker smoke fixtures в local DB/Firebase baseline.
- Cleanup status:
  не clean; residual local artifacts допустимы только как локальная dev/test residue и должны считаться известными, пока отдельный cleanup/reset не выполнен.
- Residual cleanup note:
  если следующая работа требует clean manual baseline, нужно либо выполнить targeted cleanup, либо сделать explicit local reset вроде approved `pnpm dev:mvp:internal:down:volumes`.

## Handoff state

- Current item status:
  `S-MVP-MANUAL-READINESS-3` remains `blocked` (unrelated `test:normalize-dedup:compose` regression).
  `S-FETCHER-DUPLICATE-PREFLIGHT-1` remains `blocked`.
- What is already proven:
  Process refresh: transfer audit passed, root runtime core повторно синхронизирован с package logic, reusable contract template добавлен, temporary source package retired.
  Previous auth/BFF: direct-port and nginx-shaped flows on `/bff/*` and `/admin/bff/*` passed targeted live proof.
- What is still unproven or blocked:
  Full `pnpm integration_tests` still fails in `test:normalize-dedup:compose` (outside UI scope).
  Real RSS bundle curation and `web_push` browser receipt remain open.
- Scope or coordination warning for the next agent:
  BFF routes are unchanged — all POST handlers at `/bff/*` and `/bff/admin/*` still work exactly as before.
  Pre-existing lint errors in `services/fetchers/src/fetchers.ts` (lines 861-862, no-useless-assignment) are not from this change.

### Recently changed

- 2026-03-23 — `C-AI-PROCESS-PACKAGE-REFRESH` завершен и архивирован: transfer audit passed, root process docs/machine truth synced, temporary source package retired.
- 2026-03-23 — `C-UI-REDESIGN` архивирован в `docs/history.md`; live context очищен от завершенной capability detail.
- 2026-03-23 — live process docs очищены от переходного migration residue после перехода на 7-file runtime core.
- 2026-03-23 — `database/migrations/0005_manual_mvp_readiness.sql` добавила `source_channel_runtime_state`, `channel_fetch_runs` и first-class Gemini usage fields.
- 2026-03-23 — auth/BFF routing realigned: `web`/`admin` routes переехали с `/api/*` на `/bff/*`; redirect origin/path больше не деградируют.
- 2026-03-23 — strengthened auth/BFF proof; `pnpm integration_tests` выявил unrelated blocker в `test:normalize-dedup:compose`.

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
| S-MVP-MANUAL-READINESS-3 | Stage | Manual MVP pack and final runtime sync | C-MVP-MANUAL-READINESS | blocked | S-MVP-MANUAL-READINESS-2 | `.env.dev`, `.env.example`, `apps/web/src/pages/index.astro`, `apps/admin/src/pages/index.astro`, `infra/scripts/manual-rss-bundle.template.json`, `package.json`, `README.md`, `docs/work.md`, `docs/verification.md`, `.aidp/os.yaml` | medium | partial | unassigned | Capability close gate blocked by unrelated `test:normalize-dedup:compose` regression even though auth/BFF targeted proof is green. |
| S-FETCHER-DUPLICATE-PREFLIGHT-1 | Stage | Fetcher-side duplicate suppression before insert/outbox | C-FETCHER-DUPLICATE-PREFLIGHT | blocked | - | `services/fetchers/`, `tests/unit/ts/fetcher-duplicate-preflight.test.ts`, `docs/work.md`, `docs/blueprint.md` | medium | partial | unassigned | Dirty tree already contains stage-1 implementation, but proof hardening and final sync are still incomplete. |

## Item detail

### S-MVP-MANUAL-READINESS-3

- Kind: `Stage`
- Status: `blocked`
- Goal: закрыть manual MVP readiness на уровне runtime/docs/packaging truth после завершенного auth/BFF realignment
- In scope:
  `.env.dev`, `.env.example`, `apps/web/src/pages/index.astro`, `apps/admin/src/pages/index.astro`, `infra/scripts/manual-rss-bundle.template.json`, `package.json`, `README.md`, `docs/work.md`, `docs/verification.md`, `.aidp/os.yaml`
- Out of scope:
  unrelated worker normalize/dedup regression fix, fetcher duplicate-preflight implementation, broad UI redesign follow-ups
- Allowed paths:
  `.env.dev`, `.env.example`, `apps/web/src/pages/index.astro`, `apps/admin/src/pages/index.astro`, `infra/scripts/manual-rss-bundle.template.json`, `package.json`, `README.md`, `docs/work.md`, `docs/verification.md`, `.aidp/os.yaml`
- Required proof:
  targeted auth/BFF/runtime proof plus repo-level acceptance rerun after blocker removal; current blocking signal remains `pnpm integration_tests` -> `test:normalize-dedup:compose`
- Risk: `medium`
