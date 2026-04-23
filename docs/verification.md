# Verification

Этот документ определяет, что именно должно быть доказано, прежде чем работа может считаться завершенной.

Используй его для:

- proof policy;
- proof по work kind;
- proof по risk;
- gate taxonomy;
- close gate;
- capability-level completion proof;
- implementation-vs-operator completion logic;
- failure signals и rerun guidance;
- честного описания known proof gaps.

Не используй этот документ как raw command log.
Детали конкретного исполнения принадлежат `docs/work.md`, а machine-canonical top-level commands фиксируются в `.aidp/os.yaml`.
Если `docs/engineering.md` или subsystem contract doc требуют более сильного proof contour, этот документ не должен использоваться как оправдание для более слабой проверки.

## Почему этот файл важен

Code, который "выглядит готовым", не считается завершенным автоматически.
Репозиторий может развиваться по stages только тогда, когда каждая stage и каждая capability закрываются against real proof, а не against confidence.

## Базовая Proof Map для Репозитория

Используй канонические команды из `.aidp/os.yaml`, когда соответствующая capability включена.

### Static Proof

- `pnpm check:scaffold`
  Проверяет наличие обязательной monorepo-структуры верхнего уровня и корневых workspace-файлов.
- `pnpm lint`
  Проверяет root-level ESLint coverage для TS/Astro/infra scripts и Ruff coverage для Python services; для Python части требуется host-side установка `ruff` из `infra/docker/python.dev-requirements.txt` или эквивалентной среды.
- `pnpm build`
  Проверяет workspace build scripts для Node/TypeScript/Astro-пакетов и приложений, где такие scripts объявлены.
- `pnpm typecheck`
  Проверяет TypeScript и Astro type surfaces там, где объявлены соответствующие команды.

### Behavioral Proof

- `pnpm unit_tests`
  Запускает deterministic root-level unit suites: `node:test` + `tsx` для pure TS logic и `unittest` для pure Python helpers без DB/Redis/Docker dependency. На текущем baseline этот gate покрывает adaptive scheduler transitions, admin scheduling parsing, web-push subscription validation, user triage/story-update helper semantics, saved-digest rendering, Gemini usage parsing/cost helpers, notification-preference filtering helpers, digest cadence/timezone helpers, sequence-engine executor/registry semantics, а также adaptive discovery orchestrator/API/admin helper contracts для graph compilation, class-registry planning, custom-class extensibility, source profiling, contextual scoring, portfolio persistence и feedback/re-evaluation flows.
- `pnpm integration_tests`
  Канонический root-level behavioral gate. Сейчас это thin alias на `pnpm test:mvp:internal`: он поднимает canonical `compose.yml + compose.dev.yml` baseline с `.env.dev`, прогоняет ключевые relay/fetcher/worker smoke paths и поверх них доказывает internal MVP happy path: anonymous web bootstrap, allowlisted admin sign-in, RSS ingest, moderation audit, user triage (`new/seen/saved/follow`), `/saved` and `/following` surfaces, manual saved digest preview/export/email, scheduled digest settings/runtime delivery в локальный SMTP sink, `/notifications` HTML plus helpful/not_helpful feedback through a supported immediate-channel fixture, и absence of legacy per-article `email_digest` notification rows. Дополнительно этот gate проверяет browser-safe `303` + flash redirect semantics на Astro BFF paths `/bff/*` и `/admin/bff/*`, валидирует полный `Location` origin/pathname, подтверждает dedicated admin sign-in contract и preserved `next` redirects для logged-out `/admin/*` pages, проверяет split admin CRUD HTML for `/admin/channels`, `/admin/channels/new`, `/admin/templates/llm` и `/admin/templates/interests`, подтверждает, что nginx ingress оставляет `/api/*` за Python API, требует source-link proof для system-selected collection (`/collections/system-selected` должен отдавать source `url`, а user-facing collection HTML не должен уводить на `/articles/:doc_id/explain`), а после universal-content cutover также доказывает `/content/{content_item_id}` read surface, real preview-media/detail rendering и admin article enrichment retry flow. Immediate non-email alert delivery остается compose-smoke proof через `pnpm test:cluster-match-notify:compose`, а admin-managed per-user `user_interests` в этом gate по-прежнему обязаны compile-иться, давать fresh-ingest `interest_match`, и проходить historical backfill rematch without retro notification/suppression drift.
- `pnpm article:yield:diagnostics`
  Экспортирует repeatable diagnostics pack в `/tmp/newsportal-article-yield-*` из текущего compose PostgreSQL и фиксирует declared article-yield views: channel health, fetch outcome breakdown, pipeline backlog, article states, duplicate-url ratio, near-threshold rows, eligible rows, и ranked offender analysis.
- `pnpm article:yield:remediate -- --apply`
  Выполняет bounded future-only remediation на текущем compose PostgreSQL: пишет before/after diagnostics packs, sync-ит live interest templates к canonical bundle truth, применяет declared source-cohort changes без broad historical replay, и сохраняет explicit eligible-set comparison.
- `pnpm test:discovery:examples:compose`
  Выполняет один bounded DDGS-only live discovery run поверх canonical compose baseline для runtime-enabled discovery case packs. Сейчас обязательные live packs остаются `Example B` и `Example C`, но calibration/proof surface уже допускает дополнительные validation-only packs. Harness сначала требует зеленые `pnpm test:discovery-enabled:compose` и `pnpm test:discovery:admin:compose`, затем self-seed-ит proof-owned fixtures через те же admin-owned surfaces, которыми пользуется оператор (`interest_templates`, criteria / selection profiles, baseline `source_channels`, reusable `discovery_policy_profiles`), привязывает эти профили к graph mission и recall mission, а затем пишет `/tmp/newsportal-live-discovery-examples-<runId>.json|md` с раздельными `runtimeVerdict` / `yieldVerdict`, case-pack calibration summary, benchmark-like candidate evidence, `manualReplaySettings`, materialized profile metadata, applied profile version/policy snapshots, full per-pack funnel (`candidates_found`, `benchmark_like_candidates_found`, `candidates_approved_or_promoted`, `channels_onboarded`, downstream-evidence counters), normalized yield buckets (`candidate_not_valid`, `unsupported_provider_type`, `unsupported_challenge`, `browser_assisted_residual`, `below_auto_approval_threshold`, `below_auto_promotion_threshold`, `registration_failed`, `source_onboarded_no_match_yet`, `candidate_found_not_onboarded`), root-cause classification и aggregate yield diagnostics. `yield_weak` на этом уровне остается honest non-regression outcome, если runtime прошел, но live candidate set не дал достаточного onboarding/downstream signal.
  Current product-quality artifacts from this harness must also preserve stage-level loss and productivity diagnostics per case:
  - `stageLossBuckets`
  - `productivityBuckets`
  - additive candidate-level usefulness diagnostics from runtime `policyReview` (`onboardingVerdict`, `productivityRisk`, `usefulnessDiagnostic`, `stageLossBucket`, `sourceFamily`, `sourceShape`)
