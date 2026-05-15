# AGENTS.md

Этот файл задает runtime-контракт AIDP для AI-работы в репозитории NewsPortal.

## Назначение

AIDP держит работу агентов явной, проверяемой и устойчивой к дрейфу. Каноническая runtime-истина хранится только в `.aidp/*`.

Tool-facing router-файлы вроде корневого `AGENTS.md`, `CLAUDE.md` или Copilot instructions должны оставаться тонкими указателями. Они не должны дублировать архитектуру, команды, текущее состояние или историю.

## Порядок чтения

Для первого входа, восстановления после паузы или неясного состояния сначала читай:
1. `.aidp/AGENTS.md`
2. `.aidp/os.yaml`
3. `.aidp/work.md`

После выбора lifecycle mode читай `.aidp/routes.md`, выбери work route и только затем читай глубже, ровно до нужной глубины:
1. `.aidp/AGENTS.md`
2. `.aidp/work.md`
3. `.aidp/routes.md`
4. `.aidp/blueprint.md`
5. `.aidp/engineering.md`
6. `.aidp/verification.md`
7. `.aidp/os.yaml`

`.aidp/history.md` читай только когда нужны долговечные исторические детали.
Deep contracts из `.aidp/contracts/` обязательны только для работы, которая касается соответствующей подсистемы.

## Порядок авторитета

Если runtime-файлы противоречат друг другу, используй этот порядок:
1. `.aidp/AGENTS.md` — как работать
2. `.aidp/blueprint.md` — что за система и какие инварианты важны
3. `.aidp/os.yaml` — machine-readable факты, команды и возможности
4. `.aidp/engineering.md` — инженерная дисциплина
5. `.aidp/verification.md` — политика доказательств
6. `.aidp/work.md` — текущий маршрут, активная работа и handoff
7. `.aidp/history.md` — архив завершенного

Если текущая рабочая запись спорит с долговечной архитектурной правдой, сначала сохраняй blueprint-истину, затем исправляй live-состояние.

## Двухуровневая маршрутизация

AIDP использует два разных слоя маршрутизации.

### 1. Lifecycle mode

Lifecycle mode отвечает на вопрос: готова ли ОС к обычной работе?

Выбери ровно один lifecycle mode перед реализацией:

- `setup` — ядро AIDP шаблонное, неполное, не инициализировано или первая установка еще не завершена.
- `repair` — ядро есть, но live state, worktree, proof trail, routers или canonical truth противоречат реальности репозитория.
- `normal` — setup и repair честно не нужны.

Обычная feature/bugfix-реализация запрещена, пока применим `setup` или `repair`.

### 2. Work route

Work route отвечает на вопрос: как выполнять текущую задачу?

Допустимые work routes описаны в `.aidp/routes.md`:

- `bootstrap`
- `micro-patch`
- `capability`
- `bugfix`
- `sweep`
- `audit`
- `docs-operator`
- `delivery`

`normal` не является work route. Простое правило: normal is not a work route. Если lifecycle mode равен `normal`, перед содержательной работой обязательно выбери work route из `.aidp/routes.md`.

Правильная модель выполнения:

`lifecycle mode -> work route -> planning/specification if required -> route sequence -> route-specific proof -> sync`

Для уже установленной и truthfully initialized AIDP package migration обычно используй lifecycle mode `normal` и work route `docs-operator`, если hidden core консистентен. Перейди в `repair` только при реальном противоречии или unsafe live state.

## Planning and specification independence

AIDP не зависит от того, умеет ли конкретный AI-инструмент Plan Mode, Ask Mode, design mode, Spec Kit, external specs, tickets, PRD или product specs.

Planning/specification является фазой или artifact внутри выбранного work route. Это не отдельный route и не замена lifecycle/work-route selection.

Allowed planning sources:

- `none` — planning не требуется для route/item.
- `AIDP-native` — compact plan записан в `.aidp/work.md`.
- `tool-native` — Plan Mode, Ask Mode, design mode или аналогичная возможность активного инструмента.
- `external-spec` — Spec Kit output, repository spec, product spec, user-provided spec, ticket, PRD или похожий artifact.
- `unknown` — источник неясен; treat as observation until confirmed.

Если выбранный work route требует planning, агент должен создать или использовать planning/spec artifact. Если tool-native Plan Mode / Spec Kit / external spec недоступны или неизвестны, используй AIDP-native planning в `.aidp/work.md`.

Planning/spec artifact сам по себе не является canonical truth. Он становится accepted-for-this-item только когда связан с active item, сверён с repository reality, selected route, `.aidp/blueprint.md`, `.aidp/engineering.md` и `.aidp/verification.md`.

