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
- Why now: this sync closes the bounded umbrella residual patch after `pnpm integration_tests` passed and the Firebase proof-admin cleanup path was fixed.

## Current memory

- Runtime core инициализирован; ordinary implementation work разрешен.
- `docs/blueprint.md` остается главным architectural source of truth для system boundaries и service ownership.
- `NEW_ARCHITECTURE.md` остается proposal/reference input; cross-chat durable truth for this capability now belongs in `docs/contracts/universal-task-engine.md`.
- `docs/contracts/test-access-and-fixtures.md` обязателен whenever work touches local PostgreSQL/Redis-backed proof, Firebase identities, Mailpit, or other persistent test artifacts.
- `C-UNIVERSAL-TASK-ENGINE` implementation is complete and archived in `docs/history.md`.
- Default runtime for sequence-managed triggers is now sequence-first: relay creates PostgreSQL-backed `sequence_runs`, publishes thin `q.sequence` jobs, and worker startup consumes `q.sequence` plus DB-backed cron polling by default.
- Non-sequence relay fallback remains only for `foundation.smoke.requested` and `source.channel.sync.requested`.
- Legacy queue consumers remain code-present but are opt-in only through `WORKER_ENABLE_LEGACY_QUEUE_CONSUMERS`; default runtime must not run them alongside the sequence-first path.
- Sequence runtime suppresses default outbox emission for legacy intermediate article events (`article.normalized`, `article.embedded`, `article.criteria.matched`, `article.clustered`, `article.interests.matched`) to avoid dual execution.
- Internal sequence management and agent surfaces remain maintenance-only under `/maintenance/*`; public API contracts did not expand.
- The 2026-03-27 audit re-ran the full `UTE-S8` cutover proof contour on the current tree and found no blocking sequence-runtime regressions; only documentation mismatches were corrected.
- Sequence definitions now validate `cron`, and default live sequences are activated through the sequence-engine migrations rather than through ad hoc operator bootstrap.
- Discovery/enrichment plugin catalog stays additive and adapter-backed; live provider-backed discovery rollout remains out of scope for this capability.
- Historical backfill still mirrors the legacy order, keeps snapshot-safe `reindex_job_targets`, and still skips retro notifications.
- Public/system feed eligibility comes from `system_feed_results`, not from `articles.processing_state`.
- `/` remains the system-selected feed; `/matches` remains the separate per-user personalized surface on top of system-feed-approved articles.
- `pnpm integration_tests` is now green again: the `/settings` page renders nginx-safe progressive-enhancement form actions, and the internal MVP harness now cleans up its `internal-admin-<runId>` Firebase proof identity in `finally`.
- One historical Firebase proof-admin residue may still exist from the pre-fix failed run because its alias was not surfaced at the time; future umbrella runs should no longer leak that identity.
- The dirty tree should stay limited to landed Universal Task Engine docs/runtime/code, synced process docs, and the user-owned untracked `NEW_ARCHITECTURE.md` reference.

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

- None. `P-UMBRELLA-RESIDUALS-1` is done and archived in `docs/history.md`.

### Secondary active items

- None.

### Worktree coherence

- Worktree status: active edits are limited to landed Universal Task Engine code/docs sync plus the user-owned untracked `NEW_ARCHITECTURE.md` proposal file.
- Primary item alignment note: no live item is open; the current dirty tree corresponds to the landed Universal Task Engine closeout, the archived umbrella residual fix, and the user-owned untracked `NEW_ARCHITECTURE.md` reference file.
- Mixed-change warning, if any: no live secondary item is declared.
- Explicit overlap note: none currently live.
- Required action before more implementation, if any: open a new bounded item before touching unrelated web/admin/integration work.

### Active risks

- Sequence-managed triggers must continue to preserve PostgreSQL-first write path, outbox/inbox idempotency, `system_feed_results` gating, snapshot-safe backfill, and zero retro notifications under the default sequence runtime.
- Legacy queue consumers remain code-present but must stay opt-in only; enabling them alongside sequence-first defaults risks dual execution.
- Active `sequences` seed rows now directly own production routing for managed triggers, so operator drift in sequence status/trigger wiring can break runtime even when code remains green.

### Known gaps

