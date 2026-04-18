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
- Why now: on 2026-04-18 the user asked for a destructive local reset plus a fresh outsourcing rerun so the tuned Example C bundle and bounded website source set could be re-materialized on an empty compose baseline.

## Current memory

- Runtime core инициализирован; ordinary implementation work разрешен.
- `docs/blueprint.md` остается главным architectural source of truth для boundaries, ownership и durable system behavior.
- `docs/contracts/test-access-and-fixtures.md` обязателен whenever work touches local PostgreSQL/Redis-backed proof, Firebase identities, Mailpit, web-push subscriptions или other persistent test artifacts.
- `docs/contracts/article-pipeline-core.md` обязателен whenever work touches the shipped article/selection pipeline core.
- `docs/contracts/discovery-agent.md` обязателен whenever work touches adaptive discovery missions, class registry, source profiles/scores, portfolio snapshots, feedback or re-evaluation.
- `docs/contracts/independent-recall-discovery.md` обязателен whenever work touches additive recall-first discovery entities or generic source-quality snapshots.
- `docs/contracts/browser-assisted-websites.md` обязателен whenever work touches JS-heavy website polling, browser-assisted discovery, website hard-site probing, or unsupported challenge behavior.
- `docs/contracts/feed-ingress-adapters.md` обязателен whenever work touches aggregator-aware RSS/Atom normalization or canonical URL resolution inside the `rss` boundary.
- `docs/contracts/zero-shot-interest-filtering.md` обязателен whenever work touches canonical documents, duplicate/story clustering, verification state, semantic interest filtering, or final selection truth.
- Default runtime for sequence-managed triggers остается sequence-first: relay writes PostgreSQL-backed `sequence_runs`, publishes thin `q.sequence` jobs, and worker startup consumes `q.sequence` plus DB-backed cron polling by default.
- Non-sequence relay fallback remains only for `foundation.smoke.requested` and `source.channel.sync.requested`.
- Canonical local compose/dev baseline sets `WORKER_SEQUENCE_RUNNER_CONCURRENCY=4`, while Python runtime fallback still defaults to `1` when the env is unset.
- Current website truth is closed at the bounded live-validation layer: deterministic website/channel/shared-result proof is green, broad website live-matrix evidence is archived, and no further generic website follow-up is active.
- The bounded live outsourcing validation is now shipped in repo-owned operator tooling:
  - `infra/scripts/run-live-website-outsourcing.mjs`
  - `infra/scripts/lib/outsource-example-c.bundle.mjs`
  - the harness now imports the Example C outsourcing bundle from repo code, accepts `26 ready + 3 needs_browser_fallback` rows from `docs/data_scripts/web.json`, records the single `rejected_open_web` row as `skipped_rejected_open_web`, and runs under plain `node`.
- Repo-owned `docs/data_scripts/web.json` remains the bounded live source list for this cohort: `26 ready`, `3 needs_browser_fallback`, `1 rejected_open_web`.
- The previous completed evidence bundle for the earlier live outsourcing run still lives at:
  - `/tmp/newsportal-live-website-outsourcing-2026-04-18T155147751Z.json`
  - `/tmp/newsportal-live-website-outsourcing-2026-04-18T155147751Z.md`
- The repo-owned outsourcing bundle is now truthfully repeatable from both `EXAMPLES.md` and `infra/scripts/lib/outsource-example-c.bundle.mjs`:
  - the outsourcing `interests`, `criteria`, and `global` LLM prompt texts now mirror the tuned admin bundle;
  - the five system-interest definitions now mirror the tuned descriptions, positive/negative prototypes, `must_not_have_terms`, candidate uplift cue groups, and mixed per-template `strictness` (`broad` / `balanced`);
  - the stale uniform `balanced / hold / always` wording in the generic EXAMPLES guidance was removed so future operator repeats no longer drift back to the pre-tuned baseline.
- A fresh post-sync reset-backed live outsourcing rerun completed on 2026-04-18 and now intentionally remains preserved in the local compose DB:
  - `29` `source_channels`
  - `5` `interest_templates`
  - `5` `criteria`
  - `5` `selection_profiles`
  - `3` `llm_prompt_templates`
  - `259` `web_resources`
  - `220` `articles`
  - `220` `final_selection_results`
  - `220` `system_feed_results`
  - `1100` `interest_filter_results`
  - `487` `sequence_runs`
- The completed evidence bundle for that tuned rerun lives at:
  - `/tmp/newsportal-live-website-outsourcing-2026-04-18T180725966Z.json`
  - `/tmp/newsportal-live-website-outsourcing-2026-04-18T180725966Z.md`
