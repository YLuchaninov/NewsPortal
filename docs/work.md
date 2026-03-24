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
- Why now: `C-NORMALIZE-DEDUP-BLOCKER` resolved и архивирован; `pnpm integration_tests` снова green на текущем tree, поэтому следующий truthful product-facing stage снова `S-MVP-MANUAL-READINESS-3`.

## Current memory

- Runtime core состоит из семи обязательных файлов; `docs/engineering.md` отделяет durable engineering rules от process contract, а `docs/contracts/test-access-and-fixtures.md` закрывает stateful test truth.
- `docs/blueprint.md` остается главным architectural source of truth для schema, queues, boundaries и service responsibilities.
- `docs/contracts/test-access-and-fixtures.md` является обязательным deep contract doc для stateful backend testing, Firebase identities, Mailpit delivery и persistent local fixtures.
- `C-MVP-MANUAL-READINESS` уже доставил `source_channel_runtime_state`, `channel_fetch_runs`, exact Gemini usage fields, admin/API scheduling observability, `web_push` flow и notification preferences.
- `poll_interval_seconds` остается base/min interval в `source_channels`; adaptive scheduler truth живет отдельно в runtime state.
- Astro browser/session/BFF surfaces живут в `/bff/*` и `/admin/bff/*`; public `/api/*` остается за Python API; redirect origin строится от `NEWSPORTAL_APP_BASE_URL`.
- `pnpm dev:mvp:internal` остается canonical compose baseline; lifecycle также включает `:no-build`, `:stop`, `:down`, `:down:volumes` и `:logs`.
- Root-level QA gates: `pnpm lint`, `pnpm unit_tests`, `pnpm integration_tests`; `pnpm integration_tests` остается thin alias на `pnpm test:mvp:internal`.
- RSS-first acceptance scope не расширился: `website`, `api` и `email_imap` ingest по-прежнему вне доказанного internal MVP gate.
- Compose blocker в `test:normalize-dedup:compose` оказался stale-proof проблемой, а не missing worker route: live relay в `pnpm test:mvp:internal` успевал публиковать `article.normalized`, а nginx HTML assertions в `infra/scripts/test-mvp-internal.mjs` проверяли snippets из неверного auth state.
- `services/workers/app/smoke.py` теперь допускает downstream progression дальше `deduped` и `article.normalized` со статусом `pending|published`; `infra/scripts/test-mvp-internal.mjs` теперь проверяет truthful logged-out HTML и authenticated settings/admin actions через cookie-aware requests.
- `pnpm integration_tests` прошел на текущем tree; локальный dirty worktree сейчас состоит из завершенного admin-path sweep, завершенного normalize/dedup blocker resolution и пользовательских import assets в `docs/data_scripts/*`.

## Capability planning

### Active capabilities

| Capability ID | Title | Status | Full completion condition | Planned stages | Current next stage | Notes |
|---|---|---|---|---|---|---|
| C-MVP-MANUAL-READINESS | Manual MVP readiness | ready | Schema/code/runtime docs синхронизированы; integration tests, typecheck проходят | `S-MVP-MANUAL-READINESS-1`, `S-MVP-MANUAL-READINESS-2`, `S-MVP-MANUAL-READINESS-3` | `S-MVP-MANUAL-READINESS-3` | Unblocked after green `pnpm integration_tests`; remaining open layer is final runtime/docs/manual pack |
| C-FETCHER-DUPLICATE-PREFLIGHT | Fetcher duplicate preflight | blocked | Fetcher batch precheck реализован и доказан unit + RSS smoke + multi-RSS compose proof | `S-FETCHER-DUPLICATE-PREFLIGHT-1`, `S-FETCHER-DUPLICATE-PREFLIGHT-2` | `S-FETCHER-DUPLICATE-PREFLIGHT-1` | Capability остается background work и не должна смешиваться с current readiness close path |

Rule: если capability active или ready и у нее нет truthful next stage, следующую stage нужно создать до implementation.
Rule: dependency truth и mixed worktree должны быть явно представлены, а не скрыты внутри dirty tree.

## Active execution state

### Primary active item

- ID: `S-MVP-MANUAL-READINESS-3`
- Parent capability: `C-MVP-MANUAL-READINESS`
- Why this is the primary active work: blocker resolution вернула green acceptance baseline; следующий truthful product-facing шаг снова закрытие final runtime/docs/manual-readiness stage.

### Secondary active item

- ID: `none`
- Why it exists:
  отдельный concurrent implementation item сейчас не активен.
- Allowed overlap paths:
  `none`
