# План: generic candidate recall в шумном поле

## Зачем нужен этот документ

Этот документ описывает, как построить в NewsPortal систему, которая умеет находить редкие ценные сигналы в огромном шумном потоке **для любых типов информации**, а не только для одного кейса вроде outsourced development.

Цель плана:

- не скатиться в source-ranking как главный relevance gate;
- не превратить систему в доменно-зашитый фильтр под один use case;
- сохранить широкий recall;
- улучшить routing редких meaningful candidates к `gray_zone`, `llm.review.requested` и `final_selection_results`;
- сделать логику объяснимой, доказуемой и совместимой с текущим product blueprint.

## Что мы не делаем

Этот план **не** строится на идее:

- “найти хорошие источники и доверять им”;
- “забанить плохие домены и проблема исчезнет”;
- “подкрутить систему под аутсорс/одну вертикаль”;
- “снизить шум только за счет ingest pruning”.

Почему:

- редкий ценный сигнал может прийти из шумного источника;
- источники не являются надежным прокси для семантической ценности документа;
- система должна работать для любого класса информации, а не только для buyer-intent или procurement-like signals;
- primary relevance logic должна жить на уровне документа, canonical document, story cluster и final selection, а не на уровне репутации домена.

## Базовый принцип

Система должна искать не “релевантные источники”, а **редкие meaningful candidates** в шумном поле.

Правильная модель:

`wide ingest -> document/canonical/cluster interpretation -> candidate routing -> gray_zone / LLM adjudication -> final selection`

То есть:

- ingest остается широким;
- шум интерпретируется на уровне документа и события;
- ambiguous material не теряется слишком рано;
- LLM используется как bounded adjudication layer для сложных кандидатов;
- source-level signals могут жить только как вторичный operational context, а не как основной gate relevance.

## Главные инварианты

При реализации этого плана должны оставаться истинными следующие правила:

1. PostgreSQL остается source of truth.
2. `outbox -> relay -> sequence_runs -> q.sequence -> worker` остается основным runtime path.
3. Source-level scoring не становится primary relevance gate.
4. Ingest breadth не сужается только потому, что источник обычно шумный.
5. Candidate routing должен работать для любых информационных тем, а не только для одной доменной вертикали.
6. `gray_zone` и `llm.review.requested` используются как инструмент recall recovery, а не как редкое исключение.
7. Решения должны быть explainable через document-, verification-, cluster- и selection-level evidence.

## Целевая проблема

Сейчас у системы уже восстановлен runtime:

- очередь больше не застревает тысячами;
- `gray_zone -> llm` path снова жив;
- pipeline снова двигает статьи end-to-end.

Но product-level recall все еще слабый:

- слишком много документов падают в `semantic no_match`;
- `gray_zone` и LLM review пока не вытягивают достаточный candidate flow;
- шумные документы и редкие valuable signals смешаны в одном потоке, а их разделение пока недостаточно точное;
- нет явной taxonomy того, **где именно теряется потенциально важный кандидат**.

Значит следующий этап должен лечить не runtime, а **candidate-loss model**.

## Стратегия решения

### 1. Не “оценка источников”, а taxonomy потерь кандидатов

Первый слой работы: понять, где система сейчас теряет потенциально важные сигналы.

Нужно построить taxonomy не по доменам, а по типам document/event patterns, например:

- `job-post-like`
- `community-thread-like`
- `vendor-self-promo-like`
- `generic news / commentary`
- `request-for-help-like`
- `procurement / partner-search-like`
- `implementation / migration / integration need-like`
- `comparison / vendor-evaluation-like`
- `unclear-but-suspiciously-relevant`

Это не фиксированный словарь для конечной логики. Это начальная forensic taxonomy, чтобы понять, какие документы ошибочно уходят в:

- `no_match`
- `gray_zone`
- `rejected after review`
- или вообще не доходят до review.

### 2. Wide recall как обязательное свойство