- `pnpm test:discovery:nonregression:compose`
  Выполняет repo-owned discovery safety proof поверх того же compose baseline: снимает frozen before-snapshot по pre-existing downstream corpus, требует static decoupling guard для discovery runtime files, затем запускает тот же live discovery harness в parent-owned mode (`DISCOVERY_EXAMPLES_SKIP_PREFLIGHT=1`, `DISCOVERY_EXAMPLES_SKIP_STACK_RESET=1`) so the parent proof owns stack lifecycle and preflight truth while the child harness owns only fixture seeding and runtime cases. После этого пишет `/tmp/newsportal-discovery-nonregression-<runId>.json|md` и доказывает отсутствие unexplained drift для pre-existing `interest_filter_results`, `final_selection_results`, `system_feed_results`, `llm_review_log` и `notification_log`. `pass_with_residuals` здесь означает `runtime=pass` + `nonRegression=pass` при сохранении honest `yield_weak`.
- `pnpm test:discovery:yield:compose`
  Выполняет repo-owned multi-run yield proof поверх того же harness: делает `3` bounded live run, требует `2/3` yield acceptance per runtime-enabled case pack, дополнительно gates the proof on repo-owned calibration agreement (`>= 0.80` per validation pack), пишет `/tmp/newsportal-live-discovery-yield-proof-<runId>.json|md`, и должен падать только как explicit good-yield proof failure (`yield_weak`/`fail`), а не как скрытая runtime regression. Как и non-regression contour, aggregate runner запускает child harness в parent-owned mode и читает artifact path через explicit pointer file instead of buffering compose logs through a pipe, чтобы nested proof orchestration не маскировала runtime truth. Aggregate artifact обязан сохранять per-pack pass-rate и root-cause drift over runs, чтобы следующий tuning stage можно было выбирать по evidence, а не по intuition.
- `node infra/scripts/run-live-website-outsourcing.mjs`
  Выполняет clean-baseline Example C outsourcing product proof поверх canonical local compose baseline. Artifact `/tmp/newsportal-live-website-outsourcing-<timestamp>.json|md` должен теперь сохранять не только coarse classification summary, но и normalized usefulness buckets:
  - `source_onboarded_but_no_extracted_resources`
  - `resources_extracted_but_no_stable_articles`
  - `articles_produced_but_zero_selected_outputs`
  - `selected_useful_evidence_present`
  Current proof truth also expects the artifact to preserve technical-noise attribution explicitly:
  - `interestFilterReasonCounts.wrapper_directory_noise`
  - site-level `resources_extracted_but_no_stable_articles` when all projected rows on a source are rejected as technical wrapper/category noise before semantic usefulness can be established
  Этот contour используется как downstream/product diagnostics evidence for discovery tuning; если основной loss концентрируется в `articles_produced_but_zero_selected_outputs`, follow-up должен открываться как downstream selection capability, а не маскироваться под discovery-runtime regression.

### Delivery Proof

- Root-level package или deploy gate сейчас отдельно не объявлены.
- Для packaging/deployment/migration/environment work используй relevant delivery commands и validation steps, если конкретный work item их вводит или меняет.

### Boundary Proof

Используй focused checks, которые соответствуют затронутым boundaries из `docs/blueprint.md`, `docs/engineering.md` и subsystem contract docs.

### Multi-RSS Targeted Proof

- `pnpm test:ingest:multi:compose`
  Compose-backed deterministic proof для 24 synthetic RSS feeds. Доказывает RSS-only путь `admin -> source_channels -> fetchers -> relay -> workers`, bounded-concurrency scheduler behavior, channel-level failure isolation, idempotent refetch, `next_due_at`-aware second fetch и 304 handling.
- `pnpm test:ingest:soak:compose`
  Отдельный heavier compose-backed soak для 60 synthetic RSS feeds. Используется как non-PR proof для realistic dozens-of-feeds baseline поверх того же admin/bulk/channel-state contract и подтверждает stable second-cycle behavior на dozens-of-feeds batch.
- `node --import tsx services/fetchers/src/cli/test-rss-smoke.ts --duplicate-preflight-only`
  Focused RSS smoke для fetcher duplicate-preflight. Доказывает повторный poll одной RSS-ленты без новых `articles` / article outbox rows и не зависит от более широких worker-side `canonical_doc_id` / `family_id` assertions.
- `node infra/scripts/test-rss-multi-flow.mjs --channel-count=24 --profiles=healthy,duplicate`
  Focused compose proof для fetcher duplicate-preflight. Доказывает repeated-200 duplicate suppression на 24 RSS channels without coupling stage closeout to unrelated `not_modified` / `304` fixture expectations.

### Subsystem-specific Smoke Matrix

