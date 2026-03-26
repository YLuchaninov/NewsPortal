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
- Why now: the docs pass for `HOW_TO_USE.md` and `EXAMPLES.md` is complete and archived; there is no new primary implementation item beyond ready/block lanes.

## Current memory

- Runtime core инициализирован; ordinary implementation work разрешен.
- `docs/blueprint.md` остается главным architectural source of truth для system boundaries и service ownership.
- `docs/contracts/test-access-and-fixtures.md` обязателен whenever work touches local PostgreSQL/Redis-backed proof or other persistent backend fixtures; even when compose teardown is clean, external identities and other out-of-band residue must still be tracked explicitly.
- Astro browser/session mutation flows живут в `/bff/*` и `/admin/bff/*`; public `/api/*` остается за Python API.
- `pnpm dev:mvp:internal` остается canonical compose baseline; root-level QA gates — `pnpm lint`, `pnpm unit_tests`, `pnpm integration_tests`.
- RSS-first acceptance scope не расширился: `website`, `api` и `email_imap` ingest по-прежнему вне доказанного internal MVP gate.
- Admin reindex/backfill semantics уже truthfully зафиксированы: rebuild refreshes derived indices, backfill repairs historical matches without retro notifications.
- Active admin `interest_templates` now materialize into real `criteria` rows via `source_interest_template_id`, and migration `0007_interest_template_matching_sync.sql` backfilled the current runtime so existing templates started participating in matching without manual DB edits.
- `system_feed_results` now exists as a durable article-level read model: criteria worker writes the preliminary system gate there, criterion-scope LLM review recomputes it, and both compose worker smoke and historical-backfill smoke proved the row stays consistent with criterion outcomes.
- Fresh ingest now routes sequentially: `article.clustered -> q.match.criteria -> system_feed_results -> article.criteria.matched -> q.match.interests`, while `process_match_interests` also hard-checks the stored gate before matching.
- Historical backfill now mirrors the same order: replay criteria, replay only criterion-scope gray-zone LLM, and rematch `user_interests` only for articles that remained eligible in `system_feed_results`.
- Baseline runtime no longer does interest-scope gray-zone LLM review: gray-zone user-interest matches are truthfully suppressed with `interest_gray_zone_llm_disabled`, and backfill reports `interestLlmReviews = 0`.
- Public/system feed surfaces now derive eligibility from `system_feed_results`, so users without `user_interests` still receive the system-selected media flow even when personalization rows are absent.
- Historical backfill progress remains snapshot-based through `reindex_job_targets`; completed replay rows still need an explicit retention/cleanup policy.
- Real `user_interests` already have one canonical server contract plus packaged admin UX; the system-first feed now sits above that personalization layer instead of beside it.
- The latest compose-backed acceptance and system-first proof runs both ended with `docker compose down -v --remove-orphans`; tracked residue is limited to dev Firebase admin aliases created for proof runs.

## Capability planning

### Active capabilities

| Capability ID | Title | Status | Full completion condition | Planned stages | Current next stage | Notes |
|---|---|---|---|---|---|---|
| C-MVP-BUGFIXES | Minimal working MVP bugfix lane | ready | User-confirmed blocker bugs for the minimal working MVP are fixed without regressing the current RSS-first acceptance flow | `P-MVP-BUGFIX-1`, `P-MVP-BUGFIX-2`, `SW-UI-BUILD-HARDENING-1`, future bounded MVP bugfix items TBD | next user-reported MVP bugfix item to be created | Archived bugfix patches and sweeps remain closed; the capability is ready for the next bounded blocker |
| C-FETCHER-DUPLICATE-PREFLIGHT | Fetcher duplicate preflight | blocked | Fetcher batch precheck реализован и доказан unit + RSS smoke + multi-RSS compose proof | `S-FETCHER-DUPLICATE-PREFLIGHT-1`, `S-FETCHER-DUPLICATE-PREFLIGHT-2` | `S-FETCHER-DUPLICATE-PREFLIGHT-1` | Background work; stays isolated until explicitly resumed |

Rule: если capability active или ready и у нее нет truthful next stage, следующую stage нужно создать до implementation.
Rule: dependency truth и mixed worktree должны быть явно представлены, а не скрыты внутри dirty tree.

## Active execution state

### Primary active item

- ID: `none`
- Parent capability: `none`
- Why this is the primary active work: the bounded docs patch is complete; no new implementation slice is currently active.