Система должна оставлять широкий recall.

Это означает:

- не резать ingest по “плохим” источникам;
- не принимать домен за семантическое доказательство;
- не делать host reputation основой routing;
- не выбрасывать community/job/aggregator sources только потому, что они чаще шумят.

Правильный вопрос:

не “какие источники хорошие?”,
а “какие документы и события нельзя дешево отбросить как шум?”.

### 3. Candidate routing как отдельный слой

Между текущим semantic filtering и final selection нужен честно сформулированный слой candidate routing.

Он должен отвечать не на вопрос:

- “это уже точно match?”

а на вопрос:

- “есть ли здесь достаточно признаков, чтобы не терять этот документ до LLM/gray-zone adjudication?”

Целевые routing buckets:

- `obvious_noise`
- `ordinary_non_match`
- `candidate_for_review`
- `strong_match_candidate`

Это позволит:

- не перегружать LLM всем подряд;
- не терять редкие сигналы слишком рано;
- отделить cheap rejection от ambiguous candidate handling.

### 4. Document-level и cluster-level сигналы

Главная логика должна строиться не только по сырому документу.

Нужны additive signals из нескольких уровней:

- document text;
- canonical document;
- story cluster;
- verification state;
- already-known final-selection context;
- explainable semantic and metadata cues.

Почему это важно:

- одиночный документ может выглядеть шумным;
- cluster может показать, что это часть важного события;
- verification может повысить доверие к ambiguous candidate;
- canonical-level aggregation может убрать ложный шум от дубликатов и reposts.

### 5. Gray zone как recall-recovery layer

`gray_zone` должен использоваться не как случайный остаток после scoring, а как intentional recovery path для ambiguous candidates.

Это означает:

- часть документов должна осознанно попадать в `gray_zone`, если there is non-trivial candidate evidence;
- `gray_zone` не должен маскироваться под cheap hold без причины;
- `llm.review.requested` должен запускаться там, где ambiguity реально не снимается дешевыми правилами;
- LLM review должен получать не только текст документа, но и cluster/verification/selection context, если это уже доступно в пайплайне.

### 6. Genericity across domains

План должен работать не только для outsourced development, procurement или B2B demand.

Поэтому вся модель должна быть сформулирована через общие свойства:

- редкость сигнала в шуме;
- наличие action-worthy or decision-worthy information;
- наличие external need / event / decision / change / request / anomaly;
- ambiguous but potentially important material;
- signal worth escalating despite low cheap confidence.

Это позволяет использовать ту же архитектуру для:

- buyer-intent;
- market/event monitoring;
- policy/regulatory changes;
- vendor movement;
- community-originated weak signals;
- early anomaly detection;
- niche domain discovery.

## План по этапам

### Этап 1. Spike: candidate-loss taxonomy baseline

Цель:

- понять, где именно теряется candidate flow.

Что сделать:

- собрать read-only funnel:
  - `interest_filter_results.semantic_decision`
  - `final_selection_results.final_decision`
  - `llm_review_log`
  - `verification_results`
  - `story_clusters` / `story_cluster_members`
- выделить small sampled sets:
  - `no_match`, но с признаками “возможно не надо было выбрасывать”;
  - `gray_zone`, которые так и не стали useful outputs;
  - `llm reviewed`, которые все равно ушли в reject;
  - `rejected`, но визуально похожие на weak candidates;
- вручную или полуавтоматически свернуть их в taxonomy candidate-loss patterns.

Выход этапа:

- документированная taxonomy того, где система теряет полезных кандидатов.

### Этап 2. Stage: document and cluster candidate signals

Цель:

- добавить generic signals, которые помогают выделять candidate documents без source-ranking.

Что сделать:

- ввести explainable additive signals для candidate suspicion:
  - request/help wording
  - implementation/migration/change intent
  - comparison/evaluation/procurement hints
  - anomaly/change/event-worth-attention hints
  - weak but non-trivial relevance patterns
