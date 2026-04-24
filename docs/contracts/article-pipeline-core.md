# Article Pipeline Core Contract

Этот документ фиксирует durable contract для текущего рабочего article/selection pipeline, который уже доказан на локальном baseline и который нельзя случайно повредить последующими изменениями.

## Назначение

Документ нужен как защита текущего рабочего ядра:

- чтобы не ломать pipeline при следующих доработках;
- чтобы не перепутать generic engine truth с application-layer настройками;
- чтобы не размыть ownership между ingest, canonicalization, verification, semantic filtering и final selection;
- чтобы последующие fixes и tuning шли через правильный слой.

Этот документ не заменяет:

- [.aidp/blueprint.md](/Users/user/Documents/workspace/my/NewsPortal/.aidp/blueprint.md)
- [docs/contracts/zero-shot-interest-filtering.md](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/zero-shot-interest-filtering.md)
- [docs/contracts/universal-selection-profiles.md](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/universal-selection-profiles.md)

Он дополняет их как практический guardrail для уже shipped pipeline core.

## Когда этот документ обязателен

Читай этот документ перед любой работой, которая затрагивает хотя бы одно из следующих:

- `article.ingest.requested`
- `resource.ingest.requested`, если ресурс project-ится в editorial `articles`
- `document_observations`
- `canonical_documents`
- `story_clusters`, `story_cluster_members`
- `verification_results`
- `interest_filter_results`
- `final_selection_results`
- `system_feed_results` как compatibility projection
- `llm.review.requested`
- worker-side final selection / gating / reuse logic
- admin/application tuning, если оно влияет на semantic yield, gray-zone или selected behavior

## Краткая truth-модель

Текущий рабочий pipeline выглядит так:

`source channel -> fetchers -> PostgreSQL -> outbox_events -> relay -> sequence_runs / q.sequence -> worker -> canonical / verification / filtering / selection truth -> API/admin/web read models`

Для article lane текущая truth-цепочка такая:

`articles + document_observations -> canonical_documents -> story_clusters + verification_results -> interest_filter_results -> final_selection_results -> bounded system_feed_results compatibility`

## Что сейчас считается ядром

### 1. Ingest и observation truth

- `services/fetchers` owns fetch/extract/enrichment handoff.
- `articles` не являются единственной semantic truth; это observation/editorial runtime surface.
- `document_observations` являются additive evidence layer и не должны silently исчезать из-за раннего semantic gate.
- malformed extraction inputs вроде year-zero timestamps должны санитизироваться на ingestion/enrichment boundary, а не валить весь pipeline.

### 2. Canonical truth

- `canonical_documents` являются primary dedup/evidence unit.
- duplicate article rows могут существовать и должны сохранять provenance.
- expensive semantic/review work не должен повторяться без необходимости по каждой duplicate copy, если canonical unit уже известен.

### 3. Verification truth

- `verification_results` — отдельный слой, не равный semantic match.
- verification оценивает corroboration / independence / conflict / evidence quality.
- verification не должен silently смешиваться с final selection или подменять semantic decision.

### 4. Semantic filter truth

- `interest_filter_results` — canonical runtime truth для criterion/user-interest filtering.
- здесь must быть явно разделено:
  - `technical_filter_state`
  - `semantic_decision`
  - compatibility/read explain payload
- technical filter и semantic filter не должны сливаться в один opaque reject.
- bounded generic wrapper/category hardening belongs here, not in domain-specific allowlists:
  - search/category/job-board wrapper pages may be rejected as technical noise before semantic usefulness is judged;
  - this remains valid only when the rule is source-shape based and does not hardcode specific domains or case-only vocabulary.

### 5. Final selection truth

- `final_selection_results` — primary internal selection truth.
- `system_feed_results` остается только bounded compatibility projection.
- public/admin/API selected-content reads должны предпочитать `final_selection_results`.

### 6. Canonical reuse truth

