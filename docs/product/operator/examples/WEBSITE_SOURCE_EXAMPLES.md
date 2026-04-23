# WEBSITE_SOURCE_EXAMPLES.md — Готовые website-source конфигурации для ручного тестирования `web_resources`

> **Для кого этот документ:** для администратора, который хочет тестировать `website` sources не абстрактно, а на готовых публичных сайтах с понятными ожиданиями по `/admin/resources`.
>
> **Что этот документ покрывает:** три website-source сценария в стиле `EXAMPLES.md`, каждый с несколькими конкретными публичными URL, рекомендуемыми настройками channel, ожидаемым типом `web_resources` и чеклистом проверки.
>
> **Что этот документ не покрывает полностью:** полный local MVP runbook, discovery mission planning, login-required websites, CAPTCHA bypass, cookie/session replay, stealth scraping и любые гарантии, что внешний сайт не поменяет структуру после 15 апреля 2026.
>
> **Дата подбора примеров:** 15 апреля 2026. Все URL ниже были подобраны как актуальные публичные страницы официальных сайтов на эту дату.
>
> **Prerequisites:** локальный NewsPortal stack, доступ в admin, working `website` channel flow и готовность принимать, что live public sites могут измениться после даты подбора.
>
> **Как понять, что пример сработал:** channel создался, `web_resources` появились с ожидаемыми `resource_kind`/projection, и вы можете интерпретировать успех или честный gap без подмены resource-only truth article-only ожиданиями.

Перед началом полезно держать рядом:

- [HOW_TO_USE.md](../HOW_TO_USE.md)
- [README.md](../../../README.md)
- [Manual MVP Runbook](../manual-mvp-runbook.md)
- [WEBSITE_SOURCES_TESTING.md](./WEBSITE_SOURCES_TESTING.md)

### Expanded automated live matrix

Если нужен не один ручной пример, а широкий bounded live pass, используйте repo-owned script:

```sh
node infra/scripts/test-live-website-matrix.mjs
```

Он прогоняет 16 primary public sites по четырем ingress shapes и пишет JSON evidence bundle в `/tmp/newsportal-live-website-matrix-<runId>.json`.

Current primary matrix on 16 April 2026:

- `static_editorial`: European Commission Digital Strategy News, EEA Newsroom, EUAA Press Releases, Competition Policy Latest News
- `documents_downloads`: EBRD Procurement Notices, EIB Project Procurement, World Bank Project Procurement, UNICEF Tajikistan Supply and Procurement
- `public_changelog`: WorkOS Changelog, Auth0 Changelog, Raycast Windows Changelog, Resend Changelog
- `browser_candidate`: Grafbase Changelog, Browserbase Changelog, Sentry Changelog, Intercom Changes

---

## Оглавление

