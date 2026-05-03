# Work

Этот файл хранит только live execution state. Он не является backlog, blueprint или историей.

## Свежесть live state

- Последняя проверка этого файла по worktree reality: 2026-05-03
- Последняя проверка blockers/dependencies: 2026-05-03
- Следующая revalidation для blocked items: n/a

## Текущий режим

- Workflow mode: normal
- Разрешенные workflow modes: setup | normal | repair
- Work route: capability
- Разрешенные work routes: bootstrap | micro-patch | capability | bugfix | sweep | audit | docs-operator | delivery
- Route phase: completed
- Route-specific next step: report the implemented `pnpm test:product:total-live:compose` audit layer and latest required-live proof results.
- Route-specific proof: completed targeted TS unit coverage, syntax checks, `pnpm unit_tests:ts -- product-total-live`, targeted browser/worker reruns, and required-live `pnpm test:product:total-live:compose -- --skip-diagnostics --skip-stack-build`.
- Planning required by route: yes
- Planning source: tool-native
- Plan/spec status: accepted-for-this-item
- Audit overlay: none
- Разрешенные audit overlay values: none | requested | active-read-only | approved-for-apply
- Фокус аудита: n/a
- Почему сейчас: user accepted and requested implementation of the Total Live Product Audit Layer plan.
- Active item id: NEWSPORTAL-PRODUCT-TOTAL-LIVE-AUDIT-CAPABILITY-1
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

- ID: NEWSPORTAL-PRODUCT-TOTAL-LIVE-AUDIT-CAPABILITY-1
- Parent capability: Product full-flow proof hardening.
- Почему это primary active work: implement the requested total-live audit layer above the strict A/B/C mega-flow proof.

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

