# AGENTS.md

## Назначение

Этот файл задает корневой execution contract для AI-агентов в репозитории.

Используй его, чтобы AI-assisted development оставалась:

- ограниченной по scope;
- привязанной к реальной архитектурной правде репозитория;
- проверяемой через явный proof;
- устойчивой к process drift на длинных цепочках задач и handoff;
- управляемой через явные capability, stage, worktree и cleanup rules.

## Setup safety

Этот runtime core использует репозиторий-специфичную правду, но по своей модели остается template-derived. Если хотя бы один из обязательных файлов отсутствует, содержит placeholder-правду или не отражает реальное состояние проекта, репозиторий считается находящимся в `setup mode`.

Обязательные runtime-файлы:

- `AGENTS.md`
- `docs/work.md`
- `docs/blueprint.md`
- `docs/engineering.md`
- `docs/verification.md`
- `docs/history.md`
- `.aidp/os.yaml`

Перед первой обычной implementation work нужно заменить или убрать template-like content в:

- `.aidp/os.yaml`
- `docs/work.md`
- `docs/blueprint.md`
- `docs/engineering.md`
- `docs/verification.md`
- `docs/history.md`, если в нем еще есть примерные архивные записи

Пока активен `setup mode`, агент может и должен инициализировать, переписывать и синхронизировать core, но:

- не должен трактовать scaffolding как truth проекта;
- не должен начинать ordinary implementation work поверх placeholder content;
- не должен объявлять setup завершенным, пока core не основан на repo-specific truth.

Агент обязан сохранить следующие свойства процесса:

- explicit capability planning, когда требования требуют decomposition;
- explicit work;
- explicit scope;
- explicit proof;
- explicit sync;
- explicit engineering discipline;
- short current memory;
- durable full history;
- request-driven audit.

## Authority order

Если runtime-файлы расходятся, используй такой порядок истины:

1. `AGENTS.md` — как работать
2. `docs/blueprint.md` — что такое система и что в ней должно оставаться истинным
3. `.aidp/os.yaml` — machine-canonical operational facts и commands
4. `docs/engineering.md` — durable engineering rules и implementation discipline
5. `docs/verification.md` — что должно быть доказано
6. `docs/work.md` — live execution state и capability decomposition
7. `docs/history.md` — durable archive

Если current execution planning конфликтует с durable blueprint truth, сначала сохраняй truth из `docs/blueprint.md`, затем обновляй execution state под нее.

Перед любыми изменениями в архитектуре, scaffold, schema, queues или service boundaries обязательно перечитывай `docs/blueprint.md`.

## Read Order vs Authority Order

Это разные вещи.

- `Read order` нужен для практической загрузки контекста.
- `Authority order` нужен для разрешения конфликтов между файлами.

Файл может читаться позже, но оставаться выше другого по authority.

## Десять Operating Rules

1. Начинай с явного work item, а не с кода.
2. Если требования больше одной truthful stage, сначала проектируй capability.
3. Планируй каждую stage отдельно.
4. Не путай завершение stage с завершением capability.
5. Работай только внутри declared scope и allowed paths.
6. Обновляй `docs/blueprint.md`, когда меняется durable system truth.
7. Обновляй `docs/engineering.md`, `docs/verification.md` и `.aidp/os.yaml`, когда меняются engineering discipline, proof logic, commands или machine facts.
8. Держи `docs/work.md` коротким, актуальным и decision-relevant.
9. Переноси durable completed detail в `docs/history.md`.
10. После meaningful work оставляй usable handoff.

## Required Read Order

Перед обычной implementation work читай runtime core в таком порядке:

1. `AGENTS.md`
2. `docs/work.md`
3. `docs/blueprint.md`
4. `docs/engineering.md`
5. `docs/verification.md`
6. `.aidp/os.yaml`

`docs/history.md` читай только тогда, когда нужна durable historical detail.

Deep contract docs становятся обязательным контекстом только тогда, когда active work touches соответствующую subsystem. Для текущего репозитория таким обязательным deep contract doc уже является `docs/contracts/test-access-and-fixtures.md` при работе со stateful backends, Firebase identities, Mailpit, `web_push` subscriptions и persistent test fixtures.

## Non-negotiable Rules

Агент не должен:

- начинать ordinary implementation work, если core все еще в `setup mode`;
- реализовывать работу до выбора или создания work item;
- редактировать за пределами declared `Allowed paths`;
- расширять scope без обновления work item;
- помечать work как `done` без executed proof;
- переоткрывать completed history вместо создания follow-up item;
- считать capability complete только потому, что завершена одна stage;
- трактовать intuition, visual inspection или chat confidence как достаточный proof;
- оставлять runtime/process files несинхронизированными с repo reality;
- оставлять durable completed detail жить только в `docs/work.md`, когда archive sync уже должен был произойти;
- оставлять meaningful mixed-worktree changes невидимыми для active work state;
- создавать ad hoc test users, credentials, subscriptions, webhook endpoints или другие persistent test artifacts вне declared test-access process;
- применять audit fixes без явного пользовательского approval;
- продолжать работу после stop condition.

Агент должен:

- распознавать `setup mode` до первой обычной implementation work;
- выбирать smallest truthful work kind;
- сначала проектировать capability, если raw requirements больше одной truthful stage;
- создавать truthful next stage до implementation, если готовой stage еще нет;
- планировать каждую stage отдельно, даже если stages принадлежат одной capability;
- поддерживать `docs/work.md` как live execution state;
- поддерживать `docs/history.md` как durable archive;
- поддерживать `docs/blueprint.md` как durable architecture truth;
- поддерживать `docs/engineering.md` как durable engineering truth;
- поддерживать `docs/verification.md` как актуальный proof contract;
- поддерживать `.aidp/os.yaml` как machine truth;
- выполнять required sync перед переводом item в `done`;
- архивировать durable completed detail до конца текущего sync cycle, если у item или capability больше нет truthful live next stage;
- выполнять context compression по trigger-ам;
- держать worktree truthfully aligned с primary item, explicit overlap и capability map;
- использовать только declared environments, declared identities и declared fixture procedures для stateful testing;
- фиксировать созданные persistent test artifacts и их cleanup status в `docs/work.md`;
- оставлять usable handoff при pause или session end;
- эскалировать, когда классификация, scope, proof или decomposition стали неясны.

## Work Kinds

Единственные допустимые work kinds:

- `Stage` — один implementation slice внутри capability или один self-contained progression step;
- `Patch` — небольшая локальная коррекция или polish;
- `Sweep` — cross-cutting cleanup, hardening или consistency work;
- `Spike` — investigation или feasibility work до implementation.

Всегда выбирай smallest truthful work kind.

## Capability and Stage Rule

Capability — это более крупный intended outcome. Stage — один implementation slice на пути к capability.

Правила:

- одна capability может требовать нескольких stages;
- каждая stage должна планироваться отдельно;
- у каждой stage должны быть собственные scope, proof и acceptance;
- stage может завершиться независимо;
- capability считается complete только при выполнении ее full completion condition.

Не превращай несколько честных stages в одну oversized stage.

## Requirements-to-Plan Rule

Если входящий запрос больше одной truthful stage, агент сначала обязан спроектировать capability в `docs/work.md`.

Минимальный набор данных для capability:

- `Capability ID`;
- capability goal;
- capability outcome;
- capability full completion condition;
- proposed stage breakdown;
- immediate next stage.

Если truthful next stage отсутствует, ее нужно создать до implementation.

## Normal Execution Loop

1. `Route` — классифицируй запрос в work kind.
2. `Design if needed` — если задача больше одной truthful stage, спроектируй parent capability.
3. `Create next stage if needed` — если truthful next stage отсутствует, создай ее.
4. `Bind` — выбери или создай active work item в `docs/work.md`.
5. `Bound` — зафиксируй `In scope`, `Out of scope`, `Allowed paths`, `Required proof`, `Risk`.
6. `Load` — перечитай project meaning, system truth, engineering discipline и proof requirements.
7. `Implement` — внеси smallest safe change внутри scope.
8. `Prove` — выполни required proof и зафиксируй результаты.
9. `Sync` — обнови нужные truth layers.
10. `Compress` — выполни context compression, если сработал trigger.
11. `Archive if needed` — выполни archive sync, когда completed detail больше не должен оставаться в live execution.
12. `Close or escalate` — переведи item дальше только если close gate пройден.

## Routing Rules

Используй такую классификацию:

- `Stage` — один implementation slice capability, структурное продвижение или milestone work;
- `Patch` — небольшой локальный fix, polish или local hardening;
- `Sweep` — cross-cutting cleanup, broad consistency work или широкий refactor;
- `Spike` — investigation, discovery или feasibility work.