- Proof gap: Python services still have no repo-level typecheck gate comparable to `pnpm typecheck`.
- Residual gap: discovery/enrichment live provider and DB smoke remain intentionally unproven; `UTE-S6` closed on deterministic adapter-backed proof only.
- Residual gap: one historical Firebase allowlisted proof-admin identity may still remain from the pre-fix failed umbrella run because the exact alias was not surfaced in captured output; the harness now cleans future `internal-admin-<runId>` users in `finally`.

### Next recommended action

- If the user wants the last historical external Firebase residue closed too, open a new bounded cleanup item; otherwise no live implementation follow-up is required from this patch.

### Archive sync status

- Completed item or capability awaiting archive sync:
  none.
- Why it is still live, if applicable:
  n/a.
- Archive action required next:
  none.

### Test artifacts and cleanup state

- Users created:
  no new persistent proof users remain from `P-UMBRELLA-RESIDUALS-1`; the harness now deletes its current `internal-admin-<runId>` Firebase admin identity in `finally`.
- Subscriptions or device registrations:
  none currently tracked.
- Tokens / keys / credentials issued:
  no repo-local persistent proof credentials remain tracked; only a possible historical external Firebase residue from the pre-fix failed run remains.
- Seeded or imported data:
  no new durable seeded data is tracked; `pnpm integration_tests` brought up and tore down the canonical compose baseline inside the script.
- Cleanup status:
  current patch left no new cleanup residue; only the historical unknown Firebase alias from the pre-fix failed run may still need external cleanup.

## Handoff state

- Current item status:
  no active item; `P-UMBRELLA-RESIDUALS-1` is done and archived, and the sequence-engine capability remains closed.
- What is already proven:
  `UTE-S1` through `UTE-S7` landed foundation, plugins, relay/API prep, discovery adapters, and cron/agent support.
  `UTE-S8` activated default sequences, switched relay/worker defaults to the sequence-first runtime, removed default legacy intermediate article fanout, and updated relay/fetcher compose smokes to assert `sequence_runs` plus thin `q.sequence` jobs.
  the post-cutover audit re-ran `pnpm unit_tests`, `pnpm typecheck`, `pnpm test:migrations:smoke`, `pnpm test:relay:compose`, `pnpm test:relay:phase3:compose`, `pnpm test:relay:phase45:compose`, `pnpm test:ingest:compose`, `pnpm test:normalize-dedup:compose`, `pnpm test:interest-compile:compose`, `pnpm test:criterion-compile:compose`, and `pnpm test:cluster-match-notify:compose`, and `git diff --check` passed for the touched docs.
  `P-UMBRELLA-RESIDUALS-1` restored progressive-enhancement `action` contracts on `/settings`, added failed-run Firebase proof-admin cleanup to `infra/scripts/test-mvp-internal.mjs`, passed `pnpm typecheck`, passed `pnpm integration_tests`, and passed `git diff --check` on the touched files.
- What is still unproven or blocked:
  discovery/enrichment live provider and DB smoke remain intentionally out of scope.
  no repo-local blocking proof remains from this patch; only the historical unknown Firebase alias from the pre-fix failed run may still exist outside the current successful run.
- Scope or coordination warning for the next agent:
  do not reopen the archived sequence capability or this patch for unrelated web/admin work; create a fresh bounded item for any new integration or external-cleanup request.

### Recently changed

- 2026-03-27 — completed and archived `UTE-S8 Cutover and cleanup` with sequence-first default relay/worker runtime, active default sequences, suppressed intermediate article fanout, updated relay/fetcher compose smokes, and green cutover-specific compose proof.
- 2026-03-27 — archived `C-UNIVERSAL-TASK-ENGINE`; durable rollout truth now lives in `docs/contracts/universal-task-engine.md` and `docs/history.md`.
- 2026-03-27 — archived `SWEEP-UTE-AUDIT-1` after re-running the full cutover proof contour, confirming the migration stayed green, and syncing practical migration lessons into `NEW_ARCHITECTURE.md` and runtime core docs.
- 2026-03-27 — archived `P-UMBRELLA-RESIDUALS-1` after restoring `/settings` form actions, fixing harness cleanup for `internal-admin-<runId>`, and getting `pnpm integration_tests` green again.

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

- none.
