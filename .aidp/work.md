# Work

Этот файл хранит только live execution state. Он не является backlog, blueprint или историей.

## Свежесть live state

- Последняя проверка этого файла по worktree reality: 2026-05-02
- Последняя проверка blockers/dependencies: 2026-05-02
- Следующая revalidation для blocked items: n/a

## Текущий режим

- Workflow mode: normal
- Разрешенные workflow modes: setup | normal | repair
- Work route: capability
- Разрешенные work routes: bootstrap | micro-patch | capability | bugfix | sweep | audit | docs-operator | delivery
- Route phase: proof-complete
- Route-specific next step: optional profile/policy tuning for consistently weak live domains: `hnrss.org` generation, and `remoteok.com`, `blog.cloudflare.com`, `ted.europa.eu`, `contractsfinder.service.gov.uk` review-policy residuals.
- Route-specific proof: targeted TS unit coverage, TS lint, typecheck, syntax checks and diff hygiene passed; full `pnpm test:discovery:mega:compose` live matrix completed with runtime pass and yield weak.
- Planning required by route: yes
- Planning source: tool-native
- Plan/spec status: accepted-for-this-item
- Audit overlay: none
- Разрешенные audit overlay values: none | requested | active-read-only | approved-for-apply
- Фокус аудита: n/a
- Почему сейчас: user accepted and requested implementation of the Live Discovery Domain Matrix plan.
- Active item id: NEWSPORTAL-LIVE-DISCOVERY-DOMAIN-MATRIX-CAPABILITY-1
- Active item status: done
- Item status: done
- Risk: medium
- Approval required: no
- Approval reason: bounded local/live proof harness and docs/root script work; no production deploy, secrets, schema migration, destructive cleanup or off-repo state is in scope.

## Проверки закрытия route

- `.aidp/os.yaml` initialization flag: true
- `.aidp/os.yaml` placeholder flag: false
- Setup route: закрыт 2026-04-24
- Repair route: закрыт 2026-04-25 after live-state/docs cleanup repair
- Current lifecycle mode: `normal`
- Current work route: capability
- Last completed work route: `capability` for `NEWSPORTAL-RELEASE-READY-COMPLIANCE-CAPABILITY-STAGE-32`.
- Normal mode note: `normal` не является work route; next work must select an explicit route.

## Item state machine

- Разрешенные item statuses: planned | ready | active | blocked | done | cancelled | superseded | archived
- `done` разрешен только после route-specific proof and close gate.
- `archived` разрешен только после sync в `.aidp/history.md`.
- `superseded` требует named replacing item.
- `blocked` требует blocker and next unblock condition.

## Текущая память

- NewsPortal — pnpm polyglot monorepo with Astro web/admin, FastAPI API, Node fetchers/relay/MCP, Python workers/ML/indexer, PostgreSQL, Redis/BullMQ and Docker Compose local baseline.
- PostgreSQL is durable business truth; Redis/BullMQ, HNSW, snapshots, queues and cache are derived/runtime state.
- Canonical AIDP runtime truth lives in `.aidp/*`; root/tool router files must remain thin.
- Product/reference docs remain under `docs/product`; runtime-agent contracts live under `.aidp/contracts/*`.
- Stateful proof must follow `.aidp/contracts/test-access-and-fixtures.md`.

## Активное execution state

### Primary active item

- ID: NEWSPORTAL-LIVE-DISCOVERY-DOMAIN-MATRIX-CAPABILITY-1
- Parent capability: Discovery live-provider proof hardening.
- Почему это primary active work: implement the requested A/B/C domain-matrix live test capability from the accepted plan.

### Secondary active item

- ID: none
- Почему существует: n/a
- Разрешенные overlap paths: n/a
- Условие выхода к одному primary item: n/a

### Согласованность worktree

- Existing dirty worktree contains the accepted and implemented architecture/feed/content-safety/post-sweep/universal hardening work; do not revert unrelated changes.
- Scope warning: do not run broad `git clean -fdX`; ignored `.env.*`, `.idea`, `node_modules`, `dist`, `.astro`, `data/models`, `data/snapshots` and other runtime/build artifacts may be locally useful and must only be removed by explicit targeted request.
- No commit/stage/branch changes were requested or performed for the latest sweep/stages.

### Active stage scope

