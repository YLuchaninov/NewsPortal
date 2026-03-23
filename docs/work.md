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
- Why now: основной product work по manual MVP readiness все еще заблокирован unrelated compose regression, а live process docs уже сжаты обратно до decision-relevant состояния.

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
- Worktree остается mixed: в нем одновременно присутствуют manual-readiness, duplicate-preflight, auth/BFF hardening и уже завершенная process-doc migration.

## Capability planning

### Active capabilities

| Capability ID | Title | Status | Full completion condition | Planned stages | Current next stage | Notes |
|---|---|---|---|---|---|---|
| C-MVP-MANUAL-READINESS | Manual MVP readiness | blocked | Schema/code/runtime docs синхронизированы; `pnpm integration_tests`, `pnpm test:ingest:compose`, `pnpm test:ingest:multi:compose`, `pnpm test:ingest:soak:compose`, `pnpm test:cluster-match-notify:compose`, `pnpm unit_tests` и `pnpm typecheck` проходят; manual MVP runbook и operator contract задокументированы | `S-MVP-MANUAL-READINESS-1`, `S-MVP-MANUAL-READINESS-2`, `S-MVP-MANUAL-READINESS-3` | `S-MVP-MANUAL-READINESS-3` | Blocked unrelated `test:normalize-dedup:compose` failure outside auth/doc scope |
| C-FETCHER-DUPLICATE-PREFLIGHT | Fetcher duplicate preflight | blocked | Fetcher batch precheck реализован и доказан unit + RSS smoke + multi-RSS compose proof; runtime docs синхронизированы; follow-up optimization beyond exact DB lookup оставлен отдельной stage | `S-FETCHER-DUPLICATE-PREFLIGHT-1`, `S-FETCHER-DUPLICATE-PREFLIGHT-2` | `S-FETCHER-DUPLICATE-PREFLIGHT-1` | Dirty tree already contains work for stage 1; proof and final sync еще не завершены |

Rule: если capability active и у нее нет truthful ready stage, следующую stage нужно создать до implementation.
Rule: dependency truth и mixed worktree должны быть явно представлены, а не скрыты внутри dirty tree.

## Active execution state

### Primary active item

- ID: `S-MVP-MANUAL-READINESS-3`
- Parent capability: `C-MVP-MANUAL-READINESS`
- Why this is the primary active work: именно этот item остается ближайшим product-facing blocker для honest manual MVP closure; process-doc migration уже завершена и архивирована, а auth/BFF fix itself доказан.

### Secondary active item

- ID: `S-FETCHER-DUPLICATE-PREFLIGHT-1`
- Why it exists: dirty worktree уже содержит meaningful fetcher duplicate-preflight changes вне primary item; этот overlap должен оставаться явным, пока worktree не будет разрулен.
- Allowed overlap paths:
  `services/fetchers/`, `tests/unit/ts/fetcher-duplicate-preflight.test.ts`, `docs/work.md`, `docs/blueprint.md`
- Exit condition for returning to one primary item:
  либо duplicate-preflight получает собственный clean proof-backed close path, либо его changes выносятся из текущего mixed worktree.

### Worktree coherence

- Worktree status: mixed
- Primary item alignment note:
  primary item truthfully covers manual-readiness docs/runbook/runtime-sync residue, но текущий dirty tree шире и содержит product/runtime changes из duplicate-preflight и auth/BFF hardening arcs.
- Mixed-change warning, if any:
  process migration сама по себе завершена, но tree по-прежнему не single-threaded; следующий агент не должен делать вид, что работает только с одним untouched capability.
- Required action before more implementation, if any:
  перед следующей meaningful product implementation work нужно либо закрыть/block-trace current overlaps честно, либо вынести их в clean branch/worktree, либо reframe active items еще раз.

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
  user-facing auth/BFF bug снят, runtime core v2 синхронизирован, но capability close gate для manual readiness все еще упирается в unrelated red integration suite.

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
  `S-MVP-MANUAL-READINESS-3` остается `blocked`; `S-FETCHER-DUPLICATE-PREFLIGHT-1` остается `blocked`; runtime-core v2 migration завершена и архивирована в `docs/history.md`.
- What is already proven:
  `pnpm typecheck` и `pnpm unit_tests:ts` passed on 2026-03-23; direct-port и nginx-shaped auth/BFF flows на `/bff/*` и `/admin/bff/*`, HTML `action`/`fetch` targets и сохранение `/api/*` за Python API уже прошли targeted live proof.