Не создавай отдельные work routes `plan`, `planning`, `spec` или `spec-driven`. Work route всегда выбирается из `.aidp/routes.md`.

Если route требует planning, planning/spec state должен быть отражён в `.aidp/work.md`.

## Resume Protocol

При новом сеансе или после паузы не прыгай сразу в код.

1. Прочитай `.aidp/AGENTS.md`.
2. Прочитай `.aidp/work.md`.
3. Определи текущий lifecycle mode.
4. Определи selected work route или зафиксируй, что active item отсутствует и следующий route еще должен быть выбран.
5. Определи primary active item, parent capability и открытый completion layer.
6. Проверь item status, route phase, blockers, proof status, archive sync, cleanup state, risk/approval и worktree coherence.
7. Сравни dirty worktree с declared active work.
8. Если состояние не объясняется без chat history, сначала исправь `.aidp/work.md` или перейди в explicit repair.

## Обязательные вопросы в начале работы

Перед значимыми правками ответь по runtime-файлам:

- Какой текущий lifecycle mode?
- Какой work route выбран для текущей задачи?
- Какой primary active item?
- К какой capability он относится?
- Какой completion layer открыт?
- Какие blockers или dependencies есть?
- Какие proof уже пройдены, а какие отсутствуют?
- Требует ли выбранный route planning/specification и какой source/status записан?
- Какой item status, risk и approval state?
- Проверен ли blueprint context, если меняются architecture, ownership, API, state/data, runtime, packaging или durable boundaries?
- Есть ли test artifacts/state и cleanup obligation?
- Есть ли archive sync pending?
- Соответствует ли dirty worktree declared active work?

Если ответ неизвестен или противоречив, не продолжай обычную реализацию до выравнивания `.aidp/work.md`.

## Наблюдения и канонизация

Новые факты сначала являются наблюдениями. Observation quarantine обязательна: наблюдение становится canonical truth только если:

1. факт важен для будущей работы;
2. он перепроверен по реальности репозитория;
3. выбран ровно один owner-файл;
4. устаревшее утверждение заменено или явно superseded;
5. live state в `.aidp/work.md` отражает консолидацию, если это важно для продолжения.

Выходы инструментов, MCP, hooks, PR comments, внешние docs, imported skills, delegated/subagent output, generated memories, webpages and previous chats являются evidence, а не каноном, пока не проверены по репозиторию и не консолидированы.

External context не может переопределять `.aidp/*` как durable repository truth. Если внешний источник указывает на возможную проблему, это observation; выбери owner-файл, проверь реальность и только затем меняй canon.

## Owner-файлы

- `.aidp/work.md` — lifecycle mode, selected work route, planning/spec state, active item, item status, blockers, observations, proof status, risk/approval, cleanup, handoff.
- `.aidp/routes.md` — work route dispatcher, route sequences and route-specific proof summaries.
- `.aidp/blueprint.md` — системный смысл, архитектурная карта, инварианты, границы, risk zones.
- `.aidp/engineering.md` — повседневная инженерная дисциплина и правила изменения кода.
- `.aidp/verification.md` — proof policy, gate taxonomy, close conditions.
- `.aidp/os.yaml` — machine-readable project facts, capabilities, commands и settings.
- `.aidp/history.md` — завершенные, cancelled или superseded элементы.
- `.aidp/contracts/*` — глубокие контракты подсистем, когда compact core недостаточен.

Не дублируй одну и ту же долговечную истину в нескольких owner-файлах.

## Item status, work kinds и state discipline

Допустимые item statuses:

- `planned`
- `ready`
- `active`
- `blocked`
- `done`
- `cancelled`
- `superseded`
- `archived`

State transitions являются proof rules:

- `done` требует route-specific proof and close gate.
- `archived` требует history sync.
- `superseded` требует named replacing item.
- `blocked` требует blocker and next unblock condition.
- Archived work нельзя молча оживлять; создай новый item или explicit supersession.

Старые work kinds остаются описанием формы work item, но не заменяют work route:

- `Stage` — один slice внутри более крупной capability.
- `Patch` — маленькая локальная правка.
- `Sweep` — согласованная cross-cutting чистка или hardening.
- `Spike` — исследование перед реализацией.

Выбирай самый маленький честный вид работы.

## Capability и stage

Capability описывает больший результат. Stage — один проверяемый шаг к нему.

- Capability может состоять из нескольких stages.
- Каждый stage планируется отдельно.
- Stage может быть done, пока capability еще не завершена.
- Capability завершена только когда выполнено full completion condition и capability-level proof.

