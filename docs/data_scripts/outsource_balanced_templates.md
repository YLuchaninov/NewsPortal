# Outsourcing Balanced Templates

Этот документ описывает текущий bundle в [outsource_balanced_templates.json](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/outsource_balanced_templates.json).

JSON-файл является каноническим источником истины для импорта. Этот `.md` нужен как operator-facing объяснение, зачем шаблоны разбиты именно так и как теперь работают hard constraints.

## Цель набора

Набор ориентирован на поиск заказов для аутсорс-компаний, а не на общий поток новостей про digital transformation.

Главная задача:

- ловить реальные buyer-intent сигналы;
- отделять их от vendor self-promo;
- не путать sourcing intent с внутренним hiring;
- не пропускать procurement / vendor-selection сигналы;
- не одобрять HN/Reddit/community chatter, если автор не выглядит реальным покупателем услуг.

## Что изменилось

Текущий bundle стал заметно уже и строже:

- меньше reliance на broad слова вроде `transformation`, `migration`, `partner`, `MVP`;
- больше акцента на explicit sourcing language;
- сильнее отрицательные примеры против agency PR, rankings, case studies, advisory content, thought leadership и внутренних вакансий;
- добавлены hard constraints, которые помогают ловить именно buyer phrasing.

Отдельно важно, что runtime теперь использует такую семантику:

- `must_have_terms` = OR / any-match
- `must_not_have_terms` = любой матч режет статью
- `short_tokens_required` = строгий AND по short-token features

Это значит, что `must_have_terms` теперь подходят для набора альтернативных фраз вроде:

- `rfp`
- `rfq`
- `vendor selection`
- `looking for an agency`
- `contract developers`

Но туда не стоит складывать слишком широкие слова вроде:

- `partner`
- `migration`
- `outsourcing`

иначе фильтр станет слишком мягким.

## Структура interest templates

Текущий bundle делит outsourcing demand на 5 отдельных классов.

### 1. Buyer requests for outsourced product build

Для прямых buyer-authored запросов на:

- build MVP
- launch app or platform
- take over existing codebase
- hire agency / software house / dev shop

Этот template особенно полезен для Reddit, founder communities и прямых sourcing posts.

### 2. Staff augmentation and dedicated team demand

Для случаев, когда организация ищет:

- staff augmentation
- contract developers
- dedicated team
- nearshore / offshore capacity
- managed engineering capacity

Это отдельный класс, потому что такие сигналы часто не выглядят как classic tender, но всё равно являются прямым спросом.

### 3. Software procurement and vendor selection

Для strongest buyer-intent signals:

- `RFP`
- `RFQ`
- `tender`
- `vendor selection`
- `supplier shortlist`
- `statement of work`
- `implementation contract`

Это самый “чистый” template с точки зрения покупки услуг.

### 4. Implementation partner search for migration or replacement

Для migration / rollout / replacement историй, но только если текст прямо указывает на:

- implementation partner
- systems integrator
- migration partner
- external delivery team
- outside specialists

Именно этот template должен защищать систему от ложных срабатываний на generic transformation news.

### 5. Legacy system rescue and support takeover

Для rescue / takeover / support handoff ситуаций:

- replace current vendor
- rescue project
- stabilize codebase
- continue development
- legacy application support

Это отдельный buyer-intent сегмент, который часто не ловится procurement-oriented шаблонами.

## Стратегия negative prototypes

У всех шаблонов negatives стали жёстче. Они теперь в явном виде отсекают:

- vendor marketing;
- agency landing pages;
- case studies;
- awards and rankings;
- internal hiring;
- recruiter content;
- thought leadership;
- best-practice articles;
- community discussions without active sourcing.

Это особенно важно для noisy Google News и HN corpora, где topic similarity часто есть, а buyer intent отсутствует.

## LLM templates

Bundle содержит 3 LLM templates:

- `Outsourcing buyer-intent interest review`
- `Outsourcing buyer-intent criterion review`
- `Outsourcing buyer-intent global review`

Их общая политика теперь такая:

- explicit procurement и direct buyer requests являются strongest positives;
- `criteria` template теперь опирается на конкретный `criterion_name` как на authoritative semantic frame, а не на один универсальный build-only prompt;
- `interests` template тоже привязан к самому интересу и допускает `uncertain`, когда buyer-side signal plausibly есть, но externalization еще недоказана;
- advisory content, market commentary и broad transformation stories не должны одобряться сами по себе;
- forum / Reddit / HN posts одобряются только когда автор выглядит самим покупателем и явно пытается source-ить outside delivery help;
- seller-authored marketplace / `[FOR HIRE]` posts теперь явно описаны как negative path;
- employment/career postings теперь тоже явно зафиксированы как negative path: `job details`, `required profile`, `contract type`, `reports to`, recruiter/career-page wording и внутренний найм не должны трактоваться как buyer procurement;
- слова `agency`, `partner`, `outsourcing`, `MVP`, `migration`, `modernization` больше не считаются достаточным основанием сами по себе.

## Рекомендации по применению

После импорта этого bundle:

1. импортируйте шаблоны в live admin layer;
2. пересоберите criteria / system interests;
3. прогоните historical replay или reindex для текущего корпуса;
4. отдельно проверьте, какие статьи продолжают зависать в `filtered_out` с оценками около `0.45–0.50`.

Если после этого quality всё ещё будет плохим, следующий честный шаг уже не в templates, а в одном из двух направлений:

- source/corpus cleanup;
- threshold/scoring retune.

## Canonical source

Текущий импортируемый файл:

- [outsource_balanced_templates.json](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/outsource_balanced_templates.json)
