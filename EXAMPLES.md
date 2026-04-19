# EXAMPLES.md — Готовые RSS и template-конфигурации NewsPortal для типовых проектов

> **Для кого этот документ:** для администратора, который уже поднял NewsPortal и хочет быстро наполнить систему готовыми RSS-каналами, LLM-шаблонами и шаблонами интересов под типовой сценарий.
>
> **Что этот документ покрывает:** primary operator-facing source для built-in example bundles (`RSS + Templates`) и отдельный appendix по discovery mode, который помогает расширять эти же сценарии новыми источниками.
>
> **Что этот документ не покрывает полностью:** полный `.env.dev` bootstrap, весь manual MVP runbook, полный website/hard-site operator pass и live-internet edge cases вне bounded local setup.
>
> **Перед началом:** прочитайте [HOW_TO_USE.md](./HOW_TO_USE.md) для общего админ-потока, [README.md](./README.md) для discovery/runtime env и [docs/manual-mvp-runbook.md](./docs/manual-mvp-runbook.md) для полного MVP walkthrough.

---

## Оглавление

1. [Как пользоваться этим документом](#1-как-пользоваться-этим-документом)
2. [Практические советы по качеству шаблонов](#2-практические-советы-по-качеству-шаблонов)
3. [Пример A — Агрегатор вакансий (Job Board)](#3-пример-a--агрегатор-вакансий-job-board)
   - [A.1. RSS-каналы](#a1-rss-каналы)
   - [A.2. LLM-шаблоны](#a2-llm-шаблоны)
   - [A.3. Шаблоны интересов](#a3-шаблоны-интересов)
   - [A.4. Переиндексация после настройки](#a4-переиндексация-после-настройки)
4. [Пример B — IT-новости для разработчиков](#4-пример-b--it-новости-для-разработчиков)
   - [B.1. RSS-каналы](#b1-rss-каналы)
   - [B.2. LLM-шаблоны](#b2-llm-шаблоны)
   - [B.3. Шаблоны интересов](#b3-шаблоны-интересов)
   - [B.4. Переиндексация после настройки](#b4-переиндексация-после-настройки)
5. [Пример C — Поиск клиентов для аутсорс-компании по всему миру](#5-пример-c--поиск-клиентов-для-аутсорс-компании-по-всему-миру)
   - [C.1. RSS-каналы](#c1-rss-каналы)
   - [C.2. LLM-шаблоны](#c2-llm-шаблоны)
   - [C.3. Шаблоны интересов](#c3-шаблоны-интересов)
   - [C.4. Переиндексация после настройки](#c4-переиндексация-после-настройки)
6. [Сравнительная таблица трёх конфигураций](#6-сравнительная-таблица-трёх-конфигураций)
7. [Discovery Mode для этих примеров](#7-discovery-mode-для-этих-примеров)
   - [7.1. Что discovery добавляет, а что не заменяет](#71-что-discovery-добавляет-а-что-не-заменяет)
   - [7.2. Что должно быть готово заранее](#72-что-должно-быть-готово-заранее)
   - [7.3. Какие discovery-настройки нужны и что они означают](#73-какие-discovery-настройки-нужны-и-что-они-означают)
   - [7.4. Пошаговое включение и проверка](#74-пошаговое-включение-и-проверка)
   - [7.5. Как связать discovery с примерами A, B и C](#75-как-связать-discovery-с-примерами-a-b-и-c)
   - [7.6. Что все еще остается вне этого файла](#76-что-все-еще-остается-вне-этого-файла)
8. [FAQ по примерам](#8-faq-по-примерам)

---

## 1. Как пользоваться этим документом

Каждый пример содержит **полный content-набор настроек** для одного тематического сценария, готовый к вводу в панель администратора после базового setup:

1. **RSS-каналы** — JSON для массового импорта (Bulk Import) на странице Channels; для shared bulk import каждая row должна явно нести `providerType`
2. **LLM-шаблоны** — active baseline промпты, состав которых зависит от сценария; ориентируйтесь на конкретный пример ниже. Для Example C все 3 scope (`interests`, `criteria`, `global`) являются active baseline.
3. **Шаблоны интересов** — набор системных тем с положительными и отрицательными прототипами, которые создаются на странице Templates в правой колонке и синхронизируются в live `criteria`
4. **Profile policy, hard filters и candidate cues** — для каждого system interest теперь важно заполнить прототипы, profile policy (`Strictness`, `Unresolved outcome`, `LLM review mode`), `must_not_have_terms`, `allowed_content_kinds`, `priority` и `candidate uplift positive/negative cues`; `must_have_terms` и `time_window_hours` остаются опциональными hard filters и для recall-first baseline обычно оставляются пустыми

Для built-in example bundles именно этот файл должен считаться первичным human-facing источником. Узкие companion docs в `docs/data_scripts/*` могут помогать отдельному use case, но не должны расходиться с этим документом и не должны переопределять его.

Перед использованием примеров убедитесь, что у вас уже есть:

1. Заполненный `.env.dev` и рабочий локальный stack
2. Настроенный Firebase admin sign-in и allowlist
3. Понимание, что базовый content bundle живет здесь, discovery setup теперь описан в разделе 7, а полный website/hard-site manual pass по-прежнему живет в `README.md` и `docs/manual-mvp-runbook.md`

**Порядок действий:**

```
1. Импортировать каналы (Channels → Bulk Import)
2. Создать LLM-шаблоны (Templates → левая колонка)
3. Создать шаблоны интересов (Templates → правая колонка)
4. Для каждого system interest выставить runtime policy ровно так, как она указана в текущем примере: `Strictness` может различаться по шаблонам, а `Unresolved outcome = hold` и `LLM review mode = always` остаются baseline, если ниже не указано иное
5. Запустить переиндексацию (Reindex → interest_centroids)
6. Подождать 10–15 минут и проверить результат (Articles, Clusters, Observability)
7. Если нужен полный MVP/manual verification pass, вернуться к `docs/manual-mvp-runbook.md`, а не останавливаться на этом документе
```

> ⚠️ **Не забудьте переиндексацию!** После создания или изменения шаблонов интересов всегда запускайте переиндексацию `interest_centroids`. Это обновит derived index, а режим repair/backfill поможет пересчитать уже существующие статьи по текущему системному набору тем.

---

## 2. Практические советы по качеству шаблонов

Прежде чем перейти к конкретным примерам, вот ключевые принципы, которые помогут вам адаптировать шаблоны под свой проект.

### Как работает скоринг «под капотом»

Система оценивает каждую статью по формуле, в которой:

- **Положительный скор** (вес ≈ 55%) — насколько статья похожа на ваши положительные прототипы
- **Отрицательный скор** (штраф ≈ −30%) — насколько статья похожа на ваши отрицательные прототипы
- **Мета-скор** (≈ 15%) — совпадения по языку, географии, ключевым словам
- **Новизна** (≈ 15%) — является ли это действительно новым событием

> 💡 **Ключевой вывод:** Отрицательные прототипы имеют **очень большой вес** (−30%). Три хорошо подобранных отрицательных прототипа могут кардинально снизить ложные срабатывания. Не пренебрегайте ими!

### Три правила эффективных прототипов

| Правило | Почему важно | Пример (плохо → хорошо) |
|---|---|---|
| **Разнообразие** | Одинаковые прототипы не расширяют охват — система уже «видит» эту область | ❌ `AI regulation in EU` / `AI rules in Europe` / `European AI law` → ✅ `EU passes AI regulation act` / `US proposes AI safety framework` / `UN adopts global AI ethics guidelines` |
| **Конкретность** | Общие фразы совпадают со слишком многим | ❌ `News about jobs` → ✅ `Senior backend engineer position at fintech startup in Berlin` |
| **Негативы из смежных тем** | Лучшие негативы — те, что «почти подходят», но не подходят | Для темы «вакансии»: ❌ `Weather forecast for today` → ✅ `Tech company announces 500 layoffs` |

### Как снизить расходы на LLM

В текущем baseline runtime статьи из «серой зоны» отправляются на проверку ИИ прежде всего на уровне **системных критериев**. Чтобы уменьшить количество таких проверок и расходы:

- **Добавьте больше прототипов** (5–7 положительных, 3–5 отрицательных) — система будет увереннее в решениях
- **Сделайте прототипы максимально непохожими друг на друга** — это расширяет «понимание» темы
- **Обновляйте прототипы** при появлении новых подтем — если начали появляться статьи о теме, которую система не знает, добавьте примеры

### Как теперь понимать hard constraints

Если вы используете поля вроде `must_have_terms`, `must_not_have_terms` и `short_tokens_required`, важно помнить их текущую семантику:

- `must_have_terms` работают как `OR`: статья проходит этот фильтр, если в `title + lead + body` встретился хотя бы один из указанных термов.
- `must_not_have_terms` работают как блокирующий список: достаточно одного совпадения, чтобы статья была отфильтрована.
- `short_tokens_required` работают жёстче и ближе к `AND`: требуемые short tokens должны присутствовать в извлечённых признаках статьи.
- `time_window_hours` тоже является hard gate: всё, что старше окна, не дойдёт до semantic/LLM stage.

Практический вывод:

- для большинства recall-first сценариев первый baseline лучше запускать с пустыми `must_have_terms` и пустым `time_window_hours`, чтобы не убить редкие формулировки до semantic/LLM stage;
- `must_have_terms` стоит включать только для действительно обязательных идентификаторов, без которых interest теряет смысл;
- не перегружайте `must_have_terms` длинными списками общих слов вроде `partner`, `migration`, `transformation`, иначе вы получите массовый early drop вместо полезного recall;
- `must_not_have_terms` и negative candidate cues обычно безопаснее, чем `must_have_terms`, потому что они режут явный шум, а не весь поток;
- duplicate article rows одного и того же canonical документа не должны считаться отдельными победителями: operator/user surfaces должны показывать один canonical-selected сигнал, а повторные article rows нужны для provenance, а не для надувания `selected` и `LLM review` метрик;
- если видите повторный review/selected по одной и той же canonical семье, сначала проверяйте canonical reuse и negative cues, а не расширяйте `must_have_terms`;
- для recall-first baseline generic candidate cues должны оставаться структурными (`request`, `replacement`, `procurement`, `implementation pressure`); listicle/ranking wording вроде `top`, `best`, `our picks`, `worth your time` лучше подавлять через negative cues и prompt semantics конкретного application bundle, а не считать достаточным позитивным сигналом.
- если нужен более точный контроль, держите broad тему в прототипах и candidate cues, а hard constraints добавляйте только после наблюдений по живому потоку.

### Что теперь обязательно заполнять для каждого system interest

Во всех трёх примерах ниже шаблон считается настроенным полностью только если вы заполнили:

- `Positive prototypes`
- `Negative prototypes`
- `Must-not-have terms`
- `Allowed content kinds`
- `Priority`
- `Candidate uplift positive cues`
- `Candidate uplift negative cues`
- runtime policy в additive `selection_profiles`:
  - `Strictness` должна совпадать со значением, указанным в таблице конкретного шаблона или сценария
  - `Unresolved outcome = hold`
  - `LLM review mode = always`

Опционально и только при необходимости точечного tighten-up:

- `Must-have terms`
- `Time window hours`
- `Required short tokens`
- `Forbidden short tokens`

Ниже в примерах A, B и C каналы остаются без изменений, а недостающие operator settings добавлены так, чтобы каждый сценарий можно было воспроизвести через админку полностью.

---

## 3. Пример A — Агрегатор вакансий (Job Board)

**Сценарий:** Сайт собирает вакансии и карьерные новости из различных RSS-лент и других источников. Целевая аудитория — IT-специалисты, ищущие работу. Система должна отличать **реальные вакансии** от новостей о компаниях, обзоров рынка труда и HR-статей.

**Особенность этого типа сайта:** Главная задача фильтрации — отделить настоящие объявления о вакансиях и конкретные карьерные возможности от общего информационного шума про рынок труда.

---

### A.1. RSS-каналы

Перейдите в **Channels → Bulk Import**, вставьте следующий JSON и нажмите **Validate**, затем **Import JSON**. Для shared bulk import каждая row ниже уже явно включает `"providerType": "rss"`:

```json
[
  {
    "providerType": "rss",
    "name": "Hacker News — Ask HN: Who is hiring?",
    "fetchUrl": "https://hnrss.org/show?q=hiring",
    "language": "en",
    "pollIntervalSeconds": 1800,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 14400,
    "maxItemsPerPoll": 30,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "We Work Remotely — Programming",
    "fetchUrl": "https://weworkremotely.com/categories/remote-programming-jobs.rss",
    "language": "en",
    "pollIntervalSeconds": 900,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 7200,
    "maxItemsPerPoll": 25,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "We Work Remotely — DevOps & Sysadmin",
    "fetchUrl": "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss",
    "language": "en",
    "pollIntervalSeconds": 900,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 7200,
    "maxItemsPerPoll": 25,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "We Work Remotely — Management & Finance",
    "fetchUrl": "https://weworkremotely.com/categories/remote-business-management-finance.rss",
    "language": "en",
    "pollIntervalSeconds": 1800,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 14400,
    "maxItemsPerPoll": 20,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "We Work Remotely — Design",
    "fetchUrl": "https://weworkremotely.com/categories/remote-design-jobs.rss",
    "language": "en",
    "pollIntervalSeconds": 1800,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 14400,
    "maxItemsPerPoll": 20,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "RemoteOK — Remote Jobs Feed",
    "fetchUrl": "https://remoteok.com/remote-jobs.rss",
    "language": "en",
    "pollIntervalSeconds": 900,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 7200,
    "maxItemsPerPoll": 30,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "Stack Overflow Jobs — Blog",
    "fetchUrl": "https://stackoverflow.blog/feed/",
    "language": "en",
    "pollIntervalSeconds": 3600,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 14400,
    "maxItemsPerPoll": 15,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "GitHub Blog — Engineering",
    "fetchUrl": "https://github.blog/feed/",
    "language": "en",
    "pollIntervalSeconds": 3600,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 14400,
    "maxItemsPerPoll": 10,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "LinkedIn News — Tech Industry",
    "fetchUrl": "https://news.google.com/rss/search?q=tech+hiring+jobs&hl=en-US&gl=US&ceid=US:en",
    "language": "en",
    "pollIntervalSeconds": 1800,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 7200,
    "maxItemsPerPoll": 20,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "TechCrunch — Startups",
    "fetchUrl": "https://techcrunch.com/category/startups/feed/",
    "language": "en",
    "pollIntervalSeconds": 600,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 3600,
    "maxItemsPerPoll": 20,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "VentureBeat",
    "fetchUrl": "https://venturebeat.com/feed/",
    "language": "en",
    "pollIntervalSeconds": 900,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 7200,
    "maxItemsPerPoll": 15,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "dev.to — Career Tag",
    "fetchUrl": "https://dev.to/feed/tag/career",
    "language": "en",
    "pollIntervalSeconds": 1800,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 14400,
    "maxItemsPerPoll": 15,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "dev.to — Hiring Tag",
    "fetchUrl": "https://dev.to/feed/tag/hiring",
    "language": "en",
    "pollIntervalSeconds": 1800,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 14400,
    "maxItemsPerPoll": 15,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "Indeed — Software Engineer RSS",
    "fetchUrl": "https://www.indeed.com/rss?q=software+engineer&l=remote",
    "language": "en",
    "pollIntervalSeconds": 900,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 7200,
    "maxItemsPerPoll": 25,
    "isActive": true
  }
]
```

> 💡 **Рекомендации по каналам для Job Board:**
> - Джоб-борды с RSS (We Work Remotely, RemoteOK) — основной источник, опрашивайте чаще (каждые 15 мин)
> - Агрегаторы новостей (Google News, TechCrunch) — дополнительный источник для карьерных новостей, можно реже (каждые 30 мин)
> - Блоги (dev.to, GitHub Blog) — фоновый источник для карьерных статей, ещё реже (каждые 30–60 мин)
> - RSS-ленты могут меняться — если канал перестал работать, проверьте актуальный URL на сайте источника

---

### A.2. LLM-шаблоны

Перейдите в **Templates** и создайте в левой колонке как минимум два active baseline шаблона: `criteria` и `global`. Ниже также приведён optional future-ready шаблон `interests`, если позже будет включена расширенная персонализация.

#### LLM-шаблон 1: interests (optional future-ready, не используется в baseline по умолчанию)

| Поле | Значение |
|---|---|
| **Template name** | `Job Board — Interest Review` |
| **Scope** | `interests` |

**Prompt template:**
```
You are a job-listing relevance reviewer for a job aggregator platform.

The user is tracking this job category: "{interest_name}"

An article or listing has landed in the gray zone — the system is not confident whether it matches.

Article title: {title}
Article lead: {lead}
Article body (truncated): {body}
Match context: {explain_json}

Your task: decide whether this content represents a REAL job opportunity or career-relevant content for the specified category.

APPROVE if:
- It is an actual job posting, vacancy listing, or hiring announcement for the tracked category
- It describes specific open positions with concrete role details (title, company, skills, location)
- It is a company hiring page or "we are hiring" announcement directly relevant to the category

REJECT if:
- It is a general industry news article that mentions jobs only in passing
- It is a market analysis, salary survey, or labor statistics report without specific openings
- It is a company earnings report, product launch, or press release unrelated to hiring
- It is an opinion piece, career advice article, or "how to get hired" guide without a real opening
- It is about layoffs, downsizing, or restructuring (the opposite of a job opportunity)

Respond ONLY with a JSON object:
{"decision": "approve" or "reject" or "uncertain", "score": 0.0 to 1.0, "reason": "one sentence"}

Be strict. If the content does not contain a specific job opening or hiring signal, reject it.
```

#### LLM-шаблон 2: criteria (проверка системных критериев)

| Поле | Значение |
|---|---|
| **Template name** | `Job Board — Criterion Review` |
| **Scope** | `criteria` |

**Prompt template:**
```
You are a content classification reviewer for a job aggregator platform.

The system criterion is: "{criterion_name}"

An article has landed in the gray zone — the automated scoring was inconclusive.

Article title: {title}
Article lead: {lead}
Article body (truncated): {body}
Scoring details: {explain_json}

Your task: decide whether this content meets the system criterion.

Key classification rules for a job board:
- Job postings, vacancy announcements, and "we are hiring" content are the PRIMARY content type
- Hiring roundups ("10 companies hiring this week") are RELEVANT if they contain specific companies and roles
- Company funding news is RELEVANT only if it explicitly mentions upcoming hiring plans
- General tech news, product launches, and opinion articles are NOT relevant unless they contain hiring signals

Respond ONLY with a JSON object:
{"decision": "approve" or "reject" or "uncertain", "score": 0.0 to 1.0, "reason": "one sentence"}
```

#### LLM-шаблон 3: global (универсальный запасной)

| Поле | Значение |
|---|---|
| **Template name** | `Job Board — Global Fallback` |
| **Scope** | `global` |

**Prompt template:**
```
You are a content relevance reviewer for a job aggregator platform that collects IT job postings and career opportunities.

An article has landed in the gray zone — the system is not confident in its relevance decision.

Article title: {title}
Article lead: {lead}
Article body (truncated): {body}
Review context: {explain_json}

Core question: Does this content contain or directly signal a specific job opportunity, hiring activity, or vacancy?

APPROVE if the content:
- Contains a concrete job posting or hiring announcement
- Describes a specific open position or role at an identified company
- Is a curated list of current job openings

REJECT if the content:
- Is general industry news without hiring signals
- Is career advice, interview tips, or resume guides
- Is about layoffs, restructuring, or hiring freezes
- Mentions "jobs" only as an economic indicator, not as actual openings

Respond ONLY with a JSON object:
{"decision": "approve" or "reject" or "uncertain", "score": 0.0 to 1.0, "reason": "one sentence"}

When in doubt, reject. It is better to miss a borderline article than to clutter the feed with non-job content.
```

---

### A.3. Шаблоны интересов

Перейдите в **Templates** и создайте следующие шаблоны в правой колонке (**Create Interest Template**). Для каждого шаблона вводите прототипы **по одному на строке**.

#### Общие runtime-настройки для всех job-board шаблонов

Во всех 8 шаблонах примера A используйте одинаковую profile policy:

| Поле | Значение |
|---|---|
| **Strictness** | `balanced` |
| **Unresolved outcome** | `hold` |
| **LLM review mode** | `always` |
| **Candidate cue source** | `selection_profile_definition` |

Общие принципы для job-board сценария:

- `Allowed content kinds` почти всегда: `listing`, `editorial`
- первый baseline лучше запускать с пустыми `must_have_terms` и пустым `time_window_hours`; включайте их позже только если уже увидели устойчивый шум и точно понимаете, что режете
- если всё-таки нужен hard filter, `must_have_terms` должны содержать только действительно обязательные hiring markers, а не широкие role/topic words
- negative candidate cues должны отрезать карьерные советы, market analysis, layoffs, salary reports и generic company news
- positive candidate cues должны поднимать только случаи, где есть реальная вакансия, hiring-announcement или конкретный recruiting intent

Важно: блоки `Must-have terms` и `Time window hours` ниже следует читать как optional tightening candidates, а не как обязательный baseline для первого прогона.

Общие negative candidate cues для большинства job-board шаблонов:

```text
career_advice_noise: interview tips | resume guide | career advice | how to get hired
market_report_noise: salary survey | labor statistics | market analysis | hiring trends
non_opening_noise: layoffs | restructuring | earnings report | product launch
```

---

#### 1. Backend Engineering Jobs

| Поле | Значение |
|---|---|
| **Name** | `Backend Engineering Jobs` |
| **Description** | `Job openings for backend developers: Python, Java, Go, Node.js, APIs, databases, microservices` |

**Positive prototypes:**
```
Senior Python backend developer needed at fintech startup in Berlin
Hiring Go engineer for distributed systems team — fully remote
Java backend developer position at healthcare SaaS company
We are hiring Node.js engineers to build real-time API platform
Staff backend engineer role at e-commerce scale-up — PostgreSQL and Redis expertise
Mid-level Python Django developer wanted for Series B startup — remote OK
Backend software engineer opening at cloud infrastructure company — Rust or Go preferred
```

**Negative prototypes:**
```
How to prepare for a backend engineering interview in 2026
Python 3.15 release introduces new performance optimizations
Amazon Web Services reports record quarterly revenue growth
Tech industry salary survey reveals backend engineers earn 15% more than average
Company announces migration from monolith to microservices architecture
```

**Дополнительно заполните в админке:**

**Must-have terms:**
```text
backend engineer
backend developer
python backend
java backend
go engineer
node.js engineer
microservices
api platform
```

**Must-not-have terms:**
```text
interview guide
salary survey
quarterly revenue
migration case study
```

**Allowed content kinds:** `listing`, `editorial`
**Time window hours:** `336`
**Priority:** `1.00`

**Candidate uplift positive cues:**
```text
hiring_signal: hiring | we are hiring | position | opening
role_core: backend engineer | backend developer | python | java | go | node.js
job_detail: remote | full-time | skills | experience required
```

---

#### 2. Frontend & React Jobs

| Поле | Значение |
|---|---|
| **Name** | `Frontend & React Jobs` |
| **Description** | `Job openings for frontend developers: React, Vue, Angular, TypeScript, UI/UX engineering` |

**Positive prototypes:**
```
Senior React developer needed for B2B SaaS dashboard — remote position
Hiring frontend engineer with TypeScript and Next.js experience
Vue.js developer position at digital agency — Berlin office
We are looking for a staff frontend engineer to lead our design system team
Mid-level React Native developer opening at mobile-first fintech startup
Frontend architect role at enterprise platform — Angular and microfrontends
UI engineer wanted for accessibility-focused product team — remote US only
```

**Negative prototypes:**
```
React 20 released with new concurrent rendering features
Best VS Code extensions for frontend developers in 2026
Frontend development trends to watch this year
Chrome DevTools adds new CSS debugging capabilities
Comparing React Server Components vs traditional client-side rendering
```

**Дополнительно заполните в админке:**

**Must-have terms:**
```text
frontend engineer
frontend developer
react developer
typescript
next.js
vue.js
angular
ui engineer
```

**Must-not-have terms:**
```text
frontend trends
vs code extensions
browser features
rendering comparison
```

**Allowed content kinds:** `listing`, `editorial`
**Time window hours:** `336`
**Priority:** `0.98`

**Candidate uplift positive cues:**
```text
hiring_signal: hiring | we are looking for | opening | position
role_core: react | vue | angular | typescript | ui engineer | frontend architect
job_detail: remote | hybrid | design system | experience required
```

---

#### 3. AI & Machine Learning Positions

| Поле | Значение |
|---|---|
| **Name** | `AI & Machine Learning Positions` |
| **Description** | `Job openings in AI, ML, data science: model training, NLP, computer vision, MLOps, LLM engineering` |

**Positive prototypes:**
```
Senior ML engineer needed to build recommendation system at streaming platform
Hiring NLP research scientist for conversational AI team — PhD preferred
Computer vision engineer position at autonomous vehicle startup
MLOps engineer role at healthcare AI company — Kubernetes and model deployment
LLM fine-tuning engineer wanted at AI-native SaaS startup — remote global
Data scientist opening at fintech — fraud detection and anomaly models
Junior AI engineer position at robotics company — PyTorch experience required
```

**Negative prototypes:**
```
OpenAI releases GPT-5 with reasoning capabilities
Google DeepMind achieves breakthrough in protein folding prediction
How to transition from software engineering to machine learning career
AI startup raises $200M Series C to expand enterprise offerings
New open-source LLM outperforms commercial models on benchmarks
Stanford publishes annual AI Index report showing industry growth
```

**Дополнительно заполните в админке:**

**Must-have terms:**
```text
ml engineer
machine learning engineer
nlp scientist
computer vision engineer
llm engineer
mlops engineer
data scientist
```

**Must-not-have terms:**
```text
annual ai index
career transition
funding round
benchmark report
```

**Allowed content kinds:** `listing`, `editorial`
**Time window hours:** `336`
**Priority:** `1.00`

**Candidate uplift positive cues:**
```text
hiring_signal: hiring | needed | position | role
role_core: ml engineer | nlp | computer vision | llm | mlops | data scientist
job_detail: phd preferred | remote | experience required | team
```

---

#### 4. Remote Work Opportunities

| Поле | Значение |
|---|---|
| **Name** | `Remote Work Opportunities` |
| **Description** | `Fully remote and remote-first job openings across all tech roles and seniority levels` |

**Positive prototypes:**
```
Fully remote senior software engineer position at distributed-first company
Remote product designer role — work from anywhere in EU time zones
Hiring remote DevOps engineer — async-first culture with flexible hours
100% remote data analyst position at Series A climate tech startup
Remote technical writer needed for developer documentation platform
Work-from-home customer success engineer at B2B SaaS company
Remote engineering manager role leading globally distributed team of eight
```

**Negative prototypes:**
```
Study shows remote workers report higher productivity but more loneliness
Company mandates return to office three days per week starting January
Best home office setups for remote developers — gear guide
How to manage remote engineering teams effectively
Slack introduces new features for asynchronous remote collaboration
Remote work tax implications for digital nomads in Europe
```

**Дополнительно заполните в админке:**

**Must-have terms:**
```text
fully remote
remote position
remote role
work from anywhere
distributed team
async-first
```

**Must-not-have terms:**
```text
productivity study
return to office
gear guide
tax implications
```

**Allowed content kinds:** `listing`, `editorial`
**Time window hours:** `168`
**Priority:** `0.92`

**Candidate uplift positive cues:**
```text
remote_signal: fully remote | remote role | remote position | work from anywhere
hiring_signal: hiring | needed | opening | role
distribution_signal: distributed team | async-first | flexible hours
```

---

#### 5. DevOps & SRE Roles

| Поле | Значение |
|---|---|
| **Name** | `DevOps & SRE Roles` |
| **Description** | `Job openings for DevOps engineers, SREs, platform engineers: Kubernetes, CI/CD, cloud infrastructure, observability` |

**Positive prototypes:**
```
Senior SRE needed at payments platform — on-call rotation and incident management
DevOps engineer position at video streaming company — Terraform and AWS
Platform engineer role at fintech unicorn — Kubernetes and service mesh expertise
Hiring cloud infrastructure engineer — GCP and multi-region architecture
Senior DevOps engineer opening at healthcare startup — SOC2 compliance experience
Site reliability engineer wanted for high-traffic e-commerce platform
Infrastructure engineer position — GitOps, ArgoCD, and observability stack
```

**Negative prototypes:**
```
Kubernetes 1.32 released with improved pod scheduling
HashiCorp changes Terraform license to BSL — community reacts
AWS re:Invent 2026 announcements roundup
How to pass the Certified Kubernetes Administrator exam
Comparison of CI/CD tools: GitHub Actions vs GitLab CI vs Jenkins
Datadog reports 30% year-over-year revenue growth
```

**Дополнительно заполните в админке:**

**Must-have terms:**
```text
devops engineer
site reliability engineer
sre
platform engineer
cloud infrastructure engineer
kubernetes
terraform
observability
```

**Must-not-have terms:**
```text
conference roundup
exam guide
tool comparison
quarterly revenue
```

**Allowed content kinds:** `listing`, `editorial`
**Time window hours:** `336`
**Priority:** `0.97`

**Candidate uplift positive cues:**
```text
hiring_signal: hiring | opening | position | wanted
role_core: devops | sre | platform engineer | kubernetes | terraform
job_detail: on-call | incident management | aws | gcp | observability
```

---

#### 6. Product & Project Management Roles

| Поле | Значение |
|---|---|
| **Name** | `Product & Project Management Roles` |
| **Description** | `Job openings for product managers, project managers, program managers, and Scrum Masters in tech companies` |

**Positive prototypes:**
```
Senior product manager needed for payments platform — fintech experience required
Hiring technical program manager to lead cross-team infrastructure migration
Product manager role at AI startup — user research and data-driven roadmapping
Scrum Master position at enterprise SaaS company — scaled Agile experience
We are looking for a group product manager to own developer tools vertical
Associate product manager opening at consumer social app — early career welcome
Project manager hiring at digital health company — FDA-regulated software
```

**Negative prototypes:**
```
How to write a great product requirements document — PM guide
Product management salary trends for 2026
Agile vs waterfall debate resurfaces in enterprise software
Top product management tools compared: Linear vs Jira vs Notion
CEO shares lessons learned from pivoting the company strategy three times
What product-led growth means for early-stage startups
```

**Дополнительно заполните в админке:**

**Must-have terms:**
```text
product manager
technical program manager
program manager
scrum master
project manager
group product manager
```

**Must-not-have terms:**
```text
pm guide
salary trends
agile debate
tool comparison
```

**Allowed content kinds:** `listing`, `editorial`
**Time window hours:** `336`
**Priority:** `0.90`

**Candidate uplift positive cues:**
```text
hiring_signal: hiring | needed | opening | we are looking for
role_core: product manager | program manager | scrum master | project manager
job_detail: roadmap | user research | agile | regulated software
```

---

#### 7. Data Engineering Jobs

| Поле | Значение |
|---|---|
| **Name** | `Data Engineering Jobs` |
| **Description** | `Job openings for data engineers: ETL/ELT pipelines, data warehousing, Spark, Airflow, dbt, streaming` |

**Positive prototypes:**
```
Senior data engineer needed to build real-time analytics pipeline — Kafka and Spark
Data engineer position at retail analytics company — dbt and Snowflake expertise
Hiring staff data engineer for data platform team — Airflow and BigQuery
Analytics engineer role at Series B startup — SQL and dbt focus
Data infrastructure engineer opening at autonomous driving company
We need a data engineer to build streaming ETL pipeline — Flink and Iceberg
Mid-level data engineer wanted for healthcare data warehouse team — remote
```

**Negative prototypes:**
```
Snowflake reports strong quarterly earnings beating analyst expectations
Apache Spark 4.0 released with new structured streaming features
How to design a modern data stack for early-stage startups
Databricks acquires data governance startup for $1.3 billion
Data engineering vs data science: understanding the career differences
Best practices for building reliable ELT pipelines — engineering blog post
```

**Дополнительно заполните в админке:**

**Must-have terms:**
```text
data engineer
analytics engineer
data platform
etl
elt
dbt
spark
airflow
```

**Must-not-have terms:**
```text
earnings
career differences
best practices
acquires
```

**Allowed content kinds:** `listing`, `editorial`
**Time window hours:** `336`
**Priority:** `0.96`

**Candidate uplift positive cues:**
```text
hiring_signal: hiring | needed | opening | wanted
role_core: data engineer | analytics engineer | spark | airflow | dbt | snowflake
job_detail: pipeline | warehouse | streaming | remote
```

---

#### 8. Startup Hiring & Founding Teams

| Поле | Значение |
|---|---|
| **Name** | `Startup Hiring & Founding Teams` |
| **Description** | `Early-stage hiring: co-founder search, first engineers, founding team roles at seed and pre-seed startups` |

**Positive prototypes:**
```
YC W26 startup seeking technical co-founder with backend experience
First engineering hire at pre-seed AI startup — founding engineer role
Seed-stage climate tech company hiring CTO and first three engineers
Looking for co-founder with ML expertise for health-tech venture
Founding engineer position at stealth fintech startup — equity-heavy compensation
Early-stage startup hiring first product designer — shape the product from scratch
Series A edtech company building engineering team — multiple senior roles open
```

**Negative prototypes:**
```
Startup raises $50M Series B and plans rapid team expansion
Y Combinator announces record number of applicants for latest batch
How to find the right co-founder — startup advice column
Venture capital funding drops 20% in Q1 2026 compared to last year
Startup founder shares five mistakes made while scaling from 10 to 100 people
Accelerator program announces deadline for summer cohort applications
```

**Дополнительно заполните в админке:**

**Must-have terms:**
```text
technical co-founder
founding engineer
first engineering hire
first product designer
seed-stage
pre-seed
```

**Must-not-have terms:**
```text
expansion plans
startup advice
funding drops
accelerator applications
```

**Allowed content kinds:** `listing`, `editorial`
**Time window hours:** `168`
**Priority:** `0.88`

**Candidate uplift positive cues:**
```text
early_stage_signal: pre-seed | seed-stage | yc | founding
hiring_signal: seeking | hiring | looking for | role
founding_role: co-founder | founding engineer | first hire | equity-heavy
```

---

### A.4. Переиндексация после настройки

После создания всех шаблонов интересов **обязательно** запустите переиндексацию:

1. Перейдите в **Reindex** (боковое меню → System → Reindex)
2. Выберите `interest_centroids`
3. Нажмите **Queue Reindex**
4. Дождитесь статуса **completed** в списке Recent Jobs

> ⚠️ Без переиндексации новые шаблоны интересов не повлияют на подбор статей! Система будет собирать и обрабатывать статьи, но не сможет сопоставлять их с новыми интересами.

---

## 4. Пример B — IT-новости для разработчиков

**Сценарий:** Новостной портал для программистов, который собирает материалы о стартапах, AI-технологиях, open source, языках программирования и инфраструктуре. Целевая аудитория — разработчики и технические лидеры. Система должна отличать **глубокие технические новости** от поверхностного потребительского контента и маркетинговых пресс-релизов.

**Особенность этого типа сайта:** Главная задача фильтрации — отделить новости, ценные для разработчика (новые релизы, уязвимости, архитектурные решения, технологические прорывы), от потребительских обзоров гаджетов, маркетинговых анонсов и общей бизнес-аналитики.

---

### B.1. RSS-каналы

Перейдите в **Channels → Bulk Import**, вставьте следующий JSON и нажмите **Validate**, затем **Import JSON**. Для shared bulk import каждая row ниже уже явно включает `"providerType": "rss"`:

```json
[
  {
    "providerType": "rss",
    "name": "Hacker News — Best Stories",
    "fetchUrl": "https://hnrss.org/best",
    "language": "en",
    "pollIntervalSeconds": 300,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 1800,
    "maxItemsPerPoll": 30,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "Hacker News — Newest",
    "fetchUrl": "https://hnrss.org/newest",
    "language": "en",
    "pollIntervalSeconds": 300,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 1800,
    "maxItemsPerPoll": 30,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "TechCrunch — All",
    "fetchUrl": "https://techcrunch.com/feed/",
    "language": "en",
    "pollIntervalSeconds": 300,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 3600,
    "maxItemsPerPoll": 25,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "Ars Technica — Technology",
    "fetchUrl": "https://feeds.arstechnica.com/arstechnica/technology-lab",
    "language": "en",
    "pollIntervalSeconds": 600,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 3600,
    "maxItemsPerPoll": 20,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "The Verge — Tech",
    "fetchUrl": "https://www.theverge.com/rss/tech/index.xml",
    "language": "en",
    "pollIntervalSeconds": 600,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 3600,
    "maxItemsPerPoll": 20,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "dev.to — Top Articles",
    "fetchUrl": "https://dev.to/feed",
    "language": "en",
    "pollIntervalSeconds": 900,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 7200,
    "maxItemsPerPoll": 25,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "Lobsters",
    "fetchUrl": "https://lobste.rs/rss",
    "language": "en",
    "pollIntervalSeconds": 600,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 3600,
    "maxItemsPerPoll": 25,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "InfoQ — All",
    "fetchUrl": "https://feed.infoq.com/",
    "language": "en",
    "pollIntervalSeconds": 1800,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 7200,
    "maxItemsPerPoll": 15,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "GitHub Blog",
    "fetchUrl": "https://github.blog/feed/",
    "language": "en",
    "pollIntervalSeconds": 3600,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 14400,
    "maxItemsPerPoll": 10,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "The New Stack",
    "fetchUrl": "https://thenewstack.io/feed/",
    "language": "en",
    "pollIntervalSeconds": 1800,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 7200,
    "maxItemsPerPoll": 15,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "MIT Technology Review — AI",
    "fetchUrl": "https://www.technologyreview.com/feed/",
    "language": "en",
    "pollIntervalSeconds": 1800,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 7200,
    "maxItemsPerPoll": 15,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "VentureBeat — AI",
    "fetchUrl": "https://venturebeat.com/category/ai/feed/",
    "language": "en",
    "pollIntervalSeconds": 900,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 7200,
    "maxItemsPerPoll": 15,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "Wired — AI & Security",
    "fetchUrl": "https://www.wired.com/feed/rss",
    "language": "en",
    "pollIntervalSeconds": 1800,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 7200,
    "maxItemsPerPoll": 15,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "Changelog — Podcast & News",
    "fetchUrl": "https://changelog.com/feed",
    "language": "en",
    "pollIntervalSeconds": 3600,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 14400,
    "maxItemsPerPoll": 10,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "Reuters — Technology",
    "fetchUrl": "https://www.reutersagency.com/feed/?taxonomy=best-sectors&post_type=best&best-sectors=tech",
    "language": "en",
    "pollIntervalSeconds": 600,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 3600,
    "maxItemsPerPoll": 20,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "BBC — Technology",
    "fetchUrl": "https://feeds.bbci.co.uk/news/technology/rss.xml",
    "language": "en",
    "pollIntervalSeconds": 600,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 3600,
    "maxItemsPerPoll": 20,
    "isActive": true
  }
]
```

> 💡 **Рекомендации по каналам для IT-новостей:**
> - Агрегаторы разработчиков (Hacker News, Lobsters) — основной источник, опрашивайте максимально часто (каждые 5 мин)
> - Крупные технические издания (TechCrunch, Ars Technica, The Verge) — ключевые новости, каждые 5–10 мин
> - Нишевые источники (dev.to, InfoQ, The New Stack) — глубокий технический контент, каждые 15–30 мин
> - Блоги компаний (GitHub Blog, Changelog) — реже обновляются, каждый час достаточно
> - Общие новости с техно-разделами (Reuters, BBC Tech) — для broader coverage, каждые 10 мин

---

### B.2. LLM-шаблоны

Перейдите в **Templates** и создайте в левой колонке как минимум два active baseline шаблона: `criteria` и `global`. Ниже также приведён optional future-ready шаблон `interests`, если позже будет включена расширенная персонализация.

#### LLM-шаблон 1: interests (optional future-ready, не используется в baseline по умолчанию)

| Поле | Значение |
|---|---|
| **Template name** | `DevNews — Interest Review` |
| **Scope** | `interests` |

**Prompt template:**
```
You are a tech news relevance reviewer for a developer-focused news portal.

The developer is tracking this topic: "{interest_name}"

An article has landed in the gray zone — the automated scoring was inconclusive.

Article title: {title}
Article lead: {lead}
Article body (truncated): {body}
Match context: {explain_json}

Your task: decide whether this article is genuinely valuable for a developer interested in the stated topic.

APPROVE if:
- The article covers a technical topic, tool, framework, or concept directly related to the tracked interest
- It announces a new release, vulnerability, breaking change, or deprecation relevant to the interest
- It provides actionable technical insights, architecture decisions, or post-mortems related to the interest
- It covers a significant funding round, acquisition, or launch of a product that developers in this area use

REJECT if:
- The article is a consumer product review or gadget roundup (e.g., "best phones of 2026")
- It is a corporate earnings report without technical substance
- It is a generic marketing press release or product announcement not aimed at developers
- It mentions the topic only superficially — the article is really about something else
- It is a listicle, tutorial, or beginner how-to that does not contain any news

Respond ONLY with a JSON object:
{"decision": "approve" or "reject" or "uncertain", "score": 0.0 to 1.0, "reason": "one sentence"}

Be selective. Developers value signal over noise.
```

#### LLM-шаблон 2: criteria (проверка системных критериев)

| Поле | Значение |
|---|---|
| **Template name** | `DevNews — Criterion Review` |
| **Scope** | `criteria` |

**Prompt template:**
```
You are a content classification reviewer for a developer-focused news portal.

The system criterion is: "{criterion_name}"

An article has landed in the gray zone — the automated scoring was inconclusive.

Article title: {title}
Article lead: {lead}
Article body (truncated): {body}
Scoring details: {explain_json}

Your task: decide whether this article meets the system criterion for inclusion in the developer news feed.

Classification rules:
- Technical depth matters: prefer articles with code, architecture details, benchmarks, or technical analysis
- News over guides: we want current events and announcements, not evergreen tutorials
- Developer impact: the content should affect how developers build, deploy, or reason about software
- Reject pure business/finance coverage unless it directly impacts developer workflows or tools

Respond ONLY with a JSON object:
{"decision": "approve" or "reject" or "uncertain", "score": 0.0 to 1.0, "reason": "one sentence"}
```

#### LLM-шаблон 3: global (универсальный запасной)

| Поле | Значение |
|---|---|
| **Template name** | `DevNews — Global Fallback` |
| **Scope** | `global` |

**Prompt template:**
```
You are a relevance reviewer for a developer-focused news portal covering startups, AI, open source, and technology.

An article has landed in the gray zone — the system is not confident in its relevance decision.

Article title: {title}
Article lead: {lead}
Article body (truncated): {body}
Review context: {explain_json}

Core question: Would a professional software developer find this article valuable in their daily work or career?

APPROVE if the article:
- Announces a significant technology release, vulnerability, or breaking change
- Covers a startup launch, major funding, or acquisition that affects developer tools or platforms
- Contains a technical deep dive, post-mortem, or architectural insight
- Reports on AI/ML research breakthroughs with practical developer implications
- Covers open-source project milestones, license changes, or community events

REJECT if the article:
- Is primarily a consumer product review, lifestyle piece, or gadget roundup
- Is a generic corporate press release without technical substance
- Is about entertainment, sports, or politics unrelated to technology
- Is a marketing-driven "thought leadership" post without concrete information
- Is a tutorial, guide, or how-to without any news element

Respond ONLY with a JSON object:
{"decision": "approve" or "reject" or "uncertain", "score": 0.0 to 1.0, "reason": "one sentence"}

Default to reject if uncertain. Quality over quantity.
```

---

### B.3. Шаблоны интересов

Перейдите в **Templates** и создайте следующие шаблоны в правой колонке (**Create Interest Template**). Для каждого шаблона вводите прототипы **по одному на строке**.

#### Общие runtime-настройки для всех dev-news шаблонов

Во всех 8 шаблонах примера B используйте одинаковую profile policy:

| Поле | Значение |
|---|---|
| **Strictness** | `balanced` |
| **Unresolved outcome** | `hold` |
| **LLM review mode** | `always` |
| **Candidate cue source** | `selection_profile_definition` |

Общие принципы для developer-news сценария:

- `Allowed content kinds` чаще всего: `editorial`, `document`; для инфраструктурных и отраслевых тем можно добавлять `api_payload`
- первый baseline лучше запускать с пустыми `must_have_terms` и пустым `time_window_hours`; эти hard filters добавляйте только после наблюдений по реальному шуму
- если нужен hard filter, `must_have_terms` должны описывать действительно обязательный news marker, а не просто общий topic vocabulary
- negative candidate cues должны отрезать gadget reviews, earnings, beginner tutorials, generic marketing, lifestyle и non-technical business coverage
- positive candidate cues должны поднимать release notes, breaking changes, CVEs, architectural post-mortems, platform policy changes и developer-impact launches

Важно: блоки `Must-have terms` и `Time window hours` ниже являются optional tightening candidates. Для первого прогона developer-news baseline их безопаснее оставить пустыми.

Общие negative candidate cues для большинства dev-news шаблонов:

```text
consumer_noise: smartphone review | gadget roundup | lifestyle piece | buying guide
finance_noise: earnings report | quarterly revenue | valuation update | stock performance
evergreen_noise: beginner guide | how to | tutorial | explainer article
marketing_noise: thought leadership | press release | sponsored content | vendor blog
```

---

#### 1. AI & LLM Breakthroughs

| Поле | Значение |
|---|---|
| **Name** | `AI & LLM Breakthroughs` |
| **Description** | `Research breakthroughs, model releases, and significant advances in AI, large language models, and generative AI` |

**Positive prototypes:**
```
OpenAI releases GPT-5 with multi-modal reasoning and tool-use capabilities
Google DeepMind achieves breakthrough in mathematical theorem proving
Meta open-sources new 400B parameter language model under permissive license
Anthropic publishes research on constitutional AI alignment techniques
New diffusion model generates production-quality 3D assets from text descriptions
Researchers discover way to train LLMs with 90% less compute using sparse attention
Microsoft introduces Phi-4 small language model outperforming larger competitors
```

**Negative prototypes:**
```
Best AI writing tools for content marketers compared and reviewed
How to use ChatGPT to plan your vacation itinerary
Samsung adds AI photo editing features to new Galaxy smartphone
AI-powered toothbrush promises perfect brushing technique
Startup raises $50M to build AI customer service chatbot
Celebrity uses AI-generated art for album cover sparking copyright debate
```

**Дополнительно заполните в админке:**

**Must-have terms:**
```text
language model
llm
multimodal
model release
research breakthrough
alignment
sparse attention
```

**Must-not-have terms:**
```text
for content marketers
vacation itinerary
smartphone
customer service chatbot
```

**Allowed content kinds:** `editorial`, `document`
**Time window hours:** `168`
**Priority:** `1.00`

**Candidate uplift positive cues:**
```text
release_signal: releases | open-sources | publishes research | introduces
research_signal: breakthrough | alignment | theorem proving | sparse attention
developer_impact: model | inference | multimodal | compute | benchmark
```

---

#### 2. Startup Funding & Launches

| Поле | Значение |
|---|---|
| **Name** | `Startup Funding & Launches` |
| **Description** | `Significant startup funding rounds, product launches, acquisitions, and YC/accelerator news relevant to the tech ecosystem` |

**Positive prototypes:**
```
Developer tools startup raises $80M Series B to expand cloud IDE platform
YC-backed observability company launches real-time distributed tracing product
Vercel announces $250M Series E at $3.5B valuation to scale edge platform
Supabase reaches general availability and closes $80M funding round
Infrastructure startup acquired by Cloudflare for $200M
Open-source database company launches managed cloud offering after Series A
AI code review startup graduates from YC with $4M seed round
```

**Negative prototypes:**
```
Food delivery startup raises $100M to expand to new markets
Real estate tech company valued at $1B after Series D
Crypto exchange reports quarterly trading volume and user growth metrics
Social media influencer launches DTC fashion brand with venture backing
Ride-sharing company earnings beat analyst expectations in Q3 report
Fitness app startup partners with gym chains for corporate wellness programs
```

**Дополнительно заполните в админке:**

**Must-have terms:**
```text
developer tools startup
yc-backed
launches
series a
series b
acquired
cloud ide
platform
```

**Must-not-have terms:**
```text
food delivery
real estate
crypto exchange
fashion brand
wellness
```

**Allowed content kinds:** `editorial`, `document`
**Time window hours:** `336`
**Priority:** `0.94`

**Candidate uplift positive cues:**
```text
funding_signal: raises | series a | series b | seed round | valuation
launch_signal: launches | graduates from yc | general availability | acquired
developer_fit: developer tools | observability | database | cloud | platform
```

---

#### 3. Open Source Releases & Community

| Поле | Значение |
|---|---|
| **Name** | `Open Source Releases & Community` |
| **Description** | `New releases of open-source projects, license changes, community drama, maintainer news, and FOSS ecosystem events` |

**Positive prototypes:**
```
Linux kernel 6.12 released with major filesystem performance improvements
Redis relicenses to dual SSPL and RSALv2 — community forks gain momentum
Rust 1.85 stabilizes async closures and adds new standard library APIs
Apache Foundation accepts new real-time streaming engine as top-level project
Maintainer burnout: popular npm package left-pad incident echoes in 2026
HashiCorp restores open-source license for Terraform after community backlash
SQLite adds built-in vector search extension in latest release
```

**Negative prototypes:**
```
How to contribute to open source for beginners — step-by-step guide
GitHub Copilot adds new autocomplete features in latest update
Best open-source alternatives to commercial software in 2026
Company migrates from open-source to proprietary solution citing support needs
University course teaches students how to build open-source projects
Top GitHub repositories with most stars this month — curated list
```

**Дополнительно заполните в админке:**

**Must-have terms:**
```text
open source
license
maintainer
released
community
foundation
fork
```

**Must-not-have terms:**
```text
for beginners
best alternatives
course
curated list
```

**Allowed content kinds:** `editorial`, `document`
**Time window hours:** `336`
**Priority:** `0.96`

**Candidate uplift positive cues:**
```text
release_signal: released | stabilizes | accepts | adds
community_signal: maintainer | burnout | backlash | forks | foundation
license_signal: relicenses | license | permissive | sspl
```

---

#### 4. Cloud & Infrastructure

| Поле | Значение |
|---|---|
| **Name** | `Cloud & Infrastructure` |
| **Description** | `Cloud platform news, infrastructure tooling, Kubernetes, serverless, edge computing, and DevOps developments` |

**Positive prototypes:**
```
AWS announces new region in Southeast Asia and serverless GPU instances
Kubernetes 1.33 introduces native sidecar containers and improved scheduling
Cloudflare launches Workers AI with built-in model inference at the edge
Google Cloud introduces new managed Postgres service with automatic scaling
Terraform CDK reaches 1.0 with full provider parity and state management
Fly.io adds global GPU regions for running inference workloads close to users
Incident post-mortem reveals how a DNS misconfiguration caused six-hour outage
```

**Negative prototypes:**
```
Cloud computing market share report shows AWS leads with 32 percent
How to choose between AWS, GCP, and Azure for your next project
Cloud spending optimization tips for engineering managers
Gartner publishes annual magic quadrant for cloud infrastructure services
Company reduces cloud bill by 40 percent by switching to reserved instances
What is serverless computing — beginner explainer article
```

**Дополнительно заполните в админке:**

**Must-have terms:**
```text
kubernetes
serverless
cloudflare
aws
google cloud
infrastructure
platform
incident
```

**Must-not-have terms:**
```text
market share report
spending optimization
magic quadrant
reserved instances
beginner explainer
```

**Allowed content kinds:** `editorial`, `document`, `api_payload`
**Time window hours:** `168`
**Priority:** `0.95`

**Candidate uplift positive cues:**
```text
release_signal: announces | introduces | launches | reaches 1.0
infra_signal: kubernetes | serverless | postgres | dns | outage | edge
developer_impact: scaling | scheduling | post-mortem | state management
```

---

#### 5. Programming Languages & Frameworks

| Поле | Значение |
|---|---|
| **Name** | `Programming Languages & Frameworks` |
| **Description** | `New versions, RFCs, performance benchmarks, and significant developments in programming languages and frameworks` |

**Positive prototypes:**
```
Python 3.15 introduces experimental JIT compiler boosting performance 3x
TypeScript 6.0 released with type-level pattern matching and module isolation
Go team proposes adding generics constraints for numeric types
Swift 6.2 adds distributed actor improvements and embedded runtime support
Zig 0.14 reaches self-hosted backend milestone with LLVM-free compilation
Next.js 16 launched with built-in partial prerendering and React Server Actions
Django 6.0 drops Python 3.10 support and adds async ORM query batching
```

**Negative prototypes:**
```
Top 10 programming languages to learn in 2026 ranked by popularity
Python vs JavaScript: which language should beginners pick
How to build a REST API with Express.js — tutorial for beginners
Stack Overflow developer survey reveals most loved and dreaded languages
Career comparison: Rust developer vs Go developer salary and demand
Best online courses to learn TypeScript from scratch this year
```

**Дополнительно заполните в админке:**

**Must-have terms:**
```text
released
rfc
compiler
language
framework
runtime support
django
next.js
```

**Must-not-have terms:**
```text
learn in 2026
beginners
tutorial
salary and demand
online courses
```

**Allowed content kinds:** `editorial`, `document`
**Time window hours:** `168`
**Priority:** `0.93`

**Candidate uplift positive cues:**
```text
release_signal: released | launched | adds | drops support
language_signal: python | typescript | go | swift | zig | django
technical_change: jit | generics | orm | compiler | server actions
```

---

#### 6. Developer Tools & Productivity

| Поле | Значение |
|---|---|
| **Name** | `Developer Tools & Productivity` |
| **Description** | `IDE updates, CLI tools, debugging innovations, CI/CD news, code review tools, and developer experience improvements` |

**Positive prototypes:**
```
JetBrains releases Fleet 2.0 with collaborative editing and remote workspaces
VS Code adds native support for Jupyter notebooks with real-time collaboration
GitHub Actions introduces reusable workflow templates and matrix job improvements
New CLI tool replaces curl with type-safe HTTP requests and automatic retries
Sentry launches AI-powered error grouping and automatic root cause analysis
Nix package manager reaches 100K packages milestone and simplifies onboarding
Linear releases API v2 with webhooks and real-time sync for custom integrations
```

**Negative prototypes:**
```
Best mechanical keyboards for programmers in 2026 compared and rated
How to set up your terminal for maximum productivity — dotfiles guide
Top 20 VS Code themes that reduce eye strain for night coding
Comparison of standing desks for software developers — ergonomic review
Notion vs Obsidian for developer note-taking — which is better
Pomodoro technique for programmers: boost your focus in 25-minute sprints
```

**Дополнительно заполните в админке:**

**Must-have terms:**
```text
ide
cli
developer tools
debugging
ci/cd
code review
api v2
workflow
```

**Must-not-have terms:**
```text
keyboard
dotfiles guide
themes
standing desks
pomodoro
```

**Allowed content kinds:** `editorial`, `document`
**Time window hours:** `168`
**Priority:** `0.91`

**Candidate uplift positive cues:**
```text
release_signal: releases | introduces | adds | launches
tool_signal: ide | cli | workflow | webhooks | notebooks | package manager
developer_impact: collaboration | automation | root cause | onboarding | api
```

---

#### 7. Cybersecurity for Developers

| Поле | Значение |
|---|---|
| **Name** | `Cybersecurity for Developers` |
| **Description** | `Security vulnerabilities, CVEs, supply chain attacks, and security practices directly relevant to software developers` |

**Positive prototypes:**
```
Critical RCE vulnerability discovered in popular npm package affecting millions
Log4Shell successor: new Java deserialization flaw rated CVSS 9.8
Supply chain attack injects malicious code into PyPI packages targeting CI systems
GitHub adds mandatory two-factor authentication for all contributors to popular repos
New browser zero-day actively exploited — Chrome and Firefox push emergency patches
NIST publishes post-quantum cryptography standards for software implementations
Malicious VS Code extension steals SSH keys and environment variables
```

**Negative prototypes:**
```
Best VPN services compared for privacy and speed in 2026
Cybersecurity firm raises $100M to expand threat intelligence platform
How to create a strong password that you can actually remember
University launches online master's degree in cybersecurity program
Government agency warns citizens about rising phishing scam emails
Cybersecurity job market grows 25 percent as companies increase security budgets
```

**Дополнительно заполните в админке:**

**Must-have terms:**
```text
vulnerability
cve
rce
supply chain
zero-day
patch
2fa
extension
```

**Must-not-have terms:**
```text
vpn services
raises $100m
strong password
degree program
job market
```

**Allowed content kinds:** `editorial`, `document`, `api_payload`
**Time window hours:** `168`
**Priority:** `1.00`

**Candidate uplift positive cues:**
```text
security_signal: vulnerability | cve | zero-day | exploited | malicious
developer_impact: package | ci systems | browser | extension | ssh keys
response_signal: emergency patches | mandatory | standards | supply chain
```

---

#### 8. Tech Industry & Big Tech News

| Поле | Значение |
|---|---|
| **Name** | `Tech Industry & Big Tech News` |
| **Description** | `Major moves by FAANG and Big Tech: platform changes, API policy updates, regulatory actions, and industry-shaping decisions that affect developers` |

**Positive prototypes:**
```
Google deprecates legacy Maps API and enforces migration to new pricing tiers
Apple opens sideloading on iOS in EU and publishes new App Store review guidelines
EU Digital Markets Act forces Meta to open Messenger interoperability API
Microsoft acquires developer platform company in $2B deal reshaping enterprise tooling
Twitter/X API pricing changes force third-party app developers to shut down
Amazon mandates return to office and restructures AWS engineering organization
FTC files antitrust suit against cloud provider over data egress fees
```

**Negative prototypes:**
```
Apple reports record iPhone sales in holiday quarter earnings call
Google Pixel 12 review: best camera smartphone of the year
Mark Zuckerberg shares personal fitness routine on Instagram
Netflix subscriber count grows as new original series launches
Amazon Prime Day deals on electronics and household items
Elon Musk tweets about Mars colonization timeline and SpaceX plans
```

**Дополнительно заполните в админке:**

**Must-have terms:**
```text
api
policy update
deprecates
guidelines
dma
interoperability
antitrust
pricing changes
```

**Must-not-have terms:**
```text
iphone sales
smartphone review
fitness routine
prime day
mars colonization
```

**Allowed content kinds:** `editorial`, `document`
**Time window hours:** `336`
**Priority:** `0.89`

**Candidate uplift positive cues:**
```text
platform_change: deprecates | pricing changes | review guidelines | opens api
regulation_signal: dma | antitrust | interoperability | sideloading
developer_impact: migration | third-party app developers | enterprise tooling
```

---

### B.4. Переиндексация после настройки

После создания всех шаблонов интересов **обязательно** запустите переиндексацию:

1. Перейдите в **Reindex** (боковое меню → System → Reindex)
2. Выберите `interest_centroids`
3. Нажмите **Queue Reindex**
4. Дождитесь статуса **completed** в списке Recent Jobs

---


## 5. Пример C — Поиск клиентов для аутсорс-компании по всему миру

**Сценарий:** Портал собирает публичные сигналы, по которым можно находить потенциальных клиентов для software outsourcing / outstaff / delivery-команды по всему миру. Целевая аудитория — founder, sales, bizdev и account-команда аутсорс-компании. Система должна отличать **реальные buying signals** (RFP, partner search, funded startup with delivery gap, digital transformation program, implementation tender) от общего шума: vendor marketing, абстрактных аналитических статей и обычных новостей про рынок.

**Особенность этого типа сайта:** Главная задача фильтрации — ловить не просто «интересные IT-новости», а **сигналы внешнего спроса на услуги**: проект, тендер, интеграция, модернизация, необходимость быстро запустить продукт или найти delivery-партнёра.

---

### C.1. RSS-каналы

Перейдите в **Channels → Bulk Import**, вставьте следующий JSON и нажмите **Validate**, затем **Import JSON**. Для shared bulk import каждая row ниже уже явно включает `"providerType": "rss"`:

```json
[
  {
    "providerType": "rss",
    "name": "Google News — Software Development Outsourcing",
    "fetchUrl": "https://news.google.com/rss/search?q=%22software+development+outsourcing%22+OR+%22outsourced+software+development%22&hl=en-US&gl=US&ceid=US:en",
    "language": "en",
    "pollIntervalSeconds": 900,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 7200,
    "maxItemsPerPoll": 25,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "Google News — IT Outsourcing & Engineering Partner",
    "fetchUrl": "https://news.google.com/rss/search?q=%22IT+outsourcing%22+OR+%22engineering+partner%22+OR+%22technology+partner%22&hl=en-US&gl=US&ceid=US:en",
    "language": "en",
    "pollIntervalSeconds": 900,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 7200,
    "maxItemsPerPoll": 25,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "Google News — Software Development RFP / Tender",
    "fetchUrl": "https://news.google.com/rss/search?q=%22request+for+proposal%22+%22software+development%22+OR+%22software+development+tender%22&hl=en-US&gl=US&ceid=US:en",
    "language": "en",
    "pollIntervalSeconds": 900,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 7200,
    "maxItemsPerPoll": 25,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "Google News — Mobile App Development RFP",
    "fetchUrl": "https://news.google.com/rss/search?q=%22mobile+app+development%22+(RFP+OR+tender+OR+vendor)&hl=en-US&gl=US&ceid=US:en",
    "language": "en",
    "pollIntervalSeconds": 1200,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 7200,
    "maxItemsPerPoll": 20,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "Google News — Digital Transformation Partner Search",
    "fetchUrl": "https://news.google.com/rss/search?q=%22digital+transformation%22+(partner+OR+vendor+OR+implementation)&hl=en-US&gl=US&ceid=US:en",
    "language": "en",
    "pollIntervalSeconds": 1200,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 7200,
    "maxItemsPerPoll": 20,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "Google News — ERP / CRM Implementation Partner",
    "fetchUrl": "https://news.google.com/rss/search?q=(ERP+OR+CRM)+implementation+partner+OR+system+integrator&hl=en-US&gl=US&ceid=US:en",
    "language": "en",
    "pollIntervalSeconds": 1200,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 7200,
    "maxItemsPerPoll": 20,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "Google News — Cloud Migration & Data Platform Vendors",
    "fetchUrl": "https://news.google.com/rss/search?q=(%22cloud+migration%22+OR+%22data+platform%22)+(vendor+OR+partner+OR+RFP)&hl=en-US&gl=US&ceid=US:en",
    "language": "en",
    "pollIntervalSeconds": 1200,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 7200,
    "maxItemsPerPoll": 20,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "Google News — Startup Funding & Product Build Signals",
    "fetchUrl": "https://news.google.com/rss/search?q=(startup+raises+OR+series+A+OR+seed+funding)+(product+development+OR+engineering+team)&hl=en-US&gl=US&ceid=US:en",
    "language": "en",
    "pollIntervalSeconds": 1800,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 14400,
    "maxItemsPerPoll": 20,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "TechCrunch — Startups",
    "fetchUrl": "https://techcrunch.com/category/startups/feed/",
    "language": "en",
    "pollIntervalSeconds": 900,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 7200,
    "maxItemsPerPoll": 20,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "VentureBeat",
    "fetchUrl": "https://venturebeat.com/feed/",
    "language": "en",
    "pollIntervalSeconds": 1200,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 7200,
    "maxItemsPerPoll": 15,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "Reuters — Technology",
    "fetchUrl": "https://www.reutersagency.com/feed/?taxonomy=best-sectors&post_type=best&best-sectors=tech",
    "language": "en",
    "pollIntervalSeconds": 1200,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 7200,
    "maxItemsPerPoll": 15,
    "isActive": true
  },
  {
    "providerType": "rss",
    "name": "The New Stack",
    "fetchUrl": "https://thenewstack.io/feed/",
    "language": "en",
    "pollIntervalSeconds": 1800,
    "adaptiveEnabled": true,
    "maxPollIntervalSeconds": 14400,
    "maxItemsPerPoll": 15,
    "isActive": true
  }
]
```

> 💡 **Рекомендации по каналам для global outsourcing lead discovery:**
> - Query-based Google News feeds — это основной инструмент для ловли buying signals: RFP, тендеров, поиска vendor/partner и новостей о проектах.
> - Техно-медиа (TechCrunch, VentureBeat, Reuters, The New Stack) — это не «лиды напрямую», а фоновые сигналы: funding, launch pressure, enterprise transformation, AI adoption, которые можно превратить в sales hypotheses.
> - Этот сценарий почти всегда шумнее, чем Job Board и Developer News. Поэтому для него особенно важны строгие negative prototypes и conservative LLM-review.
> - Для реального enterprise outbound через госзакупки и procurement portals обычно имеет смысл позже включить **discovery mode** и добавить региональные источники отдельно.

---

### C.2. LLM-шаблоны

Для built-in outsourcing scenario именно эта секция должна считаться первичным operator-facing источником. `docs/data_scripts/outsource_balanced_templates.md` остается только focused companion по тому же сценарию, а `docs/data_scripts/outsource_balanced_templates.json` — reference asset для ручного сравнения/переноса, но не отдельный competing handbook.

Перейдите в **Templates** и создайте в левой колонке все 3 active baseline шаблона: `interests`, `criteria` и `global`.

Ниже приведены значения, которые теперь должны считаться primary operator-facing truth для outsourcing Example C. Они синхронизированы с live admin-tuned bundle и больше не должны отставать от текущих `interest_templates`, `selection_profiles` и `llm_prompt_templates`.

#### LLM-шаблон 1: interests

| Поле | Значение |
|---|---|
| **Template name** | `Outsourcing buyer-intent interest review` |
| **Scope** | `interests` |

**Prompt template:**
```text
You review whether an article matches the stated outsourcing-related system interest.

Interest name: {interest_name}
Interest description: {interest_description}

Article title: {title}
Article lead: {lead}
Article body: {body}
Extra context: {explain_json}

Respond with JSON:
{
  "decision": "approve" or "reject" or "uncertain",
  "score": 0.0 to 1.0,
  "reason": "brief explanation"
}

Approve when the article clearly reflects buyer-side outsourcing demand, such as:
- buyer-authored marketplace project cards for software build, integration, migration, rescue, support, or dedicated-team work
- formal software procurement, vendor selection, bids, proposals, RFP/RFQ/tender, or implementation contracting
- an organization explicitly looking for an external delivery team, agency, contractor, partner, or vendor to execute software work

Use "uncertain" when the item looks like a real buyer-side software request but the text is brief, truncated, or only partially confirms the sourcing pattern.

Reject when the page is mainly:
- a procurement portal shell, index, news page, FAQ, help page, or generic opportunities page
- a category page, browse page, marketplace search page, directory, or talent network
- a freelancer profile, agency page, vendor landing page, seller listing, case study, ranking, or award article
- an internal hiring post, recruiter listing, employment ad, or career page
- generic commentary or news with no active sourcing need

Important:
- do not require the exact words "outsourcing" or "agency" if buyer-side software sourcing is otherwise explicit
- prefer concrete delivery evidence such as budget, bids, proposals, deliverables, scope, timelines, existing codebase takeover, or backlog pressure
- generic "opportunities" homepages or procurement navigation pages are out of scope even if they are vendor-facing
- reject seller-authored surfaces even if they mention similar software terms
```

#### LLM-шаблон 2: criteria

| Поле | Значение |
|---|---|
| **Template name** | `Outsourcing buyer-intent criterion review` |
| **Scope** | `criteria` |

**Prompt template:**
```text
You are a strict reviewer for one outsourcing-related system criterion.

The criterion is authoritative: "{criterion_name}".

Decide whether the article materially matches this criterion because it shows a real buyer-side need for outside software delivery, implementation, migration, takeover, procurement, or staff augmentation.

Article title: {title}
Article lead: {lead}
Article body: {body}
Extra context: {explain_json}

Respond with JSON:
{
  "decision": "approve" or "reject" or "uncertain",
  "score": 0.0 to 1.0,
  "reason": "brief explanation"
}

Approve when the article clearly shows one or more of these:
- a founder, manager, product owner, procurement team, or company is actively sourcing an external team, agency, vendor, implementation partner, contractor, rescue/takeover team, or staff-augmentation partner
- a buyer-authored marketplace project card or tender notice describes a concrete software build, integration, migration, replacement, support takeover, or dedicated-team request
- the text includes scoped delivery evidence such as budget, bids, proposals, quote request, deliverables, timeline, or statement of work
- a real organization is running software procurement, vendor selection, RFQ/RFP/tender, or implementation contracting

Use "uncertain" when the article looks buyer-side and delivery-scoped but the authorship or outsourcing intent is still truncated or implicit.

Reject when the article is mainly about:
- portal shells, procurement indexes, opportunities homepages, help pages, FAQs, news pages, or advisory pages
- category pages, search pages, browse pages, directories, talent networks, or generic marketplace indexes
- agency, vendor, consultant, or freelancer self-promotion
- case studies, awards, rankings, portfolios, or service landing pages
- internal hiring, recruiter content, employment vacancies, career pages, or role descriptions for the buyer's own team
- generic startup, AI, product, modernization, or transformation content with no active sourcing signal

Important:
- buyer-authored marketplace project cards can be valid even if they do not use the exact word "outsourcing"
- phrases like "contract opportunities", "search opportunities", "find opportunities", or vendor-facing government-contracting navigation are not buyer requests and should be rejected unless the page itself is a concrete software solicitation
- a single contractor/project post can still qualify if it clearly externalizes software delivery to a third party
- words like partner, migration, MVP, modernization, or transformation are not enough on their own
- seller-authored marketplace listings, freelancer profiles, and "available for hire" pages should be rejected
- if evidence is weak and not plausibly buyer-side, return "reject"
```

#### LLM-шаблон 3: global (active baseline fallback)

| Поле | Значение |
|---|---|
| **Template name** | `Outsourcing buyer-intent global review` |
| **Scope** | `global` |

**Prompt template:**
```text
You are the final global reviewer for outsourcing-related buyer-intent.

Decide whether the article belongs in the system-selected collection because it represents a real buyer-side need for external software delivery, implementation, procurement, migration, support takeover, or dedicated-team capacity.

Article title: {title}
Article lead: {lead}
Article body: {body}
Extra context: {explain_json}

Respond with JSON:
{
  "decision": "approve" or "reject" or "uncertain",
  "score": 0.0 to 1.0,
  "reason": "brief explanation"
}

Approve when the article clearly shows one or more of these:
- a founder, product owner, manager, procurement team, or organization is actively sourcing an outside software team or vendor
- a buyer-authored marketplace project card requests software build, implementation, integration, migration, rescue, support, or contract engineering work
- a formal procurement or vendor-selection flow exists for software delivery or managed application services
- the text contains concrete outsourcing evidence such as proposals, bids, quotes, budget, timeline, deliverables, statement of work, or replacing a current vendor

Use "uncertain" when buyer-side intent is plausible but the article is truncated or still missing explicit delivery context.

Reject when the article is mainly about:
- a portal shell, index, browse page, search page, help page, FAQ, or procurement news wrapper
- a category page, directory, talent network, or generic marketplace/jobs listing page
- a seller-authored freelancer profile, agency page, service pitch, case study, ranking, or award article
- internal hiring, recruiter content, employment vacancies, or career pages
- general commentary, news, or analysis without an active sourcing event

Important:
- real buyer-side marketplace project cards are in scope even when the wording is short
- exact keyword matching is not required if the sourcing pattern is concrete
- generic government-contracting or opportunities landing pages should be rejected unless the page itself is a concrete software procurement notice
- do not approve pages whose main function is navigation, aggregation, self-promotion, or recruiting
```

---

### C.3. Шаблоны интересов

Перейдите в **Templates** и создайте следующие шаблоны в правой колонке (**Create Interest Template**). Для каждого шаблона вводите прототипы и cue-группы **по одному на строке**.

Текущий built-in outsourcing baseline intentionally уже и строже старого широкого варианта. Для рабочего default используйте именно эти 5 шаблонов: ниже зафиксирован уже admin-tuned bundle, синхронизированный с live runtime.

#### Общие runtime-настройки для outsourcing шаблонов

Во всех 5 шаблонах примера C используйте одинаковые поля:

| Поле | Значение |
|---|---|
| **Unresolved outcome** | `hold` |
| **LLM review mode** | `always` |
| **Candidate cue source** | `selection_profile_definition` |
| **Final selection mode** | `compatibility_system_selected` |

`Strictness` теперь различается по шаблонам и должен совпадать с таблицами ниже. Общие принципы по-прежнему такие:

- `must_have_terms` оставляйте пустым, если нет действительно обязательного buyer/procurement marker
- `time_window_hours` для baseline оставляйте пустым
- `must_not_have_terms` используйте для явного подавления portal/category/search/seller/hiring noise
- candidate cues должны усиливать только конкретный buyer-side outsourcing pattern, а не broad topical similarity

---

#### 1. Buyer requests for outsourced product build

| Поле | Значение |
|---|---|
| **Name** | `Buyer requests for outsourced product build` |
| **Description** | `Signals that a buyer-side founder, product owner, manager, or company is actively sourcing an outside team, agency, vendor, or marketplace project delivery partner to build, ship, extend, or take over a software product, app, portal, platform, or integration.` |
| **Strictness** | `broad` |

**Positive prototypes:**
```text
Founder posts a fixed-price project for an external team to build a SaaS MVP.
Company requests bids or proposals for a mobile app, web portal, or software platform build.
Marketplace project card shows a buyer looking for developers to deliver an app, dashboard, or API integration.
Product owner seeks outside team to take over an existing codebase and ship the next release.
Business requests an agency or freelance delivery team for a scoped software implementation with budget and timeline.
Company needs an external vendor to build customer portal, marketplace platform, or internal workflow system.
Buyer asks for a software house or contractor team to deliver a web application from design to release.
Organization seeks external developers for MVP, rebuild, redesign, or platform delivery without in-house hiring.
```

**Negative prototypes:**
```text
Agency landing page offering MVP development services.
Freelancer profile advertising app development availability.
Category page listing freelance software jobs or projects.
Marketplace search page for finding freelancers or agencies.
Ranking of top software development agencies.
Case study about a past product build for another client.
Job-board listing recruiting an in-house engineer or product developer.
Generic startup article about MVPs or software trends with no active sourcing request.
```

**Must-have terms:** оставить пустым

**Must-not-have terms:**
```text
available for hire
remote jobs
freelance jobs
top freelancers
case study
our services
agency profile
contract opportunities
search opportunities
```

**Allowed content kinds:** `editorial`, `listing`
**Time window hours:** оставить пустым
**Priority:** `1.00`

**Candidate uplift positive cues:**
```text
buyer_request: looking for developers | looking for development team | looking for agency | looking for software house | need help | need a developer | need a team | want to hire | seeking developer | seeking team
scoped_project: fixed price | budget | timeline | deliverables | proposals | bids | quote
software_build: mobile app | web app | saas | mvp | portal | platform | dashboard | api integration
external_delivery: agency | software house | external team | development partner | delivery partner | contractor | freelance team
takeover_extension: take over | continue development | existing codebase | maintain and enhance | support and development
```

**Candidate uplift negative cues:**
```text
category_noise: freelance jobs | remote jobs | browse jobs | technology & programming projects | jobs online
directory_noise: talent network | top freelancers | available freelancers | search opportunities | contract opportunities
seller_noise: available for hire | our services | case study | portfolio | agency profile
hiring_noise: full-time | career page | join our team | recruiter | employment
```

---

#### 2. Staff augmentation and dedicated team demand

| Поле | Значение |
|---|---|
| **Name** | `Staff augmentation and dedicated team demand` |
| **Description** | `Signals that a buyer-side organization is actively sourcing outside engineering capacity such as staff augmentation, dedicated delivery team, external squad, or contract developers to accelerate a software backlog, rollout, or roadmap.` |
| **Strictness** | `broad` |

**Positive prototypes:**
```text
Engineering manager seeks staff augmentation partner for backend, frontend, QA, or DevOps delivery.
Company needs external developers or dedicated team to hit delivery deadline.
Buyer requests nearshore or offshore squad to accelerate product roadmap.
Organization looks for contract developers to support an active software backlog or implementation.
Product team wants outside engineering capacity instead of full-time hiring.
Marketplace project or sourcing post asks for dedicated team, external squad, or ongoing contractor support.
Company needs external QA and engineering support for release delivery and ongoing sprint work.
Business requests vendor-managed engineering capacity across multiple software roles.
```

**Negative prototypes:**
```text
Company opens in-house hiring for engineers or recruiters.
Career page listing permanent engineering roles.
Staff augmentation firm advertises available bench or dedicated team services.
Marketplace category page of remote jobs or freelance jobs.
Recruiter post for one employer contract vacancy.
Vendor landing page promoting outsourcing packages.
Blog article comparing staff augmentation versus outsourcing.
Directory page for finding freelancers or contractors.
```

**Must-have terms:** оставить пустым

**Must-not-have terms:**
```text
job opening
career page
available bench
our dedicated team services
remote jobs
freelance jobs
case study
contract opportunities
```

**Allowed content kinds:** `editorial`, `listing`
**Time window hours:** оставить пустым
**Priority:** `0.95`

**Candidate uplift positive cues:**
```text
capacity_gap: backlog | delivery deadline | accelerate roadmap | extra capacity | sprint support | ongoing support
team_request: dedicated team | staff augmentation | external squad | contract developers | nearshore team | offshore team
software_roles: backend | frontend | qa | devops | mobile | full stack
commercial_terms: hourly | monthly rate | 3 months | 6 months | ongoing opportunities
```

**Candidate uplift negative cues:**
```text
hiring_noise: full-time | career page | join our team | recruiter | employment
seller_noise: available bench | our dedicated team services | available for hire | vendor landing page | case study
category_noise: remote jobs | freelance jobs | browse jobs | jobs online | contract opportunities
marketplace_directory: talent network | recruiter | top freelancers
```

---

#### 3. Software procurement and vendor selection

| Поле | Значение |
|---|---|
| **Name** | `Software procurement and vendor selection` |
| **Description** | `Signals that a buyer-side organization is running real software procurement, RFP/RFQ/tender, vendor selection, or implementation contracting for software delivery, integration, modernization, migration, or managed application services, while excluding portal shells and procurement news/help wrappers.` |
| **Strictness** | `balanced` |

**Positive prototypes:**
```text
City issues RFP for software delivery, application modernization, or implementation vendor.
Enterprise launches vendor selection for ERP, CRM, or software rollout partner.
Bank publishes RFQ for data migration, integration, or development contractor.
Government tender seeks software supplier for application build, modernization, or managed services.
University requests proposals for external app development or platform implementation vendor.
Company shortlists vendors for CRM rollout, migration, or systems integration work.
Healthcare group invites bids for managed application services or support takeover.
Buyer prepares implementation contract or statement of work for outside software partner.
```

**Negative prototypes:**
```text
Procurement portal index or generic opportunities landing page.
Procurement news, awards, or market-report article.
Help center, FAQ, advisory page, or guide about how to write an RFP.
Vendor marketing page for procurement automation software.
Ranking of top systems integrators or award winners.
Career-page or hiring announcement unrelated to vendor sourcing.
Marketplace category page or directory of contractors.
Portal shell where no concrete software delivery notice or buyer request is visible.
```

**Must-have terms:** оставить пустым

**Must-not-have terms:**
```text
how to write an rfp
procurement automation
award winner
ranking of
help center
faq
latest news
contract opportunities
career page
vendor marketing
```

**Allowed content kinds:** `editorial`, `listing`, `document`, `data_file`, `api_payload`
**Time window hours:** оставить пустым
**Priority:** `1.00`

**Candidate uplift positive cues:**
```text
formal_procurement: rfp | rfq | request for proposal | request for quotation | tender | invites bids
vendor_process: vendor selection | supplier shortlist | requests proposals | implementation contract | statement of work | outside software partner
software_scope: software development | application modernization | app development | implementation services | managed application services | system integration
delivery_need: migration | rollout | replacement | support takeover | modernization
```

**Candidate uplift negative cues:**
```text
portal_shell: contract opportunities | search opportunities | browse notices | latest news | sign in to view
advisory_noise: how to write an rfp | procurement guide | help center | faq | market report
seller_noise: award winner | ranking | vendor marketing | case study | procurement automation
directory_noise: find freelancers | hire freelancers | remote jobs | freelance jobs | directory
```

---

#### 4. Implementation partner search for migration or replacement

| Поле | Значение |
|---|---|
| **Name** | `Implementation partner search for migration or replacement` |
| **Description** | `Signals that a buyer-side organization is actively sourcing an outside implementation partner, migration vendor, systems integrator, or replacement delivery team for a software rollout, replatforming, system replacement, data migration, or integration program.` |
| **Strictness** | `broad` |

**Positive prototypes:**
```text
Company seeks implementation partner for ERP, CRM, or platform migration.
Organization requests proposals from outside vendors for software replacement or replatforming delivery.
Buyer searches for systems integrator to execute rollout, cutover, or data migration project.
Marketplace or procurement post shows a company sourcing an external team for migration, integration, or replacement work.
Enterprise needs outside specialists to move from legacy platform to a new software stack.
Business invites vendors to quote on implementation, integration, or migration services under deadline.
Company looks for contractor team to replace current vendor on a transformation or rollout program.
Organization wants external delivery help for system integration, modernization, or platform switch.
```

**Negative prototypes:**
```text
Vendor blog about cloud migration best practices.
Thought-leadership article on digital transformation strategy.
Internal modernization roadmap with no partner search.
Category page of migration jobs, implementation jobs, or contractor listings.
Marketplace search page for consultants or freelancers.
Press release about a tooling launch or strategic partnership.
Career-page opening for implementation manager or migration engineer.
General portal shell or procurement news page with no concrete software delivery request.
```

**Must-have terms:** оставить пустым

**Must-not-have terms:**
```text
best practices
thought leadership
modernization roadmap
career page
remote jobs
freelance jobs
tooling launch
vendor blog
contract opportunities
search opportunities
```

**Allowed content kinds:** `editorial`, `listing`, `document`
**Time window hours:** оставить пустым
**Priority:** `0.90`

**Candidate uplift positive cues:**
```text
migration_need: migration | replatform | replacement | move from | switch platform | modernization
implementation_scope: erp | crm | data migration | system integration | api integration | cutover | rollout
sourcing_request: implementation partner | looking for partner | external team | systems integrator | migration partner | quote | proposals | bids
program_pressure: deadline | legacy system | current vendor | outside specialists | take over
```

**Candidate uplift negative cues:**
```text
advisory_noise: best practices | thought leadership | roadmap | playbook | guide
category_noise: remote jobs | freelance jobs | browse jobs | jobs online | talent network | contract opportunities
seller_noise: our services | available for hire | consulting pitch | vendor blog | case study
portal_shell: latest news | help center | faq | search opportunities | contract opportunities
```

---

#### 5. Legacy system rescue and support takeover

| Поле | Значение |
|---|---|
| **Name** | `Legacy system rescue and support takeover` |
| **Description** | `Signals that a buyer-side organization needs an outside vendor, contractor team, or support partner to rescue, stabilize, maintain, continue, or take over an inherited software product, legacy system, abandoned implementation, or existing codebase.` |
| **Strictness** | `balanced` |

**Positive prototypes:**
```text
Company needs new vendor to take over an abandoned software project.
Business seeks support partner for inherited legacy platform and existing codebase.
Organization replaces previous contractor and needs rescue or stabilization team.
Buyer requests outside team to continue development after earlier vendor failure.
Company needs maintenance vendor for critical application support plus improvements.
Marketplace project card asks for help taking over, fixing, or modernizing an existing system.
Enterprise wants code audit, stabilization, and handover support from an external team.
Product owner seeks outside rescue team for delayed implementation or broken platform.
```

**Negative prototypes:**
```text
Agency promotes legacy modernization services on a landing page.
Vendor blog about support services or technical debt trends.
Internal incident report or engineering retrospective.
Career-page opening for support engineer or maintenance developer.
Community discussion about bad outsourcing experiences.
Case study about rescuing a client codebase in the past.
Category page of support jobs, maintenance jobs, or freelance services.
General article about technical debt or modernization with no active vendor search.
```

**Must-have terms:** оставить пустым

**Must-not-have terms:**
```text
our support services
vendor blog
technical debt article
community discussion
postmortem
career page
remote jobs
freelance jobs
case study
available for hire
contract opportunities
```

**Allowed content kinds:** `editorial`, `listing`
**Time window hours:** оставить пустым
**Priority:** `0.85`

**Candidate uplift positive cues:**
```text
takeover_need: take over | takeover | replace current vendor | continue development | handover | previous developer
rescue_work: rescue | stabilize | bug fixing | support existing | maintain existing | code audit
legacy_context: legacy system | existing codebase | abandoned project | delayed implementation | inherited platform
external_support: outside team | support partner | maintenance vendor | contractor | managed support
```

**Candidate uplift negative cues:**
```text
seller_noise: our support services | agency advertises | consulting pitch | vendor blog | available for hire
internal_noise: incident report | postmortem | hiring support engineer | career page | technical debt article
category_noise: remote jobs | freelance jobs | browse jobs | services | contract opportunities
community_noise: community discussion | forum thread | reddit | thought leadership | case study
```

---

### C.4. Переиндексация после настройки

После создания всех шаблонов интересов **обязательно** запустите переиндексацию:

1. Перейдите в **Reindex** (боковое меню → System → Reindex)
2. Выберите `interest_centroids`
3. Нажмите **Queue Reindex**
4. Дождитесь статуса **completed** в списке Recent Jobs

> ⚠️ Без переиндексации новые шаблоны интересов не повлияют на подбор статей! Система будет собирать и обрабатывать статьи, но не сможет сопоставлять их с новыми интересами.

---

## 6. Сравнительная таблица трёх конфигураций

| Параметр | A: Агрегатор вакансий | B: IT-новости для разработчиков | C: Поиск клиентов для аутсорс-компании |
|---|---|---|---|
| **Главная задача фильтрации** | Отличить реальные вакансии от новостей о рынке труда | Отличить глубокий технический контент от потребительских обзоров | Отличить buying signals от общего рыночного и vendor-маркетингового шума |
| **Количество RSS-каналов** | 14 | 16 | 12 |
| **Источники** | Джоб-борды, агрегаторы вакансий, стартап-блоги | Новостные агрегаторы разработчиков, техно-издания, блоги | Query-based news feeds, funding/enterprise media, техно-издания, сигналы procurement |
| **Интервал опроса (типичный)** | 15–30 мин (вакансии обновляются реже) | 5–10 мин (новости появляются часто) | 10–30 мин (сигналы появляются неравномерно, но важны быстро) |
| **Количество шаблонов интересов** | 8 | 8 | 5 |
| **Фокус LLM-промптов** | «Есть ли конкретная вакансия?» | «Полезно ли это разработчику?» | «Есть ли здесь правдоподобный внешний спрос на услуги?» |
| **Runtime profile policy** | `balanced` / `hold` / `always` | `balanced` / `hold` / `always` | mixed `broad`/`balanced` + `hold` / `always` |
| **Типичные content kinds** | `listing`, `editorial` | `editorial`, `document`, иногда `api_payload` | `editorial`, `listing`, `document`, иногда `api_payload` / `data_file` |
| **Стратегия hard filters** | baseline обычно без `must_have_terms` и без `time_window`; включать позже, если шум уже понятен | baseline обычно без `must_have_terms` и без `time_window`; акцент на prototypes и negative cues | baseline без `must_have_terms` и без `time_window`; precision добирается через negative cues, candidate uplift и LLM |
| **Главный тип positive candidate cues** | hiring + role + job-detail signals | release + technical-impact + platform-change signals | buyer-request + procurement + implementation-pressure signals |
| **Главный тип ложных срабатываний** | Новости о компании ≠ вакансия | Обзор гаджета ≠ техническая новость | Funding/news ≠ клиентский спрос |
| **Стратегия негативных прототипов** | Карьерные советы, обзоры рынка, новости увольнений | Потребительские обзоры, маркетинговые статьи, учебные гайды | Vendor self-promo, hiring-only новости, аналитика без buyer-side сигнала |

---

## 7. Discovery Mode для этих примеров

Discovery в NewsPortal не заменяет готовые bundles из этого файла. Он нужен для того, чтобы после импорта стартовых RSS-каналов и шаблонов система могла искать дополнительные источники под те же темы.

Если вам нужен отдельный operator-facing handbook именно по discovery testing, а не короткая привязка discovery к bundles A/B/C, используйте [DISCOVERY_MODE_TESTING.md](./DISCOVERY_MODE_TESTING.md). Этот раздел остается discovery tie-in для example bundles, а не полным end-to-end guide по `/admin/discovery`.

### 7.1. Что discovery добавляет, а что не заменяет

Discovery добавляет:

- поиск новых кандидатов в источники под уже выбранную тематику;
- mission-based planning через `/admin/discovery`;
- review/approve loop для найденных RSS и `website` кандидатов;
- cost/quota visibility через `/admin/discovery` и `/maintenance/discovery/*`.

Discovery не заменяет:

- стартовый импорт RSS из примеров A, B и C;
- LLM-шаблоны `criteria` и `global`;
- шаблоны интересов и обязательную переиндексацию `interest_centroids` после их изменения;
- Firebase/bootstrap и общий MVP setup.

Практически это означает следующее:

1. Сначала разверните базовый сценарий из этого файла.
2. Потом включайте discovery, если хотите расширять набор источников без ручного поиска.
3. Найденные discovery-каналы должны проверяться на ту же тематику, что и ваши шаблоны интересов, а не жить отдельно от них.

### 7.2. Что должно быть готово заранее

Перед включением discovery для примеров из этого файла подготовьте:

1. Рабочий `.env.dev`, созданный на основе `.env.example`.
2. Поднятый локальный stack через `pnpm dev:mvp:internal`.
3. Настроенный Firebase admin sign-in:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_WEB_API_KEY`
   - `FIREBASE_CLIENT_CONFIG`
   - `FIREBASE_ADMIN_CREDENTIALS`
   - `ADMIN_ALLOWLIST_EMAILS`
4. Настроенный базовый Gemini runtime для обычного system-interest review:
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL`
   - `GEMINI_BASE_URL`
5. Уже импортированный bundle хотя бы одного из примеров A/B/C:
   - RSS-каналы
   - LLM-шаблоны
   - шаблоны интересов
   - хотя бы одна успешная переиндексация `interest_centroids`

Почему это важно: discovery ищет новые источники под уже определенную тему. Если сначала не задать темы и базовые источники, то найденные кандидаты будет труднее оценивать и они хуже соотносятся с примерами из этого файла.

### 7.3. Какие discovery-настройки нужны и что они означают

Для локального безопасного старта используйте такой baseline:

| Переменная | Рекомендуемое значение | Что делает |
|---|---|---|
| `DISCOVERY_ENABLED` | `1` только в локальной env, когда вы действительно тестируете discovery | Включает discovery runtime. В committed baseline должен оставаться выключенным. |
| `DISCOVERY_CRON` | `0 */6 * * *` | Cron для авто-запуска discovery mission planning/runs. |
| `DISCOVERY_BUDGET_CENTS_DEFAULT` | `500` | Бюджет по умолчанию для новых mission в центах. Это per-mission default, а не глобальный месячный лимит. |
| `DISCOVERY_MAX_HYPOTHESES_PER_RUN` | `20` | Ограничивает, сколько гипотез discovery строит и исполняет за один run. |
| `DISCOVERY_MAX_SOURCES_DEFAULT` | `20` | Дефолтный ceiling на количество источников, которое mission пытается собрать. |
| `DISCOVERY_AUTO_APPROVE_THRESHOLD` | оставить пустым | Пустое значение сохраняет manual review. Если указать число от `0` до `1`, кандидаты с достаточным `contextual_score` будут auto-approve. Для этих примеров manual review безопаснее. |
| `DISCOVERY_SEARCH_PROVIDER` | `ddgs` | Текущий safe baseline provider. Live search остается dormant, пока discovery выключен. |
| `DISCOVERY_DDGS_BACKEND` | `auto` | Backend mode для DDGS. |
| `DISCOVERY_DDGS_REGION` | `us-en` | Регион поиска. Для примеров A, B и C подходит англоязычный baseline. |
| `DISCOVERY_DDGS_SAFESEARCH` | `moderate` | SafeSearch-профиль для DDGS. |
| `DISCOVERY_GEMINI_API_KEY` | ваш discovery key или тот же ключ, что и `GEMINI_API_KEY` | Отдельный ключ для discovery LLM. Если оставить пустым, discovery fallback-ится к обычному Gemini key. |
| `DISCOVERY_GEMINI_MODEL` | `gemini-2.0-flash` | Отдельная модель для discovery. Если пусто, используется `GEMINI_MODEL`. |
| `DISCOVERY_GEMINI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta` | Отдельный base URL для discovery. Если пусто, используется `GEMINI_BASE_URL`. |
| `DISCOVERY_LLM_INPUT_COST_PER_MILLION_USD` | `0.10` | Тариф входных токенов для discovery cost accounting. |
| `DISCOVERY_LLM_OUTPUT_COST_PER_MILLION_USD` | `0.40` | Тариф выходных токенов для discovery cost accounting. |
| `DISCOVERY_MONTHLY_BUDGET_CENTS` | `500` для bounded local tests | Глобальный hard cap на текущий UTC-месяц. Если поставить `0`, лимит отключается. |
| `DISCOVERY_BRAVE_API_KEY` | оставить пустым | Dormant placeholder. Текущий baseline его не использует. |
| `DISCOVERY_SERPER_API_KEY` | оставить пустым | Dormant placeholder. Текущий baseline его не использует. |

Минимально обязательный discovery env set для этих примеров:

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

### 7.4. Пошаговое включение и проверка

1. Скопируйте `.env.example` в `.env.dev`, если еще не сделали этого, и заполните базовые runtime secrets.
2. В `.env.dev` включите discovery:

```env
DISCOVERY_ENABLED=1
DISCOVERY_SEARCH_PROVIDER=ddgs
DISCOVERY_AUTO_APPROVE_THRESHOLD=
DISCOVERY_MONTHLY_BUDGET_CENTS=500
```

3. Перезапустите stack, чтобы worker/API/admin увидели новые env:

```sh
pnpm dev:mvp:internal:down
pnpm dev:mvp:internal
```

4. Перед manual use прогоните bounded proof:

```sh
pnpm test:discovery-enabled:compose
```

5. Проверьте, что runtime действительно включился:
   - `GET /maintenance/discovery/summary` показывает `enabled=true`;
   - `/admin/discovery` показывает активный provider, model и месячный quota state;
   - при исчерпании месячного лимита UI/API должны честно показать quota reached вместо тихой деградации.
6. Только после этого начинайте реальные mission runs в `/admin/discovery`.

Для полного operator-testing walkthrough после этого bounded enable шага переходите в [DISCOVERY_MODE_TESTING.md](./DISCOVERY_MODE_TESTING.md): там отдельно разобраны graph-first mission flow, independent recall flow, promoted-vs-duplicate outcomes и canonical proof contour для этой зоны.

### 7.5. Как связать discovery с примерами A, B и C

Ниже приведен практический mapping, чтобы discovery искал источники под те же сценарии, что и bundles выше.

#### Для примера A — Job Board

Создайте mission примерно с такими seed inputs:

```json
{
  "title": "Job Board source expansion",
  "description": "Find RSS and website sources with real software-engineering vacancies, remote hiring, startup recruiting and concrete career opportunities.",
  "seed_topics": [
    "software engineering jobs",
    "remote developer jobs",
    "startup hiring",
    "engineering career opportunities"
  ],
  "seed_languages": ["en"],
  "seed_regions": ["us", "eu"],
  "target_provider_types": ["rss", "website"]
}
```

При review кандидатов проверяйте:

- публикует ли источник реальные вакансии или hiring roundups, а не общие HR-статьи;
- не дублирует ли он уже импортированные RSS из примера A;
- не является ли он login/CAPTCHA-зависимым сайтом, который текущий baseline не поддерживает.

#### Для примера B — Developer News

Создайте mission примерно с такими seed inputs:

```json
{
  "title": "Developer news source expansion",
  "description": "Find RSS and website sources covering developer tooling, programming languages, cloud-native engineering, security and AI/LLM news for engineers.",
  "seed_topics": [
    "developer tools",
    "programming languages",
    "cloud native engineering",
    "software security",
    "ai for developers"
  ],
  "seed_languages": ["en"],
  "seed_regions": ["us", "eu"],
  "target_provider_types": ["rss", "website"]
}
```

При review кандидатов проверяйте:

- есть ли там инженерная глубина, а не consumer-tech или gadget news;
- согласуются ли найденные темы с вашими шаблонами интересов B.1-B.4;
- не нужен ли для `website`-источника отдельный browser-assisted pass через `/admin/resources`.

#### Для примера C — Global Outsourcing Lead Discovery

Создайте mission примерно с такими seed inputs:

```json
{
  "title": "Outsourcing lead source expansion",
  "description": "Find RSS and website sources with public buying signals for external software delivery: tenders, partner searches, funded startups, digital transformation programs and implementation projects.",
  "seed_topics": [
    "software development outsourcing",
    "digital transformation tender",
    "implementation partner search",
    "startup product build",
    "engineering staff augmentation"
  ],
  "seed_languages": ["en"],
  "seed_regions": ["us", "eu", "apac"],
  "target_provider_types": ["rss", "website"]
}
```

При review кандидатов проверяйте:

- публикует ли источник buyer-side сигналы, а не только self-promo агентств и консультантов;
- содержит ли он конкретные проекты, тендеры, vendor searches, procurement notices или явные delivery gaps;
- не дублирует ли он уже импортированные query feeds и не слишком ли узок регионально;
- не нужен ли для `website`-источника отдельный browser-assisted pass через `/admin/resources`.

После approval:

1. Дайте новым источникам отработать ingest.
2. Проверяйте `Articles`, `Clusters`, `Observability` и при необходимости `/admin/resources`.
3. Не запускайте `interest_centroids` только из-за новых discovery-каналов.
4. Запускайте `interest_centroids` только если вы изменили сами шаблоны интересов.

### 7.6. Что все еще остается вне этого файла

Даже после этого appendix здесь сознательно не дублируются:

- полный `.env.dev` bootstrap и все runtime env details из `README.md`;
- весь operator manual verification flow из `docs/manual-mvp-runbook.md`;
- browser-assisted hard-site walkthrough beyond the short discovery tie-in above;
- live-internet anti-bot escalation, login-required sources, CAPTCHA solving и manual challenge bypass;
- полноценный operator-ready rollout для discovery provider types `api`, `email_imap` и `youtube`.

---

## 8. FAQ по примерам

**В: Можно ли использовать оба набора одновременно в одной установке NewsPortal?**
> Да. Эти шаблоны интересов формируют системный каталог тем и синхронизируются в live `criteria`, поэтому вы можете держать в одной установке и вакансийные, и developer-news темы одновременно. Если вам нужна персонализация для конкретного человека, она настраивается отдельно через реальные `user_interests`. LLM-шаблоны по-прежнему работают по одному на scope, но в baseline runtime активно используются прежде всего `criteria` и `global`, а `interests` остаётся future-ready scope.

**В: Нужно ли копировать все 8 шаблонов интересов? Можно ли начать с меньшего числа?**
> Конечно. Начните с 3–4 самых важных для вашей аудитории тем. Добавляйте новые по мере необходимости. Не забывайте запускать переиндексацию `interest_centroids` после каждого добавления.

**В: RSS-ленты из примеров перестали работать. Что делать?**
> RSS-ленты могут менять URL или закрываться. Если канал начал показывать ошибки — проверьте актуальный URL на сайте источника. Обычно RSS-лента указана в `<head>` сайта или на специальной странице (например, `site.com/rss` или `site.com/feed`). Вы также можете воспользоваться поиском вроде `site.com RSS feed`.

**В: Зачем в примерах для джоб-борда подключены TechCrunch и VentureBeat? Они же не публикуют вакансии.**
> Правильно — они не публикуют вакансии напрямую. Но они часто пишут о стартапах, которые получили финансирование и начали активный найм. Статьи вроде «Startup X raises $30M and plans to triple engineering team» — это ценный сигнал для тех, кто ищет работу. Шаблоны интересов и LLM-промпты отфильтруют нерелевантные новости.

**В: Мои прототипы на английском, а часть лент приходит на других языках. Это проблема?**
> Модель эмбеддингов, используемая в NewsPortal (`paraphrase-multilingual-MiniLM-L12-v2`), — мультиязычная. Она неплохо сопоставляет тексты на разных языках. Тем не менее, лучшие результаты достигаются, когда язык прототипов совпадает с языком контента. Если вы добавляете RSS-ленты на немецком или русском — рекомендуется создать отдельные шаблоны интересов с прототипами на соответствующем языке.

**В: Как понять, что конфигурация работает хорошо?**
> Проверьте три вещи:
> 1. **Observability → Fetch Runs** — каналы должны показывать `new_content`, а не постоянные `error`
> 2. **Observability → LLM Reviews** — если ИИ-проверок слишком много (и расходы растут), улучшите прототипы
> 3. **Clusters** — статьи должны группироваться в осмысленные кластеры, а не висеть поодиночке
>
> Если качество подбора неудовлетворительное — в первую очередь пересмотрите отрицательные прототипы. Они имеют самый большой эффект на точность.

**В: Как адаптировать эти примеры под другой язык (например, русскоязычный сайт)?**
> 1. Замените RSS-каналы на русскоязычные источники (Хабр, vc.ru, 3DNews, CNews и т.д.)
> 2. Перепишите прототипы на русском языке, сохраняя ту же структуру (5–7 положительных, 3–5 отрицательных)
> 3. LLM-промпты можно оставить на английском (Gemini хорошо понимает и русский, и английский контент), но при желании можно перевести и их
> 4. Не забудьте указать `"language": "ru"` при импорте каналов

**В: Почему в примере для аутсорс-компании есть funding- и tech-ленты, если они не содержат прямые заявки?**
> Потому что для sales/discovery они работают как **lead signals**, а не как готовые лиды. Новость про funding, запуск нового продукта, rollout AI-функции или enterprise-модернизацию сама по себе не означает сделку — но часто подсказывает, у кого в ближайшие месяцы появляется потребность в внешней delivery-команде. Именно поэтому в примере C такие источники сочетаются со строгими negative prototypes и conservative LLM review.

**В: Покрывает ли этот документ discovery, website channels и hard-site/browser fallback настройку?**
> Теперь частично. Раздел 7 покрывает discovery enable path, смысл `DISCOVERY_*` настроек и то, как discovery соотносится с примерами A/B/C. Но полный operator manual verification, website `/resources`, hard-site/browser fallback и cleanup/reset по-прежнему подробно живут в `README.md` и `docs/manual-mvp-runbook.md`.

---

> 📖 **Связанные документы:**
> - [HOW_TO_USE.md](./HOW_TO_USE.md) — полное руководство по администрированию NewsPortal
> - [README.md](./README.md) — runtime env, discovery enable и smoke/proof команды
> - [docs/manual-mvp-runbook.md](./docs/manual-mvp-runbook.md) — полный local MVP walkthrough, cleanup/reset, optional discovery и website verification
> - Раздел **Help & Guide** в боковом меню админки — встроенный справочник на английском языке