- The tuned rerun now proves positive outsourcing yield on the fresh baseline:
  - evidence summary is `15 projected_but_not_selected`, `11 external/runtime_residual`, `2 projected_and_selected`, `1 browser_fallback_residual`, `1 skipped_rejected_open_web`, and `0 implementation_issue`;
  - direct DB checks after the rerun show `2 selected` and `2 eligible`;
  - the selected rows are:
    - `.NET C# Backend Developer (Freelance, Per-Project Work, Ongoing Opportunities) hourly`
    - `Custom Clock Wheel for AzuraCast`
- The currently preserved live cohort is no longer the old zero-yield baseline; it is the post-sync tuned rerun and should be treated as the authoritative local outsourcing inspection set until the user requests another reset.
- RSS-ingress diagnostics on 2026-04-18 now show two separate runtime issues on the local compose stack:
  - the local DB currently contains `5185` `rss` channels in addition to the `29` outsourcing `website` channels;
  - the first blocker was a global fetchers poll-loop SQL type mismatch (`bigint <= text`) in due-channel selection, which prevented any RSS channel from reaching first fetch;
  - the second blocker was first-fetch starvation: never-fetched RSS rows were ordered oldest-first inside the provider queue, which buried user-added channels around `provider_rank 4950+ / 4961` behind the historical backlog;
  - both scheduler issues are now patched in `services/fetchers`, rebuilt into the live `fetchers` container, and proven on the live stack:
    - representative new RSS channels moved to the head of the due queue (`The New Stack = rank 1`, `Google News — Digital Transformation Partner Search = rank 2`, `TechCrunch — Startups = rank 6`, `Reuters — Technology = rank 7`);
    - those same channels then reached first fetches:
      - `VentureBeat`: `new_content`, `200`, `7 fetched`, `7 new`
      - `Google News — Digital Transformation Partner Search`: `new_content`, `200`, `20 fetched`, `4 new`
      - `TechCrunch — Startups`: `new_content`, `200`, `18 fetched`, `18 new`
      - `The New Stack`: `new_content`, `200`, `15 fetched`, `15 new`
      - `Reuters — Technology`: `hard_failure`, `404`, which still proves the channel now reaches real fetch execution instead of scheduler starvation
    - recent runtime DB proof shows `53` RSS fetch runs in the last `2` minutes after the fix.
- `C-WEBSITE-RSS-UNIFIED-DOWNSTREAM` is fully implemented and archived in `docs/history.md`; provider-specific acquisition may differ before handoff, but downstream product/filtering/selection/read-model truth must converge at `article.ingest.requested`.

## Capability planning

### Active capabilities

- none

### Active work items

- none

## Next recommended action

- none

## Archive sync status

- Completed item or capability awaiting archive sync:
  none
- Why it is still live, if applicable:
  n/a
- Archive action required next:
  none

## Test artifacts and cleanup state

- Current stage precondition:
  - the current compose DB intentionally preserves the fresh reset-backed outsourcing live cohort
- Pre-existing local operator residue still present outside the guarded tables:
  - prior live evidence bundles:
    - `/tmp/newsportal-live-website-outsourcing-2026-04-18T155147751Z.json`
    - `/tmp/newsportal-live-website-outsourcing-2026-04-18T155147751Z.md`
  - transient admin-only tuning helpers:
    - `/tmp/admin_outsourcing_tune_20260418.mjs`
    - `/tmp/admin-outsourcing-tune-session.json`
- Cleanup status:
  - the user-approved reset was executed via `pnpm dev:mvp:internal:down:volumes` followed by `pnpm dev:mvp:internal:no-build`
  - the fresh rerun cohort remains intentionally present after success:
    - `29` `source_channels`
    - `259` `web_resources`
    - `220` `articles`
    - `220` `final_selection_results`
    - `220` `system_feed_results`
    - `1100` `interest_filter_results`
    - `487` `sequence_runs`
  - no post-run cleanup/reset was performed; this cohort is intentionally preserved for inspection and tuning follow-up

## Handoff

- Current active item and status:
  no active item; `PATCH-WEB-BULK-PREP-FILE` is implemented, proven, and archived in `docs/history.md`.
- What is already proven:
  `docs/data_scripts/web.bulk-import.json` now contains `29` importable website rows derived from `docs/data_scripts/web.json`, already shaped for shared admin bulk import, while the canonical `docs/data_scripts/web.json` remained unchanged for the live outsourcing harness.
- What is still unproven or intentionally left open:
  no open proof remains for this patch; any future work would be automation to regenerate the derived bulk file after canonical source-list changes.
- Scope or coordination warning for the next agent:
  the worktree remains mixed with unrelated user-owned website/runtime edits; do not revert or normalize those changes blindly, and keep the canonical `docs/data_scripts/web.json` stable unless the user explicitly asks to change the harness-owned source list itself.
