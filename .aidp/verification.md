# Verification

## Свежесть

- Последняя проверка по реальности репозитория: 2026-04-24
- Проверил: Codex
- Следующий trigger пересмотра: изменение root scripts, test harnesses, compose baseline, migration process или delivery proof.

## Назначение

Этот файл определяет, что нужно доказать до закрытия работы. Он не хранит сырой command log; конкретные прогоны active work фиксируются в `.aidp/work.md`. Канонические команды живут в `.aidp/os.yaml`.

## Baseline proof map

Используй команды из `.aidp/os.yaml`.

### Static proof

- Lint: `pnpm lint`
- TS lint only: `pnpm lint:ts`
- Python lint only: `pnpm lint:py`
- Typecheck: `pnpm typecheck`
- Build/no-emit package checks: `pnpm build`

### Unit proof

- Full unit gate: `pnpm unit_tests`
- TS unit gate: `pnpm unit_tests:ts`
- Python unit gate: `pnpm unit_tests:py`

### Integration/smoke proof

- Canonical full local acceptance alias: `pnpm integration_tests`
- Internal MVP smoke path: `pnpm test:mvp:internal`
- Scaffold sanity: `pnpm check:scaffold`
- Relay local proof: `pnpm test:relay`
- Relay compose proof: `pnpm test:relay:compose`
- Relay phase routing: `pnpm test:relay:phase3`, `pnpm test:relay:phase3:compose`, `pnpm test:relay:phase45:compose`
- Migration smoke: `pnpm test:migrations:smoke`
- RSS ingest compose smoke: `pnpm test:ingest:compose`
- RSS ingest multi/soak: `pnpm test:ingest:multi:compose`, `pnpm test:ingest:soak:compose`
- Website compose smoke: `pnpm test:website:compose`
- Website admin/operator flow: `pnpm test:website:admin:compose`
- Automation admin/operator flow: `pnpm test:automation:admin:compose`
- Website live matrix: `pnpm test:website:matrix:compose`
- Web viewport proof: `pnpm test:web:viewports`
- UI button/accessibility audit: `pnpm test:web:ui-audit`
- Discovery enabled runtime proof: `pnpm test:discovery-enabled:compose`
- Discovery local smoke: `pnpm test:discovery-enabled:smoke`
- Discovery admin flow: `pnpm test:discovery:admin:compose`
- Discovery example proof: `pnpm test:discovery:examples:compose`
- Discovery nonregression proof: `pnpm test:discovery:nonregression:compose`
- Discovery yield proof: `pnpm test:discovery:yield:compose`
- MCP compose proof: `pnpm test:mcp:compose`
- MCP HTTP groups: `pnpm test:mcp:http:matrix`, `pnpm test:mcp:http:auth`, `pnpm test:mcp:http:reads`, `pnpm test:mcp:http:writes`, `pnpm test:mcp:http:discovery`
- MCP live HTTP proof: `pnpm test:mcp:http:live`
- Fetcher/provider smoke: `pnpm test:feed-ingress-adapters:smoke`, `pnpm test:channel-auth:compose`, `pnpm test:enrichment:compose`, `pnpm test:hard-sites:compose`
- Worker local smoke: `pnpm test:criterion-compile:smoke`, `pnpm test:cluster-match-notify:smoke`, `pnpm test:discovery-enabled:smoke`, `pnpm test:embed:smoke`, `pnpm test:interest-compile:smoke`, `pnpm test:llm-budget-stop:smoke`, `pnpm test:normalize-dedup:smoke`
- Worker compose smoke: `pnpm test:criterion-compile:compose`, `pnpm test:cluster-match-notify:compose`, `pnpm test:embed:compose`, `pnpm test:interest-compile:compose`, `pnpm test:llm-budget-stop:compose`, `pnpm test:normalize-dedup:compose`, `pnpm test:reindex-backfill:compose`
- HNSW interest-centroid check: `pnpm index:check:interest-centroids`
- HNSW event-cluster-centroid check: `pnpm index:check:event-cluster-centroids`

### Runtime/delivery proof

