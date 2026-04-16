# WEBSITE_SOURCES_TESTING.md — Готовые Website-source конфигурации и ручной тестовый handbook для `web_resources`

> **Для кого этот документ:** для администратора, который уже поднял NewsPortal и хочет не просто проверить website ingest “вообще”, а целенаправленно прогонять `website` sources через `/admin/resources` и понимать, где норма, а где regression.
>
> **Что этот документ покрывает:** primary operator-facing source для manual testing website channels, persisted `web_resources`, projected editorial rows, resource-only rows и bounded browser-assisted path.
>
> **Что этот документ не покрывает полностью:** полный MVP runbook, discovery mission planning, YouTube onboarding, login-required websites, CAPTCHA bypass, cookie/session replay и любой stealth scraping.
>
> **Перед началом:** прочитайте [HOW_TO_USE.md](./HOW_TO_USE.md) для общего admin flow, [README.md](./README.md) для runtime/discovery notes и [docs/manual-mvp-runbook.md](./docs/manual-mvp-runbook.md) для полного local MVP walkthrough.

> **Для широкого bounded live pass:** после того как локальный website proof зелёный, можно запустить `node infra/scripts/test-live-website-matrix.mjs`. Этот repo-owned harness прогоняет 16 primary public sites across `static_editorial`, `documents_downloads`, `public_changelog` и `browser_candidate`, сохраняет `/tmp/newsportal-live-website-matrix-<runId>.json`, и не заменяет deterministic compose acceptance.

---

## Оглавление