| Зона | Команда | Предпосылки | Что доказывает |
|---|---|---|---|
| Relay migrations | `pnpm test:migrations:smoke` | Доступный PostgreSQL | Миграционный слой relay может применить ожидаемую схему. |
| Relay routing (host) | `pnpm test:relay` | Доступные PostgreSQL и Redis | Базовый outbox-to-queue routing работает в локальном host path. |
| Relay phase 3 (host) | `pnpm test:relay:phase3` | Доступные PostgreSQL и Redis | Дополнительный routing path для phase-3 workloads проходит локально. |
| Relay routing (compose) | `pnpm test:relay:compose` | Поднятый `relay` в Docker Compose | Relay smoke работает в baseline compose-окружении. |
| Relay phase 3 (compose) | `pnpm test:relay:phase3:compose` | Поднятый `relay` в Docker Compose | Phase-3 routing path проходит в compose baseline. |
| Relay phase 4/5 (compose) | `pnpm test:relay:phase45:compose` | Поднятый `relay` в Docker Compose | Маршрутизация phase-4/5 очередей и событий проходит в compose baseline. |
| Fetchers ingest smoke | `pnpm test:ingest:compose` | Поднятые `fetchers`, `relay`, `worker`, PostgreSQL и Redis в Docker Compose | RSS ingest path проходит через fetcher, outbox, relay и worker pipeline. |
| Channel auth smoke | `pnpm test:channel-auth:compose` | Поднятые `fetchers`, `relay`, `worker`, PostgreSQL и Redis в Docker Compose | Deterministic protected-source proof для per-channel static `Authorization` header: protected RSS truthfully hard-fails on `401/403` without auth, succeeds with auth, keeps `429` as `rate_limited`, protected website discovery requires the header, and browser-assisted same-origin requests receive it without cross-origin leakage. |
| Website ingest smoke | `pnpm test:website:compose` | Поднятые `fetchers`, `relay`, `worker`, PostgreSQL и Redis в Docker Compose | Deterministic website path на isolated local fixture сохраняет `website` provider truth, discovers `web_resources` через sitemap/feed/collection/download modes, reuses upstream conditional-request validators on repeat polls, persists `channel_fetch_runs.provider_metrics_json`, runs typed resource extraction with classifier/body-uplift telemetry, and projects editorial resources back into `articles` without hidden-feed auto-conversion into RSS. |
| Web responsive/browser acceptance | `pnpm test:web:viewports` | Валидные `FIREBASE_WEB_API_KEY` и `ADMIN_ALLOWLIST_EMAILS`; script сам поднимает local compose baseline when needed | Browser-based web-only smoke seeds truthful user/admin fixtures, validates desktop `1440x900`, tablet `820x1180`, and mobile `390x844` across `/`, `/matches`, `/content/{content_item_id}`, `/saved`, `/saved/digest`, `/following`, `/interests`, `/settings`, and `/notifications`, and asserts visible primary actions, truthful collapsed-nav behavior below `lg`, plus absence of obvious horizontal overflow for the main interactive controls. |
| Website admin/operator acceptance | `pnpm test:website:admin:compose` | Валидные `FIREBASE_WEB_API_KEY` и `ADMIN_ALLOWLIST_EMAILS`; script сам поднимает local compose baseline when needed | Real admin/BFF flow creates a website channel, deterministic website polling persists truthful `web_resources` acquisition rows plus projection diagnostics, `/maintenance/web-resources*` stays truthful, `/admin/resources*` renders list/detail drilldown, and website provider truth is preserved without hidden-feed RSS auto-conversion. The same smoke also proves dedicated admin create/edit flows for `api` and `email_imap` channels. The smoke must stay self-contained after `pnpm integration_tests` tears the stack down. |
| Automation admin/operator acceptance | `node infra/scripts/test-automation-admin-flow.mjs` | Валидные `FIREBASE_WEB_API_KEY` и `ADMIN_ALLOWLIST_EMAILS`; script rebuilds the bounded automation compose services before exercising the stack | Real admin/BFF flow signs in through the admin app, preflights the shipped workflow workspace on `/automation`, creates/updates/archives a sequence, requests a manual run, proves pending-run cancel behavior, verifies the dedicated executions route, and checks recent outbox visibility against the current multi-route operator UX. |
| MCP admin/operator acceptance | `pnpm test:mcp:compose` | Валидные `FIREBASE_WEB_API_KEY` и `ADMIN_ALLOWLIST_EMAILS`; compose baseline with `admin`, `api`, `mcp`, `nginx`, PostgreSQL, and Redis available | Canonical deterministic HTTP-only MCP matrix: admin signs in and issues scoped tokens from `/automation/mcp`, nginx `/mcp` serves `GET` plus JSON-RPC discovery methods, every shipped tool/resource/prompt is exercised through realistic operator scenarios, expired/revoked/malformed auth and destructive-policy failures are asserted over HTTP, and request/audit evidence is confirmed without bypassing runtime owners. |
| MCP HTTP auth rerun | `pnpm test:mcp:http:auth` | Те же предпосылки, что и у `pnpm test:mcp:compose` | Focused deterministic rerun for MCP token issuance, inventory truth, and expiry/revoke auth behavior. |
| MCP HTTP read matrix | `pnpm test:mcp:http:reads` | Те же предпосылки, что и у `pnpm test:mcp:compose` | Focused deterministic rerun for MCP protocol discovery, shipped resources/prompts, read-only operator surfaces, and doc-parity coverage. |
| MCP HTTP write matrix | `pnpm test:mcp:http:writes` | Те же предпосылки, что и у `pnpm test:mcp:compose` | Focused deterministic rerun for sequence, discovery, template, interest, channel, policy, and audit/write flows. |
| MCP HTTP discovery-heavy rerun | `pnpm test:mcp:http:discovery` | Те же предпосылки, что и у `pnpm test:mcp:compose` | Focused deterministic rerun for the discovery-heavy MCP flows plus downstream read verification and doc-parity assertions. |
| MCP HTTP live/provider evidence | `pnpm test:mcp:http:live` | Валидные `FIREBASE_WEB_API_KEY` и `ADMIN_ALLOWLIST_EMAILS`; compose baseline with outbound provider/runtime access available | Supplemental HTTP-only MCP evidence: issue a live operator token, read prompts/resources/observability through `/mcp`, run a bounded sequence through runtime owners, execute profile-backed graph and recall discovery journeys against live-like domains, and write `/tmp/newsportal-mcp-http-live-*.json|md` with implementation-vs-external-vs-yield verdict classification instead of treating all weak external yield as a hard regression. |
| Discovery admin/operator acceptance | `pnpm test:discovery:admin:compose` | Валидные `FIREBASE_WEB_API_KEY` и `ADMIN_ALLOWLIST_EMAILS`; compose baseline with PostgreSQL/Redis/admin/worker/api available | Real admin/BFF flow signs in through the admin app, preflights `/discovery`, creates or updates reusable discovery profiles including structured `supportedWebsiteKinds`, attaches them to graph and recall missions, archives/reactivates/deletes disposable profile fixtures, creates or updates class/mission state, archives/reactivates mission and class rows, hard-deletes disposable mission/class fixtures, compiles the mission graph, requests a mission run, reviews a seeded candidate, submits feedback plus re-evaluation, and now proves recall mission acquisition plus recall-candidate promotion directly through `/admin/discovery` instead of maintenance-only fallback. On the default `DISCOVERY_ENABLED=0` baseline this proof only requires the run request to complete as a truthful control-plane short-circuit; provider-backed discovery execution remains the responsibility of `pnpm test:discovery-enabled:compose`. |
| Browser-assisted hard-site smoke | `pnpm test:hard-sites:compose` | Поднятые `fetchers`, `relay`, `worker`, PostgreSQL и Redis в Docker Compose | Deterministic local hard-site proof shows cheap static discovery missing the JS-heavy fixture, fetchers-owned browser assistance recommending and discovering it with browser provenance, same-origin browser auth injection staying bounded, truthful `browserRecommended/browserAttempted/browserOnlyAcceptedCount` telemetry persistence, normal `web_resources` plus smoke-owned outbox/sequence handoff still working, and unsupported login/CAPTCHA-style blocks failing explicitly without hidden bypass logic. |
| Extractus enrichment smoke | `pnpm test:enrichment:compose` | Поднятые `fetchers`, `relay`, `worker`, PostgreSQL и Redis в Docker Compose | Extractus-backed article enrichment проходит локально: short-body full extraction, long-body skip, non-fatal failure continuation, enrichment-owned media persistence и downstream normalize continuity. |
| Fetchers multi-RSS flow (compose) | `pnpm test:ingest:multi:compose` | Docker Compose access, локальный fixture server, валидные `FIREBASE_WEB_API_KEY` и `ADMIN_ALLOWLIST_EMAILS` | Full RSS-only path `admin -> source_channels -> fetchers -> relay -> workers` проходит на 24 synthetic feeds, включая `duplicate`, `not_modified`, `invalid_xml` и `timeout` profiles. |
| Fetchers multi-RSS soak (compose) | `pnpm test:ingest:soak:compose` | Те же предпосылки, что и у `pnpm test:ingest:multi:compose` | Тот же path выдерживает 60 synthetic feeds без batch abort, со stable article counts после second fetch cycle. |
| Worker normalize/dedup (host) | `pnpm test:normalize-dedup:smoke` | Доступные PostgreSQL и Redis | Базовый worker path для normalize/dedup исполняется локально. |
| Worker normalize/dedup (compose) | `pnpm test:normalize-dedup:compose` | Поднятый `worker` в Docker Compose | Тот же путь работает в compose baseline. |
| Worker embed (host) | `pnpm test:embed:smoke` | Доступные PostgreSQL и Redis, нужные Python dependencies | Embed pipeline исполняется локально. |
| Worker embed (compose) | `pnpm test:embed:compose` | Поднятый `worker` в Docker Compose | Embed pipeline проходит в compose baseline. |
| Interest compile | `pnpm test:interest-compile:smoke` / `pnpm test:interest-compile:compose` | Локальная или compose-среда с DB/Redis | Compiled interest path работает и обновляет derived state корректно. |
| Criterion compile | `pnpm test:criterion-compile:smoke` / `pnpm test:criterion-compile:compose` | Локальная или compose-среда с DB/Redis | Compiled criterion path работает и обновляет derived state корректно. |
| Cluster/match/notify | `pnpm test:cluster-match-notify:smoke` / `pnpm test:cluster-match-notify:compose` | Локальная или compose-среда с DB/Redis | Event clustering, matching и notify chain выполняются end-to-end на доступном baseline. |
| Article LLM budget stop | `pnpm test:llm-budget-stop:smoke` / `pnpm test:llm-budget-stop:compose` | Локальная или compose-среда с DB/Redis и worker runtime env | Queued article criterion reviews stop at the monthly hard cap without a provider call, do not write a fake extra `llm_review_log` row, resolve gray-zone rows by policy, and keep `system_feed_results` out of `pending_llm`. |
| Historical reindex/backfill | `PYTHONPATH=. python -m services.workers.app.smoke reindex-backfill` | Локальная или compose-среда с DB/Redis и актуальными migrations | Reindex rebuilds the derived interest index, rematches already persisted articles without duplicating match rows, records stable `processedArticles/totalArticles` from a frozen target snapshot, keeps retro-notification delivery suppressed during DB repair, and proves the optional enrichment-enabled repair path records truthful `enriched`/`skipped` state plus persisted full-content/media side effects. |
| Index consistency | `pnpm index:check:interest-centroids` / `pnpm index:check:event-cluster-centroids` | Актуальные данные и derived index directories | Derived centroid registries не дрейфуют относительно ожиданий. |

