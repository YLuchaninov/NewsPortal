# Outsourcing Admin Companion

Этот документ больше не описывает machine-read runtime bundle.

Его роль теперь другая:

- быть focused companion к Example C в `EXAMPLES.md`, а не конкурирующим primary handbook;
- помочь оператору настроить систему под use case поиска outsourcing demand;
- объяснить, какие system interests, candidate cues и LLM prompts стоит завести;
- дать человеку понятную карту того, что и куда вносить через админку;
- не делать repo-файл скрытым runtime source of truth.

Важно:

- primary operator-facing source for the built-in outsourcing example теперь живет в `EXAMPLES.md` -> Example C;
- runtime truth живет в админке и БД;
- код системы не должен читать этот `.md` напрямую;
- JSON-файлы в `docs/product/data-scripts` могут оставаться reference-asset'ами, но не считаются канонической runtime-конфигурацией.

## Цель конфигурации

Набор ориентирован на поиск заказов для аутсорс-компаний, а не на общий поток новостей про digital transformation.

Главная задача:

- ловить реальные buyer-intent сигналы;
- отделять их от vendor self-promo;
- не путать sourcing intent с внутренним hiring;
- не пропускать procurement / vendor-selection сигналы;
- не одобрять HN/Reddit/community chatter, если автор не выглядит реальным покупателем услуг.

## Как теперь это должно работать

Настройка outsourcing use case должна жить в трех местах:

1. `System interests` в админке
- positive prototypes
- negative prototypes
- hard constraints
- candidate uplift cues

2. `Selection profiles`
- unresolved behavior
- LLM review mode
- candidate cue source для gray-zone recovery

3. `LLM templates`
- criterion review
- interest review
- global review

Этот документ помогает оператору поддерживать все три слоя согласованными.

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

## Структура system interests

Текущий bundle делит outsourcing demand на 5 отдельных классов.

### 1. Buyer requests for outsourced product build

Для прямых buyer-authored запросов на:

- build MVP
- launch app or platform
- take over existing codebase
- hire agency / software house / dev shop

Через админку сюда обычно вносятся:

- positive prototypes с прямым buyer phrasing;
- must-have terms для явного sourcing language;
- candidate uplift positive cues для near-threshold request phrasing;
- negative prototypes против seller-side noise.

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

## Candidate uplift cues

Теперь candidate uplift должен настраиваться через admin layer, а не через hardcoded worker vocabulary.

Рекомендуемый формат в админке:

- `Candidate uplift positive cues`
- `Candidate uplift negative cues`

Один group на строку:

`group_name: cue one | cue two | cue three`

Пример положительных cue groups для outsourcing:

```text
request_search: looking for | need help | seeking | request for
external_delivery: implementation partner | systems integrator | external team | outside help
procurement: rfp | rfq | vendor selection | supplier shortlist
delivery_change: migration | replacement | rollout | takeover | rescue
market_signal: rising demand | growing demand | demand for
```

Пример отрицательных cue groups:

```text
hiring_noise: hiring | recruiter | career page | job details | required profile
marketplace_noise: freelancer | per hour | proposals | bids | posted
community_noise: contributors | community interest | open source | testers | collaborators
```

Если use case меняется, оператор должен менять эти cues через admin UI, а не ждать изменения worker code.

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

## Как вносить это в админку

### System interests

Для каждого interest operator должен вручную заполнить:

- `Name`
- `Description`
- `Positive prototypes`
- `Negative prototypes`
- `Must-have terms`
- `Must-not-have terms`
- `Allowed content kinds`
- `Required / forbidden short tokens`
- `Candidate uplift positive cues`
- `Candidate uplift negative cues`

### Runtime profile policy

Проверьте, что у профиля:

- `Strictness = balanced` или нужное вам значение
- `Unresolved outcome = hold`
- `LLM review mode = always`, если хотите, чтобы gray-zone шёл в review

### LLM templates

Проверьте отдельно:

- criterion template
- interest template
- global template

Criterion template должен быть criterion-grounded, а не опираться на одну слишком узкую universal framing.

## Рекомендации по применению

После ручной настройки через админку:

1. сохраните system interests;
2. дайте criteria/profile sync завершиться;
3. проверьте, что runtime candidate cues materialized;
4. проверьте `gray_zone`, `llm_review_log` и final-selection outcome;
5. только после этого оценивайте quality.

Если после этого quality всё ещё будет плохим, следующий честный шаг уже не в templates, а в одном из двух направлений:

- source/corpus cleanup;
- threshold/scoring retune.

## Runtime truth

Каноническая runtime truth теперь не здесь.

Она живет в:

- `interest_templates`
- `criteria`
- `criteria_compiled`
- `selection_profiles`
- `llm_prompt_templates`

Этот Markdown нужен как focused outsourcing-only companion к `EXAMPLES.md`, когда не нужен весь набор built-in examples целиком.