- In scope: new total-live audit harness/helpers under `infra/scripts/**`, root `package.json` script, targeted TS unit tests, product/discovery operator docs, and AIDP sync for changed proof command.
- Out of scope: schema migrations, production/deploy changes, external paid provider rollout, broad discovery policy retuning, making API/Email IMAP look externally live without real targets, and destructive cleanup.
- Allowed paths: `.aidp/work.md`, `.aidp/os.yaml`, `.aidp/verification.md`, `.aidp/contracts/test-access-and-fixtures.md`, `package.json`, `infra/scripts/**`, `tests/unit/ts/**`, `docs/product/operator/**`.
- Accepted plan summary: add `pnpm test:product:total-live:compose` as the broadest local/live audit layer above `pnpm test:product:mega-flow:compose`; require strict A/B/C mega-flow and core runtime gates, classify live-internet diagnostic weak lanes, and record API/Email IMAP external live as `not_applicable_with_reason` while requiring deterministic provider fixture evidence; emit `/tmp/newsportal-product-total-live-<runId>.json|md`.
- Blueprint context checked: `Runtime-поверхности`, `Source/content pipeline`, `Selection/personalization/discovery`, `Operator/admin control plane`, `Test/runtime boundary`, `.aidp/contracts/test-access-and-fixtures.md`.
- Required proof: targeted TS unit tests for total-live verdict/residual logic, syntax checks for new scripts, `pnpm unit_tests:ts -- product-total-live`; runtime proof with `pnpm test:product:total-live:compose` when feasible, otherwise document blocker/residual and run targeted child gates.
- Proof passed: yes; implemented total-live audit layer and passed the required-live contour with diagnostics skipped.
- Product total-live proof completed: `pnpm test:product:total-live:compose -- --skip-diagnostics --skip-stack-build` run id `38128383` passed with `runtimeVerdict=pass`, `finalVerdict=pass`; artifact `/tmp/newsportal-product-total-live-38128383.json` and `.md`; strict nested mega-flow artifact `/tmp/newsportal-product-mega-flow-695b3c2b.json` passed with `runtimeVerdict=pass`, `yieldVerdict=pass`, `finalVerdict=pass`.
- Product total-live coverage evidence: strict A/B/C live selected product proof passed; providers/channel auth/website-admin/automation-admin/MCP/Web viewport/Web UI audit/relay phase 3/4/5/ingest/normalize-dedup/interest compile/criterion compile/cluster-match-notify/embed/reindex-backfill/LLM-budget-stop required commands passed; RSS and Website provider evidence passed; API and Email IMAP deterministic fixtures passed and external live lanes were recorded as `not_applicable_with_reason` because no real external target is available.
- Product total-live live-selected evidence: Example A selected `Boulevard: Staff Product Designer, Platform` from `We Work Remotely — Programming`; Example B selected `How GitHub uses eBPF to improve deployment safety` from `GitHub Blog`; Example C selected `Why Tokyo is the most important tech destination of 2026` from `TechCrunch — Startups`; all had `finalDecision=selected` and `matchedFilterCount=1`.
- Product total-live fixes applied during proof: UI button audit seed now retries Postgres deadlock/serialization conflicts, waits for worker-stable article state before deterministic selection seeding, re-marks the admin moderation fixture as a recent failure immediately before the admin route check, and viewport proof waits longer with diagnostics for criteria processing; reindex-backfill smoke now isolates criterion scope during the reindex replay so cardinality proof remains deterministic in a live populated DB.
- Product total-live proof not run: full diagnostic-mode `pnpm test:product:total-live:compose` was not run after the required-live pass; diagnostic lanes remain separately classifiable by the harness and can be run when the long live-internet matrix is desired.
- Product mega-flow proof completed: latest strict `pnpm test:product:mega-flow:compose` run id `093f6007` passed with `runtimeVerdict=pass`, `yieldVerdict=pass`, `finalVerdict=pass`; artifact `/tmp/newsportal-product-mega-flow-093f6007.json` and `.md`; child live discovery artifact `/tmp/newsportal-product-mega-flow-discovery-6cbd0bec.json` passed for Examples A/B/C; child MCP artifact `/tmp/newsportal-mcp-http-deterministic-215cb065-494e-452d-b2e7-b268a50e102d.json` passed.
- Product mega-flow live-selected evidence: Example A selected live current-window article `Show HN: AI voice screens for hiring managers to save time` from `Hacker News — Ask HN: Who is hiring?`; Example B selected live article `How GitHub uses eBPF to improve deployment safety` from `GitHub Blog`; Example C selected live article `Why Tokyo is the most important tech destination of 2026` from `TechCrunch — Startups`. All three had `finalDecision=selected` and `matchedFilterCount=1`.
- Product mega-flow coverage evidence: A/B/C admin-managed profile truth passed; live graph+recall discovery passed for all three; RSS, Website, API and Email IMAP provider evidence passed; deterministic rejected/filter/duplicate buckets passed; strict live-selected article evidence passed; sequence resource/article/enrichment/digest/cancel/fail/retry buckets passed; Web/Admin/MCP surfaces passed.
- Separate required discovery proofs completed: `pnpm test:discovery:examples:compose` run id `84c5ef4c` passed with `runtimeVerdict=pass`, `yieldVerdict=pass`, `finalVerdict=pass`; `pnpm test:discovery:yield:compose` run id `5f14543e` passed with 3/3 passing runs for Examples A, B and C.
- Static/local proof completed: `node --check infra/scripts/test-product-mega-flow.mjs`, `node --check infra/scripts/lib/product-mega-flow-proof.mjs`, `pnpm unit_tests:ts` (318/318), targeted `PYTHONPATH=. python -m unittest tests.unit.python.test_final_selection tests.unit.python.test_selection_profiles` (22/22), `pnpm lint:ts`, and `pnpm typecheck` passed; `typecheck` retained existing Astro hints but 0 errors.
- Runtime proof completed: `pnpm test:discovery:mega:compose` run id `b57b55db` wrote `/tmp/newsportal-live-discovery-domain-matrix-b57b55db.json` and `.md`; all 27 child runs completed; `runtimeVerdict=pass`, `yieldVerdict=weak`, `finalVerdict=yield_weak`.
- Runtime proof residuals: pass 3/3 for `weworkremotely.com`, `infoq.com`, `github.blog`, `sam.gov`; weak 0/3 for `hnrss.org` with `target_domain_generation_problem`; weak 0/3 for `remoteok.com`, `blog.cloudflare.com`, `ted.europa.eu`, `contractsfinder.service.gov.uk` with `target_domain_review_policy_problem`.
- Full complex proof run: `pnpm test:discovery:admin:compose` passed; `pnpm test:discovery:examples:compose` run id `1eb94981` passed; `pnpm test:discovery:mega:compose` run id `5f4ce70f` completed all 27 child runs with `runtimeVerdict=pass`, `yieldVerdict=weak`, `finalVerdict=yield_weak`; `pnpm test:discovery:yield:compose` run id `c82c5137` passed 3/3 example repeats; `pnpm test:mcp:compose` passed with artifact `/tmp/newsportal-mcp-http-deterministic-d335de54-4f3e-45c2-a716-5fdc2a5bf2f6.json`; `pnpm test:channel-auth:compose` initially exposed localhost crawl-policy cache contamination, then passed after cleanup and a pre-clean test isolation patch; `pnpm test:providers:compose`, `pnpm test:web:viewports`, and `pnpm test:website:compose` passed.
- Cleanup status: compose stack stopped with `pnpm dev:mvp:internal:down`; final `docker ps --format '{{.Names}}'` was empty; current proof artifacts include `/tmp/newsportal-product-total-live-38128383.*`, `/tmp/newsportal-product-mega-flow-695b3c2b.*`, `/tmp/newsportal-product-mega-flow-discovery-ad8f7e3c.*`, `/tmp/newsportal-product-mega-flow-093f6007.*`, `/tmp/newsportal-product-mega-flow-discovery-6cbd0bec.*`, `/tmp/newsportal-live-discovery-examples-84c5ef4c.*`, `/tmp/newsportal-live-discovery-yield-proof-5f14543e.*`, and `/tmp/newsportal-mcp-http-deterministic-215cb065-494e-452d-b2e7-b268a50e102d.*`.

### Recent completed work

- Last completed item this session: `NEWSPORTAL-PRODUCT-MEGA-FLOW-CAPABILITY-1`.
- Outcome: added and hardened the product mega-flow compose proof, root command, scenario/verdict helper, strict live-selected article acceptance, TS/Python unit coverage, operator docs and AIDP command/proof sync; latest live proof passed end-to-end for Examples A/B/C plus provider/filter/sequence/Web/Admin/MCP buckets.
- Cleanup status: latest strict product mega-flow proof was executed in this turn; compose stack was stopped with `pnpm dev:mvp:internal:down`; final `docker ps --format '{{.Names}}'` was empty.
- Last archived item: `NEWSPORTAL-RELEASE-READY-COMPLIANCE-CAPABILITY-STAGE-32`.
- Outcome: added the repo-owned non-deploy `pnpm release:verify` gate, production image content smoke and release verification wiring, then repaired deterministic MVP proof seed state so the full release gate completes against consistent canonical document state.
- Cleanup status: `pnpm release:verify` ran product-local cleanup/down; final `docker ps --format '{{.Names}}'` was empty; no commit/stage/branch action was performed.

### Known next candidates

- Optional next candidate: narrow profile/policy tuning for consistently weak matrix domains, then rerun `pnpm test:discovery:mega:compose`.