## Gate Taxonomy

### Fast Gate

Smallest honest local proof для обычной итерации.
Обычно это static check и узкая targeted behavioral проверка.

### Structural Gate

Используй, когда меняются boundaries, refactors, shared contracts или coordination-sensitive areas.
Он должен доказывать, что структура не деградировала, а не только то, что один path все еще запускается.

### Runtime Smoke Gate

Используй, когда важен real runtime flow в среде, близкой к реальному использованию.
Он должен доказать, что система стартует, рендерит или проходит минимальный живой flow.

### Delivery Gate

Используй, когда меняются packaging, deployment, migrations или environment delivery behavior.
Он должен доказать, что систему можно реально доставить в нужной форме.

### Release Gate

Используй, когда работа готовит releasable build или promotion-ready state.
Он должен покрывать release-critical expectations.

Используй smallest truthful contour, который соответствует риску и boundary. Fast gate не заменяет structural, delivery или runtime smoke gate, если работа объективно требует большего.

## Proof по Work Kind

### Stage

Должен доказать, что конкретный implementation slice работает и не ломает соседние boundaries. Если stage является частью capability, закрывается только stage-level completion, пока не выполнено capability completion condition.

### Patch

Должен доказать, что локальная коррекция работает и не расширилась в undeclared areas.

### Sweep

Должен доказать, что cross-cutting change последовательно применен ко всем declared touched areas.

### Spike

Должен доказать findings, feasibility, constraint или причину отказаться от implementation. Spike может завершиться без shipping code, но не без evidence.

## Proof по Risk

### Low Risk

Используй targeted local proof, привязанный к затронутой области.

### Medium Risk

Используй:

- хотя бы одну static check или build/typecheck проверку, если они применимы;
- targeted behavioral proof по затронутой логике;
- boundary-aware proof, если меняются write path, contracts или service interaction.

### High Risk

Используй:

- полный релевантный gate-набор из доступных команд;
- одну или несколько behavioral/smoke проверок по реальному пути данных;
- явную проверку затронутых boundaries;
- delivery или runtime proof, если они релевантны;
- честную фиксацию residual gaps.

## Gate Selection Guidance

Выбирай proof по touched boundaries, а не только по количеству измененных файлов.

Практический baseline:

- local low-risk change -> fast gate;
- refactor или boundary-sensitive change -> structural gate;
- releasable build или promotion work -> release gate;
- packaging, deployment, migration или environment delivery work -> delivery gate;
- startup, loading, integration или real execution confidence -> runtime smoke gate.

Если релевантно несколько контуров, комбинируй их честно.

Для dashboard/collection/listing contract changes минимум включает reconciliation proof:

