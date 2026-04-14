# Engineering

Этот файл задает durable engineering rules и implementation discipline для репозитория.

Используй его для:

- engineering rules, которые направляют повседневные code changes;
- decomposition и size discipline;
- boundary discipline;
- naming и contract discipline;
- refactor discipline;
- integration, side-effect и cleanup discipline;
- stateful test access, fixture и cleanup expectations;
- правил, по которым engineering changes должны оставаться честными и доказуемыми.

Не используй его для:

- текущего work planning;
- временных заметок;
- raw command storage;
- длинных proof logs;
- historical narrative.

`docs/blueprint.md` объясняет, что такое система и какие boundaries/invariants должны оставаться истинными.
`docs/verification.md` объясняет, что именно нужно доказать.
`.aidp/os.yaml` хранит machine-canonical commands, settings и operating facts.

## Почему этот файл важен

Даже при хорошем blueprint репозиторий может деградировать в ежедневной engineering work через hidden coupling, oversized patches, ad hoc fixtures и размытые boundaries.

Этот файл нужен, чтобы изменения оставались:

- bounded;
- honest;
- reviewable;
- legible;
- согласованными с архитектурой;
- доказуемыми на релевантной глубине.

## Repo-specific Engineering Principles

- Сохраняй intended behavior, если work item явно не меняет его.
- Предпочитай smallest truthful change вместо широкого speculative rewrite.
- Держи code и runtime contracts достаточно явными, чтобы следующий агент понимал ownership без chat history.
- Предпочитай durable contract surfaces convenience coupling.
- Не смешивай process migration, product behavior changes и cleanup в один неразличимый patch.
- Сначала scaffold, потом расширение; не пытайся делать весь продукт или весь process refactor за один проход.

## Boundary Discipline

Для этого репозитория boundaries особенно важны в следующих местах:

- `apps/web` и `apps/admin` содержат Astro product surfaces и app-local BFF; тяжелая обработка не должна уезжать в frontend runtimes.
- `services/fetchers` и `services/relay` несут ingest, outbox и queue routing responsibilities; они не должны становиться business-source-of-truth поверх PostgreSQL.
- `services/api`, `services/workers`, `services/ml`, `services/indexer` несут read/explain, async processing, ML helpers и rebuild tooling; их responsibilities не должны размазываться обратно в Astro apps.
- PostgreSQL остается единственным source of truth; Redis и BullMQ — transport/retry/coordination layer.
- Public Python API остается владельцем `/api/*`; browser/session mutation flows для Astro живут в app-local `/bff/*` и `/admin/bff/*`.
- browser-heavy website probing/rendering остается fetchers-owned runtime concern: worker adapters могут вызывать internal fetchers endpoints, но не должны тащить собственный Playwright/browser stack внутрь Python orchestration.
- `packages/contracts`, `packages/sdk`, `packages/config` и `packages/ui` остаются shared layers; service-local implementation detail не должен silently протекать в shared packages без durable reason.
- Source inputs должны оставаться отделенными от derived artifacts в `data/indices`, snapshots, model caches и прочих rebuildable слоях.
- `services/workers/app/task_engine` при staged rollout остается orchestration layer внутри worker domain: relay не должен становиться executor-ом, а plugins не должны bypass-ить PostgreSQL + outbox discipline.

Правила:

- не размывай слой только ради локального shortcut-а;
- не перемещай durable logic через boundary без обновления `docs/blueprint.md`;
- если touched subsystem имеет deep contract doc, следуй ему как required context;
- не смешивай browser PRG contract, machine-readable API contract и internal smoke contract так, чтобы один silently ломал другой.
- не добавляй login/CAPTCHA/stealth bypass logic для website hard-sites вне явно задокументированного fetchers contract; unsupported challenge handling должен оставаться explicit failure, а не hidden retry path.
- если `apps/web` или `apps/admin` используют shared primitives из `packages/ui`, app-local Tailwind entry CSS обязана явно объявлять `packages/ui/src` как source; не полагайся на случайное дублирование utility-классов в app-local markup как на build contract.

## Decomposition and Size Discipline

Репозиторий должен предпочитать небольшие, explicit и reviewable units ответственности.

