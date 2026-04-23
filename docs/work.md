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
- Why now: no active implementation item; the latest completed work on 2026-04-23 was `C-MCP-ARTICLE-DIAGNOSTICS-AND-TUNING-SURFACE`.

## Current memory

- Runtime core инициализирован; ordinary implementation work разрешен.
- On 2026-04-23 `C-MCP-ARTICLE-DIAGNOSTICS-AND-TUNING-SURFACE` completed:
  - maintenance API now exposes `/maintenance/articles/residuals` and `/maintenance/articles/residuals/summary`;
  - `@newsportal/sdk` wraps article residual diagnostics and richer content-item list queries;
  - MCP now ships `articles.*`, `content_items.*`, and `articles.residuals.*` read tools with compact defaults;
  - MCP now ships article-diagnostics guide resources plus tuning prompts for interests, templates, and discovery profiles;
  - deterministic MCP read/full compose proof was rerun successfully and the capability is archived in `docs/history.md`.
- Current dirty worktree still contains unrelated earlier documentation work in `README.md`, `docs/mcp/**`, `docs/architecture-overview.md`, root compatibility stubs, and `docs/product/**`; that overlap is pre-existing and remains outside any new active item unless a future request explicitly reopens it.

## Capability planning

### Active capabilities

- none

### Current work items

- none

## Worktree coherence

- Current dirty worktree still includes pre-existing completed documentation work in `README.md`, `docs/mcp/**`, `docs/architecture-overview.md`, root compatibility stubs, and `docs/product/**`.
- The now-completed MCP article-diagnostics capability added code/test/doc changes on top of that overlap and is archived in `docs/history.md`.

## Next recommended action

- None. Wait for the next user request.

## Archive sync status

- Completed item or capability awaiting archive sync:
  none
- Why it is still live, if applicable:
  n/a
- Archive action required next:
  none

## Test artifacts and cleanup state

- No new persistent test artifacts require cleanup from the completed MCP article-diagnostics capability.
- Latest proof executed for the completed capability:
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `node infra/scripts/test-mcp-compose.mjs --group=reads --skip-build`
  - `node infra/scripts/test-mcp-compose.mjs --skip-build`
  - `git diff --check --`

## Handoff state

- Active item: none.
- Latest completed work:
  - `C-MCP-ARTICLE-DIAGNOSTICS-AND-TUNING-SURFACE` is archived in `docs/history.md` with the API/SDK/MCP/tooling/docs/proof details.
- What is already true:
  - NewsPortal MCP now exposes article/content diagnostics and residual-analysis read surfaces for operator tuning without DB bypass.
  - deterministic MCP read/full compose proof for the shipped surface is green.
  - mixed worktree overlap with earlier documentation work remains explicit and should not be reverted casually.
- The next agent can start from the archived capability entry instead of re-reading chat history if follow-up MCP tuning or article diagnostics work is requested.
