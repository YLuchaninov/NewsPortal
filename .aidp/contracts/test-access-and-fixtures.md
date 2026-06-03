# Test Access And Fixtures Contract

## Current Discovery Fixtures

Discovery test fixtures must target vNext:

- typed artifact schema validation;
- vNext migration smoke and destructive cleanup expectations;
- source registrar/probation handoff through `source_channels`, runtime state and outbox;
- MCP `discovery.*` tool list, strict payload validation and permission checks;
- admin workspace checks for runs, artifacts, candidates, probe reports, source understanding, routing decisions, source inventory, policies, adapter backlog, replay and rollback.

Retired discovery scripts, profiles and operator examples must not be used as active proof. Applied migrations are the only retained historical exception for retired discovery names.

## Required Gates

Use the smallest proof set that covers the touched surface. Common gates:

- `pnpm test:migrations:smoke`
- `pnpm unit_tests:py`
- `pnpm unit_tests:ts`
- `pnpm test:mcp:http:discovery`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `git diff --check`

Static sweeps must allow applied migrations only; active runtime, tests, scripts, docs and operator snapshots must not contain removed discovery names.