- In scope: `infra/scripts/lib/discovery-live-example-cases.mjs`, new domain-matrix harness/helpers under `infra/scripts/**`, root `package.json` script, targeted TS unit tests, discovery operator docs, and AIDP sync for changed proof command.
- Out of scope: schema migrations, production/deploy changes, external paid provider rollout, broad discovery policy retuning beyond the domain-matrix harness contract, and destructive cleanup.
- Allowed paths: `.aidp/work.md`, `.aidp/os.yaml`, `.aidp/verification.md`, `.aidp/contracts/test-access-and-fixtures.md`, `.aidp/contracts/discovery-agent.md`, `package.json`, `infra/scripts/**`, `tests/unit/ts/**`, `docs/product/operator/examples/**`.
- Accepted plan summary: add fixed 3-domain targets per Example A/B/C, derive domain-scoped profile-backed runs, repeat 3 times with 2-pass acceptance, emit JSON/Markdown artifacts with per-domain diagnostics and known residual classification.
- Blueprint context checked: `Discovery acquisition`, `Runtime boundary`, `Test/runtime boundary`, `Discovery live search/LLM budget`, `.aidp/contracts/discovery-agent.md`, `.aidp/contracts/test-access-and-fixtures.md`.
- Required proof: targeted TS unit tests for domain metadata/helpers/verdict logic, `pnpm unit_tests:ts`, `pnpm lint:ts`, `pnpm typecheck`, syntax checks, `git diff --check --`, and the full 9-domain x 3-repeat live matrix when runtime access is available.
- Proof passed: `pnpm unit_tests:ts`; `pnpm lint:ts`; `pnpm typecheck`; `node --check infra/scripts/test-live-discovery-domain-matrix.mjs`; `node --check infra/scripts/test-live-discovery-examples.mjs`; `git diff --check --`.
- Runtime proof completed: `pnpm test:discovery:mega:compose` run id `b57b55db` wrote `/tmp/newsportal-live-discovery-domain-matrix-b57b55db.json` and `.md`; all 27 child runs completed; `runtimeVerdict=pass`, `yieldVerdict=weak`, `finalVerdict=yield_weak`.
- Runtime proof residuals: pass 3/3 for `weworkremotely.com`, `infoq.com`, `github.blog`, `sam.gov`; weak 0/3 for `hnrss.org` with `target_domain_generation_problem`; weak 0/3 for `remoteok.com`, `blog.cloudflare.com`, `ted.europa.eu`, `contractsfinder.service.gov.uk` with `target_domain_review_policy_problem`.
- Full complex proof run: `pnpm test:discovery:admin:compose` passed; `pnpm test:discovery:examples:compose` run id `1eb94981` passed; `pnpm test:discovery:mega:compose` run id `5f4ce70f` completed all 27 child runs with `runtimeVerdict=pass`, `yieldVerdict=weak`, `finalVerdict=yield_weak`; `pnpm test:discovery:yield:compose` run id `c82c5137` passed 3/3 example repeats; `pnpm test:mcp:compose` passed with artifact `/tmp/newsportal-mcp-http-deterministic-d335de54-4f3e-45c2-a716-5fdc2a5bf2f6.json`; `pnpm test:channel-auth:compose` initially exposed localhost crawl-policy cache contamination, then passed after cleanup and a pre-clean test isolation patch; `pnpm test:providers:compose`, `pnpm test:web:viewports`, and `pnpm test:website:compose` passed.
- Cleanup status: compose stack stopped with `pnpm dev:mvp:internal:down`; final `docker ps --format '{{.Names}}'` was empty; `/tmp/newsportal-live-discovery-domain-matrix-b57b55db.*`, `/tmp/newsportal-live-discovery-domain-matrix-5f4ce70f.*`, `/tmp/newsportal-live-discovery-examples-1eb94981.*`, `/tmp/newsportal-live-discovery-yield-proof-c82c5137.*`, and `/tmp/newsportal-mcp-http-deterministic-d335de54-4f3e-45c2-a716-5fdc2a5bf2f6.*` remain as proof evidence.

### Recent completed work

- Last completed item this session: `NEWSPORTAL-LIVE-DISCOVERY-DOMAIN-MATRIX-CAPABILITY-1`.
- Outcome: added fixed A/B/C domain targets, domain-scoped case derivation, a 3-repeat/2-pass domain matrix verdict helper, new live matrix harness, root command, docs/AIDP command sync and TS unit coverage.
- Cleanup status: live matrix was executed in this turn; `/tmp/newsportal-live-discovery-domain-matrix-b57b55db.json` and `.md` are the current proof artifacts; compose stack was stopped with `pnpm dev:mvp:internal:down`.
- Last archived item: `NEWSPORTAL-RELEASE-READY-COMPLIANCE-CAPABILITY-STAGE-32`.
- Outcome: added the repo-owned non-deploy `pnpm release:verify` gate, production image content smoke and release verification wiring, then repaired deterministic MVP proof seed state so the full release gate completes against consistent canonical document state.
- Cleanup status: `pnpm release:verify` ran product-local cleanup/down; final `docker ps --format '{{.Names}}'` was empty; no commit/stage/branch action was performed.

### Known next candidates

- Optional next candidate: narrow profile/policy tuning for consistently weak matrix domains, then rerun `pnpm test:discovery:mega:compose`.