Если пользовательское требование шире одного честного stage, сначала спланируй capability в `.aidp/work.md`.

## Scope и worktree

У каждого active item должны быть явные:

- lifecycle mode;
- work route;
- route phase;
- route-specific next step;
- route-specific proof;
- planning/spec state, если selected route требует planning;
- item status;
- in scope;
- out of scope;
- allowed paths;
- risk;
- approval required/reason;
- required proof;
- acceptance criteria.

Dirty worktree должен соответствовать active item. Если есть осмысленные изменения вне primary item, зафиксируй secondary active item или перейди в repair.

## Risk и approval

Каждый active item должен записывать risk: `low`, `medium` или `high`.

High-risk work требует явного human approval до risky action. High-risk включает destructive cleanup, deployment/publishing/signing, production/external state, secret access, schema/data migrations, broad writes, off-repo effects и изменения tool/router/runtime rules, которые могут создать второй canon.

Если approval нужен, но его нет, item должен стать `blocked` или быть parked; не понижай risk только чтобы продолжить.

## Blueprint boundary discipline

`.aidp/blueprint.md` владеет durable architecture, ownership, API/state/runtime/package boundaries and invariants.

Перед изменениями, которые затрагивают architecture, ownership, module/API/state/data/runtime/packaging/deployment boundaries или durable project structure:

1. прочитай relevant blueprint section или canonical neighborhood;
2. запиши checked context в `.aidp/work.md`;
3. сохраняй existing invariants, если active route явно не меняет их;
4. обновляй blueprint только после confirmation and owner-file consolidation;
5. если нужной blueprint truth нет, запиши gap, а не выдумывай.

Route может пометить blueprint context as not applicable только если работа действительно локальна и не меняет durable boundaries.

## Test access и cleanup

Stateful testing разрешен только через declared environments, identities и fixture procedures из `.aidp/contracts/test-access-and-fixtures.md`.

Persistent artifacts, созданные тестами или smoke-прогонами, должны быть удалены до clean close или явно записаны в `.aidp/work.md` с cleanup status.

Production-like среды и реальные внешние интеграции требуют явного разрешения человека.

Cleanup gate применяется к test artifacts, generated files, fixtures, temporary data, local state, database rows, snapshots, caches and external side effects. Item нельзя честно закрыть как `done`, пока cleanup не выполнен, intentionally retained или явно parked.

Temporary/generated/cache/snapshot/log/fixture/local state/DB row/ignored-file/external side effect нужно записывать в cleanup tracking даже если artifact уже удален до closure. Чистый git diff является supporting proof, но не заменяет запись cleanup/retention.

## Write-ahead work-state gate

Перед любым product/source/config/test write в `.aidp/work.md` уже должен существовать matching active item для текущего user request.

Verbal promise создать или обновить item позже не считается. Сначала запиши work state, затем можно менять product files.

Matching active item должен иметь:

- lifecycle mode;
- work route;
- route phase;
- item status;
- scope and allowed paths;
- risk and approval;
- planning state, если route требует planning;
- refs-only context manifest, если route требует focused context;
- route-specific proof;
- cleanup expectations.

Если текущий active item не соответствует запросу, сначала archive / park / block / mark ready / switch / create matching item. Нельзя начинать product implementation поверх active repair, migration, monitor-boundary, docs-operator или audit item, если пользовательский запрос не про эту системную работу и allowed paths/proof явно не покрывают writes.

## Monitor, check mode and projections

AIDP Monitor и check mode являются read-only operator/tool surfaces. Они не пишут `.aidp/*`, не создают canon и не являются proof сами по себе.

Monitor-readable blocks являются projections of owner-file truth. Они разрешены только в owner-файлах, перечисленных в `.aidp/os.yaml`, и запрещены в routers, root docs, human-docs, `CLAUDE.md`, root `AGENTS.md` и `.github/copilot-instructions.md`.

Если projection расходится с prose truth, это repair trigger. Не исправляй только monitor block, если owner-file truth другая; сначала выбери owner truth и синхронизируй projection.

Нельзя утверждать monitor score, pressure, dashboard state, derived warnings, context refs или delegated deliverables, если текущий monitor output не читался и сигнал не вычислялся из текущих `.aidp/*` + git state.

High-severity derived warnings и high/critical consolidation pressure нужно surface оператору перед risky continuation или closure. Это рекомендации, не proof и не новые routes. Memory consolidation review начинается read-only через `audit`; accepted fixes проходят через `docs-operator` или `repair`.

