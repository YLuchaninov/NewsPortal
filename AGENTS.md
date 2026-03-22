# AGENTS.md

## Назначение

Этот файл задает корневой execution contract для AI-агентов в репозитории.

Он нужен, чтобы AI-assisted development оставалась:

- ограниченной по scope;
- привязанной к реальной архитектурной правде репозитория;
- проверяемой через явный proof;
- устойчивой к process drift при длинных цепочках задач и handoff.

## Source of truth и merge rule

- Перед любыми изменениями в архитектуре, scaffold, schema, queues или service boundaries обязательно перечитывай `docs/blueprint.md`.
- Если идея реализации конфликтует с `docs/blueprint.md`, follow blueprint, если только пользователь явно не зафиксировал override.
- `AGENTS.md` управляет process-layer: routing, scope discipline, work state, proof discipline, sync и handoff.
- `docs/blueprint.md` остается главным human-readable source of truth для архитектуры, схем данных, очередей, сервисных границ, инвариантов и запрещенных shortcut-ов.
- `.aidp/os.yaml` хранит machine-readable project facts, supported states и канонические команды верхнего уровня.
- `docs/verification.md` определяет proof policy и close gate.
- `docs/work.md` хранит live execution state, capability planning и handoff.
- `docs/history.md` хранит durable completed detail, которое больше не должно лежать в live context.

## Runtime core

В нормальном режиме агент работает с шестью runtime-файлами:

- `AGENTS.md`
- `docs/work.md`
- `docs/blueprint.md`
- `docs/verification.md`
- `docs/history.md`
- `.aidp/os.yaml`

Runtime core теперь живет прямо в репозитории; внешняя template-директория для его использования не требуется.

## Setup safety

Runtime core считается находящимся в `setup mode`, если хотя бы одно из условий верно:

- отсутствует любой файл runtime core;
- в runtime core остались template placeholders;
- `.aidp/os.yaml` не отражает реальную структуру, команды и ограничения репозитория;
- `docs/work.md` не отражает реальный live state;
- `docs/verification.md` не описывает реальные proof paths и known gaps;
- `docs/history.md` все еще содержит примерные архивные записи вместо правды проекта.

Пока `setup mode` активен, агент может и должен инициализировать core, но не должен трактовать template content как правду проекта и не должен начинать обычную implementation work без явного завершения setup.

## Краткое описание проекта

Этот репозиторий является polyglot monorepo для новостной платформы.

Базовая архитектура:

- Astro для `apps/web` и `apps/admin`;
- Node/TypeScript для `services/fetchers` и `services/relay`;
- Python для `services/api`, `services/workers`, `services/ml` и `services/indexer`;
- PostgreSQL является единственным source of truth;
- Redis + BullMQ используются только как transport;
- консистентность между БД и очередями обеспечивается через outbox/inbox patterns;
- Docker Compose является официальным локальным baseline.

## Структура репозитория

Ожидаемая структура верхнего уровня:

- `apps/web`
- `apps/admin`
- `services/fetchers`
- `services/relay`
- `services/api`
- `services/workers`
- `services/ml`
- `services/indexer`
- `packages/ui`
- `packages/contracts`
- `packages/sdk`
- `packages/config`
- `database/migrations`
- `database/ddl`
- `database/seeds`
- `infra/docker`
- `infra/nginx`
- `infra/systemd`
- `infra/scripts`
- `data/models`
- `data/indices`
- `data/snapshots`
- `data/logs`
- `docs`

## Архитектурные ограничения

Агент не должен:

- заменять Astro на Next.js или другой frontend framework;
- заменять PostgreSQL на SQLite как основную БД;
- использовать `pgvector` как primary ANN baseline;
- добавлять Kafka или Kubernetes в baseline;
- делать внутренний REST между Astro и Python главным transport path для тяжелой обработки;
- класть большие article payload в очереди; queue payloads должны быть ID-based и компактными;
- переносить тяжелую NLP или matching logic во frontend runtimes;
- придумывать business logic, которая еще не определена; вместо этого нужно оставлять явные TODO и gaps.

## Ответственность сервисов

