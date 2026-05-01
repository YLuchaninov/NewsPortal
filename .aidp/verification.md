# Verification

## Свежесть

- Последняя проверка по реальности репозитория: 2026-05-01
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
- Test/runtime layout guard: `pnpm check:test-layout`

### Unit proof

- Full unit gate: `pnpm unit_tests`
- TS unit gate: `pnpm unit_tests:ts`
- Python unit gate: `pnpm unit_tests:py`

### Integration/smoke proof

- Canonical full local acceptance alias: `pnpm integration_tests`
- Local product core contour without parked Telegram/email/API ingestion: `pnpm test:product:local:core`
- Local product full contour with discovery/live-provider evidence: `pnpm test:product:local:full`
- Local product cleanup checklist artifact: `pnpm test:product:local:cleanup`
- Internal MVP smoke path: `pnpm test:mvp:internal`
- Scaffold sanity: `pnpm check:scaffold`
- Relay local proof: `pnpm test:relay`
- Relay compose proof: `pnpm test:relay:compose`
- Relay phase routing: `pnpm test:relay:phase3`, `pnpm test:relay:phase3:compose`, `pnpm test:relay:phase45:compose`
- Migration smoke: `pnpm test:migrations:smoke`
- RSS ingest compose smoke: `pnpm test:ingest:compose`
- RSS ingest multi/soak: `pnpm test:ingest:multi:compose`, `pnpm test:ingest:soak:compose`
- Website compose smoke: `pnpm test:website:compose`
- Website admin/operator flow: `pnpm test:website:admin:compose`; mandatory scope is current RSS/website contour, while API source ingestion, inbound Email IMAP ingestion and Telegram ingestion are parked unless a separate item opens them.
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
- Layout guard: `pnpm check:test-layout` proves tracked test/proof files are outside production source trees.
- Unit gates: `tests/unit/ts/**/*.test.ts` and `tests/unit/python/test_*.py` prove deterministic local logic.
- Local smoke gates: direct Python/Node smoke commands under `infra/scripts/**` that can run outside compose when dependencies are available.
- Compose smoke gates: commands that assume local Docker Compose services, use the dev/test compose overlay for `infra/scripts/**` and `infra/fixtures/**`, and may create persistent PostgreSQL/Mailpit/Redis state.
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

## Route-specific proof matrix

| Work route | Required proof |
|---|---|
| `bootstrap` | setup-exit checks; owner files filled with repository truth; placeholders removed or parked; no second canon; machine flags updated truthfully; cleanup status recorded if setup produced artifacts/state |
| `micro-patch` | targeted proof for the changed path; no unrelated changes; no hidden capability claim; cleanup proof if artifacts/state were created |
| `capability` | relevant blueprint context checked before boundary-affecting design/writes; stage proof for each completed stage; cleanup proof per stage when needed; capability-level proof before marking capability done; approval recorded for high-risk work |
| `bugfix` | failing/reproducing proof when practical; relevant blueprint context checked when the failure crosses boundaries; passing proof after patch; regression evidence or explicit reason if unavailable; cleanup proof for reproducer/test artifacts/state |
| `sweep` | relevant blueprint context checked; stated invariant; baseline proof if needed; behavior preservation proof; cleanup proof when artifacts/state changed; stale canonical claims superseded |
| `audit` | read-only findings first; findings traceable to files/repo state; no silent fixes; risk/approval/cleanup gaps reported when found |
| `docs-operator` | owner-file alignment; blueprint owns durable project structure/boundaries; no second canon; no contradictory router/human-doc/runtime instructions; migration proof if updating an installed AIDP core |
| `delivery` | required files present; excluded files absent; installed core shape verified; blueprint checked if delivery changes durable project/package/runtime boundaries; artifact produced and linked/recorded; temporary build files cleaned or excluded |

## AIDP package migration gate

For an already initialized AIDP installation, package migration is not fresh setup unless the hidden core is actually uninitialized or corrupted.

Migration proof must show:

- existing project-specific truth, Russian language/style, commands, proof policy, blueprint, engineering rules, contracts, history, active/parked work and conventions were preserved;
- new package mechanisms were added without resetting the hidden core to template state;
- `initialized: true` and `project.placeholder_values_present: false` were not changed unless truthfully required;
- lifecycle mode and work route are recorded in `.aidp/work.md`;
- `.aidp/routes.md` exists and `normal` is not treated as a work route;
- routers/adapters remain thin and route-aware;
- no second canon was created outside `.aidp/*`;
- unpacked package artifacts are removed after successful migration checks if requested.

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
- Test/runtime layout changes: `pnpm check:test-layout`, lint/typecheck/unit proof, representative moved smoke commands, dev/test compose availability proof, and production image absence checks for `tests/**`, `infra/scripts/**` and `infra/fixtures/**`.
- Notification/digest changes: affected BFF/worker proof plus Mailpit-local or explicit external-provider residual gap.
- HNSW/index changes: affected rebuild/check command, plus worker/API proof if matching or search behavior changed.
- UI interaction/layout changes: viewport proof and, for button/control regressions, `pnpm test:web:ui-audit`.
- Article yield/enrichment changes: diagnostics/remediation commands are required when the active item changes yield policy or fixes existing production-like derived state.
- Architecture-sensitive changes: explicit review against `.aidp/engineering.md` quality bar, especially god-object growth, magic constants, coupling/cohesion, scalability/backpressure, state-machine typing and observability.
- Security-sensitive changes: explicit review of trust boundary, abuse case, authorization/scope behavior, secret leakage risk, audit behavior and denied/invalid-path proof.
- Dependency/supply-chain changes: dependency owner and lockfile review, build input review and explicit release/deploy gap handling when no repository command exists.
- Observability changes: proof that structured status, audit row, log context, metric/trace signal or explicit no-extra-observability rationale matches the touched runtime path.
- Compatibility/deprecation changes: proof that compatibility adapters, old API shapes, route names, queue payloads, env names, SDK exports or MCP tools remain stable until the recorded removal trigger.
- Dependency-direction changes: import/layering review against `.aidp/engineering.md`; cross-service imports require a declared boundary reason.