### Secondary active item

- ID: `none`
- Why it exists: `.aidp/os.yaml` keeps multi-agent work disabled; no concurrent implementation lane is active.
- Allowed overlap paths: `none`
- Exit condition for returning to one primary item: already satisfied.

### Worktree coherence

- Worktree status: current dirty tree contains archived shared-UI hardening/template-matching code, archived reindex-progress and user-interest proof sync, and the now-closed system-first feed/runtime work.
- Primary item alignment note: no primary implementation lane is active; any further code or docs change now needs a new bounded item.
- Mixed-change warning, if any: none.
- Required action before more implementation, if any: bind the next truthful item explicitly before touching code again.

### Active risks

- Operators can still confuse template-backed system matching with per-user interest filtering: active admin templates now feed `criteria`, but `user_interests` remain a separate runtime layer with different data ownership.
- The new admin manage page must stay explicit about on-behalf semantics: future work cannot blur per-user `user_interests` into template-backed system criteria or hide which user is being edited.
- Reindex jobs now leave durable `reindex_job_targets` rows in PostgreSQL for snapshot-safe replay; retention/cleanup policy for completed jobs is still implicit and could become operational drift if ignored.
- Dev Firebase still contains allowlisted proof-only admin aliases; a future cleanup item should remove them explicitly rather than assuming compose teardown handled external identity residue.

### Known gaps

- Proof gap: Python services по-прежнему не имеют repo-level typecheck gate, сопоставимого с `pnpm typecheck`.
- Proof gap: `pnpm unit_tests` покрывает только deterministic pure logic; DB/Redis/queue/network boundaries доказываются integration/smoke path.
- Proof gap: multi-channel RSS proofs compose-backed и не имеют lightweight host-only variant.
- Proof gap: there is no operator-facing proof/report that explains how many historical articles were replayed, how many produced gray-zone matches, or whether compiled interests existed at run time.
- Product gap: users without `user_interests` now get the system-selected feed, but baseline notifications still remain a personalization-lane concern rather than a separate system-feed alert contract.

### Next recommended action

- Wait for the next explicit user request or create a new bounded follow-up item before more implementation or docs changes.

### Archive sync status

- Completed item or capability awaiting archive sync:
  none
- Why it is still live, if applicable:
  all completed system-first detail is now archived in `docs/history.md`.
- Archive action required next:
  none

### Test artifacts and cleanup state

- Users created:
  allowlisted Firebase admin alias `yluchaninov+internal-admin-f77f2941@gmail.com` created for smoke run `f77f2941`; no automated cleanup ran, so the identity remains as local/dev Firebase residue.
  allowlisted Firebase admin alias `yluchaninov+internal-admin-682c854e@gmail.com` created during the final `integration_tests` proof run; compose teardown cleaned local services, but the external dev Firebase identity remains until explicit cleanup.
- Subscriptions or device registrations:
  none for this patch.
- Tokens / keys / credentials issued:
  no persistent tokens were retained; only ephemeral session cookies were used during the smoke run.
- Seeded or imported data:
  none from the latest compose-backed proof run; both `pnpm integration_tests` and the final system-first compose proofs finished with `docker compose down -v --remove-orphans`, so local PostgreSQL/Redis/Mailpit state from those runs was removed.
- Cleanup status:
  latest compose-backed runtime artifacts were torn down cleanly; only the two Firebase admin aliases remain as tracked external residue pending an explicit cleanup item.

## Handoff state

- Current item status:
  `P-DOCS-SYSTEM-FIRST-SYNC-2` is `archived`.
  `P-DOCS-SYSTEM-FIRST-SYNC-1` is `archived`.
  `C-SYSTEM-FIRST-PERSONALIZATION` and its stages remain `archived`.
  `S-FETCHER-DUPLICATE-PREFLIGHT-1` remains the only explicit blocked background stage.
