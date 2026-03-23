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
  Запускает deterministic root-level unit suites: `node:test` + `tsx` для pure TS logic и `unittest` для pure Python helpers без DB/Redis/Docker dependency. На текущем baseline этот gate покрывает adaptive scheduler transitions, admin scheduling parsing, web-push subscription validation, Gemini usage parsing/cost helpers и notification-preference filtering helpers.
- `pnpm integration_tests`
  Канонический root-level behavioral gate. Сейчас это thin alias на `pnpm test:mvp:internal`: он поднимает canonical `compose.yml + compose.dev.yml` baseline с `.env.dev`, прогоняет ключевые relay/fetcher/worker smoke paths и поверх них доказывает internal MVP happy path: anonymous web bootstrap, allowlisted admin sign-in, RSS ingest, notification delivery в локальный SMTP sink и moderation audit. Дополнительно этот gate проверяет browser-safe `303` + flash redirect semantics на Astro BFF paths `/bff/*` и `/admin/bff/*`, валидирует полный `Location` origin/pathname и подтверждает, что nginx ingress оставляет `/api/*` за Python API.

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
| Fetchers multi-RSS flow (compose) | `pnpm test:ingest:multi:compose` | Docker Compose access, локальный fixture server, валидные `FIREBASE_WEB_API_KEY` и `ADMIN_ALLOWLIST_EMAILS` | Full RSS-only path `admin -> source_channels -> fetchers -> relay -> workers` проходит на 24 synthetic feeds, включая `duplicate`, `not_modified`, `invalid_xml` и `timeout` profiles. |
| Fetchers multi-RSS soak (compose) | `pnpm test:ingest:soak:compose` | Те же предпосылки, что и у `pnpm test:ingest:multi:compose` | Тот же path выдерживает 60 synthetic feeds без batch abort, со stable article counts после second fetch cycle. |
| Worker normalize/dedup (host) | `pnpm test:normalize-dedup:smoke` | Доступные PostgreSQL и Redis | Базовый worker path для normalize/dedup исполняется локально. |
| Worker normalize/dedup (compose) | `pnpm test:normalize-dedup:compose` | Поднятый `worker` в Docker Compose | Тот же путь работает в compose baseline. |
| Worker embed (host) | `pnpm test:embed:smoke` | Доступные PostgreSQL и Redis, нужные Python dependencies | Embed pipeline исполняется локально. |
| Worker embed (compose) | `pnpm test:embed:compose` | Поднятый `worker` в Docker Compose | Embed pipeline проходит в compose baseline. |
| Interest compile | `pnpm test:interest-compile:smoke` / `pnpm test:interest-compile:compose` | Локальная или compose-среда с DB/Redis | Compiled interest path работает и обновляет derived state корректно. |
| Criterion compile | `pnpm test:criterion-compile:smoke` / `pnpm test:criterion-compile:compose` | Локальная или compose-среда с DB/Redis | Compiled criterion path работает и обновляет derived state корректно. |
| Cluster/match/notify | `pnpm test:cluster-match-notify:smoke` / `pnpm test:cluster-match-notify:compose` | Локальная или compose-среда с DB/Redis | Event clustering, matching и notify chain выполняются end-to-end на доступном baseline. |
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

## Failure Signals and Rerun Guidance

Когда gate важен для work item, в `docs/work.md` должно быть явно видно:

- какой failing signal блокирует completion;
- какой command или check нужно rerun после исправления;
- является ли failure blocking, или это только residual gap.

Практические примеры для текущего репозитория:

- если docs/process cleanup оставляет stale read order, authority order, runtime-core file list, template placeholder или неактуальные runtime-path references, work item не может считаться завершенным; после фикса нужно rerun targeted `rg` consistency check;
- если integration gate падает вне текущего scope, failure может остаться blocking residual gap только при честной фиксации в `docs/work.md`;
- если stateful testing создало persistent artifacts без cleanup truth, это тоже failing signal, а не "мелочь после теста".

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
- Единый internal acceptance suite по-прежнему покрывает только RSS-first MVP path; multi-channel RSS proof теперь есть отдельными compose-backed командами, но `website`, `api` и `email_imap` ingest все еще требуют собственного acceptance proof.
- Browser receipt для `web_push` остается manual-only proof item; automated gates сейчас доказывают subscription persistence и notify-path behavior, но не фактический push receipt в браузере.
- Root-level release/deploy gate в этом репозитории пока не зафиксирован как отдельная canonical proof surface.