- What is still unproven or blocked:
  full `pnpm integration_tests` currently fails outside auth scope in `test:normalize-dedup:compose`; real RSS bundle curation, manual browser receipt for `web_push` и separate acceptance для `website/api/email_imap` остаются open.
- Scope or coordination warning for the next agent:
  worktree уже mixed и включает product/runtime changes из нескольких arcs; не упрощай browser PRG contract, JSON/script contract или process-state truth ради локального удобства.

### Recently changed

- 2026-03-23 — live process docs очищены от переходного migration residue после перехода на 7-file runtime core; stale `init`/migration noise убран из активного контекста, архив сохранен в `docs/history.md`.
- 2026-03-23 — `database/migrations/0005_manual_mvp_readiness.sql` добавила `source_channel_runtime_state`, `channel_fetch_runs` и first-class Gemini usage fields в `llm_review_log`.
- 2026-03-23 — `services/fetchers` получили provider-agnostic adaptive scheduling, append-only fetch history и `next_due_at`-aware due selection; `pnpm test:ingest:multi:compose` и `pnpm test:ingest:soak:compose` ранее стали green на 24/60-channel path.
- 2026-03-23 — `services/api` и `apps/admin` получили scheduling health, fetch-run observability, LLM usage summaries и bulk provider-wide schedule patch surface.
- 2026-03-23 — `apps/web` и `services/workers` получили working `web_push` subscription path, notification-preference enforcement, configured-channel visibility и richer interest lifecycle.
- 2026-03-23 — auth/BFF routing realigned для dev + prod: `web`/`admin` routes переехали с `/api/*` на `/bff/*`, env/compose/nginx wiring синхронизированы, а redirect origin/path больше не деградируют в bare `http://localhost/`.
- 2026-03-23 — strengthened auth/BFF proof зафиксировал полный `Location` origin/pathname и сохранение `/api/articles` за Python API; одновременно `pnpm integration_tests` выявил unrelated blocker в `test:normalize-dedup:compose`.
- 2026-03-22 — full process-proof audit подтвердил authority chain, command truth и heavy compose-backed RSS-first acceptance без новых drift findings.

## Operating limits

Keep this file operationally small.

- Keep `Current memory` roughly within 20-40 lines.
- Keep `Recently changed` to at most 5-8 concise bullets.
- Keep only active capabilities и decision-relevant live state.
- Do not let the worktree become semantically broader than the active execution state recorded here.
- Move durable completed detail into `docs/history.md`.

## Automatic compression triggers

Run context compression when any are true:

- an item moved to `done`
- an item is about to be archived
- the primary active item changed
- this file exceeds the operating limits above
- more than 8 recent change bullets are present
- completed detail is still occupying live space here
- a capability line has become stale after stage completion or replanning
- a handoff or session end is about to happen after meaningful changes

## Compression checklist

When compressing context:

1. keep the active item accurate and schema-complete
2. keep active capability lines accurate and concise
3. preserve only current mode, current memory, active capabilities, active items, worktree coherence, active risks, known gaps, next recommended action, test artifacts, handoff state, and concise recent changes
4. move durable completed detail into `docs/history.md`
5. delete stale temporary notes after preserving their durable meaning
6. keep enough current memory that the next agent can continue without chat history
7. if the worktree is mixed, either reframe it honestly here or reduce it before handoff

## Active work index

| ID | Kind | Title | Parent capability | Status | Depends on | Allowed paths | Risk | Proof status | Owner | Summary |
|---|---|---|---|---|---|---|---|---|---|---|
| S-MVP-MANUAL-READINESS-3 | Stage | Manual MVP pack and final runtime sync | C-MVP-MANUAL-READINESS | blocked | S-MVP-MANUAL-READINESS-2 | `.env.dev`, `.env.example`, `apps/web/src/pages/index.astro`, `apps/admin/src/pages/index.astro`, `infra/scripts/manual-rss-bundle.template.json`, `package.json`, `README.md`, `docs/work.md`, `docs/verification.md`, `.aidp/os.yaml` | medium | partial | unassigned | Capability close gate blocked by unrelated `test:normalize-dedup:compose` regression even though auth/BFF targeted proof is green. |
| S-FETCHER-DUPLICATE-PREFLIGHT-1 | Stage | Fetcher-side duplicate suppression before insert/outbox | C-FETCHER-DUPLICATE-PREFLIGHT | blocked | - | `services/fetchers/`, `tests/unit/ts/fetcher-duplicate-preflight.test.ts`, `docs/work.md`, `docs/blueprint.md` | medium | partial | unassigned | Dirty tree already contains stage-1 implementation, but proof hardening and final sync are still incomplete. |