- Start full local stack: `pnpm dev:mvp:internal`
- Start without rebuild: `pnpm dev:mvp:internal:no-build`
- Stop/down/log lifecycle: `pnpm dev:mvp:internal:stop`, `pnpm dev:mvp:internal:down`, `pnpm dev:mvp:internal:logs`
- Expected local health endpoints: web `http://127.0.0.1:4321/api/health`, admin `http://127.0.0.1:4322/api/health`, API `http://127.0.0.1:8000/health`, nginx `http://127.0.0.1:8080/health`, Mailpit `http://127.0.0.1:8025/`.
- One-off runtime utilities: `pnpm db:migrate`, `pnpm db:seed:outbox-smoke`, `pnpm fetch:rss:once`, `pnpm website:projection:replay`, `pnpm website:projection:replay:compose`.
- Article yield diagnostics/remediation: `pnpm article:yield:diagnostics`, `pnpm article:yield:remediate`.

## Test surface taxonomy

- Static gates: lint, typecheck and build prove source shape and package contracts without runtime state.
- Unit gates: `tests/unit/ts/**/*.test.ts` and `tests/unit/python/test_*.py` prove deterministic local logic.
- Local smoke gates: direct Python/Node smoke commands that can run outside compose when dependencies are available.
- Compose smoke gates: commands that assume local Docker Compose services and may create persistent PostgreSQL/Mailpit/Redis state.
- Full acceptance gates: `pnpm test:mvp:internal`, website/admin/discovery/MCP live harnesses and multi/soak ingest.
- Diagnostic/remediation utilities: commands that inspect or repair runtime-derived state; they are not default close gates unless the active item touches their area.
- Live/external-provider gates: discovery live examples/yield, website live matrix and MCP live proof may involve external networks/providers or nondeterminism; residual gaps must be explicit if skipped.

## Таксономия gates

- Fast gate: smallest honest local proof for low-risk changes.
- Structural gate: required for boundaries, refactors, shared contracts, migrations, queue routing or cross-surface changes.
- Runtime smoke gate: required when startup, compose integration or service health matters.
- Delivery gate: required for Docker/compose/nginx/env/runtime delivery changes.
- Release gate: not separately declared yet; no repository-specific release command exists.

## Proof по типу работы

- `Patch`: targeted static/unit proof for touched area; stronger proof if stateful or boundary-sensitive.
- `Stage`: proof that the stage objective works and nearby boundaries still hold.
- `Sweep`: proof across all declared touched areas, usually lint/typecheck/unit plus targeted behavior.
- `Spike`: evidence for findings and constraints; may close without production code but not without explicit evidence.
- Architecture hardening/doc-only sweep: source/research evidence, owner-file consistency check and no-runtime-gate rationale if product code did not change.

## Proof по риску

- Low: targeted unit/static check or explicit read-only audit evidence.
- Medium: static proof plus targeted behavioral proof.
- High: full relevant gate set, boundary review, integration/smoke proof and explicit residual gap review.

## Ожидания по границам

- UI or design-system changes: typecheck/build plus targeted unit or viewport/browser proof when layout/user flow matters.
- Admin/session/auth changes: targeted admin flow proof and authorization boundary review.
- Web anonymous session changes: web BFF/session proof and cleanup/residual user state note when users are created.
- API changes: unit proof plus targeted endpoint/script proof.
- Fetcher/source changes: fetcher smoke or compose proof for affected provider; stateful artifact tracking if source rows are created.
- Feed adapter changes: `pnpm test:feed-ingress-adapters:smoke`; use `pnpm test:ingest:compose` or multi/soak proof when scheduler/runtime fanout changes.
- Website ingestion changes: `pnpm test:website:compose`; hard-site/browser-assisted changes need `pnpm test:hard-sites:compose` or website live matrix when relevant.
- Relay/queue changes: relay tests plus phase routing and worker/sequence smoke when routing semantics change.
- Worker/selection changes: Python unit proof plus relevant worker smoke/compose proof such as normalize/dedup, embed, interest/criterion compile, cluster-match-notify or reindex-backfill.
- Migration/schema changes: `pnpm test:migrations:smoke` plus affected API/worker/fetcher proof.
- Discovery changes: bounded discovery smoke/compose proof; admin, nonregression, examples or yield gates are selected by touched surface. Live external search/LLM gaps must be explicit.
- MCP/control-plane changes: `pnpm test:mcp:compose` or targeted MCP HTTP group proof.
- Automation/control-plane changes: `pnpm test:automation:admin:compose` plus targeted unit/control-plane proof.
- Delivery/compose changes: compose startup/health proof or an explicit blocked proof gap; scaffold changes should run `pnpm check:scaffold`.
- Notification/digest changes: affected BFF/worker proof plus Mailpit-local or explicit external-provider residual gap.
- HNSW/index changes: affected rebuild/check command, plus worker/API proof if matching or search behavior changed.
- UI interaction/layout changes: viewport proof and, for button/control regressions, `pnpm test:web:ui-audit`.
- Article yield/enrichment changes: diagnostics/remediation commands are required when the active item changes yield policy or fixes existing production-like derived state.
- Architecture-sensitive changes: explicit review against `.aidp/engineering.md` quality bar, especially god-object growth, magic constants, coupling/cohesion, scalability/backpressure, state-machine typing and observability.