- summary KPI, который описывает system-selected collection backlog, должен быть сверяем с paginated collection `total` на одном и том же локальном dataset;
- labels вроде `today`, `24h`, `active` не считаются доказанными, если backend semantics и UI wording расходятся.
- для staged pagination rollout каждый upgraded list endpoint должен отдельно доказать `page/pageSize/total/totalPages/hasNext/hasPrev` и overrange empty-page semantics на live dataset, а не только на unit mocks.
- если rollout временно сохраняет legacy raw callers без `page/pageSize`, нужна явная compatibility proof, пока все consumers не будут переведены на paginated contract.
- capability closeout для listing-consistency также должен доказать, что user-facing wording больше не называет system-selected записи `published`, `feed`, или `matched-only`, если runtime truth на этом read model включает `matched` и `notified`.
- для historical reindex/backfill минимум включает duplicate-safe proof для `criterion_match_results` / `interest_match_results`, явную проверку, что repair mode не рассылает retro-notifications, и proof того, что `processedArticles <= totalArticles` держится на frozen target snapshot, а не на mutable live scan.
- если historical reindex/backfill prepend-ит article enrichment, proof должен дополнительно подтвердить conservative target selection for editorial `articles`, отсутствие silent rerun для already `enriched` rows без explicit force, truthful `enriched`/`skipped` persistence, сохранность feed-media/full-content side effects и отсутствие `notify` stage в historical mode.
- для staged system-first matching contract changes минимум включает targeted proof того, что `system_feed_results` truthfully follows criterion outcomes: `pass_through` when no criteria were evaluated, `pending_llm` while criterion gray-zone review is unresolved, `eligible` after at least one surviving criterion, and `filtered_out` when all evaluated criteria are irrelevant.
- для article-side gray-zone LLM budget/hard-stop changes минимум включает targeted proof того, что `LLM_REVIEW_ENABLED=0` и exhausted `LLM_REVIEW_MONTHLY_BUDGET_CENTS` оба не оставляют criterion rows/system gate в `pending_llm`: fresh ingest и replay должны truthfully resolve to `relevant` / `irrelevant` by policy, skip the external provider call, avoid writing a fake new `llm_review_log` row, and surface the same budget state through `/maintenance/llm-budget-summary`, `/dashboard/summary`, and admin observability/dashboard snapshots.
- для criteria-gated clustering contract changes минимум включает routing proof для `article.embedded -> criteria`, release proof того, что только финальный `eligible`/`pass_through` system gate публикует `article.criteria.matched -> cluster`, и downstream proof того, что только `article.clustered` запускает `user_interests`, тогда как `filtered_out` статьи truthfully skip both cluster and personalization lanes.
- для collection/UI rollout поверх system-first matching минимум включает proof того, что `/collections/system-selected`, `/content-items`, и summary surfaces derive eligibility from persisted selection truth, а не от `articles.processing_state`; на текущем stage-4 baseline это означает `final_selection_results` first with `system_feed_results` fallback while rows are still materializing.
- для canonical-review reuse и duplicate-heavy editorial families минимум включает targeted proof того, что один `canonical_document_id + criterion_id` не создает повторный criterion-scope `llm_review_log` verdict по умолчанию, а duplicate article rows reuse-ят уже существующий canonical review verdict с явной explain metadata вместо нового provider call.
- для canonical-first selected/read semantics минимум включает proof того, что user/operator selected-content surfaces и selection-gate fallbacks не трактуют duplicate article rows одного canonical сигнала как независимых selected winners, даже если article-level `final_selection_results` / `system_feed_results` rows сохраняются ради provenance.
- если `processed total` / `processed 24h` semantics расширяются от `processing_state` к final system-gate truth, proof должен включать live reconciliation между `/dashboard/summary` и прямым DB count на том же dataset после reload затронутого API runtime, а не только unit-assert на SQL string.
- если historical backfill теперь поддерживает derived article-level gate/read models вроде `final_selection_results` / `system_feed_results`, proof должен подтверждать, что replay keeps those derived rows in sync alongside `criterion_match_results` / `interest_match_results`, still without retro-notifications.
- если baseline runtime отключает interest-scope gray-zone LLM review, proof должен явно подтвердить, что fresh ingest больше не enqueue-ит этот scope по умолчанию, а historical backfill сохраняет `interestLlmReviews = 0`.
- для admin auth/CRUD contract changes минимум включает redirect unit coverage плюс runtime proof для logged-out redirect на dedicated sign-in и signed-in HTML checks на затронутых list/create/edit screens под прямым app path и/или nginx-shaped `/admin` ingress.
- для admin on-behalf `user_interests` contract changes минимум включает targeted TS/unit coverage для target-user lookup semantics, audited mutation payloads и compile-request queue emission; отдельная manage-page/runtime proof может закрываться следующим UX stage, если текущий slice еще не surfaced в HTML.
- для capability closeout вокруг real admin-managed `user_interests` нужен end-to-end compose proof: operator-created interest must compile, fresh ingest must create the targeted `interest_match`, historical backfill must add or preserve the same match without creating retro notification/suppression drift, and any removed immediate channel semantics must be covered truthfully by the surrounding gate instead of silently reusing legacy `email_digest` expectations.
- для shared `packages/ui` или app Tailwind source contract changes минимум включает build каждой затронутой Astro app и targeted compiled-artifact check, подтверждающий, что representative shared utility selectors/values действительно попали в конечный bundle, а не остались только в source strings.
- для additive Universal Task Engine foundation без relay cutover минимум включает `pnpm unit_tests`, `pnpm typecheck`, targeted queue-contract coverage и executor unit proof для lifecycle, `_stop`, retry и timeout behavior; relay routing и runtime smoke становятся обязательными только в stage, который реально меняет default routing или worker startup.
- для additive Universal Task Engine relay prep без live switch минимум включает `pnpm unit_tests`, `pnpm typecheck`, targeted relay routing proof для active sequence lookup / run creation / `q.sequence` payloads и явную проверку, что default runtime flag все еще не включает sequence routing по умолчанию.
- для additive Universal Task Engine cron/agent integration без cutover минимум включает `pnpm unit_tests`, targeted Python proof для cron parsing, minute-based due-sequence polling/bootstrap, dispatch-failure handling, sequence-job payload processing и internal agent draft-sequence create/run contracts, плюс явную проверку, что worker default flags все еще не включают sequence runner или cron scheduler по умолчанию.
- для финального Universal Task Engine cutover минимум включает `pnpm unit_tests`, `pnpm typecheck`, `pnpm test:migrations:smoke`, relay compose proof для foundation + sequence-managed phase routes, RSS ingest compose smoke, worker compose smokes (`normalize-dedup`, `interest-compile`, `criterion-compile`, `cluster-match-notify`) и явную проверку, что default runtime suppress-ит legacy intermediate article fanout вместо прежнего direct queue ownership.
- если umbrella `pnpm integration_tests` после этих cutover-specific gates падает в unrelated surface вне sequence/runtime boundary, такой failure можно оставить как residual gap только при явной фиксации того, что именно sequence cutover уже доказан и какой follow-up item нужен для оставшегося failure.
- для adaptive discovery cutover минимум включает `pnpm unit_tests`, `pnpm typecheck`, `pnpm test:migrations:smoke`, targeted Python coverage для graph compilation, mission/class archive-delete guards, registry-driven class loading, custom-class add/archive/delete flows, hypothesis planning, source profiling, contextual scoring, portfolio ranking, feedback ingestion, re-evaluation и source-registration discipline, плюс targeted TS coverage для discovery SDK, admin BFF payload normalization и graph/class/profile/portfolio admin surfaces.
- shipped `C-DISCOVERY-PROFILES-ADMIN` minimum now includes additive schema proof for `discovery_policy_profiles` plus mission/recall `profile_id`, `applied_profile_version`, and `applied_policy_json`, targeted TS/Python coverage for profile CRUD payloads and structured explainability mapping, `pnpm test:migrations:smoke`, `pnpm test:discovery:admin:compose`, one fresh `pnpm test:discovery:examples:compose` run to confirm profile-capable code keeps discovery runtime green and emits manual replay snapshots, `pnpm test:discovery:nonregression:compose`, and `git diff --check --` on touched capability files.
- capability closeout для adaptive discovery дополнительно требует `python -m py_compile services/workers/app/smoke.py`, `pnpm test:relay:compose`, `pnpm test:ingest:compose`, `pnpm test:discovery-enabled:compose` и `pnpm integration_tests`; enabled-runtime compose smoke обязан оставаться bounded fake-provider/local-harness proof even after the cutover and must not be treated as uncontrolled real-internet validation.
- discovery migration smoke is now expected to assert the full discovery core rather than only the later additive layers: `discovery_missions`, `discovery_hypothesis_classes`, `discovery_hypotheses`, `discovery_source_profiles`, `discovery_candidates`, `discovery_source_interest_scores`, `discovery_portfolio_snapshots`, `discovery_feedback_events`, `discovery_strategy_stats`, `discovery_cost_log`, their representative indexes/columns, and the critical FK bridge back into pre-existing 0016 tables.
- для Extractus parser/enrichment capability минимум включает `pnpm unit_tests`, `pnpm typecheck`, `pnpm test:migrations:smoke`, `pnpm test:enrichment:compose` и `pnpm integration_tests`; proof должен покрыть extractus parsing for RSS/ATOM/JSON Feed, pre-normalize enrichment success/skip/failure, enrichment-owned media persistence, `/article/{doc_id}` read surface, admin retry path и явную сохранность sequence-first truth без нового default trigger `article.enriched` или fetchers-owned queue consumer.
- для future-only article-yield remediation capability минимум включает `pnpm article:yield:diagnostics`, `pnpm article:yield:remediate -- --apply`, `pnpm unit_tests`, `pnpm typecheck`, `pnpm test:enrichment:compose`, rebuild/restart затронутого fetchers runtime если менялся live fetchers code, и один fresh poll-window check на текущем compose stack; closeout proof должен явно показать before/after article-yield baseline, no-growth или reduction для pending `article.ingest.requested`, и отсутствие мутации previously eligible set during remediation apply.
- для website scraping contract changes минимум включает targeted TS/unit proof for conditional-request and browser/static metric logic, `pnpm test:migrations:smoke`, `pnpm test:website:compose`, `pnpm test:hard-sites:compose`, `pnpm test:channel-auth:compose`, `pnpm test:website:admin:compose`, `pnpm test:enrichment:compose`, и rebuild/restart затронутого local fetchers runtime before any bounded live-site validation when the compose stack is long-lived.
- если work item explicitly requires bounded live-site validation for `website`, that pass must record at least one of: `provider_metrics_json`, classification transitions, editorial extractor/body-uplift telemetry, or explicit external residuals; live-site findings may uncover real runtime bugs, but they supplement rather than replace the deterministic compose gates above.
- canonical repo-owned bounded live-site runner for that explicit case is now `node infra/scripts/test-live-website-matrix.mjs`; it should execute only after the deterministic website-only compose proof is green, should write a `/tmp/newsportal-live-website-matrix-<runId>.json` evidence bundle, and must classify any remaining failures as implementation issue vs external/runtime residual instead of silently folding them into generic pass/fail language. Focused reruns may narrow the matrix with `--group=<groupKey>` and/or `--site=<candidateName>` when the full pass surfaces a small number of real-site residuals that need truthful reclassification.
- для zero-shot interest filtering cutover capability первый design-contract stage минимум включает required-read-order reload, sync `docs/contracts/zero-shot-interest-filtering.md` plus touched truth layers, и targeted consistency proof for references and formatting.
- для universal configurable selection profiles capability первый design-contract stage минимум включает required-read-order reload, sync `docs/contracts/universal-selection-profiles.md` plus touched truth layers, и targeted consistency proof for references and formatting.
- shipped `STAGE-1-PROFILE-CONFIG-MODEL-AND-COMPATIBILITY-MAPPING` минимум требует targeted proof for the current template/criteria-to-profile compatibility mapping, `pnpm unit_tests`, `pnpm typecheck`, and `git diff --check --` on touched stage files; proof must explicitly show that existing `final_selection_results` ownership remains intact and that current domain semantics become explicit config instead of hidden engine truth.
- shipped proof for `STAGE-1-PROFILE-CONFIG-MODEL-AND-COMPATIBILITY-MAPPING` should additionally include `pnpm test:migrations:smoke` whenever this stage introduces or changes additive profile-config schema.
- shipped `STAGE-2-CHEAP-PROFILE-SCORING-AND-HOLD-POLICY` минимум требует targeted Python coverage for profile evaluation and hold-policy logic, `pnpm unit_tests`, `pnpm typecheck`, `pnpm test:cluster-match-notify:compose`, and `git diff --check --` on touched stage files; proof must explicitly show that cheap `hold` remains the default unresolved path and that LLM review is invoked only for profile policies that explicitly opt into it.
- shipped `STAGE-3-FINAL-SELECTION-POLICY-CUTOVER` минимум требует targeted Python/API proof for profile-driven final selection, `pnpm unit_tests`, `pnpm typecheck`, `pnpm test:cluster-match-notify:compose`, and `git diff --check --` on touched stage files; proof must explicitly cover `final_selection_results` derivation from profile runtime outcomes, explicit separation between `llmReviewPending` and cheap `hold`, compatibility projection behavior, and preserved `system-selected collection` truth.
- `STAGE-4-EXPLAIN-AND-OPERATOR-TUNING-SURFACES` минимум требует targeted Python/TS proof for article/content explain payloads plus admin operator-surface helpers, `pnpm unit_tests`, `pnpm typecheck`, and `git diff --check --` on touched stage files; proof should explicitly cover human-readable selection summaries plus generic diagnostics payloads when this stage centralizes explain/tuning data into API/operator surfaces. Add `pnpm test:cluster-match-notify:compose` only when this stage changes runtime selection semantics rather than read/explain projection only.
- `STAGE-5-MIGRATION-BACKFILL-AND-COMPATIBILITY-CLOSEOUT` минимум требует targeted Python/TS proof for historical repair/backfill compatibility behavior plus maintenance/read-model projection, `pnpm unit_tests`, `pnpm typecheck`, and `git diff --check --` on touched stage files; add `pnpm test:reindex-backfill:compose` when this stage changes replay semantics rather than only surfacing already-produced backfill metadata. Proof must explicitly cover `selectionProfileSnapshot` provenance for `backfill` / `repair` jobs once that metadata lands and show that compatibility closeout does not break current selected-content truth.
- universal configurable selection-profiles capability closeout минимум требует `pnpm unit_tests`, `pnpm typecheck`, `pnpm test:reindex-backfill:compose`, and targeted consistency proof for synced runtime/process docs. Capability closeout must explicitly show that additive `selection_profiles`, cheap `hold`, normalized `selection_*` operator payloads, and replay/profile provenance all coexist without reintroducing mandatory LLM review or hidden compatibility ownership.
- shipped `STAGE-1-CANONICAL-DOCUMENT-AND-OBSERVATION-LAYER` минимум требует `pnpm test:migrations:smoke`, `pnpm unit_tests`, `pnpm typecheck`, and `pnpm test:ingest:compose`; the compose proof must explicitly cover that RSS ingest now persists `document_observations` and materializes `canonical_documents` alongside the existing `articles` path without changing current `system_feed_results` truth.
- shipped `STAGE-2-DUPLICATE-STORY-CLUSTERING-AND-VERIFICATION` минимум требует `pnpm test:migrations:smoke`, `pnpm unit_tests`, `pnpm typecheck`, and `pnpm test:cluster-match-notify:compose`; proof must explicitly cover additive `story_clusters` / `story_cluster_members` / `verification_results`, canonical-document plus story-cluster verification rows, and continued legacy `event_clusters` / `system_feed_results` compatibility on the compose path.
- shipped `STAGE-3-ZERO-SHOT-INTEREST-FILTER-SPLIT` минимум требует `pnpm test:migrations:smoke`, `pnpm unit_tests`, `pnpm typecheck`, `pnpm test:interest-compile:compose`, and `pnpm test:cluster-match-notify:compose`; proof must explicitly cover additive `interest_filter_results`, explicit `technical_filter_state` / `semantic_decision` / verification snapshot rows for both system criteria and user interests, and continued legacy `criterion_match_results` / `interest_match_results` / `system_feed_results` compatibility on the compose path.
- shipped `STAGE-4-FINAL-SELECTION-READ-MODEL-CUTOVER` минимум требует `pnpm test:migrations:smoke`, `pnpm unit_tests`, `pnpm typecheck`, and `pnpm test:cluster-match-notify:compose`; the stage should also attempt `pnpm integration_tests`, but if that broad gate fails on unrelated mixed-worktree RSS/canonical smoke drift the failure must be recorded explicitly as a residual outside the stage-4 boundary. Proof must explicitly cover additive `final_selection_results`, compatibility projection into `system_feed_results`, and final-selection-first read behavior for `/collections/system-selected`, `/content-items`, dashboard summary, and admin article explain surfaces.
- shipped `STAGE-5-DISCOVERY-SOURCE-SCORING-DECOUPLING` минимум требует `pnpm unit_tests`, `pnpm typecheck`, and `pnpm test:discovery-enabled:compose`; proof must explicitly cover that discovery/source-scoring no longer reads downstream selected-content outcomes like `system_feed_results` / `final_selection_results`, while discovery planning, score persistence, and portfolio snapshots still function on the compose baseline.
- `STAGE-0-INDEPENDENT-RECALL-DESIGN-CONTRACT` минимум требует required-read-order reload, sync [`docs/contracts/independent-recall-discovery.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/independent-recall-discovery.md) plus touched truth layers, и targeted consistency proof for references and formatting.
- `STAGE-0-MCP-DESIGN-CONTRACT` минимум требует required-read-order reload, sync [`docs/contracts/mcp-control-plane.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/mcp-control-plane.md) plus touched truth layers, и targeted consistency proof for references and formatting.
- shipped `STAGE-1-INDEPENDENT-RECALL-QUALITY-FOUNDATION` минимум требует `pnpm unit_tests`, `pnpm typecheck`, `pnpm test:migrations:smoke`, targeted Python proof for generic recall/source-quality scoring plus discovery persistence, и targeted API proof for `/maintenance/discovery/source-quality-snapshots*` read surfaces. Proof must explicitly cover additive `discovery_source_quality_snapshots`, worker-side materialization during discovery execution/re-evaluation, and continued separation between generic recall quality and mission-fit `discovery_source_interest_scores`.
- shipped `STAGE-2-INDEPENDENT-RECALL-MISSION-AND-CANDIDATE-LAYER` минимум требует `pnpm unit_tests`, `pnpm typecheck`, `pnpm test:migrations:smoke`, `python -m py_compile` for touched Python API/tests, targeted Python API proof for recall mission/candidate CRUD plus canonical-domain source-profile linkage, and `git diff --check --` on touched stage files. Proof must explicitly cover additive `discovery_recall_missions` / `discovery_recall_candidates`, maintenance read/write surfaces for `/maintenance/discovery/recall-missions*` and `/maintenance/discovery/recall-candidates*`, latest-source-quality joins on recall candidate reads, and continued separation from graph-first promotion into `source_channels`.
- shipped `STAGE-3-INDEPENDENT-RECALL-ACQUISITION-LOOPS` минимум требует `python -m py_compile` for touched Python worker/API/tests, targeted Python proof for bounded recall-first acquisition orchestration plus API delegation, `pnpm unit_tests`, `pnpm typecheck`, and `git diff --check --` on touched stage files. Proof must explicitly cover additive recall-first acquisition without `interest_graph`, bounded `rss` / `website` probing into `discovery_recall_candidates`, reuse of shared `discovery_source_profiles`, materialization of `discovery_source_quality_snapshots` with `snapshot_reason = recall_acquisition`, and continued separation from source-channel promotion into `source_channels`.
- shipped `STAGE-4-INDEPENDENT-RECALL-PROMOTION-CUTOVER` минимум требует `pnpm test:migrations:smoke`, `python -m py_compile` for touched Python API/tests, targeted Python proof for recall-candidate promotion and source-channel onboarding discipline, `pnpm unit_tests`, `pnpm typecheck`, and `git diff --check --` on touched stage files. Proof must explicitly cover additive `registered_channel_id` persistence on `discovery_recall_candidates`, `POST /maintenance/discovery/recall-candidates/{recall_candidate_id}/promote`, reuse of `PostgresSourceRegistrarAdapter` plus `source.channel.sync.requested`, source-profile channel linkage after promotion, and continued separation from graph-first mission planning.
- shipped `STAGE-5-INDEPENDENT-RECALL-OBSERVABILITY-AND-COMPATIBILITY-CLEANUP` минимум требует `python -m py_compile` for touched Python API/tests, targeted TS/Python proof for discovery operator helpers plus read-model wording, `pnpm unit_tests`, `pnpm typecheck`, and `git diff --check --` on touched stage files. Proof must explicitly cover promoted/duplicate recall-candidate counts in discovery summary, latest generic source-quality snapshot fields on source-profile reads, and operator/admin/help wording that separates mission fit, generic source quality, neutral recall backlog, and recall-promotion state.
- the independent-recall capability was archived before the separate compose discovery schema-drift residual was fully repaired; later follow-up proof for `PATCH-DISCOVERY-SCHEMA-REPAIR-0016` must explicitly show that a drifted DB can apply a pre-`0027` repair, finish pending discovery migrations through `0030`, replay the residual repair through `0036`, and pass `pnpm test:discovery-enabled:compose` without manual DB reset.
- `PATCH-DISCOVERY-SCHEMA-REPAIR-0016` минимум требует required-read-order reload plus compose DB evidence for the drift, `pnpm test:migrations:smoke`, `pnpm db:migrate`, `pnpm test:discovery-enabled:compose`, and `git diff --check --` on touched files. Proof must explicitly show the migration-order unblocker (`0026a_discovery_schema_drift_prerepair.sql`), the post-cutover consistency repair (`0030_discovery_schema_drift_repair.sql`), and the residual replay repair (`0036_discovery_schema_residual_repair.sql`) on the compose baseline.
- shipped `STAGE-6-ADMIN-API-OBSERVABILITY-AND-OPERATOR-TOOLS` минимум требует targeted TS/Python coverage for touched operator helpers and API explain/detail surfaces, `pnpm unit_tests`, `pnpm typecheck`, `pnpm test:cluster-match-notify:compose`, `pnpm test:discovery-enabled:compose`, и targeted consistency proof for synced runtime/process docs. Если required compose proof падает на unrelated mixed-worktree regression outside the declared write scope, blocker must be recorded explicitly in `docs/work.md` instead of silently marking the stage done.
- shipped `STAGE-7-BACKFILL-COMPATIBILITY-CLEANUP-AND-FINAL-SYNC` минимум требует targeted Python coverage for worker-side selection gating and historical repair behavior, `pnpm unit_tests`, `pnpm typecheck`, `pnpm test:migrations:smoke`, `pnpm test:ingest:compose`, `pnpm test:cluster-match-notify:compose`, `pnpm test:reindex-backfill:compose`, и targeted consistency proof for synced runtime/process docs. Proof must explicitly show that historical backfill rebuilds additive `story_clusters` / `verification_results` / `interest_filter_results` / `final_selection_results`, keeps bounded `system_feed_results` aligned, and does not emit retro-notifications.
- capability closeout для zero-shot interest filtering cutover дополнительно требует the same end-to-end compose ingest proof plus clustering/final-selection proof and historical repair proof above; if a previously green `pnpm test:discovery-enabled:compose` later fails on compose-schema drift outside the zero-shot write scope, that failure must be recorded as a separate environment residual rather than misreported as a closeout regression.
- для universal web-ingestion capability минимум включает `pnpm lint`, `pnpm typecheck`, `pnpm unit_tests`, `pnpm test:migrations:smoke`, targeted TS coverage для queue/relay routing of `resource.ingest.requested` и website admin-channel validation, targeted Python coverage для website probe/discovery semantics и source-registration discipline, плюс явную проверку, что website discovery сохраняет `web_resources` / `resource.ingest.requested` truth without silently converting website channels into RSS. Capability closeout требует deterministic compose/runtime proof через `pnpm test:website:compose` вместе с `pnpm test:relay:compose` и `pnpm test:ingest:compose` на локальном baseline; live internet не считается acceptable closeout proof.
- для website-source closeout поверх уже archived web-ingestion runtime минимум включает `pnpm typecheck`, `pnpm unit_tests`, targeted TS/Python coverage для admin website write-path и `web_resources` acquisition surfaces, `pnpm test:website:compose`, browser/admin-style compose proof через `pnpm test:website:admin:compose`, и `pnpm website:projection:replay:compose -- --dry-run` whenever the stage changes legacy website compat semantics; closeout proof должен явно подтвердить, что ingestable website rows handoff-ятся в общий article pipeline с persisted `content_kind`, unprojectable rows остаются видимыми в `/maintenance/web-resources*` и `/admin/resources*` как acquisition/projection diagnostics, user-facing selected-content surfaces больше не читают raw `web_resources`, а legacy replay candidate set truthfully drains to zero after the bounded replay is applied.
- для любого current or future inbound provider capability, который добавляет или меняет acquisition path, capability closeout минимум должен явно доказать, что provider-specific logic заканчивается до общего handoff `article.ingest.requested`, provider-native tables/read models не становятся parallel product truth, и после handoff тот же common downstream path (`normalize -> dedup -> cluster -> verification -> interest filter -> final selection`) остается единственным owner selected-content semantics.
- для browser-assisted hard-site capability поверх archived website runtime минимум включает `pnpm typecheck`, `pnpm unit_tests`, targeted TS/Python coverage для browser fallback gating, discovery probe normalization и website source-registration hints, плюс deterministic compose proof через `pnpm test:hard-sites:compose`, `pnpm test:website:compose`, `pnpm test:website:admin:compose` и `pnpm test:discovery-enabled:compose`; closeout proof должен явно подтвердить fetchers-owned browser runtime ownership, additive provenance on `/admin/resources*`, сохранность `website` provider truth без hidden-feed RSS auto-conversion, и explicit unsupported challenge failure without login/CAPTCHA bypass logic or live-internet dependency.
- для per-channel static `Authorization` header capability поверх operator-ready `rss` и `website` channels минимум включает `pnpm typecheck`, `pnpm unit_tests`, `pnpm test:migrations:smoke`, targeted TS coverage для admin preserve/replace/clear semantics и same-origin auth helpers, deterministic compose proof через `pnpm test:channel-auth:compose`, `pnpm test:website:compose`, `pnpm test:hard-sites:compose` и `pnpm integration_tests`; closeout proof должен явно подтвердить separate `auth_config_json` storage, safe `has_authorization_header` summaries, auth-oriented `401/403` hard failures, retained `429` rate-limited behavior, и same-origin-only browser header injection without cross-origin leakage.
- для feed-ingress adapter capability поверх archived RSS ingest runtime минимум включает `pnpm typecheck`, `pnpm unit_tests`, deterministic local adapter smoke через `pnpm test:feed-ingress-adapters:smoke`, targeted TS coverage для adapter-strategy parse/inference, Reddit tolerant parse, HN discussion normalization/comment-update drop, Google wrapper resolution/cache и stale-entry gating, плюс regression proof that generic RSS parsing path still works; if shared compose runtime smoke like `pnpm test:ingest:compose` times out because of unrelated queue backlog, that failure must be recorded explicitly as runtime-residual rather than misreported as adapter parsing failure.