1. [Как пользоваться этим документом](#1-как-пользоваться-этим-документом)
2. [Практические советы по выбору website source](#2-практические-советы-по-выбору-website-source)
3. [Пример A — Редакционный newsroom / policy publication](#3-пример-a--редакционный-newsroom--policy-publication)
   - [A.1. Когда использовать](#a1-когда-использовать)
   - [A.2. Готовая конфигурация channel](#a2-готовая-конфигурация-channel)
   - [A.3. Что должно появиться в `/admin/resources`](#a3-что-должно-появиться-в-adminresources)
   - [A.4. Как именно проверять](#a4-как-именно-проверять)
4. [Пример B — Портал документов, тендеров или public registry](#4-пример-b--портал-документов-тендеров-или-public-registry)
   - [B.1. Когда использовать](#b1-когда-использовать)
   - [B.2. Готовая конфигурация channel](#b2-готовая-конфигурация-channel)
   - [B.3. Что должно появиться в `/admin/resources`](#b3-что-должно-появиться-в-adminresources)
   - [B.4. Как именно проверять](#b4-как-именно-проверять)
5. [Пример C — Public JS-heavy press center / product newsroom](#5-пример-c--public-js-heavy-press-center--product-newsroom)
   - [C.1. Когда использовать](#c1-когда-использовать)
   - [C.2. Готовая конфигурация channel](#c2-готовая-конфигурация-channel)
   - [C.3. Что должно поменяться после browser fallback](#c3-что-должно-поменяться-после-browser-fallback)
   - [C.4. Как именно проверять](#c4-как-именно-проверять)
6. [Сравнительная таблица трёх конфигураций](#6-сравнительная-таблица-трёх-конфигураций)
7. [Общий операторский порядок для любого из примеров](#7-общий-операторский-порядок-для-любого-из-примеров)
8. [Troubleshooting и признаки regression](#8-troubleshooting-и-признаки-regression)
9. [Канонический proof для этой зоны](#9-канонический-proof-для-этой-зоны)
10. [FAQ по website examples](#10-faq-по-website-examples)

---

## 1. Как пользоваться этим документом

Каждый пример ниже — это **не просто идея сайта**, а готовый testing bundle для одного честного сценария website ingest.

Каждый bundle содержит:

1. **Тип сайта** — какой класс источника вы тестируете на самом деле
2. **Готовую конфигурацию channel** — какие поля заполнять в admin form
3. **Ожидаемый mix `web_resources`** — какие kinds и projection outcomes должны появиться
4. **Конкретный checklist по `/admin/resources`** — какие фильтры переключить и что именно считать успехом

Этот документ специально устроен аналогично `EXAMPLES.md`, но под website lane, а не под RSS/templates.

### Самая важная идея

У website ingest truth выглядит так:

`website channel -> web_resources -> optional projection into articles`

То есть:

- **не каждая** row обязана стать article;
- `editorial` rows **могут** проектироваться в `articles`;
- `entity`, `document`, `listing`, `data_file` и другие rows **могут честно оставаться resource-only**;
- `/admin/resources` — это не вторичная страница, а каноническая operator surface для website truth.

### Что выбрать первым

Если вы только начинаете:

- начните с **Примера A**, если хотите проверить article projection;
- начните с **Примера B**, если хотите проверить resource-only lane;
- начните с **Примера C**, если ваш реальный target public, но JS-heavy.

### Перед стартом любого примера

1. Поднимите stack:

```sh
pnpm dev:mvp:internal
```

2. Проверьте health:

- `http://127.0.0.1:4322/api/health`
- `http://127.0.0.1:8000/health`

3. Убедитесь, что admin sign-in работает.

4. Если хотите сначала проверить baseline автоматикой, запустите:

```sh
python -m unittest tests.unit.python.test_api_web_resources
pnpm typecheck
pnpm test:website:admin:compose
```

---

## 2. Практические советы по выбору website source

Прежде чем перейти к трём примерам, вот самые важные правила выбора хорошего website target.

### Правило 1. Тестируйте форму сайта, а не только его тему

Для website lane важнее **как устроен сайт**, чем **о чём он пишет**.

Примеры форм:

- editorial newsroom
- documents/download portal
- JS-heavy press center
- mixed directory + detail pages

Для `/admin/resources` это важнее, чем “IT”, “finance” или “policy”.

### Правило 2. Не ждите article projection там, где сайт по своей природе документный

Если источник — это procurement portal, registry, docs hub или download center, то нормой будет:

- много `document` / `listing` / `data_file`
- мало или ноль projected `editorial`

Это **не regression**.

### Правило 3. Не включайте browser fallback заранее

`browserFallbackEnabled` нужен только когда cheap/static path реально не видит нужные ресурсы.

Для первого прогона почти всегда правильнее:

- сначала `browserFallbackEnabled = false`
- потом включать его точечно

### Правило 4. Allow/block patterns должны ужимать шум, а не вырезать весь сайт

Хорошо:

- `allowed`: `/news/`, `/press/`, `/blog/`, `/insights/`
- `blocked`: `/login`, `/privacy`, `/terms`, `/careers`, `/contact`

Плохо:

- слишком узкий `allowed`, который оставляет 2–3 URL и ломает реальный crawl
- слишком широкий `blocked`, который случайно режет все нужные section paths

### Правило 5. `Authorization header` — только для статического header-auth

Используйте его только если:

- сайт публично доступен;
- нужен один фиксированный header;
- не требуется интерактивный логин.

Не используйте его как замену:

- cookie/session auth
- браузерному входу
- CAPTCHA bypass

---

## 3. Пример A — Редакционный newsroom / policy publication

**Сценарий:** сайт-публикация с newsroom / press / updates / blog разделами. Это самый прямой путь проверить, что website lane умеет не только хранить `web_resources`, но и проецировать editorial-compatible rows в `articles`.

**Почему этот кейс важен:** он проверяет основной “новостной” happy path website provider-а: discovery -> extraction -> `editorial` rows -> projected article drilldown.

### A.1. Когда использовать

Берите этот пример, если ваш target похож на:

- public newsroom организации;
- policy/publication site с разделами `news`, `press`, `updates`, `blog`;
- corporate newsroom без тяжелого JS;
- publication, где каждая новость живет на отдельной HTML detail page.

Обычно у такого сайта:

- есть homepage или section page;
- новости лежат в предсказуемых URL;
- cheap/static discovery уже находит нужные страницы;
- projected `editorial` rows должны доминировать.

### A.2. Готовая конфигурация channel

Ниже пример для формы `Website channel basics`.

Замените домен и paths на свой реальный target, но **сохраняйте саму форму конфигурации**.

```text
Name: EU Policy Newsroom Example
Website entry URL: https://policy-site.example/
Language: en
Active: true
Poll interval (s): 900
Adaptive: true
Max poll interval (s): 14400
Request timeout (ms): 10000
Total poll timeout (ms): 60000
User agent: NewsPortalFetchers/0.1 (+https://newsportal.local)
Max resources per poll: 20
Crawl delay (ms): 1000
Sitemap discovery enabled: true
Feed discovery enabled: true
Collection discovery enabled: true
Download discovery enabled: true
Browser fallback enabled: false
Collection seed URLs:
  https://policy-site.example/news
  https://policy-site.example/press
Allowed URL patterns:
  /news/
  /press/
  /updates/
  /blog/
Blocked URL patterns:
  /login
  /privacy
  /terms
  /careers
Authorization header: <leave empty>
```

### Почему именно так

- `Browser fallback enabled = false`
  потому что для обычного newsroom cheap/static path должен быть достаточным
- `Collection seed URLs`
  помогают быстро сузить crawl к реальным editorial sections
- `Allowed URL patterns`
  направляют runtime в новости, а не в about/contact/legal noise
- `Blocked URL patterns`
  отрезают типичные нерелевантные страницы

### A.3. Что должно появиться в `/admin/resources`

Для этого сценария нормальный outcome такой:

- много `editorial` rows;
- часть rows имеет `projected_article_id`;
- могут появиться отдельные `document` rows, если newsroom публикует PDF annexes или press kits;
- resource-only rows допустимы, но не должны быть единственным результатом.

Ожидаемая картина:

- `projection = all`
  виден mix из projected editorial rows и редких resource-only rows
- `projection = projected`
  видно, что editorial website rows truthfully linked to `/admin/articles/[docId]`
- `resourceKind = editorial`
  это основной фильтр для этого кейса

### Что считать успехом

Успех для Примера A:

1. website channel создается без ошибки
2. после poll появляются `editorial` rows
3. хотя бы часть `editorial` rows получает article projection
4. detail по projected resource открывает downstream article
5. `/admin/articles/[docId]` соответствует ожидаемой website news row

### Что не считать ошибкой

Не ошибка, если:

- некоторые rows остались resource-only;
- часть rows классифицирована как `document`;
- на странице есть немного `listing` noise при первом прогоне

### A.4. Как именно проверять

1. Создайте channel по конфигурации выше.
2. Найдите `channelId` на `/channels`.
3. Форсируйте poll:

```sh
docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml \
  exec -T fetchers pnpm --filter @newsportal/fetchers run:once <channelId>
```

4. Откройте `/admin/resources?channelId=<channelId>`.
5. Проверьте:
   - summary cards не пустые;
   - есть `editorial` rows;
   - есть `Projected` counts;
   - хотя бы одна row ведет в `/admin/articles/[docId]`.
6. Пройдите фильтры:
   - `projection=all`
   - `projection=projected`
   - `resourceKind=editorial`
7. Откройте одну projected row и одну resource-only row, если такая есть.

---

## 4. Пример B — Портал документов, тендеров или public registry

**Сценарий:** сайт, где основная ценность не в “новостных статьях”, а в страницах тендеров, официальных документов, реестрах, notice pages, download artifacts и структурных listings.

**Почему этот кейс важен:** он доказывает, что non-editorial website truth не исчезает behind article-only workflow. Именно здесь легче всего ошибочно решить, что lane “сломана”, хотя на самом деле resource-only rows — это и есть правильный результат.

### B.1. Когда использовать

Берите этот пример, если ваш target похож на:

- public procurement portal
- notices / tenders / grants portal
- public registry
- documentation/download hub
- standards or regulations portal с множеством документов и listings

Обычно у такого сайта:

- много listing pages
- много detail pages с документами
- article projection либо редка, либо не нужна вообще

### B.2. Готовая конфигурация channel

```text
Name: Public Procurement Portal Example
Website entry URL: https://procurement-site.example/
Language: en
Active: true
Poll interval (s): 1800
Adaptive: true
Max poll interval (s): 28800
Request timeout (ms): 10000
Total poll timeout (ms): 60000
User agent: NewsPortalFetchers/0.1 (+https://newsportal.local)
Max resources per poll: 30
Crawl delay (ms): 1000
Sitemap discovery enabled: true
Feed discovery enabled: false
Collection discovery enabled: true
Download discovery enabled: true
Browser fallback enabled: false
Collection seed URLs:
  https://procurement-site.example/tenders
  https://procurement-site.example/notices
  https://procurement-site.example/documents
Allowed URL patterns:
  /tender
  /notice
  /procurement
  /document
  /download
  /pdf
Blocked URL patterns:
  /login
  /privacy
  /terms
  /contact
  /newsroom
Authorization header: <leave empty>
```

### Почему именно так

- `Feed discovery enabled = false`
  потому что для такого портала чаще важны listings и documents, а не hidden feed hints
- `Download discovery enabled = true`
  потому что документы и вложения тут часть основной truth
- `Max resources per poll = 30`
  потому что порталы notices/tenders часто плодят больше resource rows за один проход
- `Blocked /newsroom`
  чтобы не смешивать редкие editorial pages с основным document-heavy path

### B.3. Что должно появиться в `/admin/resources`

Для этого сценария нормальный outcome такой:

- доминируют `document`, `listing`, `data_file`, иногда `entity`;
- projected `editorial` rows могут отсутствовать совсем;
- `resource-only` rows — это expected success path, а не partial failure.

Ожидаемая картина:

- `projection = resource_only`
  это главный фильтр для этого кейса
- `resourceKind = document`
  часто самый полезный фильтр
- `resourceKind = listing`
  помогает увидеть upstream collection truth

### Что считать успехом

Успех для Примера B:

1. `web_resources` materialize-ятся вообще
2. `document` / `listing` rows видны в `/admin/resources`
3. detail по resource открывается и показывает persisted metadata
4. отсутствие article projection **не считается поломкой**
5. resource-only lane остается наблюдаемой и фильтруемой

### Что не считать ошибкой

Не ошибка, если:

- `Projected = 0`
- `projection = projected` пустой
- `resourceKind = editorial` почти ничего не показывает

Именно этот пример нужен, чтобы отучиться от ложного ожидания “каждый website source должен превратиться в Articles”.

### B.4. Как именно проверять

1. Создайте channel по конфигурации выше.
2. Запустите poll через `run:once`.
3. Откройте `/admin/resources?channelId=<channelId>`.
4. Проверьте:
   - `Resource-only` count > 0
   - есть `document` и/или `listing`
   - detail по resource открывается
5. Пройдите фильтры:
   - `projection=resource_only`
   - `resourceKind=document`
   - `resourceKind=listing`
   - `extractionState=failed`, если хотите отделить реальные extraction issues от нормальных resource-only rows
6. Откройте несколько detail rows и убедитесь, что resource truth полезна даже без article projection.

---

## 5. Пример C — Public JS-heavy press center / product newsroom

**Сценарий:** public сайт с newsroom / press / updates, но cheap/static path не видит реальные resource URLs без render/network activity. Это bounded browser-assisted кейс.

**Почему этот кейс важен:** он проверяет не только website ingest, но и то, что browser assistance остается additive fallback, показывает provenance и не превращает source silently в RSS.

### C.1. Когда использовать

Берите этот пример, если ваш target похож на:

- public product/company newsroom с heavy client-side rendering
- press center, где список новостей отрисовывается после JS
- SPA-like public updates page
- public hard-site без логина, но с тяжелой фронтенд-подачей

Не берите этот пример, если сайт:

- требует логин;
- упирается в CAPTCHA;
- живет на cookie/session auth;
- требует stealth/bypass tactics.

### C.2. Готовая конфигурация channel

Первый проход делайте **без** browser fallback, чтобы увидеть честный baseline. Затем включайте fallback и сравнивайте результат.

#### Вариант 1. Baseline without browser fallback

```text
Name: JS-heavy Newsroom Baseline Example
Website entry URL: https://js-newsroom.example/
Language: en
Active: true
Poll interval (s): 900
Adaptive: true
Max poll interval (s): 14400
Request timeout (ms): 12000
Total poll timeout (ms): 70000
User agent: NewsPortalFetchers/0.1 (+https://newsportal.local)
Max resources per poll: 20
Crawl delay (ms): 1000
Sitemap discovery enabled: true
Feed discovery enabled: true
Collection discovery enabled: true
Download discovery enabled: true
Browser fallback enabled: false
Collection seed URLs:
  https://js-newsroom.example/press
  https://js-newsroom.example/news
Allowed URL patterns:
  /press/
  /news/
  /announcements/
  /blog/
Blocked URL patterns:
  /login
  /privacy
  /terms
  /careers
Authorization header: <leave empty>
```

#### Вариант 2. Browser-assisted pass

Используйте те же поля, но поменяйте:

```text
Browser fallback enabled: true
```

Остальное оставьте одинаковым, чтобы сравнение было честным.

### C.3. Что должно поменяться после browser fallback

До browser fallback допустим такой baseline:

- ноль или очень мало полезных rows;
- только collection/listing noise;
- отсутствие ожидаемых editorial rows.

После browser fallback нормальный outcome такой:

- появляются реальные rows, которых cheap/static path не видел;
- в `/admin/resources` и detail виден browser-related discovery provenance;
- часть rows может стать projected `editorial`;
- source все еще остается `website`.

### Что считать успехом

Успех для Примера C:

1. cheap/static baseline показал ограниченность, но не сломал surface
2. после включения `browserFallbackEnabled` появились дополнительные полезные rows
3. detail показывает browser-related provenance
4. hidden feed hints, если они обнаружены, не превращают provider в RSS
5. unsupported blocks fail explicitly, а не маскируются под “все хорошо”

### Что не считать ошибкой

Не ошибка, если:

- cheap/static baseline почти пустой;
- browser-assisted rows остаются partly resource-only;
- не все JS-heavy rows становятся projected articles.

### C.4. Как именно проверять

1. Создайте channel с `browserFallbackEnabled = false`.
2. Запустите первый poll.
3. Откройте `/admin/resources?channelId=<channelId>` и зафиксируйте baseline:
   - сколько rows
   - какие resource kinds
   - есть ли projected editorial rows
4. Отредактируйте ту же channel и включите `browserFallbackEnabled = true`.
5. Повторно запустите poll.
6. Снова откройте `/admin/resources`.
7. Проверьте:
   - rows стало больше или они стали релевантнее;
   - в list/detail виден browser provenance;
   - provider truth не деградировала в RSS-like shortcut.

Если сайт упирается в login/CAPTCHA:

- это out-of-scope outcome;
- правильный результат — explicit unsupported failure.

---

## 6. Сравнительная таблица трёх конфигураций

| Параметр | Пример A — newsroom | Пример B — documents/tenders | Пример C — JS-heavy newsroom |
|---|---|---|---|
| Главная цель | projected editorial rows | resource-only truth | browser-assisted discovery |
| Нормальный итог | много `editorial`, часть projected | много `document` / `listing`, мало projection | baseline пустоват, после fallback появляются useful rows |
| `browserFallbackEnabled` | `false` | `false` | сначала `false`, потом `true` |
| `feedDiscoveryEnabled` | `true` | чаще `false` | `true` |
| `downloadDiscoveryEnabled` | `true`, но вторично | `true`, критично | `true` |
| Основной фильтр в `/resources` | `resourceKind=editorial` | `projection=resource_only`, `resourceKind=document` | compare before/after browser fallback |
| Что чаще всего считают ошибкой по незнанию | “почему не все rows projected?” | “почему нет articles?” | “почему cheap mode пустой?” |
| Что на самом деле является нормой | часть rows остается resource-only | projected rows могут отсутствовать | browser assistance нужна только после доказанного cheap-gap |

---

## 7. Общий операторский порядок для любого из примеров

Независимо от выбранного кейса, рабочий порядок один и тот же:

1. Поднимите stack:

```sh
pnpm dev:mvp:internal
```

2. Войдите в admin: `http://127.0.0.1:4322/sign-in`
3. Создайте `website` channel по одному из примеров выше
4. Найдите `channelId`
5. Форсируйте poll:

```sh
docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml \
  exec -T fetchers pnpm --filter @newsportal/fetchers run:once <channelId>
```

6. Откройте `/admin/resources?channelId=<channelId>`
7. Проверьте rows на list page
8. Пройдите фильтры:
   - `projection`
   - `resourceKind`
   - `extractionState`
9. Откройте 2–3 resource detail rows
10. Если есть projected editorial row, откройте связанный `/admin/articles/[docId]`

---

## 8. Troubleshooting и признаки regression

### Проблема: `No website resources match these filters`

Проверьте:

1. channel `active`
2. вы использовали правильный `channelId`
3. poll реально запускался
4. `fetchUrl` и seeds достижимы
5. фильтры не зажаты слишком узко

### Проблема: видны только projected rows

Это часто нормально для Примера A.

Проверьте только:

- `projection=all`
- `resourceKind` не зажат в `editorial`
- нет ли скрытых `document` / `listing` rows вне текущего page slice

### Проблема: видны только resource-only rows

Это часто нормально для Примера B.

Считать это ошибкой стоит только если:

- вы тестировали явный newsroom;
- ожидали `editorial` rows;
- patterns/seeds реально указывают на news/press sections.

### Проблема: JS-heavy сайт ничего не дает

Порядок действий:

1. cheap/static first
2. затем `browserFallbackEnabled = true`
3. повторный poll
4. проверка browser provenance

Если сайт упирается в login/CAPTCHA, это не баг документа и не “скрытый обходной путь”, а out-of-scope result.

### Проблема: `/admin/resources` или `/maintenance/web-resources` отдает 500

Это уже regression, а не operator misunderstanding.

Сначала прогоните:

```sh
python -m unittest tests.unit.python.test_api_web_resources
pnpm typecheck
pnpm test:website:admin:compose
```

Если regression подтверждается, чинить нужно именно website/admin/resource surface, а не обходить проблему через article-only workflow.

---

## 9. Канонический proof для этой зоны

Для deterministic baseline эта зона уже имеет выделенный proof set:

```sh
python -m unittest tests.unit.python.test_api_web_resources
pnpm typecheck
pnpm test:website:compose
pnpm test:website:admin:compose
pnpm test:hard-sites:compose
```

Как это читать:

- `test_api_web_resources`
  maintenance/API truth для `/maintenance/web-resources*`
- `pnpm test:website:compose`
  сам website ingest path
- `pnpm test:website:admin:compose`
  operator-facing create/edit/resources/article flow
- `pnpm test:hard-sites:compose`
  bounded browser-assisted/hard-site contract

Если ваш manual pass расходится с этим proof, фиксируйте это как:

- product regression
- doc drift
- или site-specific out-of-scope behavior

---

## 10. FAQ по website examples

### Нужно ли во всех трёх примерах ждать article projection?

Нет.

- В Примере A — да, это core expectation.
- В Примере B — нет, resource-only lane и есть expected result.
- В Примере C — article projection возможна, но главный смысл кейса не в ней, а в browser-assisted discovery.

### Почему я не даю здесь список “идеальных live URLs”?

Потому что для этой подсистемы важнее **тип сайта и shape ресурсов**, чем конкретный домен. Реальные live websites меняют верстку, anti-bot behavior и section structure, а testing contract NewsPortal должен оставаться понятным даже при смене конкретных targets.

Проще говоря:

- этот документ дает вам **максимально релевантные archetype examples**;
- реальные домены вы подставляете уже под свою тему и рынок.

### Какой из трёх примеров самый важный для `web_resources`?

Если цель — именно проверить, что `web_resources` не исчезают behind article-only workflow, самый важный пример — **Пример B**.

### Какой из трёх примеров лучше всего проверяет operator-ready happy path?

**Пример A**, потому что он легче всего показывает всю цепочку:

`website -> web_resources -> projected article`

### Какой из трёх примеров нужен, если сайт “похож на SPA”?

**Пример C**.

Но только если сайт public и bounded browser assistance действительно уместна.