- Exit condition for returning to one primary item:
  already satisfied; если начнется новая implementation work поверх текущего dirty tree, overlap нужно будет зафиксировать заново.

### Worktree coherence

- Worktree status: mixed completed-change state
- Primary item alignment note:
  current dirty tree шире `S-MVP-MANUAL-READINESS-3`: в нем лежат завершенные изменения из `SW-ADMIN-APP-PATHS-1`, завершенные изменения из `C-NORMALIZE-DEDUP-BLOCKER` и пользовательские import assets в `docs/data_scripts/*`.
- Mixed-change warning, if any:
  перед новой manual-readiness implementation work не делай вид, что tree clean; либо split/commit completed changes, либо truthfully carry overlap в live state.
- Required action before more implementation, if any:
  для текущего docs sync дополнительного action не нужно; следующий product change должен стартовать только после honest reframe dirty tree.

### Active risks

- `website`, `api` и `email_imap` ingest все еще не покрыты единым acceptance gate.
- Browser receipt для `web_push` остается manual-only proof item.
- `pnpm lint` для Python части зависит от отдельной host-side установки `ruff`.
- Local dirty tree остается смешанным из completed change sets и user-owned assets, что повышает риск accidental scope drift при следующей stage.

### Known gaps

- Proof gap: Python services по-прежнему не имеют repo-level typecheck gate, сопоставимого с `pnpm typecheck`.
- Proof gap: `pnpm unit_tests` покрывает только deterministic pure logic; DB/Redis/queue/network boundaries доказываются integration/smoke path.
- Proof gap: multi-channel RSS proofs compose-backed и не имеют lightweight host-only variant.
- Product gap: repo хранит только RSS bundle template; curated real-feed bundle оператор должен собрать отдельно.
- Cleanup gap: local proof artifacts вроде Firebase alias users, RSS proof channels и notification subscriptions могут оставаться в local baseline, если cleanup не выполнен отдельным item или reset-ом среды.

### Next recommended action

- Next step:
  возобновить `S-MVP-MANUAL-READINESS-3` и решить, нужен ли еще final runtime/docs/manual pack поверх уже green acceptance baseline.
- Why this is next:
  blocker в normalize/dedup больше не удерживает close gate; следующая открытая completion layer связана с manual/runtime truth, а не с worker/relay correctness.

### Archive sync status

- Completed item or capability awaiting archive sync:
  `none`
- Why it is still live, if applicable:
  blocker resolution и admin path sweep уже архивированы в `docs/history.md`; live doc держит только текущий handoff и worktree truth.
- Archive action required next:
  none, если не появится новый completed detail.

### Test artifacts and cleanup state

- Users created:
  internal proofs могут создавать allowlisted Firebase admin aliases `internal-admin-<runId>` / `rss-admin-<runId>`, anonymous web users и `internal-user-<runId>@example.test`.
- Subscriptions or device registrations:
  local `web_push` subscriptions и notification channel rows могут оставаться после manual/integration verification.
- Tokens / keys / credentials issued:
  local dev VAPID keys живут в `.env.dev`; временные Firebase-issued tokens считаются ephemeral и не должны храниться как durable truth.
- Seeded or imported data:
  proof runs могут оставлять `Internal MVP RSS <runId>`, `RSS multi <runId> ...`, outbox smoke rows и worker smoke fixtures в local DB/Firebase baseline.
- Cleanup status:
  не clean; residual local artifacts допустимы только как локальная dev/test residue и должны считаться известными, пока отдельный cleanup item или explicit local reset вроде approved `pnpm dev:mvp:internal:down:volumes` не выполнен.

## Handoff state

- Current item status:
  `C-NORMALIZE-DEDUP-BLOCKER` archived after green `pnpm integration_tests`.
  `S-MVP-MANUAL-READINESS-3` is `ready`.
  `S-FETCHER-DUPLICATE-PREFLIGHT-1` remains `blocked` background work.
- What is already proven:
  Process refresh: transfer audit passed, root runtime core синхронизирован с package logic, reusable contract template добавлен, temporary source package retired.
  `SW-ADMIN-APP-PATHS-1`: admin links, redirects, logout и BFF form actions теперь строятся через shared `resolveAdminAppPath`; targeted routing unit test green, `pnpm typecheck` green, search по `apps/admin/src` больше не находит hardcoded root `href`/`action`/`Astro.redirect` patterns.
  `C-NORMALIZE-DEDUP-BLOCKER`: code inspection and compose proof showed live relay timing plus stale nginx HTML assertions; `services/workers/app/smoke.py` и `infra/scripts/test-mvp-internal.mjs` обновлены, а `pnpm integration_tests` завершился green на текущем tree.