## Failure Signals and Rerun Guidance

Когда gate важен для work item, в `docs/work.md` должно быть явно видно:

- какой failing signal блокирует completion;
- какой command или check нужно rerun после исправления;
- является ли failure blocking, или это только residual gap.

Практические примеры для текущего репозитория:

- если docs/process cleanup оставляет stale read order, authority order, runtime-core file list, template placeholder или неактуальные runtime-path references, work item не может считаться завершенным; после фикса нужно rerun targeted `rg` consistency check;
- если integration gate падает вне текущего scope, failure может остаться blocking residual gap только при честной фиксации в `docs/work.md`;
- если stateful testing создало persistent artifacts без cleanup truth, это тоже failing signal, а не "мелочь после теста".
- если dashboard summary и system-selected collection больше не сходятся по одному и тому же declared filter set, listing-consistency work item не может считаться завершенным; после фикса нужна повторная live reconciliation проверка.

## Capability Completion Proof

Capability может считаться complete только если одновременно выполнены:

- все stages, необходимые для declared capability outcome;
- capability-level proof, подтверждающий end-to-end outcome, если он требуется для этой capability.

Завершение одной stage не означает завершение capability.

## Implementation Completion vs Operator/Manual Completion

Некоторые capability завершают coding work раньше, чем operator/manual readiness, delivery validation или real-world receipt checks.

