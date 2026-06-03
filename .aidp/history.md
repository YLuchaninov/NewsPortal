# AIDP History

## Durable Decisions

- Discovery vNext is the only active operator-facing discovery truth.
- Historical discovery implementations were removed from active API, MCP, Admin UI, scripts, tests and operator docs during the 2026-05-29 destructive sweep.
- Applied migrations remain the historical schema chain and must not be edited after application.
- Dated operational discovery snapshots were removed; applied migrations are the only retained historical exception for retired discovery names.
- Shared source/channel/fetcher/content/outbox/UTE/downstream filtering boundaries remain authoritative and are not discovery-owned cleanup targets.
- Discovery vNext completion added policy-governed live-capable runs, persisted run steps, query attempts, LLM gateway events, monitoring state/observations, and vNext-only API/MCP/Admin diagnostics on 2026-05-29.

## Resolved Lessons

- Source registration must continue to emit `source.channel.sync.requested`.
- Probation handoff must not trigger retro notifications.
- Discovery routing must not use historical yield as a keep/drop signal.
- Missing or invalid vNext policies fail closed.
- Live Discovery provider/LLM execution requires enabled runtime, credentials, active policies and explicit positive budget; preview/replay paths remain non-live and must not silently fallback from failed live runs.