Правила:

- не прячь большой redesign внутри patch-sized item;
- split work до implementation, если одна stage становится слишком широкой для honest reasoning;
- держи modules достаточно focused, чтобы одна доминирующая responsibility оставалась видимой;
- не нормализуй oversized files, oversized functions и oversized stages как норму;
- если файл нельзя кратко объяснить одним абзацем, это design smell и повод к decomposition.

Практический baseline для этого репозитория:

- process/docs changes должны оставаться отделимыми от application behavior changes;
- runtime env tweaks, compose wiring и proof harness changes нужно группировать осмысленно, а не размазывать рядом с unrelated product logic;
- если dirty worktree уже mixed, новый change должен либо честно описать overlap, либо дождаться reframe.

## Naming and Contract Discipline

Имена должны показывать responsibility и contract shape.

Правила:

- предпочитай explicit names для states, adapters, transformers, repositories, handlers, clients и contracts;
- избегай vague layers вроде `utils`, `helpers` или `common`, если responsibility не остается точной;
- если boundary важен, encode его в name или location;
- предпочитай явные translation points между env/model/payload formats вместо silent implicit conversion;
- queue payloads, event contracts и BFF/API payloads должны оставаться тонкими и читаемыми.

Для этого репозитория это особенно означает:

- queue payloads остаются ID-based и компактными;
- env contracts должны явно различать internal service URLs и public/browser URLs;
- browser/BFF naming не должен вводить в заблуждение относительно ownership paths (`/bff/*` vs `/api/*`).
- sequence-engine symbols должны явно различать sequence definition, run, task-run, plugin, executor и relay handoff; не вводи vague names вроде `task utils` для orchestration core.

## State, Data and Side-effect Discipline

Правила:

- ownership state должен быть explicit;
- mutation points должны оставаться видимыми;
- side effects нужно изолировать так, чтобы их можно было доказать и чистить;
- не допускай hidden cross-layer writes;
- derived artifacts не становятся source of truth;
- generated, packaged и deployment outputs остаются derived products.

Repo-specific invariants для engineering changes:

- write path сначала фиксирует business truth в PostgreSQL, затем публикует outbox event;
- нельзя класть большие article payload в очереди;
- derived HNSW/snapshots/cache state должен оставаться rebuildable из PostgreSQL;
- не делай Redis, BullMQ, local files или in-memory caches альтернативным truth layer;
- не оставляй environment drift скрытым между `.env*`, compose wiring и runtime docs.
- additive stage-1 zero-shot filtering ownership теперь живет в `canonical_documents` и `document_observations`; если работа касается canonical ownership during the cutover, не прячь новую semantic truth только в `articles`, и не ломай текущий compatibility contract для `system_feed_results` без явного stage framing.
- additive stage-2 clustering/verification truth теперь живет в `story_clusters`, `story_cluster_members`, и `verification_results`; если работа касается story grouping или verification during the cutover, не возвращай новую semantic ownership обратно только в legacy `event_clusters`, и не смешивай verification state с final-selection truth раньше соответствующей stage.
- additive stage-3 semantic split truth теперь живет в `interest_filter_results`; если работа касается criteria/user-interest semantic decisions during the cutover, не прячь новую split truth только в `criterion_match_results` / `interest_match_results`, и не путай compatibility delivery decisions с canonical semantic filter outcomes раньше final-selection stage.
- additive stage-4 final-selection truth теперь живет в `final_selection_results`; если работа касается selected-content read surfaces or final editorial gating during the cutover, не возвращай primary ownership обратно только в `system_feed_results`, и держи compatibility projection explicit instead of letting legacy article-side tables silently retake truth.
- additive stage-1 universal-profile config truth теперь живет в `selection_profiles`; если работа касается current system-interest semantics или future configurable filtering layers, не держи новый profile/policy meaning только в `interest_templates` / `criteria`, и не трактуй compatibility mapping как лицензию снова спрятать domain truth обратно в engine.
- shipped stage-2 universal-profile runtime now reads `selection_profiles` for criterion gray-zone policy; если работа касается unresolved criterion handling, не возвращай default path к безусловной LLM queueing и не делай cheap `hold` невозможным для profile-backed criteria.
- shipped stage-3 universal-profile final-selection truth now distinguishes true LLM-pending gray-zone rows from cheap profile-backed `hold`; если работа касается `final_selection_results`, compatibility `system_feed_results`, или downstream selected-content gating, не своди эти два случая обратно в один `pending_llm` bucket и не теряй explicit `semantic_hold` explain semantics.
- shipped operator/explain surfaces now translate `final_selection_results.explain_json` into human-readable `selectionSummary` / `selectionReason` / normalized `selection_*` payloads plus `hold` vs `pending review` hints and generic diagnostics; если работа касается admin/article/resource explain surfaces, не заставляй operator-а читать raw JSON counts или доменно-зашитые шаблоны там, где можно отдать generic profile-driven wording or precomputed diagnostics payloads from the API.
- shipped migration/backfill closeout now records `selectionProfileSnapshot` during historical `backfill` / `repair`, projects human-readable replay provenance through maintenance reindex reads, and normalizes compatibility-only selection state instead of leaking raw legacy decisions as if they were primary runtime truth; если работа касается reindex/backfill observability or compatibility closeout, не оставляй новый profile-state provenance buried only in raw worker `result_json` when an existing operator read-model can own it.
- эволюция selection semantics поверх shipped zero-shot pipeline должна оставаться profile-driven; если работа касается нового configurable filtering layer, не возвращай domain truth обратно в скрытые engine-specific templates, fixed actor/content taxonomies, source-cohort heuristics или mandatory gray-zone LLM review вместо profile-local config/policy, описанного в `docs/contracts/universal-selection-profiles.md`.
- shipped stage-7 closeout truth now requires worker-side personalization/backfill gating to consult `final_selection_results` first and treat `system_feed_results` only as explicit compatibility projection; если работа касается historical repair, replay selection, or downstream match fanout, не reintroduce `eligible_for_feed` as the silent primary runtime gate.
- shipped stage-5 discovery/source-scoring truth must stay decoupled from downstream selected-content outcomes; если работа касается `discovery_source_interest_scores`, channel metrics, portfolio assembly или re-evaluation, не возвращай source-quality learning обратно к `system_feed_results` / `final_selection_results`, и не маскируй selection-dependent yield под будто бы generic source quality.
- shipped stage-1 independent-recall discovery foundation now lives in `discovery_source_quality_snapshots`; если работа касается generic recall quality, future recall-first acquisition, или maintenance read surfaces for source quality, не прячь additive generic source-quality truth только в mission-scoped `discovery_source_interest_scores`, и не позволяй новому recall layer молча стать единственным owner source promotion before the later cutover stages ship.
- shipped stage-2 independent-recall discovery layer now also lives in `discovery_recall_missions` and `discovery_recall_candidates`; если работа касается neutral recall backlog, candidate linkage, or maintenance API surfaces for recall-first entities, не возвращай эту additive truth обратно только в graph-first `discovery_missions` / `discovery_candidates`, и не давай recall candidates silently promote themselves into `source_channels` before the explicit promotion-cutover stage ships.
- shipped stage-3 independent-recall discovery runtime now also lives in `acquire_recall_missions(...)` plus `POST /maintenance/discovery/recall-missions/{recall_mission_id}/acquire`; если работа касается recall-first acquisition, держи provider scope bounded to the shipped `rss` / `website` loop, materialize additive recall candidates and quality snapshots through the shared source-profile layer, и не смешивай acquisition with source-channel promotion before stage-4 framing explicitly allows it.
- shipped stage-4 independent-recall discovery runtime now also lives in `POST /maintenance/discovery/recall-candidates/{recall_candidate_id}/promote`; если работа касается recall-candidate promotion, используй существующий `PostgresSourceRegistrarAdapter` и PostgreSQL + outbox onboarding contract, держи `registered_channel_id` / source-profile channel linkage explicit, и не вводи параллельный shortcut around `source_channels` or `source.channel.sync.requested`.
- shipped stage-5 independent-recall discovery closeout now requires operator/admin/API discovery surfaces to label mission fit, generic source quality, neutral recall backlog, and recall promotion as separate truths; если работа касается discovery read models or admin wording, не collapse-ь эти meanings обратно в один score и не описывай graph-first missions как будто они по-прежнему единственный owner source onboarding.
- repaired discovery schema baseline now relies on `0026a_discovery_schema_drift_prerepair.sql` before `0027_*` plus `0030_discovery_schema_drift_repair.sql` after the additive recall migrations; если работа касается discovery schema/migrations or migration smoke, не ослабляй этот ordering contract, не удаляй idempotent repair behavior для already-drifted DBs, и не возвращай migration smoke к partial checks that skip discovery core tables, indexes, or FK bridges.
- operator/admin/explain surfaces during the cutover обязаны различать article observation telemetry, canonical-document ownership, story-cluster verification, и final-selection truth; не collapse-ь эти слои обратно в один badge или в wording, которое будто бы `articles.processing_state` по-прежнему является public/system gate.