1. [Как пользоваться этим документом](#1-как-пользоваться-этим-документом)
2. [Практические советы по выбору live URL](#2-практические-советы-по-выбору-live-url)
3. [Пример A — Редакционный newsroom / public press releases](#3-пример-a--редакционный-newsroom--public-press-releases)
   - [A.1. Что проверяет этот кейс](#a1-что-проверяет-этот-кейс)
   - [A.2. Конкретные URL для старта](#a2-конкретные-url-для-старта)
   - [A.3. Рекомендуемая конфигурация channel](#a3-рекомендуемая-конфигурация-channel)
   - [A.4. Что должно появиться в `/admin/resources`](#a4-что-должно-появиться-в-adminresources)
4. [Пример B — Документы, notices и tenders portal](#4-пример-b--документы-notices-и-tenders-portal)
   - [B.1. Что проверяет этот кейс](#b1-что-проверяет-этот-кейс)
   - [B.2. Конкретные URL для старта](#b2-конкретные-url-для-старта)
   - [B.3. Рекомендуемая конфигурация channel](#b3-рекомендуемая-конфигурация-channel)
   - [B.4. Что должно появиться в `/admin/resources`](#b4-что-должно-появиться-в-adminresources)
5. [Пример C — Public JS-heavy newsroom / product announcements](#5-пример-c--public-js-heavy-newsroom--product-announcements)
   - [C.1. Что проверяет этот кейс](#c1-что-проверяет-этот-кейс)
   - [C.2. Конкретные URL для старта](#c2-конкретные-url-для-старта)
   - [C.3. Рекомендуемая конфигурация channel](#c3-рекомендуемая-конфигурация-channel)
   - [C.4. Что должно появиться в `/admin/resources`](#c4-что-должно-появиться-в-adminresources)
6. [Сравнительная таблица трех кейсов](#6-сравнительная-таблица-трех-кейсов)
7. [Общий порядок проверки для любого примера](#7-общий-порядок-проверки-для-любого-примера)
8. [FAQ по live examples](#8-faq-по-live-examples)

---

## 1. Как пользоваться этим документом

Ниже даны не просто советы, а **готовые live example bundles**.

Каждый bundle содержит:

1. несколько конкретных URL;
2. suggested settings для `website` channel;
3. ожидания по `resource_kind`;
4. ожидания по `projection`;
5. конкретный смысл успеха.

### Важная оговорка

У website provider truth выглядит так:

`website channel -> persisted web_resources -> optional projection into articles`

Это значит:

- `editorial` rows **могут** проектироваться в `articles`;
- `document`, `listing`, `entity`, `data_file` и другие rows **могут честно оставаться resource-only**;
- отсутствие article projection **не всегда ошибка**.

### Какой пример брать первым

- Если вы хотите проверить “классический newsroom path”, начните с **Примера A**.
- Если вы хотите проверить, что non-editorial rows не исчезают behind article-only workflow, начните с **Примера B**.
- Если вы хотите проверить bounded browser-assisted path на реальном публичном сайте, начните с **Примера C**.

### Перед стартом любого примера

1. Поднимите stack:

```sh
pnpm dev:mvp:internal
```

2. Войдите в admin на `http://127.0.0.1:4322/sign-in`.

3. Если сначала хотите проверить baseline автоматикой:

```sh
python -m unittest tests.unit.python.test_api_web_resources
pnpm typecheck
pnpm test:website:admin:compose
```

---

## 2. Практические советы по выбору live URL

### Правило 1. Сначала тестируйте тип сайта, а не его тему

Для website lane важнее форма сайта:

- newsroom / press releases
- documents / tenders / notices
- JS-heavy public announcements

чем его тематика сама по себе.

### Правило 2. На один URL лучше делать одну channel

Хотя ниже у каждого кейса несколько конкретных URL, **не смешивайте их в один source** на первом прогоне.

Лучше:

- 1 channel = 1 live target
- одинаковый checklist
- потом сравнение результатов между channels

### Правило 3. Browser fallback не включайте заранее

Для кейса C правильный порядок такой:

1. сначала `browserFallbackEnabled = false`
2. затем только при честном gap включать `true`

### Правило 4. Проверяйте terms/robots и не делайте агрессивные poll settings

Для live public URLs используйте conservative defaults:

- `pollIntervalSeconds = 900` или `1800`
- `maxResourcesPerPoll = 20`
- `crawlDelayMs = 1000`

---

## 3. Пример A — Редакционный newsroom / public press releases

**Сценарий:** официальный newsroom, press corner или public releases site, где ожидается много `editorial` rows и хотя бы часть из них должна truthfully проектироваться в `articles`.

### A.1. Что проверяет этот кейс

Этот кейс проверяет:

- cheap/static discovery на публичном newsroom;
- появление `editorial` rows;
- article projection для части website resources;
- связку `/admin/resources -> /admin/articles/[docId]`.

### A.2. Конкретные URL для старта

Ниже три релевантных live targets этого типа.

#### Вариант A1 — European Commission press releases

```text
Entry URL:
https://commission.europa.eu/about/contact/press-services/press-releases-and-notifications_en

Optional section URL:
https://commission.europa.eu/about/contact/press-services/press-room_en
```

Что здесь особенно полезно:

- официальный newsroom/public releases flow;
- много editorial-like pages;
- хороший кандидат на projected rows.

#### Вариант A2 — Council of the European Union / Consilium press releases

```text
Entry URL:
https://www.consilium.europa.eu/en/press/press-releases/

Optional section URL:
https://www.consilium.europa.eu/en/press/
```

Что здесь особенно полезно:

- классический press releases section;
- отдельные detail pages;
- удобный кейс для проверки `resourceKind=editorial`.

#### Вариант A3 — European Environment Agency newsroom

```text
Entry URL:
https://www.eea.europa.eu/en/newsroom/news

Optional section URL:
https://www.eea.europa.eu/en/newsroom
```

Что здесь особенно полезно:

- newsroom со стабильной публичной структурой;
- сочетание list page и detail pages;
- хороший тест на article projection без browser fallback.

### A.3. Рекомендуемая конфигурация channel

Используйте одинаковую форму для каждого из трех URL, меняя только домен и path.

```text
Name: Editorial newsroom example
Website entry URL: <one URL from A1/A2/A3>
Language: en
Active: true
Poll interval (s): 900
Adaptive: true
Max poll interval (s): 14400
Request timeout (ms): 10000
Total poll timeout (ms): 60000
Max resources per poll: 20
Crawl delay (ms): 1000
Sitemap discovery enabled: true
Feed discovery enabled: true
Collection discovery enabled: true
Download discovery enabled: true
Browser fallback enabled: false
Collection seed URLs:
  <optional section URL from the same target>
Allowed URL patterns:
  /press/
  /news/
  /newsroom/
  /releases/
  /statement
Blocked URL patterns:
  /login
  /privacy
  /terms
  /contact
  /careers
Authorization header: <leave empty>
```

### A.4. Что должно появиться в `/admin/resources`

Ожидаемая картина:

- `editorial` rows должны быть основной частью результата;
- часть `editorial` rows должна иметь `projected_article_id`;
- `projection=projected` не должен быть пустым для хорошего newsroom target;
- `document` rows допустимы, но не должны доминировать.

Что считать успехом:

1. есть `editorial` rows;
2. хотя бы часть из них projected;
3. resource detail открывается;
4. projected resource ведет на `/admin/articles/[docId]`.

Что не считать ошибкой:

- часть rows осталась resource-only;
- на странице есть небольшое количество `document` / `listing` noise.

---

## 4. Пример B — Документы, notices и tenders portal

**Сценарий:** public portal, где основной truth слой состоит из notices, procurement listings, documents и detail pages, а не из editorial articles.

### B.1. Что проверяет этот кейс

Этот кейс проверяет:

- что non-editorial `web_resources` materialize-ятся нормально;
- что они остаются видимыми в `/admin/resources`;
- что `resource-only` outcome сам по себе считается успехом, а не недоработкой.

### B.2. Конкретные URL для старта

#### Вариант B1 — TED EU Tenders

```text
Entry URL:
https://ted.europa.eu/en/

Optional section URL:
https://ted.europa.eu/en/advanced-search
```

Что здесь особенно полезно:

- ярко выраженный listing/notices portal;
- хороший тест на `listing`, `document`, `resource-only`;
- не стоит ожидать классический newsroom-style article projection как главный результат.

#### Вариант B2 — EBRD Procurement Notices

```text
Entry URL:
https://www.ebrd.com/home/work-with-us/project-procurement/procurement-notices.html

Alternative URL:
https://www.ebrd.com/work-with-us/procurement/notices.html?1=1&filterContract=Consultancy+Services
```

Что здесь особенно полезно:

- procurement notices flow;
- list/detail structure;
- хороший кандидат на non-editorial rows.

#### Вариант B3 — World Bank Procurement Notices

```text
Entry URL:
https://www.worldbank.org/en/projects-operations/procurement
```

Что здесь особенно полезно:

- official procurement notices hub;
- document/notices semantics;
- честный тест на resource-only lane.

### B.3. Рекомендуемая конфигурация channel

```text
Name: Procurement documents example
Website entry URL: <one URL from B1/B2/B3>
Language: en
Active: true
Poll interval (s): 1800
Adaptive: true
Max poll interval (s): 28800
Request timeout (ms): 10000
Total poll timeout (ms): 60000
Max resources per poll: 30
Crawl delay (ms): 1000
Sitemap discovery enabled: true
Feed discovery enabled: false
Collection discovery enabled: true
Download discovery enabled: true
Browser fallback enabled: false
Collection seed URLs:
  <optional section URL from the same target if available>
Allowed URL patterns:
  /procurement
  /tender
  /notice
  /search
  /detail
  /document
Blocked URL patterns:
  /login
  /privacy
  /terms
  /careers
  /newsroom
Authorization header: <leave empty>
```

### B.4. Что должно появиться в `/admin/resources`

Ожидаемая картина:

- доминируют `document`, `listing`, иногда `entity`;
- `projection=resource_only` должен быть самым полезным фильтром;
- `projection=projected` может быть пустым и это **нормально**;
- главная ценность здесь не в `articles`, а в persisted resource truth.

Что считать успехом:

1. `resource-only` rows materialize-ятся;
2. `/admin/resources` не скрывает non-editorial truth;
3. resource detail usable даже без article projection.

Что не считать ошибкой:

- `Projected = 0`;
- отсутствие `editorial` rows;
- пустой `/admin/articles` для этого target.

---

## 5. Пример C — Public JS-heavy newsroom / product announcements

**Сценарий:** публичный product/news/announcements site, где cheap/static path может быть слабым, а bounded browser-assisted fallback должен давать additive value.

### C.1. Что проверяет этот кейс

Этот кейс проверяет:

- честный before/after для `browserFallbackEnabled`;
- browser-assisted provenance в `/admin/resources`;
- отсутствие hidden-feed auto-conversion в RSS;
- bounded support only for public JS-heavy targets.

### C.2. Конкретные URL для старта

#### Вариант C1 — OpenAI Product news

```text
Entry URL:
https://openai.com/news/product/

Alternative section URL:
https://openai.com/news/product-releases/
```

Что здесь особенно полезно:

- публичный product/news surface;
- хороший кандидат на JS-heavy/public announcements path;
- уместно сравнивать cheap/static и browser-assisted результаты.

#### Вариант C2 — OpenAI Company announcements

```text
Entry URL:
https://openai.com/news/company-announcements/
```

Что здесь особенно полезно:

- та же семья сайта, но другой section shape;
- удобно сравнить поведение одной платформы на соседнем разделе.

#### Вариант C3 — Stripe Press / Newsroom

```text
Entry URL:
https://stripe.com/press

Alternative section URL:
https://stripe.com/us/newsroom
```

Что здесь особенно полезно:

- крупный public product/company newsroom;
- хороший target для bounded browser-assisted проверки;
- mix news/stories/about surfaces помогает проверить patterns.

### C.3. Рекомендуемая конфигурация channel

Для каждого URL из C1/C2/C3 делайте два прогона: сначала без browser fallback, потом с ним.

#### Pass 1 — baseline without browser fallback

```text
Name: JS-heavy newsroom baseline
Website entry URL: <one URL from C1/C2/C3>
Language: en
Active: true
Poll interval (s): 900
Adaptive: true
Max poll interval (s): 14400
Request timeout (ms): 12000
Total poll timeout (ms): 70000
Max resources per poll: 20
Crawl delay (ms): 1000
Sitemap discovery enabled: true
Feed discovery enabled: true
Collection discovery enabled: true
Download discovery enabled: true
Browser fallback enabled: false
Collection seed URLs:
  <optional sibling section URL from the same target>
Allowed URL patterns:
  /news/
  /press
  /product
  /announcements
  /company
Blocked URL patterns:
  /login
  /privacy
  /terms
  /careers
  /support
Authorization header: <leave empty>
```

#### Pass 2 — browser-assisted pass

Оставьте все то же самое, кроме:

```text
Browser fallback enabled: true
```

### C.4. Что должно появиться в `/admin/resources`

До browser fallback допустимы:

- бедный результат;
- мало useful rows;
- в основном collection/listing noise.

После browser fallback нормальный outcome такой:

- появляются новые useful rows;
- `discovery_source` или detail truth показывает browser-assisted provenance;
- часть rows может стать projected `editorial`;
- provider truth остается `website`, а не деградирует в RSS shortcut.

Что считать успехом:

1. cheap/static baseline честно показывает ограничение;
2. browser-assisted pass дает additive improvement;
3. provenance видна в `/admin/resources` и detail.

Что не считать ошибкой:

- cheap/static baseline почти пустой;
- не все JS-heavy rows становятся projected;
- часть rows остается resource-only.

---

## 6. Сравнительная таблица трех кейсов

| Параметр | Пример A | Пример B | Пример C |
|---|---|---|---|
| Основная цель | projected editorial rows | resource-only truth | browser-assisted additive discovery |
| Тип сайта | newsroom / press releases | tenders / notices / documents | public JS-heavy product/news |
| Browser fallback | `false` | `false` | сначала `false`, потом `true` |
| Основной успех | есть `editorial` + projection | есть `document` / `listing` без скрытия | after-fallback rows более полезны |
| Что чаще всего путают с багом | не все rows projected | нет articles | cheap mode почти пустой |
| Что на самом деле норма | часть rows остается resource-only | `Projected = 0` может быть нормой | fallback нужен только после честного gap |

---

## 7. Общий порядок проверки для любого примера

1. Поднимите stack:

```sh
pnpm dev:mvp:internal
```

2. Создайте одну `website` channel на один live target.

3. Найдите `channelId` в admin.

4. Форсируйте poll:

```sh
docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml \
  exec -T fetchers pnpm --filter @newsportal/fetchers run:once <channelId>
```

5. Откройте:

- `/admin/resources?channelId=<channelId>`

6. Проверьте фильтры:

- `projection=all`
- `projection=projected`
- `projection=resource_only`
- `resourceKind`
- `extractionState`

7. Откройте 2-3 detail rows.

8. Если есть projected row, откройте связанный `/admin/articles/[docId]`.

---

## 8. FAQ по live examples

### Почему тут несколько URL на кейс, а не один?

Чтобы у вас был выбор между:

- более стабильным official section;
- альтернативным section URL;
- похожим по типу сайтом, если первый target временно меняется или деградирует.

### Нужно ли использовать все URL из одного кейса сразу?

Нет. На первом прогоне лучше брать **один URL = одна channel**.

### Какой кейс лучше всего показывает, что `web_resources` не скрываются behind articles?

Пример B.

### Какой кейс лучше всего показывает operator-ready happy path?

Пример A.

### Какой кейс лучше использовать для проверки browser-assisted path?

Пример C.

### Что делать, если live сайт поменялся после 15 апреля 2026?

Используйте тот же archetype:

- newsroom
- tenders/documents portal
- public JS-heavy announcements site

и подставьте другой похожий официальный URL, сохранив логику конкретного кейса.