Если item меняет форму в ходе работы, сначала обнови его framing, split work, смени work kind или эскалируй.

## Test Access and Cleanup Rule

Stateful systems создают operational drift, если доступ, identities, fixtures и cleanup не объявлены явно.

Используй такие правила:

- применяй только declared test environments, declared credentials и declared fixture procedures;
- предпочитай reusable seeded fixtures и deterministic scripts вместо ad hoc manual entity creation;
- не создавай persistent users, subscriptions, API keys, notification endpoints или external registrations без реальной необходимости work item;
- если работа создала persistent test artifacts, зафиксируй их в `docs/work.md` в блоке `Test artifacts and cleanup state`;
- если cleanup возможен в рамках active work, выполни его до clean close;
- если cleanup пока невозможен, оставь explicit residual cleanup note и handoff;
- не используй production identities или production-like user state без явного human approval.

При работе со stateful или integration-heavy частями репозитория обязательно используй `docs/contracts/test-access-and-fixtures.md`.

## Dependency and Readiness Rule

Stage или другой work item может стать `ready` или `active` только когда его declared dependencies удовлетворены.

Правила:

- если `Depends on` равен `-`, item может продолжаться нормально;
- если зависимости перечислены, каждая из них уже должна быть `done` или `archived`;
- если dependency еще не завершена, dependent item остается `planned`, `ready` или `blocked`, но не начинает implementation;
- если reality показывает, что dependency list неполон, сначала обнови item.

Dependency override — исключение. Он требует явного human approval и записи о принятом риске rework.

## Worktree Coherence and Concurrent Work Rule

Репозиторий не должен нести скрытую concurrent work.

Перед продолжением meaningful implementation, перед переводом work в `done` и перед handoff сравни actual dirty worktree с active work state.

Правила:

- если dirty paths укладываются в primary active item, продолжай работу;
- если dirty paths выходят за declared `Allowed paths` primary item, остановись и reframe work;
- если в worktree уже присутствуют meaningful changes из другого item или capability, сделай overlap explicit в `docs/work.md`.

Когда появляется mixed work, агент обязан сделать одно из следующего до дальнейшей implementation work:

1. truthfully обновить текущий item, если scope был фактически неполным;
2. открыть explicit `Secondary active item` в `docs/work.md` с reason, allowed overlap paths и exit condition;
3. compress и close/pause текущий item, затем переключить primary item.

Если `.aidp/os.yaml` не разрешает multi-agent work, secondary active item считается краткоживущим исключением, а не штатным режимом.

## Scope Rules

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
- process/core files, которые нужно синхронизировать по факту изменения истины;
- subsystem contract docs, если меняется их durable contract truth.

Если требуется менять что-то еще, сначала нужно:

- явно расширить scope;
- split work;
- сменить work kind;
- или эскалировать.

## Update Routing Rules

После meaningful change обновляй только тот truth layer, чья правда реально изменилась:

- `docs/work.md` — live execution state, capability decomposition, current memory, worktree coherence, test artifacts, gaps, next step и handoff;
- `docs/blueprint.md` — назначение системы, technical model, operating model, invariants, boundaries, structural rules, forbidden shortcuts и risk zones;
- `docs/engineering.md` — durable engineering rules, decomposition discipline, boundary-handling, refactor discipline и stateful test discipline;
- `.aidp/os.yaml` — machine facts, commands, states, planning settings, coordination settings, proof contours и test-access defaults;
- `docs/verification.md` — proof policy, close gate, risk-to-proof expectations, command guidance и failure/rerun rules;
- `docs/history.md` — durable completed detail, которую нужно убрать из live context;
- `docs/contracts/*` — subsystem-specific durable contracts, включая test-access, fixture и cleanup truth.

Не обновляй core-файл только потому, что рядом изменился код. Обновляй его только тогда, когда изменилась именно его truth layer.

## Setup Mode Routine

Если runtime core еще не инициализирован под текущую версию contract, агент должен выполнить setup mode routine:

- заполнить `.aidp/os.yaml` реальными project facts, commands и settings;
- убрать template placeholders из `docs/work.md`;
- убедиться, что `docs/blueprint.md` описывает реальную architecture truth;
- заполнить `docs/engineering.md` реальными engineering rules репозитория;
- заполнить `docs/verification.md` реальными proof paths, gate contours и known gaps;
- убрать примерные архивные записи из `docs/history.md`;
- создать или синхронизировать нужные deep contract docs, если их truth уже нужна для работы.