## Refactor Discipline

Refactors разрешены только когда они остаются честными.

Правила:

- не называй behavior-changing rewrite `refactor`;
- при refactor сохраняй intended behavior, если work item явно не говорит обратного;
- если refactor touches shared contracts, risky boundaries или stateful flows, используй более сильный proof contour;
- если refactor меняет durable engineering truth, обновляй этот файл и при необходимости `docs/blueprint.md`;
- если refactor вскрывает deeper subsystem contract, выноси его в `docs/contracts/*`, а не перегружай runtime core.

## Proof Expectations for Engineering Work

`docs/verification.md` остается главным документом для gate taxonomy и close gate, но engineering work должна выбирать proof contour честно.

Используй такой baseline:

- local low-risk engineering change -> fast gate;
- boundary-sensitive change или refactor -> structural gate;
- packaging, deployment, migration или environment delivery change -> delivery gate;
- startup, integration или minimal real flow confidence -> runtime smoke gate;
- release preparation или promotion -> release gate.

Если boundary changed, fast gate не заменяет structural/delivery/runtime proof.

## Forbidden Engineering Shortcuts

Не делай следующее:

- не создавай god objects или vague shared layers;
- не тащи heavy-processing logic во frontend runtimes;
- не обходи stable contract из-за того, что local change кажется маленьким;
- не смешивай unrelated concerns только потому, что файлы находятся рядом;
- не делай manual writes в derived state как будто это primary truth;
- не оставляй risky refactor без обновленного proof contour;
- не превращай generated/deployment artifacts в accidental source of truth;
- не создавай ad hoc persistent test users, subscriptions, webhooks или notification endpoints без явной фиксации и cleanup plan;
- не оставляй local DB/Firebase/Mailpit/web-push residue невидимым для `docs/work.md`.

## Deep Contract Docs

Используй `docs/contracts/*` для subsystems, которые слишком сложны для compact core.

Текущие contract docs:

- `docs/contracts/README.md`
- `docs/contracts/article-pipeline-core.md`
- `docs/contracts/browser-assisted-websites.md`
- `docs/contracts/content-model.md`
- `docs/contracts/discovery-agent.md`
- `docs/contracts/test-access-and-fixtures.md`
- `docs/contracts/universal-task-engine.md`
- `docs/contracts/feed-ingress-adapters.md`
- `docs/contracts/zero-shot-interest-filtering.md`
- `docs/contracts/universal-selection-profiles.md`

Новые contract docs нужны, когда subsystem получает:

- сложный внешний API или interface;
- сложный data/migration model;
- сложный packaging или deployment path;
- platform-specific launch/runtime contract;
- risky shared contract, к которому часто будут возвращаться;
- stateful test model, который уже не помещается в этот файл.

## Stateful Test Access, Test Data and Cleanup Rules

Работа со stateful backends должна оставаться reproducible, bounded и clean.

### Разрешенные среды

- `local`:
  Канонический baseline. Разрешены `pnpm dev:mvp:internal`, host-side smoke against local PostgreSQL/Redis, local Docker Compose, локальный SMTP sink `mailpit`, локальный Firebase-backed dev setup и local fixture servers.
- `dev`:
  Отдельная shared dev-среда сейчас не зафиксирована как часть канонического baseline. Используй только при явном human framing конкретного work item.
