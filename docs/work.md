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
- Why now: the user asked to finish the remaining small follow-ups, and this sync closed the last two live lanes: residual proof closeout and fetcher duplicate-preflight.

## Current memory

- Runtime core инициализирован; ordinary implementation work разрешен.
- `docs/blueprint.md` остается главным architectural source of truth для system boundaries и service ownership.
- `docs/contracts/test-access-and-fixtures.md` обязателен whenever work touches local PostgreSQL/Redis-backed proof, Firebase identities, Mailpit, or other persistent test artifacts.
- Fresh ingest remains sequential and system-first: `article.embedded -> criteria -> article.criteria.matched -> cluster -> article.clustered -> interests`.
- Historical backfill mirrors the same order, keeps snapshot-safe `reindex_job_targets`, and still skips retro notifications.
- Public/system feed eligibility comes from `system_feed_results`, not from `articles.processing_state`.
- `/` remains the system-selected feed; `/matches` remains the separate per-user personalized surface on top of system-feed-approved articles.
- API dashboard `processed_total` / `processed_today` now count final system-gate rows plus later `matched` / `notified` states.
- `llm_review_log.cost_estimate_usd` is still a worker-side estimate, not provider billing truth, but fresh local proof now exists for provider-usage-backed non-null writes.
- Browser `web_push` receipt is now manually proven on the local app path, with explicit cleanup of the temporary user/channel/browser artifacts.
- Fetcher duplicate preflight is now durably proven with unit coverage, duplicate-focused RSS smoke, and duplicate-focused 24-channel compose proof; the broader default ingest proofs still cover wider ingest invariants and remain separate from this closeout.
- No active test artifacts are currently tracked.
- The worktree remains mixed and dirty from archived runtime/docs changes; there is no active implementation item, so new edits must start from a fresh explicit bind.

## Capability planning

### Active capabilities

| Capability ID | Title | Status | Full completion condition | Planned stages | Current next stage | Notes |
|---|---|---|---|---|---|---|

### Ready capabilities

| Capability ID | Title | Status | Full completion condition | Planned stages | Current next stage | Notes |
|---|---|---|---|---|---|---|

Rule: если capability active или ready и у нее нет truthful next stage, следующую stage нужно создать до implementation.
Rule: dependency truth и mixed worktree должны быть явно представлены, а не скрыты внутри dirty tree.

## Active execution state

### Primary active item

- None.

### Secondary active items

- None.

### Worktree coherence

- Worktree status: the tree remains mixed and dirty from already-landed runtime/docs changes across worker/API/relay/web/admin plus the archive sync in this turn.
- Primary item alignment note: there is no active implementation item now; the remaining dirty paths belong to already-closed archived work and must not be treated as permission for casual scope expansion.
- Mixed-change warning, if any: yes — archived clustering, live-update, residual-proof, fetcher-proof, and related docs/runtime changes still coexist in the same uncommitted tree.
- Explicit overlap note: none currently live; overlapping dirty paths are historical residue from already-closed items.
- Required action before more implementation, if any: open a new bounded work item before making additional product or runtime changes.

### Active risks

- Operators can still confuse template-backed system matching with per-user `user_interests`; future work must keep that ownership boundary explicit.
- Duplicate historical `articles` rows can still exist in PostgreSQL; fetcher preflight now suppresses duplicate re-insertions on repeat RSS polls, but it is not a historical repair capability.
- Completed `reindex_job_targets` retention/cleanup policy remains implicit and could become operational drift if left unowned.

### Known gaps

- Proof gap: Python services still have no repo-level typecheck gate comparable to `pnpm typecheck`.
- Proof gap: `pnpm unit_tests` covers deterministic pure logic only; DB/Redis/queue/network boundaries still rely on integration/smoke proof.
- Proof gap: there is still no operator-facing report explaining how many historical articles were replayed, how many produced gray-zone matches, or which compiled interests existed at run time.
- Product gap: baseline notifications remain a personalization-lane concern rather than a separate system-feed alert contract.
- Scope gap: `website`, `api`, and `email_imap` ingest remain outside the current RSS-first acceptance gate.

### Next recommended action

- If the user wants to continue immediately, bind a new explicit item or decide how to stage/commit the already-archived dirty tree.

### Archive sync status

- Completed item or capability awaiting archive sync:
  none.
- Why it is still live, if applicable:
  n/a.
- Archive action required next:
  none.

### Test artifacts and cleanup state

- Users created:
  none currently tracked.
- Subscriptions or device registrations:
  none currently tracked.
- Tokens / keys / credentials issued:
  no persistent proof credentials remain tracked.
- Seeded or imported data:
  none currently tracked.
- Cleanup status:
  clean.

## Handoff state

- Current item status:
  no active item is bound.
- What is already proven:
  real-browser proof exists for the shipped web/admin live-update UX on the live local apps.
  fresh worker smoke proves non-null DB-written `llm_review_log.cost_estimate_usd` from provider `usageMetadata`.
  real Chrome proof confirms browser `web_push` receipt end-to-end, including unsubscribe and DB/browser cleanup.
  fetcher duplicate preflight is proven by unit coverage, host RSS duplicate-only smoke, and duplicate-focused 24-channel compose proof.
- What is still unproven or blocked:
  no open proof debt is currently tracked for the just-closed residual and fetcher lanes.
- Scope or coordination warning for the next agent:
  do not reintroduce `processing_state` as the canonical public-feed gate now that runtime truth is article-level `system_feed_results`; keep any new ingest or feed work on a fresh bounded item.

### Recently changed

- 2026-03-27 — archive-synced `C-RESIDUAL-PROOF-CLOSEOUT` after proving fresh provider-usage-backed `llm_review_log.cost_estimate_usd` writes and real-browser `web_push` receipt with full cleanup.
- 2026-03-27 — closed `C-FETCHER-DUPLICATE-PREFLIGHT` by adding duplicate-focused proof modes to the RSS smoke harness and multi-RSS compose harness, then executing green unit + smoke + compose proof.
- 2026-03-27 — compressed live execution state to no active item because the user-requested residual closeout lanes are now complete.

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

No active items.
