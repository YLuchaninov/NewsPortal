# DISCOVERY_MODE_TESTING.md — Готовые discovery-mode сценарии и operator-facing handbook для dual-path discovery

> **Для кого этот документ:** для администратора, который уже поднял NewsPortal и хочет тестировать discovery mode как отдельную подсистему, а не как набор разрозненных env-переменных и API ручек.
>
> **Что этот документ покрывает:** primary operator-facing source для bounded local testing discovery runtime: safe-by-default baseline, runtime enable smoke, graph-first mission workflow, independent-recall acquisition/promotion, и expected evidence на `/admin/discovery` и `/maintenance/discovery/*`.
>
> **Что этот документ не покрывает полностью:** полный MVP runbook, общий bootstrap всего продукта, uncontrolled live-internet rollout, stealth scraping, login-required discovery targets, и operator-ready onboarding для discovery provider types `api`, `email_imap` и `youtube`.
>
> **Перед началом:** держите рядом [HOW_TO_USE.md](./HOW_TO_USE.md), [README.md](./README.md), [EXAMPLES.md](./EXAMPLES.md) и [docs/manual-mvp-runbook.md](./docs/manual-mvp-runbook.md).

---

## Оглавление

1. [Как пользоваться этим документом](#1-как-пользоваться-этим-документом)
2. [Что именно discovery тестирует сейчас](#2-что-именно-discovery-тестирует-сейчас)
3. [Пример A — Runtime enable и bounded smoke](#3-пример-a--runtime-enable-и-bounded-smoke)
   - [A.1. Когда использовать](#a1-когда-использовать)
   - [A.2. Что должно быть готово заранее](#a2-что-должно-быть-готово-заранее)
   - [A.3. Какие команды запускать](#a3-какие-команды-запускать)
   - [A.4. Что должно считаться успехом](#a4-что-должно-считаться-успехом)
   - [A.5. Что не считается regression](#a5-что-не-считается-regression)
4. [Пример B — Graph-first mission testing](#4-пример-b--graph-first-mission-testing)
   - [B.1. Когда использовать](#b1-когда-использовать)
   - [B.2. Пошаговый operator flow](#b2-пошаговый-operator-flow)
   - [B.3. Что должно появиться в API и admin UI](#b3-что-должно-появиться-в-api-и-admin-ui)
   - [B.4. Что считать успехом](#b4-что-считать-успехом)
   - [B.5. Что не считается regression](#b5-что-не-считается-regression)
5. [Пример C — Independent recall testing](#5-пример-c--independent-recall-testing)
   - [C.1. Когда использовать](#c1-когда-использовать)
   - [C.2. Bounded recall flow](#c2-bounded-recall-flow)
   - [C.3. Что должно появиться в admin/UI и API](#c3-что-должно-появиться-в-adminui-и-api)
   - [C.4. Что считать успехом](#c4-что-считать-успехом)
   - [C.5. Что не считается regression](#c5-что-не-считается-regression)
6. [Как читать dual-path discovery без путаницы](#6-как-читать-dual-path-discovery-без-путаницы)
7. [Troubleshooting и честные non-regressions](#7-troubleshooting-и-честные-non-regressions)
8. [Канонический proof для этой зоны](#8-канонический-proof-для-этой-зоны)
9. [Proof-backed Discovery Profiles для Example B и Example C](#9-proof-backed-discovery-profiles-для-example-b-и-example-c)
   - [9.1. Как использовать proof-backed profiles](#91-как-использовать-proof-backed-profiles)
   - [9.2. Example B — Proof-backed Discovery Profile](#92-example-b--proof-backed-discovery-profile)
   - [9.3. Example C — Proof-backed Discovery Profile](#93-example-c--proof-backed-discovery-profile)
10. [FAQ по discovery mode](#10-faq-по-discovery-mode)

---

## 1. Как пользоваться этим документом

Этот handbook устроен так же, как `EXAMPLES.md` и `WEBSITE_SOURCES_TESTING.md`, но для discovery lane.

Каждый bundle ниже — это не абстрактная теория, а готовый testing scenario:

1. **Когда использовать** — какой именно слой discovery вы проверяете
2. **Prerequisites** — что должно быть уже поднято и включено
3. **Exact commands или UI/API path** — что делать руками или какими repo-owned proof-командами это подтвердить
4. **Expected evidence** — что именно должно появиться в API, admin UI или runtime proof
5. **Success criteria** — что считать честным зеленым результатом
6. **Non-regressions** — что может выглядеть непривычно, но в текущем shipped baseline является нормой

### Самая важная идея

Discovery в текущем репозитории уже **не только graph mission flow**.

Оператор должен держать в голове четыре разных смысла:

- **Mission fit** — graph-first mission-scoped source fit и portfolio state
- **Generic source quality** — additive recall/source-quality snapshots
- **Neutral recall backlog** — recall missions и recall candidates без `interest_graph`
- **Promotion state** — стал ли recall candidate обычным `source_channel` или связан как duplicate

Эти значения не должны смешиваться в один “общий discovery score”.

### Что выбрать первым

- Если вы хотите доказать, что runtime вообще включается и discovery LLM/search path живой, начните с **Примера A**.
- Если вы хотите проверить operator-facing mission/class/candidate workflow, берите **Пример B**.
- Если вы хотите проверить additive recall lane и bounded promotion в обычные `source_channels`, берите **Пример C**.

---

## 2. Что именно discovery тестирует сейчас

Current shipped discovery truth для operator testing выглядит так:

- committed baseline остается safe-by-default: `DISCOVERY_ENABLED=0`
- provider-backed discovery execution доказывается только после явного opt-in
- `/admin/discovery` — каноническая operator read/write surface для graph-first missions/classes/candidates/feedback
- `/maintenance/discovery/summary` и `/maintenance/discovery/costs/summary` — канонические runtime/read-model surfaces
- graph-first mission flow и independent recall flow сейчас живут рядом как **dual-path control plane**
- browser-assisted website candidates должны оставаться `website`, а не silently auto-convert в RSS
- provider types `api`, `email_imap` и `youtube` для этого guide считаются out-of-scope follow-up area, даже если symbols уже есть в broader runtime truth

### Safe-by-default baseline

Если вы ничего специально не включали, честным baseline считается:

```env
DISCOVERY_ENABLED=0
DISCOVERY_SEARCH_PROVIDER=ddgs
DISCOVERY_MONTHLY_BUDGET_CENTS=0
```

Это не ошибка. Это intended default.

### Что считается canonical testing surfaces

- `pnpm test:discovery-enabled:compose`
- `pnpm test:discovery:admin:compose`
- `/admin/discovery`
- `/maintenance/discovery/summary`
- `/maintenance/discovery/costs/summary`

---

## 3. Пример A — Runtime enable и bounded smoke

**Сценарий:** вы хотите не вручную кликать discovery UI “на удачу”, а сначала доказать, что enabled-runtime path действительно поднялся и bounded provider-backed walkthrough проходит.

### A.1. Когда использовать

Используйте этот пример, если вам нужно:

- включить discovery локально впервые;
- проверить, что worker/API/admin увидели `DISCOVERY_*` env;
- получить честное bounded proof до любых manual mission runs;
- убедиться, что quota/model/provider surfaces показывают реальные значения.

### A.2. Что должно быть готово заранее

Перед этим примером должны быть готовы:

1. `.env.dev`, созданный на основе `.env.example`
2. рабочий локальный stack через `pnpm dev:mvp:internal`
3. Firebase admin sign-in:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_WEB_API_KEY`
   - `FIREBASE_CLIENT_CONFIG`
   - `FIREBASE_ADMIN_CREDENTIALS`
   - `ADMIN_ALLOWLIST_EMAILS`
4. базовый Gemini runtime:
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL`
   - `GEMINI_BASE_URL`
5. discovery-specific env:
   - `DISCOVERY_ENABLED=1`
   - `DISCOVERY_SEARCH_PROVIDER=ddgs`
   - `DISCOVERY_GEMINI_API_KEY` или fallback к `GEMINI_API_KEY`
   - `DISCOVERY_GEMINI_MODEL`
   - `DISCOVERY_GEMINI_BASE_URL`
   - `DISCOVERY_MONTHLY_BUDGET_CENTS`

Рекомендуемый bounded local baseline:

```env
DISCOVERY_ENABLED=1
DISCOVERY_CRON=0 */6 * * *
DISCOVERY_BUDGET_CENTS_DEFAULT=500
DISCOVERY_MAX_HYPOTHESES_PER_RUN=20
DISCOVERY_MAX_SOURCES_DEFAULT=20
DISCOVERY_AUTO_APPROVE_THRESHOLD=
DISCOVERY_SEARCH_PROVIDER=ddgs
DISCOVERY_DDGS_BACKEND=auto
DISCOVERY_DDGS_REGION=us-en
DISCOVERY_DDGS_SAFESEARCH=moderate
DISCOVERY_GEMINI_API_KEY=replace-me
DISCOVERY_GEMINI_MODEL=gemini-2.0-flash
DISCOVERY_GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
DISCOVERY_LLM_INPUT_COST_PER_MILLION_USD=0.10
DISCOVERY_LLM_OUTPUT_COST_PER_MILLION_USD=0.40
DISCOVERY_MONTHLY_BUDGET_CENTS=500
```

### A.3. Какие команды запускать

1. Перезапустите stack после включения env:

```sh
pnpm dev:mvp:internal:down
pnpm dev:mvp:internal
```

2. Прогоните bounded enabled-runtime proof:

```sh
pnpm test:discovery-enabled:compose
```

3. Проверьте operator/read surfaces:

- `http://127.0.0.1:8000/maintenance/discovery/summary`
- `http://127.0.0.1:8000/maintenance/discovery/costs/summary`
- `http://127.0.0.1:4322/discovery`

### A.4. Что должно считаться успехом

Успешный результат для этого примера:

1. `pnpm test:discovery-enabled:compose` завершается без ошибки
2. worker smoke возвращает `status = discovery-enabled-ok`
3. `/maintenance/discovery/summary` показывает:
   - `enabled=true`
   - активный discovery LLM model
   - monthly quota fields
4. `/admin/discovery` показывает:
   - search provider
   - discovery LLM
   - monthly quota
   - dual-path wording, а не только graph-first phrasing
5. `/maintenance/discovery/costs/summary` не должен падать, даже если cost rows еще пустые

### A.5. Что не считается regression

Следующее в текущем baseline нормально:

- пустой backlog или пустой cost ledger на свежем локальном стенде
- `DISCOVERY_BRAVE_API_KEY` и `DISCOVERY_SERPER_API_KEY` остаются пустыми placeholder envs
- quota exhaustion должна отображаться visibly как quota reached, а не считаться “сломавшимся UI”
- committed baseline по-прежнему может хранить discovery выключенным; операторский green path начинается только после явного local opt-in

---

## 4. Пример B — Graph-first mission testing

**Сценарий:** вы хотите проверить основной admin/operator flow discovery: class registry, mission planning, graph compile, run request, candidate review, feedback и portfolio re-evaluation.

### B.1. Когда использовать

Используйте этот пример, если вам нужно:

- руками пройти `/admin/discovery` как оператор;
- проверить graph-first mission lane поверх enabled runtime;
- убедиться, что UI и API согласованы по миссиям, классам, кандидатам и feedback;
- получить bounded operator proof до более широких экспериментов с темами и источниками.

### B.2. Пошаговый operator flow

#### Шаг 1. Если хотите сначала проверить admin/operator acceptance автоматикой

Запустите repo-owned acceptance harness:

```sh
pnpm test:discovery:admin:compose
```

Этот proof-контур покрывает:

- admin sign-in
- create/update/archive/reactivate/delete class
- create/update/archive/reactivate/delete mission
- compile graph
- run mission request
- candidate approval
- feedback submission
- re-evaluation
- recall seeding/promotion

#### Шаг 2. Создайте class в `/admin/discovery?tab=classes`

Используйте bounded local values вроде:

```text
Class key: regional_watch
Display name: Regional Watch
Status: active
Generation backend: graph_seed_only
Provider types: rss,website
Max per mission: 3
Seed rules JSON: {"tactics":["regional","local"]}
```

#### Шаг 3. Создайте mission в `/admin/discovery?tab=missions`

Для первого local pass используйте что-то вроде:

```text
Title: EU AI oversight sources
Description: Find RSS and website sources covering EU AI policy, compliance, and regulatory oversight.
Seed topics:
  EU AI oversight
  AI regulation
  Brussels policy
Seed languages:
  en
Seed regions:
  EU
Target provider types:
  rss,website
Max hypotheses: 4
Max sources: 6
Budget (cents): 400
Priority: 2
Optional interest graph JSON:
  {"core_topic":"EU AI oversight","subtopics":["policy","regulation"]}
```

#### Шаг 4. Скомпилируйте graph

На миссии нажмите **Compile graph**.

После этого ожидается:

- `interest_graph_status = compiled`
- mission остается читаемой на `/admin/discovery?tab=missions`
- mission detail в maintenance API больше не выглядит как pending graph draft

#### Шаг 5. Запросите mission run

На миссии нажмите **Run mission**.

Потом проверьте:

- `/maintenance/discovery/missions/{mission_id}`
- `/admin/discovery?tab=missions`
- `/admin/discovery?tab=candidates`

#### Шаг 6. Проверьте кандидатов, review и feedback

На вкладке `Candidates`:

- найдите candidate
- выполните approve/reject review

Потом:

- перейдите в `Feedback`
- отправьте feedback c понятным `feedback_type` и `feedback_value`
- на вкладке `Portfolio` нажмите **Re-evaluate mission**

### B.3. Что должно появиться в API и admin UI

После честного зеленого graph-first pass вы должны видеть:

- `Missions` tab:
  - mission row
  - `graph: compiled`
  - run count / budget / latest portfolio snapshot
- `Classes` tab:
  - class виден и меняет lifecycle state truthfully
- `Candidates` tab:
  - reviewed candidate
  - `registered_channel_id` после approved flow или duplicate linkage
- `Feedback` tab:
  - сохраненный feedback event
- `Portfolio` tab:
  - ranked sources
  - refreshed mission portfolio snapshot
- `Sources` tab:
  - **Generic source quality** и **Mission fit** видны как разные meanings

Полезные прямые read surfaces:

- `/maintenance/discovery/missions/{mission_id}`
- `/maintenance/discovery/candidates/{candidate_id}`
- `/maintenance/discovery/missions/{mission_id}/portfolio`
- `/maintenance/discovery/source-profiles`
- `/maintenance/discovery/source-interest-scores`

### B.4. Что считать успехом

Успешный graph-first pass означает:

1. class и mission создаются без ошибки
2. graph compile дает `compiled`, а не тихий no-op
3. run request не деградирует в hidden worker failure
4. candidate review сохраняется и виден в UI/API
5. feedback сохраняется и re-evaluate продвигает portfolio state
6. при source registration появляются:
   - `registered_channel_id`
   - normal `source_channels` linkage
   - `source.channel.sync.requested` onboarding discipline

### B.5. Что не считается regression

Следующее сейчас нормально и должно трактоваться честно:

- default disabled worker baseline может short-circuit queued graph execution cleanly вместо provider-backed work, если вы не прошли Example A с `DISCOVERY_ENABLED=1`
- approved candidate может стать `duplicate`, если уже связан с существующим normal channel
- mission fit и generic source quality не обязаны совпадать по score
- отсутствие `api`, `email_imap` и `youtube` в operator-ready discovery flow — это current scope boundary, а не regression этого handbook

---

## 5. Пример C — Independent recall testing

**Сценарий:** вы хотите проверить additive recall lane отдельно от mission graph: recall missions, recall candidates, generic source-quality evidence и bounded promotion в normal `source_channels`.

### C.1. Когда использовать

Берите этот пример, если вам нужно:

- проверить neutral recall backlog без `interest_graph`
- увидеть promoted vs duplicate recall states
- проверить, что recall candidate promotion не вводит parallel onboarding path
- зафиксировать, что browser-assisted website candidates остаются `website`

### C.2. Bounded recall flow

Current shipped admin UI использует вкладку `Recall` как **operator read surface**.
Bounded creation/acquire/promotion flow сейчас честнее всего проверять через maintenance API.

#### Шаг 1. Создайте recall mission

```sh
curl -sS -X POST http://127.0.0.1:8000/maintenance/discovery/recall-missions \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Local recall mission",
    "description": "Bounded neutral recall test",
    "missionKind": "domain_seed",
    "seedDomains": ["recall-example.test"],
    "seedQueries": ["recall example feed"],
    "targetProviderTypes": ["rss"],
    "scopeJson": {"manual": true},
    "maxCandidates": 4,
    "createdBy": "admin@example.test"
  }'
```

Сохраните `recall_mission_id`.

#### Шаг 2. Создайте recall candidate

```sh
curl -sS -X POST http://127.0.0.1:8000/maintenance/discovery/recall-candidates \
  -H 'Content-Type: application/json' \
  -d '{
    "recallMissionId": "<recall_mission_id>",
    "url": "https://recall-example.test/feed.xml",
    "finalUrl": "https://recall-example.test/feed.xml",
    "title": "Recall candidate local test",
    "description": "Bounded recall candidate",
    "providerType": "rss",
    "status": "pending",
    "qualitySignalSource": "manual_seed",
    "evaluationJson": {"classification": "rss"},
    "createdBy": "admin@example.test"
  }'
```

Сохраните `recall_candidate_id`.

#### Шаг 3. Promote recall candidate

```sh
curl -sS -X POST http://127.0.0.1:8000/maintenance/discovery/recall-candidates/<recall_candidate_id>/promote \
  -H 'Content-Type: application/json' \
  -d '{
    "enabled": true,
    "reviewedBy": "admin@example.test",
    "tags": ["manual-test"]
  }'
```

#### Шаг 4. Проверьте Recall tab

Откройте:

- `/admin/discovery?tab=recall`
- `/maintenance/discovery/recall-missions`
- `/maintenance/discovery/recall-candidates`
- `/maintenance/discovery/summary`

#### Шаг 5. Если recall candidate был `website`

Если вы тестируете website candidate и runtime рекомендует browser assistance:

- provider type должен остаться `website`
- browser provenance проверяйте на `/admin/resources`
- hidden feeds могут быть hints, но не должны silently перевести onboarding в RSS

### C.3. Что должно появиться в admin/UI и API

После успешного recall pass вы должны видеть:

- `Recall missions` в `tab=recall`
- `Recall candidates` с promotion state
- `promoted` или `linked_duplicate` / `duplicate` как честный итог bounded promotion
- source-quality fields на recall candidate/source profile reads
- summary counters:
  - recall mission count
  - recall candidate count
  - promoted recall candidate count
  - duplicate recall candidate count

Оператор должен отдельно читать:

- **Generic recall/source quality**
- **Promotion state**
- **Channel link**

и не путать это с mission-fit scoring.

### C.4. Что считать успехом

Успешный recall pass означает:

1. recall mission и recall candidate создаются без `interest_graph`
2. promotion возвращает конкретный status, а не тихий partial failure
3. recall candidate получает `registered_channel_id` или truthfully marked duplicate state
4. `/admin/discovery?tab=recall` показывает backlog и promotion state
5. onboarding после promotion идет через normal `source_channels` contract, а не через скрытый parallel path

### C.5. Что не считается regression

Следующее сейчас нормально:

- Recall tab — read surface, а не обязательно full CRUD form для recall create/acquire
- `promoted` и `duplicate` оба могут быть успешными bounded outcomes
- generic source quality snapshot может существовать без mission-fit score
- recall-first acquisition для этого handbook остается bounded to `rss` и `website`

---

## 6. Как читать dual-path discovery без путаницы

На `/admin/discovery` и связанных API surfaces используйте такую ментальную модель:

| Слой | Что означает | Где смотреть |
|---|---|---|
| `Graph missions` | graph-first planning, hypotheses, portfolio fit | `Missions`, `Classes`, `Candidates`, `Portfolio` |
| `Mission fit` | mission-scoped contextual scoring | `Sources`, `source-interest-scores`, portfolio reads |
| `Recall missions` | neutral recall backlog without `interest_graph` | `Recall`, `recall-missions` |
| `Generic source quality` | additive recall/source-quality truth | `Recall`, `Sources`, `source-quality-snapshots` |
| `Promotion state` | стал ли recall candidate normal channel | `Recall`, summary counters, candidate/channel link fields |

### Чего делать не нужно

Не трактуйте как одно и то же:

- high generic recall score и high mission fit
- promoted recall candidate и downstream selected content
- browser assistance recommendation и automatic RSS conversion

---

## 7. Troubleshooting и честные non-regressions

### Симптом: `/admin/discovery` открыт, но real provider-backed execution не происходит

Проверьте:

- включен ли `DISCOVERY_ENABLED=1`
- перезапускался ли stack после env change
- запускался ли `pnpm test:discovery-enabled:compose`

Если `DISCOVERY_ENABLED=0`, чистый short-circuit discovery runtime — это expected behavior, а не regression.

### Симптом: quota исчерпана

Это не скрытая деградация.

Ожидаемое поведение:

- UI показывает monthly quota exhausted
- manual mission runs блокируются честно
- нужно либо дождаться нового UTC-месяца, либо поднять `DISCOVERY_MONTHLY_BUDGET_CENTS`

### Симптом: website candidate hinted a hidden feed

Это не означает, что source должен стать RSS.

Ожидаемое поведение:

- source может остаться `website`
- browser fallback/provenance проверяется через `/admin/resources`
- hidden feeds остаются hints only

### Симптом: recall candidate promoted as duplicate

Это не regression, если:

- existing `source_channel` уже покрывает этот source
- response честно показывает duplicate/promotion state
- candidate связан с concrete channel link

---

## 8. Канонический proof для этой зоны

Если нужен минимальный честный proof contour для operator testing discovery, используйте такой набор:

1. `pnpm test:discovery-enabled:compose`
   Доказывает bounded provider-backed enabled runtime.
2. `pnpm test:discovery:admin:compose`
   Доказывает operator/admin graph-first flow плюс bounded recall seeding/promotion acceptance.
3. `pnpm test:discovery:examples:compose`
   Доказывает profile-backed Example B/C single-run flow, materialize-ит reusable `discovery_policy_profiles` и пишет canonical `manualReplaySettings` в artifact.
4. Manual read checks:
   - `/maintenance/discovery/summary`
   - `/maintenance/discovery/costs/summary`
   - `/admin/discovery`

### Как понимать эти два proof lanes

- `pnpm test:discovery-enabled:compose`
  это runtime smoke про enabled discovery adapters, LLM/search path и bounded adaptive walkthrough
- `pnpm test:discovery:admin:compose`
  это operator acceptance про admin/control-plane lifecycle, candidate review, feedback, re-evaluation и recall promotion shape
- `pnpm test:discovery:examples:compose`
  это profile-backed Example B/C proof и source of truth для operator-replayable discovery settings из этого handbook

Они дополняют друг друга, а не заменяют.

---

## 9. Proof-backed Discovery Profiles для Example B и Example C

Эта секция фиксирует exact operator-facing settings для двух shipped proof cohorts.

Source of truth для этих настроек остается в runtime case-pack layer:

- [`infra/scripts/lib/discovery-live-example-cases.mjs`](./infra/scripts/lib/discovery-live-example-cases.mjs)
- [`infra/scripts/lib/discovery-live-proof-profiles.mjs`](./infra/scripts/lib/discovery-live-proof-profiles.mjs)

Canonical single-run proof command:

```sh
pnpm test:discovery:examples:compose
```

Harness materialize-ит reusable `discovery_policy_profiles`, привязывает их к graph mission и recall mission и пишет `/tmp/newsportal-live-discovery-examples-<runId>.json|md`.

Current freshest synced profile-backed proof artifacts:

- single-run replay baseline:
  - `/tmp/newsportal-live-discovery-examples-b41de125.json`
  - `/tmp/newsportal-live-discovery-examples-b41de125.md`
- final bounded multi-run gate:
  - `/tmp/newsportal-live-discovery-yield-proof-a59832ca.json`
  - `/tmp/newsportal-live-discovery-yield-proof-a59832ca.md`
- non-regression wrapper on the same contour:
  - `/tmp/newsportal-discovery-nonregression-f499bb13.json`
  - `/tmp/newsportal-discovery-nonregression-f499bb13.md`

Его truthful outcome сейчас такой:

- общий `runtimeVerdict = pass`
- общий `yieldVerdict = pass`
- `nonRegressionVerdict = pass` на свежем wrapper-proof
- latest single-run `b41de125` дал `yield pass` для обоих required packs
- final multi-run gate `a59832ca` тоже завершился `pass`:
  - `Example B` прошел `3/3`
  - `Example C` прошел `3/3`

Это значит, что настройки ниже уже являются canonical manual replay baseline и одновременно закрытым `good yield` proof contour для обоих required packs на текущем DDGS-first baseline.

### 9.1. Как использовать proof-backed profiles

Используйте эти profiles, если вам нужно:

- повторить exactly тот же operator tuning, который использует automation;
- сравнить ручной `/admin/discovery` run с repo-owned proof;
- не придумывать отдельную “ручную” конфигурацию, расходящуюся с harness truth.

Manual replay pattern:

1. Запустите `pnpm test:discovery:examples:compose` хотя бы один раз, чтобы materialize-ить reusable profiles и получить свежий artifact.
2. Откройте `/admin/discovery?tab=profiles`.
3. Найдите profile по стабильному `profileKey`.
4. Для graph lane создайте mission и выберите этот profile в selector-е `Discovery profile`.
5. Для recall lane создайте recall mission и выберите тот же profile.
6. Сверьте `Applied profile version` на mission/recall row с artifact `manualReplaySettings`.
7. После run смотрите:
   - `/admin/discovery`
   - `/maintenance/discovery/summary`
   - `/maintenance/discovery/costs/summary`
   - artifact `manualReplaySettings`

### 9.2. Example B — Proof-backed Discovery Profile

Когда использовать:

- если вы расширяете `Example B — IT-новости для разработчиков`;
- если вам нужен dev-news/editorial-first discovery baseline;
- если вы хотите проверить graph + recall lanes на developer-news interest pack.

Stable profile identity:

- `profileKey = example_b_dev_news_proof`
- `displayName = Example B — Dev News Proof`
- latest synced single-run used `appliedProfileVersion = 22`
- for manual replay always trust the `manualReplaySettings` from your own fresh artifact if the version has moved again

Graph profile settings:

```json
{
  "providerTypes": ["rss", "website"],
  "supportedWebsiteKinds": [],
  "preferredDomains": [
    "infoq.com",
    "thenewstack.io",
    "github.blog",
    "blog.cloudflare.com",
    "techcrunch.com",
    "venturebeat.com"
  ],
  "blockedDomains": [
    "feedspot.com",
    "rssing.com",
    "rssowl.org",
    "alltop.com"
  ],
  "positiveKeywords": [
    "developer",
    "engineering",
    "open source",
    "security advisory",
    "cloud native",
    "platform engineering",
    "programming language",
    "framework",
    "ai",
    "llm"
  ],
  "negativeKeywords": [
    "top 10",
    "top 50",
    "best blogs",
    "best developer blogs",
    "blogs to follow",
    "directory",
    "feed directory",
    "release notes only",
    "changelog archive",
    "rss aggregator",
    "listicle",
    "seo",
    "contact us",
    "advanced search",
    "web store",
    "newsletter",
    "profile"
  ],
  "preferredTactics": [
    "editorial dev news",
    "official engineering updates"
  ],
  "minRssReviewScore": 0.78,
  "minWebsiteReviewScore": 0.81
}
```

Recall profile settings:

```json
{
  "providerTypes": ["rss", "website"],
  "preferredDomains": [
    "engineering.fb.com",
    "blog.jetbrains.com",
    "github.blog",
    "blog.cloudflare.com",
    "thenewstack.io",
    "infoq.com",
    "lineageos.org",
    "underthehood.meltwater.com"
  ],
  "blockedDomains": [
    "feedspot.com",
    "rssing.com",
    "alltop.com",
    "rss.app",
    "wikipedia.org",
    "einnews.com",
    "archdaily.com",
    "opensourcefeed.org",
    "expertinsights.com",
    "tedt.org",
    "manofmany.com",
    "morningstar.com",
    "msn.com"
  ],
  "positiveKeywords": [
    "engineering",
    "developer",
    "open source",
    "security advisory",
    "architecture",
    "platform"
  ],
  "negativeKeywords": [
    "top blogs",
    "directory",
    "rss aggregator",
    "listicle",
    "changelog archive",
    "rssfeed generator",
    "widgets & bots",
    "wikipedia",
    "architecture blogs",
    "telemetry feeds",
    "contact us",
    "advanced search",
    "newsletter",
    "profile"
  ],
  "preferredTactics": [
    "official engineering blog",
    "engineering blog rss",
    "developer security advisory feed",
    "developer platform blog"
  ],
  "minPromotionScore": 0.2,
  "supportedWebsiteKinds": []
}
```

Benchmark cohort:

```json
{
  "domains": [
    "infoq.com",
    "thenewstack.io",
    "techcrunch.com",
    "arstechnica.com",
    "github.blog",
    "blog.jetbrains.com",
    "blog.cloudflare.com",
    "netflixtechblog.com",
    "engineering.fb.com",
    "underthehood.meltwater.com",
    "venturebeat.com",
    "mittechnologyreview.com"
  ],
  "titleKeywords": [
    "engineering",
    "developer",
    "open source",
    "cloud native",
    "security advisory",
    "programming language",
    "ai",
    "llm"
  ],
  "tacticKeywords": [
    "engineering blog",
    "official engineering updates",
    "security advisory"
  ]
}
```

Exact graph mission seeds:

```json
{
  "seedTopics": [
    "official engineering blog updates",
    "programming language release engineering",
    "cloud native engineering editorial",
    "developer security advisory",
    "ai for developers editorial",
    "open source foundation releases",
    "engineering architecture blog",
    "big tech engineering blog updates"
  ],
  "seedLanguages": ["en"],
  "seedRegions": ["us", "eu"],
  "targetProviderTypes": ["rss", "website"],
  "maxHypotheses": 4,
  "maxSources": 12,
  "budgetCents": 250
}
```

Exact recall queries:

```json
{
  "seedQueries": [
    "site:blog.jetbrains.com company blog feed",
    "site:engineering.fb.com engineering blog",
    "site:github.blog engineering feed",
    "site:blog.cloudflare.com developers rss",
    "site:underthehood.meltwater.com atom"
  ],
  "targetProviderTypes": ["rss", "website"],
  "maxCandidates": 8
}
```

What counts as success:

- profile exists in `/admin/discovery?tab=profiles` with the correct key and version;
- graph and recall missions both show the attached profile and applied version;
- artifact contains `manualReplaySettings.profile.profileKey = example_b_dev_news_proof`;
- at least one passing run produces onboarded source plus downstream evidence;
- candidates show structured policy explainability in UI.

Current truthful note:

- this profile is proof-backed and operator-replayable today;
- latest authoritative single-run and multi-run proofs both ended `yield pass` for Example B, so this profile is now both a canonical manual replay baseline and a closed good-yield profile on the current DDGS-first contour.

### 9.3. Example C — Proof-backed Discovery Profile

Когда использовать:

- если вы расширяете `Example C — Поиск клиентов для аутсорс-компании`;
- если вам нужен buyer-signal / procurement-oriented discovery baseline;
- если вы хотите повторить current proof-backed buyer-signal baseline через reusable profile.

Stable profile identity:

- `profileKey = example_c_outsourcing_proof`
- `displayName = Example C — Outsourcing Proof`
- latest synced single-run used `appliedProfileVersion = 22`
- for manual replay always trust the `manualReplaySettings` from your own fresh artifact if the version has moved again

Graph profile settings:

```json
{
  "providerTypes": ["rss", "website"],
  "supportedWebsiteKinds": [
    "editorial",
    "procurement_portal",
    "listing"
  ],
  "preferredDomains": [
    "sam.gov",
    "ted.europa.eu",
    "contractsfinder.service.gov.uk",
    "merx.com",
    "bonfirehub.com"
  ],
  "blockedDomains": [
    "clutch.co",
    "goodfirms.co",
    "upwork.com",
    "agency.example.com",
    "statetechmagazine.com",
    "smdp.com"
  ],
  "positiveKeywords": [
    "request for proposal",
    "rfp",
    "tender",
    "procurement",
    "vendor selection",
    "implementation partner",
    "migration partner",
    "dedicated team",
    "staff augmentation",
    "legacy system support"
  ],
  "negativeKeywords": [
    "how to outsource",
    "outsourcing services",
    "outsourcing trends",
    "top outsourcing companies",
    "best outsourcing companies",
    "agency",
    "marketing",
    "case study",
    "market report",
    "nearshoring trends",
    "blog",
    "best practices",
    "procurement process",
    "guide",
    "pdf",
    "contact us",
    "advanced search",
    "magazine",
    "news and trends",
    "local news"
  ],
  "preferredTactics": [
    "procurement notice",
    "rfp notice",
    "vendor selection notice",
    "tender notice rss"
  ],
  "minRssReviewScore": 0.74,
  "minWebsiteReviewScore": 0.8
}
```

Recall profile settings:

```json
{
  "providerTypes": ["rss", "website"],
  "supportedWebsiteKinds": [
    "editorial",
    "procurement_portal",
    "listing"
  ],
  "preferredDomains": [
    "sam.gov",
    "ted.europa.eu",
    "contractsfinder.service.gov.uk",
    "merx.com",
    "bonfirehub.com",
    "bidsandtenders.ca",
    "ifad.org",
    "ec.europa.eu"
  ],
  "blockedDomains": [
    "feedspot.com",
    "clutch.co",
    "goodfirms.co",
    "upwork.com",
    "vendor.example.com",
    "globaltenders.com",
    "tendernews.com",
    "tendersgo.com",
    "tendersontime.com",
    "youtube.com"
  ],
  "positiveKeywords": [
    "request for proposal",
    "rfp",
    "tender",
    "procurement",
    "vendor selection",
    "implementation partner",
    "migration",
    "support takeover",
    "opportunities"
  ],
  "negativeKeywords": [
    "how to outsource",
    "outsourcing services",
    "agency",
    "marketing",
    "case study",
    "nearshoring",
    "best practices",
    "procurement process",
    "guide",
    "pdf",
    "contact us",
    "for beginners",
    "magazine",
    "news and trends"
  ],
  "preferredTactics": [
    "procurement notice",
    "tender notice rss",
    "vendor selection",
    "implementation partner",
    "buyer procurement feed",
    "tender portal feed"
  ],
  "minPromotionScore": 0.18
}
```

Benchmark cohort:

```json
{
  "domains": [
    "sam.gov",
    "ted.europa.eu",
    "contractsfinder.service.gov.uk",
    "merx.com",
    "bonfirehub.com",
    "bidsandtenders.ca"
  ],
  "titleKeywords": [
    "request for proposal",
    "rfp",
    "tender notice",
    "procurement",
    "vendor selection",
    "implementation partner",
    "migration partner",
    "support takeover"
  ],
  "tacticKeywords": [
    "procurement notice",
    "rfp notice",
    "vendor selection notice",
    "tender notice rss"
  ]
}
```

Exact graph mission seeds:

```json
{
  "seedTopics": [
    "digital services procurement portal",
    "software development buyer request for proposal",
    "implementation partner contract notice",
    "engineering staff augmentation procurement notice",
    "public sector software vendor selection notice",
    "application modernization procurement portal",
    "legacy system support contract notice"
  ],
  "seedLanguages": ["en"],
  "seedRegions": ["us", "eu", "apac"],
  "targetProviderTypes": ["rss", "website"],
  "maxHypotheses": 4,
  "maxSources": 12,
  "budgetCents": 250
}
```

Exact recall queries:

```json
{
  "seedQueries": [
    "site:sam.gov software development services procurement",
    "site:contractsfinder.service.gov.uk digital transformation procurement",
    "site:ted.europa.eu software implementation contract notice",
    "site:bonfirehub.com software modernization procurement",
    "site:bidsandtenders.ca legacy system support services"
  ],
  "targetProviderTypes": ["rss", "website"],
  "maxCandidates": 8
}
```

What counts as success:

- profile exists in `/admin/discovery?tab=profiles` with the correct key and version;
- graph and recall missions both show the attached profile and applied version;
- artifact contains `manualReplaySettings.profile.profileKey = example_c_outsourcing_proof`;
- at least one passing run produces onboarded source plus downstream evidence;
- structured policy explainability is visible on candidate cards.

Current truthful note:

- this profile-backed baseline remains canonical and operator-replayable;
- the latest authoritative single-run and multi-run proofs both ended `yield pass` for Example C, so this profile is now both a canonical manual replay baseline and a closed good-yield profile on the current DDGS-first contour.

---

## 10. FAQ по discovery mode

**В: Нужно ли discovery для обычного MVP run?**
> Нет. Canonical safe-by-default MVP baseline остается без discovery. Для общего продукта используйте `docs/manual-mvp-runbook.md`.

**В: Можно ли тестировать discovery только через `/admin/discovery`?**
> Не полностью. Для честного локального proof сначала нужен `pnpm test:discovery-enabled:compose`, а recall create/promote flow сейчас truthfully bounded maintenance API path.

**В: Если candidate связан с public JS-heavy website, нужно ли переводить его в RSS?**
> Нет. Он должен оставаться `website`. Browser assistance и `/admin/resources` — это проверка provider provenance, а не повод к silent provider conversion.

**В: Почему handbook не покрывает `api`, `email_imap` и `youtube`?**
> Потому что для discovery testing в текущем shipped operator baseline bounded repo-owned proof и operator-ready walkthrough truthfully покрывают `rss` и `website`.

**В: Что важнее при чтении `/admin/discovery`: portfolio rank или recall quality?**
> Это разные смыслы. Portfolio rank относится к mission-fit lane, а recall quality относится к generic source-quality lane.