Выходить из `setup mode` можно только после того, как core полностью основан на repo-specific truth.

## Optional Deep Contract Docs

Core intentionally остается компактным. Если отдельная subsystem становится слишком сложной для core, разрешено заводить deep contract docs.

Правила:

- deep contract doc создается только для реально сложной subsystem;
- если active work touches subsystem с отдельным contract doc, этот документ становится required context;
- временные deep design docs должны сливаться в `docs/history.md` или в стабильный contract doc после завершения соответствующего arc;
- нельзя оставлять long-lived system truth только во временных planning notes.

Текущие repo-specific deep contract docs:

- `docs/contracts/test-access-and-fixtures.md` — stateful backend test access, fixture creation и cleanup truth;
- `docs/contracts/README.md` — index доступных contract docs и правила их использования.

## Automatic Maintenance Routines

### Work Sync Routine

Выполняй Work Sync Routine после любого meaningful change, перед переводом item в `done` и перед переключением primary active item.

Work Sync Routine должна:

- обновить correct truth layer;
- держать stage state и parent capability state согласованными;
- держать worktree state aligned с active item, explicit overlap и capability map;
- честно фиксировать proof в active work item;
- честно фиксировать test artifacts и cleanup status, если работа трогала stateful systems;
- переносить durable completed detail в `docs/history.md`, когда она больше не должна лежать в `docs/work.md`;
- не оставлять fully completed capability half-live после конца текущего sync cycle.

### Stage and Capability Sync Rule

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

## Durable Truth Rule

Локальный change обязан сопровождаться обновлением `docs/blueprint.md`, если он меняет хотя бы одно из следующего:

- что система делает;
- как она устроена технически;
- реальный operating flow;
- core invariant;
- key boundary;
- structural rule;
- forbidden shortcut;
- risk zone или ее affected boundaries.

Если меняется durable engineering truth, stateful test discipline или deep contract truth, обновляй `docs/engineering.md` и/или соответствующий contract doc.

## Completion-layer Rule

Некоторые capability имеют более одного честного completion layer.

Примеры:

- implementation completion;
- operator/manual readiness completion;
- rollout или delivery completion.

Правила:

- stage может завершить implementation slice, не завершая capability целиком;
- capability может оставаться active после code completion, если открыты manual, operator, delivery или другой declared completion layer;
- когда это так, completion layers должны быть явно записаны в `docs/work.md`, а `docs/verification.md` должен фиксировать, что еще требуется для full completion.

Не маскируй operator/manual residue под будто бы незавершенную coding work и не объявляй capability complete раньше ее full completion condition.

## Stop Conditions

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
- dirty worktree перестает соответствовать declared work framing;
- задача по сути exploratory и должна быть `Spike`.

## State Transitions

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

## Close Gate

Work item может стать `done`, только если все условия истинны:

- required fields заполнены;
- `Executed proof` заполнен явно;
- `Proof status` равен `passed`;
- глубина proof соответствует declared risk;
- live runtime/process files синхронизированы;
- residual gaps зафиксированы честно.

Capability может считаться complete только при выполнении ее completion condition.

## Context Compression

Запускай `RUN CONTEXT COMPRESSION NOW`, если верно хотя бы одно:

- item переведен в `done`;
- item готовится к archiving;
- primary active item поменялся;
- `docs/work.md` вышел за operating limits;
- completed detail все еще занимает live space;
- stale capability line устарела после завершения stage или replanning;
- заканчивается meaningful session и нужен handoff.

Compression означает:

- сохранить точный active item;
- оставить только decision-relevant current memory;
- держать capability decomposition короткой и актуальной;
- перенести durable completed detail в `docs/history.md`;
- удалить stale temporary notes после сохранения их durable meaning.

## Handoff Rule

Перед meaningful pause или session end после реальной работы в `docs/work.md` должны остаться:

- текущий active item и его реальный статус;
- next recommended action;
- unresolved risks и open questions;
- что уже доказано;
- что еще не доказано или заблокировано;
- scope или coordination warning, которую следующий агент должен увидеть первой.

Если следующий агент не сможет продолжить без чтения chat history, handoff считается неполным.

## Optional Audit Mode

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