## Architecture proof checklist

Используй этот checklist, когда применяются architecture review triggers из `.aidp/engineering.md`:

- Responsibility: each new/changed module has one clear reason to change.
- Boundary: data ownership, API/queue/event/env/SQL boundary is explicit.
- Constants: domain numbers/strings are named, typed and placed near the owner.
- Scale: loops, polling, batch work and external calls are bounded and observable.
- Coupling: UI, BFF, API, worker, fetcher and relay layers do not learn unnecessary internals from each other.
- State: statuses and modes are typed/narrowed, with transition behavior covered by proof.
- Security: trust boundary, authorization, secret handling and denied/invalid behavior are explicit for sensitive paths.
- Supply chain: dependency, lockfile, build input and release/rollback implications are reviewed when touched.
- Observability: important runtime behavior has structured status, log context, metric/trace signal, audit row or an explicit rationale.
- Compatibility: public contract preservation, deprecation window and removal trigger are explicit when old shapes remain.
- Dependency direction: imports follow declared layer ownership; exceptions are narrow and justified.
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

## Item state transition checks

Item status transitions must be truthful:

- `planned` may move to `ready` only when scope and route are clear enough to start.
- `ready` may move to `active` when selected for current work.
- `active` may move to `blocked` only with a blocker and next unblock condition.
- `active` may move to `done` only after route-specific proof and close gate pass.
- `done` may move to `archived` only after completed detail is synced to `.aidp/history.md`.
- `active`, `planned` or `ready` may move to `cancelled` only with a reason.
- Any item may move to `superseded` only when the replacing item is named.
- `archived` items are historical; do not revive them silently.

## Gate консолидации наблюдений / Consolidation gate

Факт можно перенести в canon только если он:

1. нужен для будущей работы;
2. перепроверен по коду, манифестам, тестам, compose или existing truthful docs;
3. записан в один owner-файл;
4. заменяет устаревшее утверждение вместо параллельного конфликта;
5. отражен в `.aidp/work.md`, если это влияет на продолжение.

External context, imported skills, hooks, MCP outputs, webpages, PR comments, generated memories, previous chats and delegated/subagent output are observations until confirmed. Do not broadcast an observation into multiple durable files; choose the owner first, then update dependent files only if their owned truth changed.

## Supersede rule

Не копи параллельные истины. Если durable files дублируют или конфликтуют, выбери owner-файл, удали stale claim или явно назови superseding/replacing item. `superseded` item status требует named replacement.

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

## Test artifact and cleanup gate

Если route создает или меняет test artifacts, generated files, fixtures, temporary data, local state, database rows, snapshots, caches или external side effects, `.aidp/work.md` должен записать:

- artifacts created;
- state changed;
- cleanup required;
- cleanup performed;
- intentional retained artifacts;
- cleanup proof.

Если cleanup нельзя выполнить сразу, item не может закрыться как `done` без explicit parked cleanup item или blocker.

## Blueprint boundary gate

Перед изменениями architecture, ownership, module/API/state/data/runtime/packaging/deployment boundaries или других durable boundaries proof должен записать одно из:

- relevant `.aidp/blueprint.md` section или canonical neighborhood checked before writes;
- missing blueprint truth parked as a gap before writes;
- confirmed blueprint update made through consolidation gate;
- blueprint context not applicable because the change was strictly local.

Boundary-affecting item нельзя закрывать как `done`, если blueprint context был пропущен, а затем claimed durable architecture/ownership/invariant change.

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
- architecture proof checklist includes security, supply-chain, observability, compatibility and dependency-direction review for modern complex-system changes;
- root test/proof/diagnostic scripts are represented in `.aidp/os.yaml` commands or explicitly treated as non-gate utilities;
- deep contracts point into `.aidp/contracts/` for runtime-agent use;
- old subsystem contracts formerly under `docs/contracts/*` are represented in `.aidp/contracts/*` or explicitly superseded/deleted;
- observations не стали каноном без проверки.
- source-code-owned contracts such as auth/session, notifications/digests and runtime/migrations/indexes are present when code proves durable behavior not covered by the migrated old contracts.