- `apps/web`: user-facing product UI.
- `apps/admin`: operational/admin UI.
- `services/fetchers`: ingest из RSS, websites, email feeds и внешних API; запись raw article и outbox event.
- `services/relay`: чтение outbox events, публикация jobs в BullMQ, delivery status и re-drive.
- `services/api`: thin read/debug/explain API.
- `services/workers`: normalize, dedup, embed, cluster, match, notify, reindex orchestration.
- `services/ml`: preprocessing, feature extraction, embeddings, compilers, scoring helpers.
- `services/indexer`: HNSW rebuilds, backfills, cleanup, retention.

## Shared packages

- `packages/contracts`: DTO, queue payload schemas, event schemas, JSON schemas, OpenAPI fragments.
- `packages/sdk`: generated TS SDK для web/admin.
- `packages/ui`: shared UI primitives на базе `shadcn/ui`.
- `packages/config`: theme, brand, notification, prompt, public API и source bundle config.

## Delivery style

- Предпочитай небольшие и reviewable changes.
- Для крупных задач сначала делай short plan, потом implementation.
- Сначала scaffold, потом расширение; не пытайся собирать весь продукт за один проход.
- Предпочитай минимальный runnable foundation вместо широких fake implementations.
- После изменений запускай smallest meaningful validation и честно фиксируй, что именно проверено.

## Authority order

Если runtime-файлы расходятся, используй такой порядок истины:

1. `AGENTS.md`
2. `docs/blueprint.md`
3. `.aidp/os.yaml`
4. `docs/verification.md`
5. `docs/work.md`
6. `docs/history.md`

Если current execution planning расходится с durable blueprint truth, сначала сохраняй truth из `docs/blueprint.md`, затем обновляй execution state под него.

## Required read order

Перед обычной implementation work читай runtime core в таком порядке:

1. `AGENTS.md`
2. `docs/work.md`
3. `docs/blueprint.md`
4. `docs/verification.md`
5. `.aidp/os.yaml`

`docs/history.md` читай только тогда, когда нужна durable historical detail.

## Десять operating rules

1. Начинай с явного work item, а не с кода.
2. Если требования больше одной truthful stage, сначала спроектируй capability.
3. Планируй каждую stage отдельно.
4. Не путай завершение stage с завершением capability.
5. Работай только внутри declared scope и allowed paths.
6. Обновляй `docs/blueprint.md`, когда меняется durable system truth.
7. Обновляй `docs/verification.md` или `.aidp/os.yaml`, когда меняются proof logic, commands или machine facts.
8. Держи `docs/work.md` коротким, актуальным и decision-relevant.
9. Переноси durable completed detail в `docs/history.md`.
10. После meaningful work оставляй usable handoff.

## Non-negotiable rules

Агент не должен:

- начинать ordinary implementation work, если runtime core все еще в `setup mode`;
- реализовывать работу до выбора или создания work item;
- редактировать за пределами declared `Allowed paths`;
- расширять scope без обновления work item;
- помечать work item как `done` без executed proof;
- трактовать intuition, visual inspection или chat confidence как достаточный proof;
- считать capability complete только потому, что завершена одна из stages;
- оставлять runtime core несинхронизированным с repo reality;
- применять audit fixes без явного одобрения пользователя;
- продолжать работу после stop condition.

Агент должен:

- распознавать `setup mode` до первой обычной implementation work;
- выбирать smallest truthful work kind;
- сначала проектировать capability, если raw requirements больше одной truthful stage;
- создавать следующую truthful stage до implementation, если готовой stage еще нет;
- поддерживать `docs/work.md` как живой execution state;
- поддерживать `docs/history.md` как durable archive;
- поддерживать `docs/blueprint.md` как durable architecture truth;
- поддерживать `docs/verification.md` как актуальный proof policy;
- поддерживать `.aidp/os.yaml` как machine truth;
- выполнять required sync перед переводом item в `done`;
- выполнять context compression по trigger-ам;
- оставлять usable handoff при pause или session end;
- эскалировать, когда классификация, scope, proof или decomposition стали неясны.

## Work kinds

Единственные допустимые work kinds:

- `Stage` — один implementation slice внутри capability или один self-contained progression step;
- `Patch` — небольшая локальная коррекция или polish;
- `Sweep` — cross-cutting cleanup, hardening или consistency work;
- `Spike` — investigation или feasibility work до implementation.

Всегда выбирай smallest truthful work kind.

## Capability and stage rule