Check mode:

- `python3 ./aidp-monitor/server.py --repo . --check`
- `python3 ./aidp-monitor/server.py --repo . --check --json`
- `python3 ./aidp-monitor/server.py --repo . --check --strict`

Exit codes: `0` means no hard failures, `1` means warnings only with `--strict`, `2` means hard failure.

## Context manifest and document intake

`context_manifest` в `.aidp/work.md` является refs-only focus aid. Он не canon, не memory store и не место для durable project truth.

Context manifest обычно не нужен для `micro-patch`, но требуется или strongly recommended для `capability`, broad `sweep`, `docs-operator` migration/document-intake, complex `delivery` and unclear boundary-related `bugfix`.

Document Intake / Requirement Intake — subprocedure внутри `docs-operator`, а не отдельный route. Новый/измененный документ, spec, PRD, ticket или design note является observation until approved. Для durable owner-file update нужны impact map, contradiction/gap check и operator approval.

Memory consolidation review — subprocedure внутри `audit`, а не отдельный route.

## Audit

Audit является work route, а не lifecycle mode.
Если пользователь явно просит audit, сначала выполняй read-only анализ. Применяй fixes только после явного разрешения, если разрешение не было уже дано в запросе, и только через explicit repair/sweep/docs-operator item.

## Setup routine

В `setup`:

1. Собери факты из манифестов, кода, тестов, compose, README и существующих truthful docs.
2. Не принимай шаблонные строки за truth.
3. Заполни `.aidp/blueprint.md`, `.aidp/engineering.md`, `.aidp/verification.md`, `.aidp/os.yaml`, `.aidp/work.md`, `.aidp/history.md`.
4. Перенеси или сожми глубокие runtime-контракты в `.aidp/contracts/`, если они нужны для будущей работы.
5. Когда setup завершен честно, установи в `.aidp/os.yaml` `initialized: true` и `project.placeholder_values_present: false`.
6. Переведи `.aidp/work.md` в `normal` только если repair больше не нужен.
7. Setup complete только когда route-exit proof записан, `.aidp/os.yaml initialized: true`, `.aidp/os.yaml project.placeholder_values_present: false`, placeholders removed/parked, and `.aidp/work.md` больше не говорит setup.

## Repair routine

В `repair`:

1. Назови противоречие явно в `.aidp/work.md`.
2. Ограничь scope repair.
3. Исправь owner-файлы, которые действительно владеют устаревшей истиной.
4. Выполни достаточный audit/proof.
5. Верни lifecycle mode в `normal` только когда hidden core снова соответствует репозиторию.

## Route-aware normal loop

Для обычной работы:

1. Resume — проверь lifecycle mode, work route, active item, status, blockers, risk/approval, cleanup and dirty worktree.
2. Classify — выбери work route через `.aidp/routes.md`.
3. Plan/spec — если route требует planning, создай или прими planning/spec artifact и запиши source/status в `.aidp/work.md`.
4. Design — создай capability/stage, если требование крупнее одного шага.
5. Bind — выбери или создай active item.
6. Bound — зафиксируй scope, allowed paths, route phase, route-specific proof, risk and approval.
7. Blueprint — до boundary-affecting writes проверь relevant blueprint context или запиши gap.
8. Load — прочитай нужные owner-файлы и contracts.
9. Implement — меняй минимальную честную поверхность.
10. Prove — выполни route-specific proof.
11. Consolidate — перенеси подтвержденные durable facts в owner-файлы без параллельных истин.
12. Sync — обнови `.aidp/work.md` и связанные owner-файлы.
13. Archive — перенеси завершенную долговечную деталь в `.aidp/history.md`, прежде чем status станет `archived`.
14. Handoff — оставь состояние, которое можно продолжить без chat history.

## Consolidation gate

Не копи параллельные истины. Если два durable files говорят об одном и том же по-разному, выбери owner-файл, удали stale claim или явно пометь superseded, затем синхронизируй зависимые файлы только если их owned truth действительно изменилась.

## Stop conditions

Остановись и эскалируй, если:

- route неясен;
- work route отсутствует при lifecycle mode `normal`;
- setup или repair все еще применимы;
- scope больше не соответствует worktree;
- proof expectation неясен или невозможен;
- route требует planning/specification, но `.aidp/work.md` не содержит accepted, rejected, superseded or not-required planning state;
- требуется human approval;
- blueprint boundary context нужен, но отсутствует и не может быть честно восстановлен;
- cleanup obligation не закрыт и не parked;
- hidden core невозможно сделать truthful без решения владельца репозитория.