## Architecture proof checklist

Используй этот checklist, когда применяются architecture review triggers из `.aidp/engineering.md`:

- Responsibility: each new/changed module has one clear reason to change.
- Boundary: data ownership, API/queue/event/env/SQL boundary is explicit.
- Constants: domain numbers/strings are named, typed and placed near the owner.
- Scale: loops, polling, batch work and external calls are bounded and observable.
- Coupling: UI, BFF, API, worker, fetcher and relay layers do not learn unnecessary internals from each other.
- State: statuses and modes are typed/narrowed, with transition behavior covered by proof.
- Proof: selected gate matches blast radius; typecheck alone is not enough for architecture-sensitive behavior changes.

## Exit gate для setup и repair

`setup` может завершиться только если:

- `.aidp/os.yaml` содержит реальные project facts and commands;
- `.aidp/os.yaml` говорит `initialized: true`;
- `.aidp/os.yaml` говорит `project.placeholder_values_present: false`;
- `.aidp/blueprint.md`, `.aidp/engineering.md`, `.aidp/verification.md`, `.aidp/work.md`, `.aidp/history.md` больше не выдают шаблонные строки за repo truth;
- `.aidp/work.md` больше не находится в `setup`;
- core можно продолжить без chat history.

`repair` может завершиться только когда противоречие устранено или честно записано как residual gap, а `.aidp/work.md` больше не нуждается в `repair`.

## Gate консолидации наблюдений

Факт можно перенести в canon только если он:

1. нужен для будущей работы;
2. перепроверен по коду, манифестам, тестам, compose или existing truthful docs;
3. записан в один owner-файл;
4. заменяет устаревшее утверждение вместо параллельного конфликта;
5. отражен в `.aidp/work.md`, если это влияет на продолжение.

## Close gate

Work item может стать `done` только если:

- required proof явный;
- executed proof явный;
- proof status `passed`;
- proof depth соответствует risk;
- core files синхронизированы;
- residual gaps и cleanup state записаны честно;
- completed durable detail архивируется в `.aidp/history.md`, когда больше не нужна live-деталь.

Capability может считаться завершенной только после выполнения full completion condition и capability-level proof.

## Stateful proof и cleanup

Если proof создает users, source channels, notification rows, web push subscriptions, API/MCP tokens, Mailpit-visible deliveries, discovery profiles/candidates или imported datasets, cleanup must be done or recorded in `.aidp/work.md`.

Используй `.aidp/contracts/test-access-and-fixtures.md` для declared environments, identity model, fixture procedures and cleanup policy.

## Известные proof gaps

- Production deploy proof не объявлен в репозитории.
- Separate release/package proof не объявлен; delivery confidence строится через compose/build/smoke gates.
- External live discovery and LLM proofs are intentionally bounded and may be nondeterministic; residual gaps must be recorded when live providers are involved.

## Audit checks

Аудит AIDP должен проверить:

- все `.aidp/*` файлы на русском, кроме schema keys/commands/package names;
- нет placeholder/example rows, маскирующихся под truth;
- `os.yaml` flags соответствуют `work.md`;
- router files тонкие и не содержат второй source of truth;
- active work state объясняет dirty worktree;
- proof policy matches real scripts;
- root test/proof/diagnostic scripts are represented in `.aidp/os.yaml` commands or explicitly treated as non-gate utilities;
- deep contracts point into `.aidp/contracts/` for runtime-agent use;
- each old subsystem contract from `docs/contracts/*` is either represented in `.aidp/contracts/*` or explicitly superseded;
- observations не стали каноном без проверки.
- source-code-owned contracts such as auth/session, notifications/digests and runtime/migrations/indexes are present when code proves durable behavior not covered by old `docs/contracts/*`.