- добавить cluster-aware enrichment:
  - candidate signal from related docs in the same cluster
  - verification-aware uplift/downgrade
- не превращать это в hard-coded vertical rules.

Выход этапа:

- repo-level candidate signal layer, который работает поверх документа/canonical/cluster.

### Этап 3. Stage: gray-zone and LLM candidate routing

Цель:

- сделать `gray_zone` и LLM review реальным bounded recovery path для ambiguous candidates.

Что сделать:

- пересмотреть routing rules между:
  - `no_match`
  - `gray_zone`
  - `match candidate`
- определить, какие candidate signals достаточно сильны для эскалации в LLM;
- убедиться, что LLM review вызывается из generic ambiguity logic, а не из domain hacks;
- улучшить operator visibility:
  - why this became candidate
  - why this stayed gray zone
  - why LLM rejected/approved it

Выход этапа:

- predictable candidate escalation path вместо случайного серого хвоста.

### Этап 4. Stage: noise-tolerant proof and operator visibility

Цель:

- доказать, что система лучше держит recall в шумном поле и не схлопывается обратно в cheap rejection.

Что сделать:

- построить proof contour:
  - больше meaningful candidates доходит до gray-zone/LLM
  - pipeline не деградирует по throughput
  - source breadth не схлопывается
  - нет source-ranking как primary gate
- добавить operator diagnostics:
  - candidate-loss reasons
  - candidate-routing reasons
  - gray-zone volume and outcomes
  - LLM adjudication outcomes

Выход этапа:

- доказуемый generic recall improvement, а не “кажется стало лучше”.

## Какие файлы и слои, скорее всего, будут затронуты позже

Это не список для текущего planning item, а probable implementation map:

- `services/workers/app/final_selection.py`
- `services/workers/app/main.py`
- `services/workers/app/selection_profiles.py`
- `services/api/app/main.py`
- `apps/admin/src/lib/server/operator-surfaces.ts`
- возможные contract/docs updates around zero-shot filtering and profile semantics
- targeted tests under `tests/unit/python/*` and `tests/unit/ts/*`

Важно:

- `services/fetchers` не должен становиться владельцем relevance logic;
- source-level observations могут использоваться как вспомогательный контекст, но не как primary selection gate.

## Как проверять, что мы не скатились в wrong direction

Перед каждой implementation stage нужно задавать себе вопросы:

1. Мы сейчас классифицируем документы или ранжируем источники?
2. Редкий сильный сигнал из шумного источника все еще может пройти?
3. Новая логика generic для разных информационных доменов или зашита под один кейс?
4. `gray_zone` стал полезным инструментом recall или остался cosmetic state?
5. LLM review получает bounded, meaningful candidate set, а не случайный хвост?
6. Operator может понять, почему документ:
   - отброшен,
   - стал candidate,
   - попал в gray-zone,
   - ушел в LLM review,
   - был в итоге отклонен или выбран?

Если хотя бы на один из этих вопросов ответ “нет”, план реализуется неверно.

## Acceptance criteria для capability

Capability можно считать закрытой только если:

- есть документированная candidate-loss taxonomy;
- document/cluster-level candidate signals добавлены без source-ranking как primary gate;
- `gray_zone -> llm.review.requested` используется как intentional recall recovery path;
- proof показывает улучшение candidate flow без сужения ingest breadth;
- решение остается generic across information domains;
- runtime/architecture truth из текущего product blueprint не нарушена.

## Короткий итог

Правильная следующая цель для NewsPortal:

не “найти лучшие источники”,
а “научиться не терять редкие важные сигналы в шумном поле”.

Это должен быть:

- generic;
- noise-tolerant;
- document/event-centric;
- explainable;
- bounded by current PostgreSQL/outbox/sequence architecture;
- пригодный для любых информационных задач, а не только для одного вертикального кейса.