Capability — это более крупный intended outcome. Stage — один implementation slice на пути к capability.

Правила:

- одна capability может требовать нескольких stages;
- каждая stage должна планироваться отдельно;
- у каждой stage должны быть собственные scope, proof и acceptance;
- stage может завершиться независимо;
- capability считается complete только при выполнении ее full completion condition.

## Requirements-to-plan rule

Если входящий запрос больше одной truthful stage, агент сначала обязан спроектировать capability в `docs/work.md`.

Минимальный набор данных для capability:

- `Capability ID`;
- capability goal;
- capability outcome;
- full completion condition;
- proposed stage breakdown;
- immediate next stage.

Если готовой truthful next stage нет, ее нужно создать до implementation.

## Normal execution loop

1. `Route` — классифицируй запрос в work kind.
2. `Design if needed` — если задача больше одной truthful stage, спроектируй parent capability.
3. `Create next stage if needed` — если truthful next stage отсутствует, создай ее.
4. `Bind` — выбери или создай active work item в `docs/work.md`.
5. `Bound` — зафиксируй `In scope`, `Out of scope`, `Allowed paths`, `Required proof`, `Risk`.
6. `Load` — перечитай project meaning, system truth и proof requirements.
7. `Implement` — внеси smallest safe change внутри scope.
8. `Prove` — выполни required proof и зафиксируй результаты.
9. `Sync` — обнови нужные truth layers.
10. `Compress` — выполни context compression, если сработал trigger.
11. `Close or escalate` — переведи item дальше только если close gate пройден.

## Scope rules

Каждый active или ready work item обязан явно определять:

- `Kind`
- `Status`
- `Goal`
- `In scope`
- `Out of scope`
- `Allowed paths`
- `Required proof`
- `Risk`

Агент может менять только:

- файлы внутри `Allowed paths`;
- файлы, строго необходимые для того, чтобы эти изменения собирались, запускались или проверялись;
- runtime core files, которые нужно синхронизировать по факту изменения истины.

Если требуется менять что-то еще, сначала нужно:

- явно расширить scope;
- или split work;
- или сменить work kind;
- или эскалировать.

## Update routing rules

После meaningful change обновляй только тот truth layer, чья правда реально изменилась:

- `docs/work.md` — live execution state, capability decomposition, current memory, gaps, next step, handoff;
- `docs/blueprint.md` — назначение системы, technical model, operating model, invariants, boundaries, structural rules, forbidden shortcuts, risk zones;
- `.aidp/os.yaml` — machine facts, commands, states, planning settings, coordination settings;
- `docs/verification.md` — proof policy, close conditions, risk-to-proof expectations;
- `docs/history.md` — durable completed detail, которую нужно убрать из live context.

Не обновляй core-файл только потому, что рядом изменился код. Обновляй его только тогда, когда изменилась именно его truth layer.

## Setup mode routine

Если runtime core еще не инициализирован, агент должен выполнить setup mode routine:

- заполнить `.aidp/os.yaml` реальными project facts и commands;
- убрать template placeholders из `docs/work.md`;
- заполнить `docs/verification.md` реальными proof paths и gaps;
- убедиться, что `docs/blueprint.md` описывает реальную architecture truth;
- убрать примерные архивные записи из `docs/history.md`.

Выходить из `setup mode` можно только после того, как runtime core полностью основан на repo-specific truth.

## Optional deep contract docs

Core intentionally остается компактным. Если отдельная подсистема становится слишком сложной для core, разрешено заводить deep contract docs.

Правила:

- deep contract doc создается только для реально сложной subsystem;
- если active work touches subsystem с отдельным contract doc, этот документ становится required context;
- временные deep design docs должны сливаться в `docs/history.md` или в стабильный contract doc после завершения соответствующего arc.

## Automatic maintenance routines

### Work Sync Routine

Выполняй Work Sync Routine после любого meaningful change, перед переводом item в `done` и перед переключением primary active item.

Work Sync Routine должна:

- обновить correct truth layer;
- держать stage state и parent capability state согласованными;
- честно фиксировать proof в active work item;
- переносить durable completed detail в `docs/history.md`, когда она больше не должна лежать в `docs/work.md`.

### Stage and capability sync rule

Если capability состоит из нескольких stages, в `docs/work.md` должны быть согласованы:

- статус capability;
- stage plan;
- current next stage;
- реальный статус active stage.

Завершенная stage означает только stage-level completion.

### Context Compression Routine

Запускай `RUN CONTEXT COMPRESSION NOW`, когда срабатывает любой compression trigger.

### Consistency Audit Routine

Запускай `RUN CONSISTENCY AUDIT NOW` только по явному запросу пользователя.

### Approved Fix Routine

Запускай `APPLY APPROVED AUDIT FIXES NOW` только после явного пользовательского approval.

## Durable truth rule

Локальный кодовый change обязан сопровождаться обновлением `docs/blueprint.md`, если он меняет хотя бы одно из следующего:

- что система делает;
- как она устроена технически;
- реальный operating flow;
- core invariant;
- key boundary;
- structural rule;
- forbidden shortcut;
- risk zone или ее affected boundaries.

Если ничего из этого не изменилось, blueprint лучше оставить стабильным.

## Stop conditions

Нужно немедленно остановиться и эскалировать, если:

- запрос нельзя уверенно классифицировать;
- обязательные поля work item отсутствуют;
- raw requirements требуют decomposition, но parent capability не спроектирована;
- repo reality конфликтует с `docs/blueprint.md` или `.aidp/os.yaml`;
- touched files выходят за `Allowed paths`;
- локальный change внезапно становится structural;
- required proof нельзя исполнить;
- риск выше текущего proof plan;
- два active items начинают конкурировать за одну и ту же область;
- задача по сути exploratory и должна быть `Spike`.

## State transitions

Допустимые states:

- `planned`
- `ready`
- `active`
- `blocked`
- `done`
- `archived`

Допустимые transitions:

- `planned -> ready`
- `ready -> active`
- `active -> blocked`
- `blocked -> ready`
- `active -> done`
- `done -> archived`

Для нового work создавай follow-up item вместо переоткрытия completed history.

## Close gate

Work item может стать `done`, только если все условия истинны:

- required fields заполнены;
- `Executed proof` заполнен явно;
- `Proof status` равен `passed`;
- глубина proof соответствует declared risk;
- live runtime core синхронизирован;
- residual gaps зафиксированы честно.

Capability может считаться complete только при выполнении ее completion condition.

## Context compression

Запускай `RUN CONTEXT COMPRESSION NOW`, если верно хотя бы одно:

- item переведен в `done`;
- item готовится к archiving;
- primary active item поменялся;
- `docs/work.md` вышел за свой operating budget;
- completed detail все еще занимает live space;
- capability line устарела после завершения stage или replanning;
- заканчивается meaningful session и нужен handoff.

Compression означает:

- сохранить точный active item;
- оставить только decision-relevant current memory;
- держать capability decomposition короткой и актуальной;
- перенести durable completed detail в `docs/history.md`;
- удалить stale temporary notes после сохранения их durable meaning.

## Handoff rule

Перед meaningful pause или session end после реальной работы в `docs/work.md` должны остаться:

- текущий active item и его реальный статус;
- next recommended action;
- unresolved risks и open questions;
- что уже доказано;
- что еще не доказано или заблокировано;
- scope или coordination warning, которую следующий агент должен увидеть первой.

Если следующий агент не сможет продолжить без чтения chat history, handoff считается неполным.

## Optional audit mode

Audit отделен от normal execution loop и является request-driven.

Если пользователь просит audit, выполняется:

`RUN CONSISTENCY AUDIT NOW`

Audit по умолчанию read-only. Он может:

- проверять compact core на накопленный drift;
- формулировать findings и severity;
- предлагать safe structural fixes;
- запрашивать явный approval перед применением fixes.

После явного approval пользователя агент может выполнить:

`APPLY APPROVED AUDIT FIXES NOW`

Допустимые audit fixes:

- перенос durable completed detail из `docs/work.md` в `docs/history.md`;
- нормализация обязательных разделов;
- добавление missing empty required blocks;
- уменьшение перегруженного current memory без потери смысла;
- архивирование `done` item, если historical detail уже зафиксирован;
- удаление явной дублирующей live-document информации.

Audit fixes не должны молча менять:

- назначение системы, архитектуру или инварианты;
- risk level;
- work intent или work kind без объяснения;
- semantics scope;
- смысл proof policy;
- machine facts по догадке.
