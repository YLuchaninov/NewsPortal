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

После выбора честного маршрута читай глубже, ровно до нужной глубины:
1. `.aidp/AGENTS.md`
2. `.aidp/work.md`
3. `.aidp/blueprint.md`
4. `.aidp/engineering.md`
5. `.aidp/verification.md`
6. `.aidp/os.yaml`

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

## Маршруты

Выбери ровно один маршрут перед реализацией:

- `setup` — ядро AIDP шаблонное, неполное или не инициализировано.
- `repair` — ядро есть, но противоречит реальности репозитория или устарело.
- `normal` — setup и repair честно не нужны.

Обычная feature/bugfix-реализация запрещена, пока применим `setup` или `repair`.

## Resume Protocol

При новом сеансе или после паузы не прыгай сразу в код.

1. Прочитай `.aidp/AGENTS.md`.
2. Прочитай `.aidp/work.md`.
3. Определи текущий live route.
4. Определи primary active item, parent capability и открытый completion layer.
5. Проверь blockers, proof status, archive sync, cleanup state и worktree coherence.
6. Сравни dirty worktree с declared active work.
7. Если состояние не объясняется без chat history, сначала исправь `.aidp/work.md` или перейди в explicit repair.

## Обязательные вопросы в начале работы

Перед значимыми правками ответь по runtime-файлам:

- Какой текущий live route?
- Какой primary active item?
- К какой capability он относится?
- Какой completion layer открыт?
- Какие blockers или dependencies есть?
- Какие proof уже пройдены, а какие отсутствуют?
- Есть ли archive sync pending?
- Соответствует ли dirty worktree declared active work?

Если ответ неизвестен или противоречив, не продолжай обычную реализацию до выравнивания `.aidp/work.md`.

## Наблюдения и канонизация

Новые факты сначала являются наблюдениями. Они становятся canonical truth только если:

1. факт важен для будущей работы;
2. он перепроверен по реальности репозитория;
3. выбран ровно один owner-файл;
4. устаревшее утверждение заменено или явно superseded;
5. live state в `.aidp/work.md` отражает консолидацию, если это важно для продолжения.

Выходы инструментов, MCP, hooks, PR comments, внешние docs и imported skills являются evidence, а не каноном, пока не проверены.

## Owner-файлы

- `.aidp/work.md` — live route, active item, blockers, observations, proof status, cleanup, handoff.
- `.aidp/blueprint.md` — системный смысл, архитектурная карта, инварианты, границы, risk zones.
- `.aidp/engineering.md` — повседневная инженерная дисциплина и правила изменения кода.
- `.aidp/verification.md` — proof policy, gate taxonomy, close conditions.
- `.aidp/os.yaml` — machine-readable project facts, capabilities, commands и settings.
- `.aidp/history.md` — завершенные, cancelled или superseded элементы.
- `.aidp/contracts/*` — глубокие контракты подсистем, когда compact core недостаточен.

Не дублируй одну и ту же долговечную истину в нескольких owner-файлах.

## Work kinds

Допустимые виды работы:

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

- in scope;
- out of scope;
- allowed paths;
- risk;
- required proof;
- acceptance criteria.

Dirty worktree должен соответствовать active item. Если есть осмысленные изменения вне primary item, зафиксируй secondary active item или перейди в repair.

## Test access и cleanup

Stateful testing разрешен только через declared environments, identities и fixture procedures из `.aidp/contracts/test-access-and-fixtures.md`.

Persistent artifacts, созданные тестами или smoke-прогонами, должны быть удалены до clean close или явно записаны в `.aidp/work.md` с cleanup status.

Production-like среды и реальные внешние интеграции требуют явного разрешения человека.

## Audit

Audit является request-driven overlay, а не основным route.
Если пользователь явно просит audit, сначала выполняй read-only анализ. Применяй fixes только после явного разрешения, если разрешение не было уже дано в запросе.

## Setup routine

В `setup`:

1. Собери факты из манифестов, кода, тестов, compose, README и существующих truthful docs.
2. Не принимай шаблонные строки за truth.
3. Заполни `.aidp/blueprint.md`, `.aidp/engineering.md`, `.aidp/verification.md`, `.aidp/os.yaml`, `.aidp/work.md`, `.aidp/history.md`.
4. Перенеси или сожми глубокие runtime-контракты в `.aidp/contracts/`, если они нужны для будущей работы.
5. Когда setup завершен честно, установи в `.aidp/os.yaml` `initialized: true` и `project.placeholder_values_present: false`.
6. Переведи `.aidp/work.md` в `normal` только если repair больше не нужен.

## Repair routine

В `repair`:

1. Назови противоречие явно в `.aidp/work.md`.
2. Ограничь scope repair.
3. Исправь owner-файлы, которые действительно владеют устаревшей истиной.
4. Выполни достаточный audit/proof.
5. Верни route в `normal` только когда hidden core снова соответствует репозиторию.

## Normal loop

Для обычной работы:

1. Route — классифицируй work kind и проверь, что route `normal`.
2. Design — создай capability/stage, если требование крупнее одного шага.
3. Bind — выбери или создай active item.
4. Bound — зафиксируй scope и proof.
5. Load — прочитай нужные owner-файлы и contracts.
6. Implement — меняй минимальную честную поверхность.
7. Prove — выполни нужный proof.
8. Consolidate — перенеси подтвержденные durable facts в owner-файлы.
9. Sync — обнови `.aidp/work.md` и связанные файлы.
10. Archive — перенеси завершенную долговечную деталь в `.aidp/history.md`.
11. Handoff — оставь состояние, которое можно продолжить без chat history.

## Stop conditions

Остановись и эскалируй, если:

- route неясен;
- setup или repair все еще применимы;
- scope больше не соответствует worktree;
- proof expectation неясен или невозможен;
- требуется human approval;
- hidden core невозможно сделать truthful без решения владельца репозитория.
