# EXAMPLES.md — Готовые конфигурации NewsPortal для типовых проектов

> **Для кого этот документ:** для администратора, который хочет быстро запустить NewsPortal под конкретный тип сайта. Здесь приведены **полные рабочие конфигурации** — RSS-каналы, LLM-шаблоны и шаблоны интересов — для двух реальных сценариев.
>
> **Предварительное чтение:** [HOW_TO_USE.md](./HOW_TO_USE.md) — общее руководство по администрированию.

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
5. [Сравнительная таблица двух конфигураций](#5-сравнительная-таблица-двух-конфигураций)
6. [FAQ по примерам](#6-faq-по-примерам)

---

## 1. Как пользоваться этим документом

Каждый пример содержит **полный набор настроек**, готовый к вводу в панель администратора:

1. **RSS-каналы** — JSON для массового импорта (Bulk Import) на странице Channels
2. **LLM-шаблоны** — три промпта (scope: `interests`, `criteria`, `global`), которые создаются на странице Templates в левой колонке
3. **Шаблоны интересов** — набор тем с положительными и отрицательными прототипами, которые создаются на странице Templates в правой колонке

**Порядок действий:**

```
1. Импортировать каналы (Channels → Bulk Import)
2. Создать LLM-шаблоны (Templates → левая колонка)
3. Создать шаблоны интересов (Templates → правая колонка)
4. Запустить переиндексацию (Reindex → interest_centroids)
5. Подождать 10–15 минут и проверить результат (Articles, Clusters, Observability)
```

> ⚠️ **Не забудьте переиндексацию!** После создания или изменения шаблонов интересов всегда запускайте переиндексацию `interest_centroids`. Без этого новые шаблоны не повлияют на подбор статей.

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

Каждая статья в «серой зоне» (скор 0.45–0.72) отправляется на проверку ИИ, что стоит денег. Чтобы уменьшить количество статей в серой зоне:

- **Добавьте больше прототипов** (5–7 положительных, 3–5 отрицательных) — система будет увереннее в решениях
- **Сделайте прототипы максимально непохожими друг на друга** — это расширяет «понимание» темы
- **Обновляйте прототипы** при появлении новых подтем — если начали появляться статьи о теме, которую система не знает, добавьте примеры

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

Перейдите в **Templates** и создайте три шаблона в левой колонке (**Create LLM Template**).

#### LLM-шаблон 1: interests (проверка интересов пользователей)

| Поле | Значение |
|---|---|
| **Template name** | `Job Board — Interest Review` |
| **Scope** | `interests` |

**Prompt template:**
```
You are a job-listing relevance reviewer for a job aggregator platform.

The user is tracking this job category: "{{title}}"

An article or listing has landed in the gray zone — the system is not confident whether it matches.

Article title: {{title}}
Article lead: {{lead}}
Article body (truncated): {{body}}
Match context: {{explain_json}}

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

The system criterion is: "{{title}}"

An article has landed in the gray zone — the automated scoring was inconclusive.

Article title: {{title}}
Article lead: {{lead}}
Article body (truncated): {{body}}
Scoring details: {{explain_json}}

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

Article title: {{title}}
Article lead: {{lead}}
Article body (truncated): {{body}}
Review context: {{explain_json}}

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

Перейдите в **Templates** и создайте три шаблона в левой колонке (**Create LLM Template**).

#### LLM-шаблон 1: interests (проверка интересов пользователей)

| Поле | Значение |
|---|---|
| **Template name** | `DevNews — Interest Review` |
| **Scope** | `interests` |

**Prompt template:**
```
You are a tech news relevance reviewer for a developer-focused news portal.

The developer is tracking this topic: "{{title}}"

An article has landed in the gray zone — the automated scoring was inconclusive.

Article title: {{title}}
Article lead: {{lead}}
Article body (truncated): {{body}}
Match context: {{explain_json}}

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

The system criterion is: "{{title}}"

An article has landed in the gray zone — the automated scoring was inconclusive.

Article title: {{title}}
Article lead: {{lead}}
Article body (truncated): {{body}}
Scoring details: {{explain_json}}

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

Article title: {{title}}
Article lead: {{lead}}
Article body (truncated): {{body}}
Review context: {{explain_json}}

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

## 5. Сравнительная таблица двух конфигураций

| Параметр | A: Агрегатор вакансий | B: IT-новости для разработчиков |
|---|---|---|
| **Главная задача фильтрации** | Отличить реальные вакансии от новостей о рынке труда | Отличить глубокий технический контент от потребительских обзоров |
| **Количество RSS-каналов** | 14 | 16 |
| **Источники** | Джоб-борды, агрегаторы вакансий, стартап-блоги | Новостные агрегаторы разработчиков, техно-издания, блоги |
| **Интервал опроса (типичный)** | 15–30 мин (вакансии обновляются реже) | 5–10 мин (новости появляются часто) |
| **Количество шаблонов интересов** | 8 | 8 |
| **Фокус LLM-промптов** | «Есть ли конкретная вакансия?» | «Полезно ли это разработчику?» |
| **Главный тип ложных срабатываний** | Новости о компании ≠ вакансия | Обзор гаджета ≠ техническая новость |
| **Стратегия негативных прототипов** | Карьерные советы, обзоры рынка, новости увольнений | Потребительские обзоры, маркетинговые статьи, учебные гайды |

---

## 6. FAQ по примерам

**В: Можно ли использовать оба набора одновременно в одной установке NewsPortal?**
> Да. Шаблоны интересов — это отдельные темы, которые выбирают пользователи. Вы можете создать и вакансийные, и новостные шаблоны в одной системе. Но LLM-шаблоны работают по одному на scope (используется последний активный), поэтому вам понадобится написать универсальный промпт, покрывающий обе задачи.

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

---

> 📖 **Связанные документы:**
> - [HOW_TO_USE.md](./HOW_TO_USE.md) — полное руководство по администрированию NewsPortal
> - Раздел **Help & Guide** в боковом меню админки — встроенный справочник на английском языке

