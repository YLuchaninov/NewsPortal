# Blueprint Shell: runtime-facing architecture truth for NewsPortal

Этот файл остается обязательным runtime-core blueprint для агентной разработки.

Он больше не хранит полный длинный product architecture reference целиком.
Канонический полный продуктовый blueprint теперь живет в:

- [`docs/product/architecture/product-blueprint.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/product/architecture/product-blueprint.md)

## Как читать этот файл

- Используй этот shell как compact architecture truth для execution, scoping и boundary checks.
- Используй product blueprint как полный human-facing architecture/reference документ.
- Если меняется долговременная product truth, сначала синхронизируй product blueprint, затем обнови этот shell так, чтобы runtime-core summary не дрейфовал.

## Runtime-facing summary

### Назначение системы

NewsPortal строится как zero-shot система фильтрации, персонализации, event clustering и нотификаций контента для одного B2C white-label-ready продукта на рынках USA и Евросоюза.

### Product meaning

Система должна принимать поток контента из нескольких типов источников, нормализовать и дедуплицировать content items, находить совпадения по system interests и user interests без retrain, объяснимо доставлять важные элементы пользователю и сохранять управляемую эксплуатационную стоимость.

### Technical model

- polyglot monorepo с Astro apps, Node fetch/relay services и Python NLP/indexing services;
- PostgreSQL как единственный source of truth;
- Redis + BullMQ только как transport layer;
- HNSW indices, snapshots, model cache и прочие derived artifacts пересобираемы;
- shared contracts, SDK, UI и config вынесены в `packages/*`.

### Operating model

Основной путь данных выглядит так:

`source channel -> Node fetcher -> PostgreSQL -> outbox_events -> relay -> (q.fetch/q.foundation.smoke fallback or sequence lookup -> sequence_runs -> q.sequence) -> Python workers/task engine -> PostgreSQL/HNSW derived state -> Astro web/admin, API и notification dispatch`

Главный write principle: пользовательский и сервисный command path сначала фиксирует бизнес-изменение в PostgreSQL, затем публикует outbox event; тяжелая обработка выполняется асинхронно worker-ами, а UI читает результат из PostgreSQL.

### Core invariants

- PostgreSQL является единственным source of truth для критичных бизнес-данных.
- Redis и BullMQ используются только как transport, coordination и retry layer.
- Система остается zero-shot only: без online learning, retrain по кликам и training pipeline.
- Тяжелая NLP/matching logic не уходит в frontend runtimes и не становится sync internal REST path.
- Derived state обязан быть rebuildable из PostgreSQL.

### Runtime-critical boundaries

- `apps/*` содержат только Astro product surfaces и тонкие BFF/read flows.
- `services/fetchers` и `services/relay` владеют ingest/adaptation/routing, но не становятся business source of truth.
- `services/api`, `services/workers`, `services/ml`, `services/indexer` владеют read/explain, async processing, ML helpers и rebuild tooling.
- `services/workers/app/task_engine` остается default runtime owner для sequence-managed triggers.
- provider-specific acquisition может различаться только до общего downstream handoff; после handoff product truth должна сходиться на одном downstream path.

### Runtime-sensitive risk zones

- queue consistency и outbox/inbox semantics;
- derived indices и compiled state drift;
- auth/session bridge и notification delivery;
- gray-zone LLM review, suppression и final-selection explainability.

### Canonical product architecture truth

Полный product architecture/reference документ теперь живет в:

- [`docs/product/architecture/product-blueprint.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/product/architecture/product-blueprint.md)

Этот документ должен считаться canonical owner для:

- system purpose and product meaning;
- technical model and operating model in full detail;
- capability model;
- architectural decisions;
- boundaries, structural rules, forbidden shortcuts и risk zones;
- shipped vs future-ready product truth.

## Related truth layers

- [`docs/product/architecture/product-blueprint.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/product/architecture/product-blueprint.md)
  Канонический полный product blueprint.
- [`docs/product/architecture/architecture-overview.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/product/architecture/architecture-overview.md)
  Быстрый current-state walkthrough с диаграммами.
- [`docs/engineering.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/engineering.md)
  Durable engineering discipline.
- [`docs/verification.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/verification.md)
  Proof policy и close gate.

## Update rule

- Если меняется полный product architecture truth, обновляй `docs/product/architecture/product-blueprint.md`.
- Если это изменение затрагивает runtime-facing summary, boundaries или invariants, синхронизируй и этот shell.
- Не возвращай длинный full product reference обратно в `docs/blueprint.md`.