- criterion-scope LLM review reuse key: `canonical_document_id + criterion_id`
- duplicate article rows одного canonical документа не должны инициировать новый LLM review по тому же критерию, если resolved verdict уже есть
- selected/feed truth должен быть canonical-first:
  - один canonical signal не должен выглядеть как множество независимых selected winners
  - article-level provenance при этом должна сохраняться

## Неизменяемые инварианты ядра

Следующие вещи считаются non-negotiable, пока явно не переписаны и не доказаны более сильным stage:

1. PostgreSQL остается единственным source of truth.
2. Redis/BullMQ/queue state не становятся semantic source of truth.
3. `articles` не возвращаются в роль единственного owner-а semantic/final-selection truth.
4. `final_selection_results` не уступает primary ownership обратно `system_feed_results`.
5. duplicate-heavy corpus не должен тратить LLM budget повторно на один и тот же canonical signal без необходимости.
6. article-level provenance нельзя терять ради canonical collapse.
7. generic engine не должен снова получать hidden domain-specific hardcoding вместо profile-/admin-driven semantics.
8. application-layer tuning не должен silently превращаться в source-level truth.

## Что считается нормальным текущим поведением

### Нормально

- duplicate article rows существуют для одного canonical document;
- один `match` из пяти criteria может быть достаточен для `selected`, если нет `gray_zone` и `conflicting verification`;
- `gray_zone` может существовать без auto-accept;
- `gray_zone` может требовать LLM review только когда policy это разрешает;
- часть job-like или request-like текстов может проходить, если система интерпретирует их как внешний спрос, а не внутренний найм;
- часть pipeline может короткое время показывать ранний ingest без downstream rows сразу после reset/restart.

### Ненормально

- repeated LLM reviews на одном `canonical_document_id + criterion_id`;
- пачка selected rows на одном canonical signal без явной reuse semantics;
- `must_have_terms` как массовый blanket gate, который убивает recall до semantic stage;
- `time_window_hours` как скрытый глобальный choke point для всех criteria;
- source-level ranking/banlist как primary relevance engine;
- generic engine, который снова hardcode-ит предметную семантику конкретного use case;
- feed/read surfaces, которые снова создают впечатление “ничего не проверялось”, хотя downstream truth существует.

## Что можно менять безопасно

### Safe layer 1: application/admin layer

Это preferred слой для изменения product quality без ломки ядра:

- `interest_templates`
- `criteria`
- `criteria_compiled`
- `selection_profiles`
- `llm_prompt_templates`
- candidate positive/negative cues
- `must_not_have_terms`
- `allowed_content_kinds`
- `strictness`
- `unresolvedDecision`
- `llmReviewMode`

Через этот слой можно:

- tightening / relaxing precision
- routing gray-zone
- improving prompt semantics
- changing domain-specific bundle behavior

Безопасное правило:

- если задачу можно решить через admin-owned truth, не трогай engine code.

### Safe layer 2: read-model wording / operator visibility

Можно безопасно улучшать:

- explain payloads
- admin/operator summaries
- visibility of reuse/hold/pending-review state
- diagnostics wording

При условии, что:

- underlying runtime truth не переписывается задним числом
- explain не начинает маскировать real state

### Safe layer 3: bounded runtime hardening

Допустимы изменения, которые не меняют business semantics:

- transient retry hardening
- deadlock retry
- lock-scope reduction
- per-channel poll lease
- non-fatal enrichment/oEmbed degradation handling
- generic wrapper/category-noise filtering that protects the downstream pipeline from treating search pages, browse pages, or job-board shells as stable buyer-intent articles

Но только если:

- сохраняется sequence-first ownership
- не нарушается PostgreSQL/outbox discipline
- не исчезает article/canonical provenance
- diagnostics truth stays honest about where the loss happened; projected rows that are all rejected as technical wrapper noise may be counted as `resources_extracted_but_no_stable_articles` in product proof instead of semantic zero-yield.

## Что нельзя делать без отдельного stage и усиленного proof

