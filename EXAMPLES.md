# EXAMPLES.md — Готовые RSS и template-конфигурации NewsPortal для типовых проектов

> **Для кого этот документ:** для администратора, который уже поднял NewsPortal и хочет быстро наполнить систему готовыми RSS-каналами, LLM-шаблонами и шаблонами интересов под типовой сценарий.
>
> **Что этот документ покрывает:** content-configuration bundle для RSS + Templates и отдельный appendix по discovery mode, который помогает расширять эти же сценарии новыми источниками.
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

1. **RSS-каналы** — JSON для массового импорта (Bulk Import) на странице Channels
2. **LLM-шаблоны** — два active baseline промпта (scope: `criteria`, `global`) и один optional future-ready промпт (`interests`) для возможной opt-in / premium персонализации
3. **Шаблоны интересов** — набор системных тем с положительными и отрицательными прототипами, которые создаются на странице Templates в правой колонке и синхронизируются в live `criteria`

Перед использованием примеров убедитесь, что у вас уже есть:

1. Заполненный `.env.dev` и рабочий локальный stack
2. Настроенный Firebase admin sign-in и allowlist
3. Понимание, что базовый content bundle живет здесь, discovery setup теперь описан в разделе 7, а полный website/hard-site manual pass по-прежнему живет в `README.md` и `docs/manual-mvp-runbook.md`

**Порядок действий:**