- What is already proven:
  the new durable `system_feed_results` contract is live: migration `0009_system_feed_results.sql`, synced phase-4 DDL, criteria-worker maintenance, criterion-LLM recompute, targeted Python unit coverage, and compose worker smoke/backfill smoke all passed in this turn.
  the sequential runtime is now live and proven: queue routing changed to `article.clustered -> criteria` and `article.criteria.matched -> interests`, compose relay routing smoke passed, compose worker `cluster-match-notify` smoke passed, and compose worker `reindex-backfill` smoke passed with `criterionLlmReviews = 0` and `interestLlmReviews = 0`.
  public/system feed eligibility now comes from `system_feed_results`: `services/api/app/main.py` switched `/feed` and dashboard summary to the system gate, web/admin builds passed, and a DB-backed fallback proof confirmed that an article with `processing_state = clustered` and `system_feed_results.eligible_for_feed = true` appears in `/feed` without any personalization lane.
  the prior user-interest operator flow remains proven: canonical mutation helpers, packaged admin `/user-interests`, compile proof, fresh-ingest `interest_match`, and historical rematch without retro notification drift all stayed green while system-first routing moved ahead of personalization.
  user-facing docs are now aligned with that runtime truth: README/how-to-use/examples describe the sequential system-first order, README SQL examples expose `system_feed_results`, and the stale feed gate wording in `docs/blueprint.md` no longer points at `processing_state`.
  `HOW_TO_USE.md` and `EXAMPLES.md` now also match the live contract: they describe system-first filtering, distinguish `interest_templates` from real `user_interests`, treat `criteria`/`global` as the active baseline LLM scopes, and use current prompt placeholders.
- What is still unproven or blocked:
  no manual browser-click walkthrough was executed in this turn; runtime proof used HTTP/browser-style requests instead of a human-driven browser session.
  `website`, `api` и `email_imap` ingest остаются вне current RSS-first acceptance gate.
  Browser receipt для `web_push` по-прежнему manual-only.
- Scope or coordination warning for the next agent:
  do not reintroduce `processing_state` as the canonical public-feed gate now that runtime truth is article-level `system_feed_results`. Future work should open a new bounded item instead of implicitly reopening archived system-first, user-interest, or reindex lanes.

### Recently changed

- 2026-03-26 — `P-DOCS-SYSTEM-FIRST-SYNC-2` archived after syncing `HOW_TO_USE.md` and `EXAMPLES.md` with the live system-first contract, including dashboard wording, template semantics, current LLM scopes, article-state explanations, and prompt placeholders.
- 2026-03-26 — `P-DOCS-SYSTEM-FIRST-SYNC-1` archived after syncing README/how-to-use/examples plus blueprint feed wording with the shipped system-first order and `system_feed_results` gate; `docs/contracts/README.md` and `.env.example` were checked and required no changes.
- 2026-03-26 — `C-SYSTEM-FIRST-PERSONALIZATION` archived after shipping `system_feed_results`, criteria-first runtime order, system-gated `/feed`, user-facing system-selected feed copy, and proof for both personalized and no-interest paths.
- 2026-03-26 — `S-SYSTEM-FIRST-RUNTIME-3` reached done state after landing criteria-first queue routing, system-gated interest matching, historical backfill gating, baseline disablement of interest-scope gray-zone LLM, and compose relay/worker proof for the new runtime order.
- 2026-03-26 — `SP-SYSTEM-FIRST-PERSONALIZATION-1` archived after documenting the requested two-layer hierarchy: system criteria plus criteria-scope LLM first, optional per-user personalization second, with user-interest gray-zone LLM moved out of the default baseline.
- 2026-03-25 — `S-USER-INTEREST-MATCH-PROOF-4` and `C-MATCHING-OPERATOR-TRUTH` archived after `pnpm integration_tests` proved admin-managed per-user interests on fresh ingest plus historical backfill, while keeping duplicate-cluster delivery resolved via send or `recent_send_history` suppression and avoiding retro notification drift.
- 2026-03-25 — `S-USER-INTEREST-ADMIN-UX-3` archived after shipping `/user-interests`, making the admin helper packaging-safe without `apps/web` imports, and proving nginx-shaped create/compile/read/delete flow for one selected user.
- 2026-03-25 — `S-USER-INTEREST-SHARED-CONTRACT-2` archived after canonical user-interest mutations moved into one shared server helper, admin gained audited on-behalf `email`/`user_id` BFF endpoints, and targeted TS/unit + repo TS proof stayed green.

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
| S-FETCHER-DUPLICATE-PREFLIGHT-1 | Stage | Fetcher-side duplicate suppression before insert/outbox | C-FETCHER-DUPLICATE-PREFLIGHT | blocked | - | `services/fetchers/`, `tests/unit/ts/fetcher-duplicate-preflight.test.ts`, `docs/work.md`, `docs/blueprint.md` | medium | partial | unassigned | Background capability remains blocked and should stay isolated until it is explicitly resumed. |

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