### Нельзя

- возвращать source-level ranking как главный relevance gate;
- добавлять hardcoded outsourcing/vendor/hiring vocabulary обратно в generic engine;
- лечить quality через silent denylist источников вместо semantic/application tuning;
- включать blanket `must_have_terms` как baseline;
- заставлять каждый `gray_zone` обязательно идти в LLM;
- обходить canonical reuse и снова review-ить duplicates как независимые сущности;
- писать selected truth напрямую в compatibility-only read model;
- делать manual DB mutations по runtime truth без declared reset/repair scope;
- делать новый destructive reset без preserve-set snapshot.

## Текущая граница generic engine vs application layer

### В generic engine должно жить

- sequence/runtime orchestration
- canonicalization ownership
- verification ownership
- generic candidate-uplift algorithm
- final-selection mapping rules
- canonical reuse mechanics
- compatibility projection boundaries

### В application layer должно жить

- конкретная предметная семантика criteria
- candidate cue vocabulary
- prompt wording
- precision tuning под use case
- negative cue tightening
- admin/operator policy choices

Практическое правило:

- если изменение звучит как “улучшить понимание именно outsourcing / procurement / hiring / niche domain”, это почти всегда application layer;
- если изменение звучит как “pipeline повторно review-ит duplicate canonical docs” или “selection truth расходится между article и canonical layer”, это pipeline core.

## Обязательный proof перед изменениями ядра

Если работа трогает pipeline core, минимум proof должен покрывать:

1. targeted unit/integration checks по затронутому ownership path;
2. проверку, что duplicate canonical reuse не регрессировал;
3. проверку, что `final_selection_results` остается primary selection truth;
4. проверку, что article-level provenance не потеряна;
5. read-only live evidence, если изменение касается runtime behavior на текущей БД;
6. sync `.aidp/work.md` и всех затронутых truth layers.

## Минимальный forensic checklist перед risky changes

Перед risky pipeline change сначала ответь на эти вопросы:

1. Это проблема generic engine или application-layer semantics?
2. Затрагивается ли `canonical_document_id + criterion_id` reuse?
3. Затрагивается ли ownership `final_selection_results`?
4. Не возвращает ли change domain truth в hidden code path?
5. Не появляется ли снова early blanket filter, который убьет recall?
6. Не начнет ли selected/feed снова раздуваться на duplicate article rows?

Если хотя бы на один вопрос ответ неочевиден, нужен отдельный stage, а не patch.

## Reset и preserved-baseline discipline

Для локального destructive reset текущий truthful preserve-set остается таким:

- `source_providers`
- `source_channels`
- `interest_templates`
- `criteria`
- `criteria_compiled`
- `selection_profiles`
- `llm_prompt_templates`

После restore нужно:

- очистить `fetch_cursors`
- очистить `source_channel_runtime_state`
- обнулить channel-side polling/error timestamps

Нельзя считать reset truthful, если preserved subset был уже неполным или runtime rows были silently восстановлены вместе с настройками.

## Related files

- [.aidp/blueprint.md](/Users/user/Documents/workspace/my/NewsPortal/.aidp/blueprint.md)
- [.aidp/engineering.md](/Users/user/Documents/workspace/my/NewsPortal/.aidp/engineering.md)
- [.aidp/verification.md](/Users/user/Documents/workspace/my/NewsPortal/.aidp/verification.md)
- [docs/contracts/zero-shot-interest-filtering.md](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/zero-shot-interest-filtering.md)
- [docs/contracts/universal-selection-profiles.md](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/universal-selection-profiles.md)

## Update triggers

Обновляй этот документ, если меняется хотя бы одно из следующих:

- ingest-to-selection ownership path;
- canonical reuse semantics;
- final-selection ownership;
- safe tuning boundary between engine and application layer;
- allowed preserve-set for truthful local reset;
- operator/read-model expectations around selected, gray-zone, hold, pending review, or duplicate reuse.