```
1. Импортировать каналы (Channels → Bulk Import)
2. Создать LLM-шаблоны (Templates → левая колонка)
3. Создать шаблоны интересов (Templates → правая колонка)
4. Запустить переиндексацию (Reindex → interest_centroids)
5. Подождать 10–15 минут и проверить результат (Articles, Clusters, Observability)
6. Если нужен полный MVP/manual verification pass, вернуться к `docs/manual-mvp-runbook.md`, а не останавливаться на этом документе
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

Практический вывод:

- для альтернативных buyer-intent формулировок вроде `rfp`, `rfq`, `vendor selection`, `looking for an agency` теперь удобно использовать именно `must_have_terms`;
- не перегружайте `must_have_terms` длинными списками общих слов вроде `partner`, `migration`, `transformation`, иначе они станут слишком широким OR-фильтром;
- если нужен более точный контроль, держите broad тему в прототипах, а hard constraints используйте только для сильных маркеров намерения.

---

## 3. Пример A — Агрегатор вакансий (Job Board)

**Сценарий:** Сайт собирает вакансии и карьерные новости из различных RSS-лент и других источников. Целевая аудитория — IT-специалисты, ищущие работу. Система должна отличать **реальные вакансии** от новостей о компаниях, обзоров рынка труда и HR-статей.

**Особенность этого типа сайта:** Главная задача фильтрации — отделить настоящие объявления о вакансиях и конкретные карьерные возможности от общего информационного шума про рынок труда.

---

### A.1. RSS-каналы

Перейдите в **Channels → Bulk Import**, вставьте следующий JSON и нажмите **Validate**, затем **Import JSON**:

```json
[
  {
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

Перейдите в **Channels → Bulk Import**, вставьте следующий JSON и нажмите **Validate**, затем **Import JSON**:

```json
[
  {
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

Перейдите в **Channels → Bulk Import**, вставьте следующий JSON и нажмите **Validate**, затем **Import JSON**:

```json
[
  {
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

Перейдите в **Templates** и создайте в левой колонке как минимум два active baseline шаблона: `criteria` и `global`. Ниже также приведён optional future-ready шаблон `interests`, если позже будет включена расширенная персонализация.

#### LLM-шаблон 1: interests (optional future-ready, не используется в baseline по умолчанию)

| Поле | Значение |
|---|---|
| **Template name** | `Outsourcing Leads — Interest Review` |
| **Scope** | `interests` |

**Prompt template:**
```
You are a B2B lead reviewer for a global software outsourcing company.

The user is tracking this lead category: "{interest_name}"

An article has landed in the gray zone — the system is not confident whether it matches.

Article title: {title}
Article lead: {lead}
Article body (truncated): {body}
Match context: {explain_json}

Your task: decide whether this content represents a REAL external demand signal for the specified lead category.

APPROVE if:
- It contains a tender, RFP, procurement notice, vendor search, implementation search, or partner search
- It describes a company that is actively launching, rebuilding, modernizing, integrating, or scaling a product and is likely to need external delivery capacity
- It clearly mentions budget, timeline, project scope, vendor shortlist, or search for a development / integration / consulting partner
- It is a funded startup or expanding company with a concrete build or delivery need, not just generic growth news

REJECT if:
- It is pure vendor self-promotion, thought leadership, or agency marketing
- It is general market analysis about outsourcing with no specific buyer signal
- It is ordinary hiring news for internal employees with no sign of external partner demand
- It is M&A, earnings, layoffs, or macro commentary with no project-buying signal
- It is a generic trend article that only mentions outsourcing, AI, cloud, or transformation abstractly

Respond ONLY with a JSON object:
{"decision": "approve" or "reject" or "uncertain", "score": 0.0 to 1.0, "reason": "one sentence"}

Be conservative. Approve only when there is a believable client-intent signal.
```

#### LLM-шаблон 2: criteria (проверка системных критериев)

| Поле | Значение |
|---|---|
| **Template name** | `Outsourcing Leads — Criterion Review` |
| **Scope** | `criteria` |

**Prompt template:**
```
You are a content qualification reviewer for a global software outsourcing company.

The system criterion is: "{criterion_name}"

An article has landed in the gray zone — the automated scoring was inconclusive.

Article title: {title}
Article lead: {lead}
Article body (truncated): {body}
Scoring details: {explain_json}

Your task: decide whether this content meets the system criterion.

Key classification rules for outsourcing lead discovery:
- Direct buyer-side signals (RFPs, tenders, vendor search, implementation partner search) are the PRIMARY content type
- Fundraising or expansion news is RELEVANT only if it implies a concrete product build, transformation, implementation, or delivery need
- Enterprise modernization, migration, data platform, AI rollout, and integration projects are RELEVANT when there is evidence the company may use external help
- General tech news, vendor marketing, opinion pieces, and hiring-only stories are NOT relevant unless they clearly imply external service demand

Respond ONLY with a JSON object:
{"decision": "approve" or "reject" or "uncertain", "score": 0.0 to 1.0, "reason": "one sentence"}
```

#### LLM-шаблон 3: global (универсальный запасной)

| Поле | Значение |
|---|---|
| **Template name** | `Outsourcing Leads — Global Fallback` |
| **Scope** | `global` |

**Prompt template:**
```
You are a content relevance reviewer for a company that sells outsourced software development, data, cloud, QA, and product delivery services worldwide.

An article has landed in the gray zone — the system is not confident in its relevance decision.

Article title: {title}
Article lead: {lead}
Article body (truncated): {body}
Review context: {explain_json}

Core question: Does this content contain or strongly signal a company, department, startup, or public buyer that may purchase external software / product / data / cloud delivery services?

APPROVE if the content:
- Mentions a tender, RFP, procurement notice, or active vendor/partner selection
- Describes a concrete modernization, migration, build, launch, AI rollout, or implementation initiative with likely external delivery demand
- Signals a funded or scaling company that needs execution capacity faster than normal in-house hiring alone would provide

REJECT if the content:
- Is agency marketing or self-promotional vendor content
- Is a general trend or analyst report with no identifiable buyer or project
- Is only about internal hiring, layoffs, funding, or business results without external service demand
- Is general product or consumer-tech news unrelated to a services opportunity

Respond ONLY with a JSON object:
{"decision": "approve" or "reject" or "uncertain", "score": 0.0 to 1.0, "reason": "one sentence"}

When in doubt, reject. It is better to miss a vague signal than to flood the pipeline with non-buying noise.
```

---

### C.3. Шаблоны интересов

Перейдите в **Templates** и создайте следующие шаблоны в правой колонке (**Create Interest Template**). Для каждого шаблона вводите прототипы **по одному на строке**.

---

#### 1. Startup Funding & MVP Build Signals

| Поле | Значение |
|---|---|
| **Name** | `Startup Funding & MVP Build Signals` |
| **Description** | `Funded startups and early-stage companies likely to outsource MVP, product delivery, or first engineering capacity` |

**Positive prototypes:**
```
Seed-stage fintech startup raises $4M and looks for external product team to ship MVP in 12 weeks
Series A health-tech company seeks development partner to accelerate patient portal launch
VC-backed B2B SaaS startup needs outsourced engineering team before first enterprise pilot
Founders announce product roadmap and search for software partner to build v1 quickly
Startup expands to US market and hires agency to deliver new mobile application
Newly funded logistics startup looking for dedicated development team to build admin platform
Pre-seed AI startup needs external engineers to validate product before internal team is staffed
```

**Negative prototypes:**
```
Startup raises $25M and appoints new chief financial officer
How founders should choose between in-house and outsourced development
VC market report shows seed funding rebounds in 2026
Startup valuation trends across Europe and Latin America
Founder shares lessons from building first MVP with no code tools
```

---

#### 2. Enterprise Digital Transformation Programs

| Поле | Значение |
|---|---|
| **Name** | `Enterprise Digital Transformation Programs` |
| **Description** | `Large organizations launching modernization, digital transformation, self-service, automation, and platform rebuild programs` |

**Positive prototypes:**
```
Global insurer starts digital transformation program and invites vendors to modernize claims platform
Retail chain launches multi-country customer experience rebuild and seeks external delivery partner
Manufacturing group starts enterprise modernization initiative with RFP for implementation vendors
Telecom operator searches for product engineering partner to rebuild customer self-service systems
Bank announces core platform transformation and procurement process for integration partner
Healthcare network seeks external team for patient app, portal redesign, and backend modernization
Regional airline launches digital passenger experience project and looks for delivery partner
```

**Negative prototypes:**
```
CEO says digital transformation remains a strategic priority for the company
Consulting firm publishes annual digital transformation trends report
Vendor blog explains seven pillars of enterprise modernization
Company wins innovation award for previous digital transformation work
Analyst predicts CIO budgets will rise next year
```

---

#### 3. RFPs, Tenders & Procurement Notices

| Поле | Значение |
|---|---|
| **Name** | `RFPs, Tenders & Procurement Notices` |
| **Description** | `Public and private procurement notices for software development, app delivery, platforms, portals, and managed engineering work` |

**Positive prototypes:**
```
Government agency issues RFP for citizen services portal rebuild and ongoing support
University publishes tender for student mobile app, backend integration, and maintenance
Municipality seeks supplier for document workflow platform and CRM integration project
Public hospital procurement notice requests vendor for telemedicine software implementation
Airport authority opens tender for passenger information platform modernization
NGO seeks software development partner for grant management system across three countries
Utility company issues request for proposal for field operations mobile application
```

**Negative prototypes:**
```
Government department announces procurement reform policy update
How to respond to public sector software tenders successfully
Tender advisory firm promotes its bid writing services
Ministry releases annual spending report with no live opportunities
Opinion article debates whether public procurement moves too slowly
```

---

#### 4. ERP / CRM / Internal Systems Implementation

| Поле | Значение |
|---|---|
| **Name** | `ERP / CRM / Internal Systems Implementation` |
| **Description** | `Buyer-side demand for ERP, CRM, workflow, integration, and back-office systems implementation` |

**Positive prototypes:**
```
Distribution company seeks ERP implementation partner for finance, inventory, and warehouse operations
Nonprofit issues RFP for Salesforce implementation and donor platform integration
Real estate group starts CRM migration and looks for system integrator with portal expertise
Hospitality brand needs vendor for Microsoft Dynamics rollout across global properties
Industrial company searches for partner to replace legacy ERP with cloud platform
Education provider needs external team to integrate CRM, billing, and student lifecycle workflows
Regional bank launches vendor selection for internal workflow automation and CRM upgrade
```

**Negative prototypes:**
```
Salesforce releases new AI capabilities for enterprise users
Consultancy shares top five ERP migration mistakes
CRM software market expected to grow 12 percent annually
Vendor case study describes successful implementation for unnamed client
Comparison of Salesforce vs HubSpot for mid-market businesses
```

---

#### 5. AI / LLM Implementation Projects

| Поле | Значение |
|---|---|
| **Name** | `AI / LLM Implementation Projects` |
| **Description** | `Organizations likely to buy external help for AI copilots, LLM integrations, search, automation, and applied AI delivery` |

**Positive prototypes:**
```
Insurance company seeks partner to implement internal AI copilot for service agents
Enterprise SaaS vendor launches RFP for LLM-powered search and support automation
Retailer looks for AI implementation partner to deploy forecasting and recommendation models
Legal firm starts vendor review for document intelligence platform based on generative AI
Government body seeks supplier for AI-assisted knowledge search across internal systems
Healthcare provider needs partner to integrate LLM triage assistant into existing patient workflow
B2B platform company requests proposals for AI summarization and workflow automation rollout
```

**Negative prototypes:**
```
OpenAI releases new multimodal model with better reasoning
Analyst says enterprise AI spending will double by 2028
AI consultancy publishes guide to successful LLM adoption
Vendor announces new AI platform for enterprises worldwide
Opinion article argues most AI pilots fail without change management
```

---

#### 6. Data Platform & BI Modernization

| Поле | Значение |
|---|---|
| **Name** | `Data Platform & BI Modernization` |
| **Description** | `Opportunities related to data warehouses, BI migration, analytics engineering, reporting platforms, and data integration` |

**Positive prototypes:**
```
Retail group seeks partner to migrate reporting stack from legacy BI to cloud warehouse
Healthcare organization starts tender for data lakehouse, dashboards, and ETL modernization
Media company looks for external team to rebuild analytics platform on Snowflake and dbt
Logistics business issues RFP for operational reporting, data pipelines, and executive dashboards
Fintech company needs data engineering partner for warehouse rebuild and self-serve BI rollout
Global NGO seeks vendor for donor analytics platform and cross-system data integration
Consumer brand launches procurement for customer data platform implementation and reporting layer
```

**Negative prototypes:**
```
Snowflake reports record quarterly revenue growth
How to design a modern BI stack for scaling companies
Consultant explains the difference between ETL and ELT
Database vendor releases benchmark showing faster query performance
Thought leadership piece on the future of data mesh
```

---

#### 7. Cloud / DevOps / Platform Modernization

| Поле | Значение |
|---|---|
| **Name** | `Cloud / DevOps / Platform Modernization` |
| **Description** | `Signals that a company may need external help with migration, DevOps, Kubernetes, observability, platform engineering, and reliability improvements` |

**Positive prototypes:**
```
Bank seeks cloud migration partner for multi-region infrastructure modernization
Media platform issues RFP for DevOps transformation, CI/CD rebuild, and observability rollout
Scale-up needs external SRE team to stabilize platform before global launch
Public sector body searches for managed Kubernetes and platform engineering vendor
E-commerce company starts project to migrate monolith to cloud-native stack with outside partner
Telecom group requests proposals for infrastructure automation and release engineering overhaul
SaaS provider needs platform modernization partner to improve reliability and deployment speed
```

**Negative prototypes:**
```
AWS launches new managed Kubernetes feature at annual conference
How to pass the Certified Kubernetes Administrator exam
DevOps platform vendor announces partnership with cloud provider
Engineering blog explains why every team should adopt GitOps
Cloud market revenue expected to reach new record next year
```

---

#### 8. Agency / White-Label / Delivery Partnership Opportunities

| Поле | Значение |
|---|---|
| **Name** | `Agency / White-Label / Delivery Partnership Opportunities` |
| **Description** | `Agencies, consultancies, and system integrators that may need subcontractors, delivery partners, or white-label engineering capacity` |

**Positive prototypes:**
```
Digital agency seeks white-label development partner for enterprise portal rollout
Consulting firm needs subcontracted engineering team to deliver client mobile application
System integrator looks for offshore delivery partner for backlog-heavy modernization program
Brand agency searches for technical partner to build ecommerce and loyalty platform for major client
Regional consultancy needs nearshore QA and development capacity for public sector project
Implementation partner expands pipeline and looks for external product squad to cover new accounts
Creative agency wins transformation deal and immediately seeks backend and frontend delivery partner
```

**Negative prototypes:**
```
Agency launches new website and rebrands its service offering
Consultancy publishes report on the future of digital delivery partnerships
Marketing agency shares tips for choosing a white-label vendor
System integrator announces annual revenue growth and new office opening
Opinion piece about whether agencies should build in-house engineering teams
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
| **Количество шаблонов интересов** | 8 | 8 | 8 |
| **Фокус LLM-промптов** | «Есть ли конкретная вакансия?» | «Полезно ли это разработчику?» | «Есть ли здесь правдоподобный внешний спрос на услуги?» |
| **Главный тип ложных срабатываний** | Новости о компании ≠ вакансия | Обзор гаджета ≠ техническая новость | Funding/news ≠ клиентский спрос |
| **Стратегия негативных прототипов** | Карьерные советы, обзоры рынка, новости увольнений | Потребительские обзоры, маркетинговые статьи, учебные гайды | Vendor self-promo, hiring-only новости, аналитика без buyer-side сигнала |

---

## 7. Discovery Mode для этих примеров

Discovery в NewsPortal не заменяет готовые bundles из этого файла. Он нужен для того, чтобы после импорта стартовых RSS-каналов и шаблонов система могла искать дополнительные источники под те же темы.

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