- `staging`, `preview`, `sandbox`:
  Сейчас не описаны как стандартные рабочие среды для этого репозитория.
- production-like environments:
  Запрещены без explicit human approval.

### Источники доступа

Разрешенные access sources:

- env vars из `.env.dev`, `.env.example` и compose env wiring;
- deterministic bootstrap/proof commands, например `pnpm dev:mvp:internal`, `pnpm test:mvp:internal`, `pnpm test:ingest:multi:compose`, worker smoke commands и relay smoke seed;
- local seeded or fixture creation paths внутри `services/workers/app/smoke.py`, `services/fetchers/src/cli/test-rss-smoke.ts`, `services/fetchers/src/cli/test-feed-ingress-adapters-smoke.ts`, `infra/scripts/test-mvp-internal.mjs` и `infra/scripts/test-rss-multi-flow.mjs`.

### RSS aggregator discipline

- aggregator-specific normalization для Reddit/Hacker News/Google News и похожих RSS/Atom system feeds должна оставаться внутренним `rss` ingress-adapter layer, а не превращаться в новый `provider_type`;
- adapter-specific canonicalization или stale-entry drop должны происходить до persistence/outbox handoff и сопровождаться явным `raw_payload_json.feedAdapter` provenance;
- generic RSS behavior должен оставаться baseline path и всегда иметь regression proof рядом с adapter-specific work.

Не придумывай credentials внутри work loop.

### Разрешенные test identities

- admin:
  Allowlisted Firebase identity из `ADMIN_ALLOWLIST_EMAILS`, включая repeatable alias patterns вроде `internal-admin-<runId>@...` или `+internal-admin-<runId>`;
- regular user:
  Anonymous web session или local user row, созданный deterministic proof script;
- notifications-enabled user:
  Local user с `notification_preferences` и подключенным notification channel;
- machine identity:
  Compose services и worker/relay/fetcher processes, работающие через declared env contracts.

Сейчас не зафиксированы как reusable seeded identities:

- disabled user;
- premium/paid user;
- отдельный shared staging-only test tenant.

### Предпочтительный порядок fixture creation

1. reusable seeded fixtures;
2. deterministic creation scripts;
3. ephemeral test entities с видимой naming convention;
4. manual creation только когда варианты выше отсутствуют.

### Naming Convention для ephemeral artifacts

Используй traceable naming patterns, уже существующие в репозитории:

- `internal-admin-<runId>@domain` или `email+internal-admin-<runId>@domain`;
- `rss-admin-<runId>@domain` или `email+rss-admin-<runId>@domain`;
- `internal-user-<runId>@example.test`;
- `Internal MVP RSS <runId>`;
- `RSS multi <runId> ...`;
- script-generated `runId` из short UUID.

### Артефакты, которые нужно отслеживать

Если работа создает persistent state, фиксируй это в `docs/work.md`.

Типичные артефакты для этого репозитория:

- Firebase admin/test identities;
- local user rows и anonymous user state;
- source channels, созданные smoke и multi-RSS proofs;
- notification channel rows и `web_push` subscriptions/device registrations;
- outbox smoke rows;
- imported or seeded RSS fixture data;
- external registrations, если они появятся в будущем.

### Cleanup Policy

Cleanup является частью engineering discipline.

Правила:

- если persistent artifact можно безопасно удалить в рамках active work, удали его до clean completion;
- если cleanup намеренно отложен, зафиксируй artifact, cleanup status и rationale в `docs/work.md`;
- если cleanup требует follow-up item, создай его явно;
- destructive environment reset вроде `pnpm dev:mvp:internal:down:volumes` допустим только когда он действительно соответствует scope и одобрен в контексте работы.

### Done Gate Interaction

Stateful backend work не считается cleanly done, пока не выполнено одно из:

- artifacts удалены;
- artifacts являются intentional reusable fixtures;
- residual artifacts явно записаны с cleanup status и rationale.

### Required Deep Contract

При любой работе, которая трогает Firebase bootstrap, allowlisted admin flows, local compose integrations, Mailpit delivery, notification subscriptions или fixture cleanup, обязательно перечитывай `docs/contracts/test-access-and-fixtures.md`.