Когда это происходит:

- stage может честно закрыть implementation slice;
- capability может оставаться active, потому что operator/manual layer еще открыт;
- `docs/work.md` должен явно показывать, какой completion layer еще открыт;
- этот файл должен описывать, какой proof еще нужен для full capability completion.

Не заставляй operator/manual closure masquerade as unfinished coding work и не схлопывай implementation completion с full capability completion, если это не одно и то же.

## Test Access and Cleanup Proof

Stateful backend testing должна доказывать не только behavior, но и cleanup truth.

Если работа трогает local DB/Firebase/Mailpit/`web_push` fixtures:

- следуй `docs/contracts/test-access-and-fixtures.md`;
- фиксируй created artifacts и cleanup status в `docs/work.md`;
- не считай item cleanly done, если residue не удален и не описан явно.

## Close Gate

Work item может стать `done`, только если:

- `Required proof` сформулирован явно;
- `Executed proof` заполнен явно;
- `Proof status` равен `passed`;
- depth проверки соответствует declared risk;
- runtime/process/core files синхронизированы;
- residual gaps записаны честно, а не замолчаны.

Capability не считается cleanly closed, если его durable completed detail к концу текущего sync cycle все еще не перенесен в `docs/history.md`.

## Когда обновлять этот файл

Обновляй этот файл только тогда, когда меняется durable proof truth:

- появились или исчезли repo-level proof commands;
- изменилась требуемая глубина проверки для определенной зоны риска;
- capability-level proof expectation стала другой;
- появилась новая обязательная subsystem-specific smoke path;
- изменился gate taxonomy;
- изменились failure signals или rerun expectations;
- stateful cleanup truth стала более строгой или иначе обязательной.

Не переписывай этот файл только потому, что один конкретный work item выполнил частный набор команд.

## Known Proof Gaps

- Root-level `pnpm lint` требует отдельной host-side установки `ruff` из `infra/docker/python.dev-requirements.txt`; main `pnpm install` по-прежнему не покрывает Python QA tooling.
- Значимая часть smoke matrix зависит от поднятого Docker Compose и локально доступных PostgreSQL/Redis/services.
- `pnpm integration_tests`, `pnpm test:ingest:multi:compose` и `pnpm test:ingest:soak:compose` зависят от реального `FIREBASE_WEB_API_KEY`, корректного `ADMIN_ALLOWLIST_EMAILS`, compose-доступа и локального loopback fixture networking; без этого admin-backed RSS proof не исполним.
- Python services пока не имеют root-level typecheck gate, сопоставимого с `pnpm typecheck`.
- Root-level `pnpm unit_tests` сейчас покрывает только deterministic pure logic; DB/Redis/queue/network boundaries по-прежнему доказываются integration/smoke path.
- Единый internal acceptance suite покрывает broader internal MVP baseline, но protected-channel auth, website/API/Email IMAP admin CRUD и sequence/outbox admin tooling по-прежнему зависят от dedicated compose/operator smokes вместо umbrella `pnpm integration_tests`.
- Browser receipt для `web_push` остается manual-only proof item; automated gates сейчас доказывают subscription persistence и notify-path behavior, но не фактический push receipt в браузере.
- Root-level release/deploy gate в этом репозитории пока не зафиксирован как отдельная canonical proof surface.