- What is still unproven or blocked:
  Full manual browser click-path не повторялся в этой сессии; automated acceptance green, но operator-side receipt для `web_push` и curated RSS bundle остаются open.
  `website`, `api` и `email_imap` ingest по-прежнему не имеют сопоставимого acceptance proof.
- Scope or coordination warning for the next agent:
  `docs/data_scripts/*` содержит пользовательские import payload assets; не перетирай их.
  Dirty tree все еще содержит completed admin-path и blocker-resolution changes; перед новым broad stage лучше split/commit или truthfully reframe overlap.

### Recently changed

- 2026-03-24 — `C-NORMALIZE-DEDUP-BLOCKER` архивирован: compose blocker resolved through truthful smoke/assertion realignment and corrected nginx auth-state checks; `pnpm integration_tests` green.
- 2026-03-24 — `SW-ADMIN-APP-PATHS-1` архивирован: user-reported `/channels/bff/admin/channels/bulk` 404 traced to page-relative admin paths; shared helper now preserves direct-port root and nginx `/admin` prefix.
- 2026-03-23 — `C-AI-PROCESS-PACKAGE-REFRESH` завершен и архивирован: transfer audit passed, root process docs/machine truth synced, temporary source package retired.
- 2026-03-23 — `C-UI-REDESIGN` архивирован в `docs/history.md`; live context очищен от завершенной capability detail.
- 2026-03-23 — live process docs очищены от переходного migration residue после перехода на 7-file runtime core.

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
| S-MVP-MANUAL-READINESS-3 | Stage | Manual MVP pack and final runtime sync | C-MVP-MANUAL-READINESS | ready | S-MVP-MANUAL-READINESS-2 | `.env.dev`, `.env.example`, `apps/web/src/pages/index.astro`, `apps/admin/src/pages/index.astro`, `infra/scripts/manual-rss-bundle.template.json`, `package.json`, `README.md`, `docs/work.md`, `docs/verification.md`, `.aidp/os.yaml` | medium | partial | unassigned | Capability is unblocked after green `pnpm integration_tests`; final runtime/docs/manual pack can resume on a truthful acceptance baseline. |
| S-FETCHER-DUPLICATE-PREFLIGHT-1 | Stage | Fetcher-side duplicate suppression before insert/outbox | C-FETCHER-DUPLICATE-PREFLIGHT | blocked | - | `services/fetchers/`, `tests/unit/ts/fetcher-duplicate-preflight.test.ts`, `docs/work.md`, `docs/blueprint.md` | medium | partial | unassigned | Capability remains blocked background work and should stay isolated from current manual-readiness close path. |

## Item detail

### S-MVP-MANUAL-READINESS-3

- Kind: `Stage`
- Status: `ready`
- Goal: закрыть manual MVP readiness на уровне runtime/docs/packaging truth после устранения unrelated acceptance blocker-а
- In scope:
  `.env.dev`, `.env.example`, `apps/web/src/pages/index.astro`, `apps/admin/src/pages/index.astro`, `infra/scripts/manual-rss-bundle.template.json`, `package.json`, `README.md`, `docs/work.md`, `docs/verification.md`, `.aidp/os.yaml`
- Out of scope:
  new worker/relay semantics changes, fetcher duplicate-preflight implementation, broad UI redesign follow-ups
- Allowed paths:
  `.env.dev`, `.env.example`, `apps/web/src/pages/index.astro`, `apps/admin/src/pages/index.astro`, `infra/scripts/manual-rss-bundle.template.json`, `package.json`, `README.md`, `docs/work.md`, `docs/verification.md`, `.aidp/os.yaml`
- Required proof:
  targeted auth/BFF/runtime proof plus repo-level acceptance rerun на финальном tree; blocker rerun больше не является красным сигналом на текущем baseline
- Risk: `medium`
- Planned return path:
  1. Revalidate stage scope against the current dirty tree and decide, with no guesswork, whether any final runtime/docs/manual-pack drift remains in the allowed paths.
  2. Sync only the missing truth layers inside scope: `.env*`, entry pages, manual RSS bundle template, package/docs/runtime metadata.
  3. Run the medium-risk proof contour for the final tree: at minimum the relevant targeted auth/BFF/runtime checks, `pnpm typecheck`, `pnpm integration_tests`, and `git diff --check`.
  4. If those proofs stay green, sync `docs/work.md` and `docs/history.md`, then close `S-MVP-MANUAL-READINESS-3` and reassess whether `C-MVP-MANUAL-READINESS` itself can move to archive.

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
