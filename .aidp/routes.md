# Routes

Этот файл является каноническим dispatcher для рабочих маршрутов AIDP.

Lifecycle mode отвечает на вопрос, готова ли ОС к обычной работе. Work route отвечает на вопрос, как именно выполнять текущую задачу.

`normal` не является рабочим маршрутом. Если lifecycle mode равен `normal`, перед содержательной работой нужно выбрать ровно один work route.

## Порядок выбора route

1. Если hidden core не инициализирован, шаблонный или неполный, используй lifecycle mode `setup` и work route `bootstrap`.
2. Если live state, worktree, proof trail, routers или canonical truth противоречивы или небезопасны, используй lifecycle mode `repair` и самый узкий repair-route.
3. Если пользователь просит read-only проверку консистентности, рисков, архитектуры, proof или OS state, используй `audit`.
4. Если изменение очень маленькое и локальное, используй `micro-patch`.
5. Если исправляется неправильное поведение или регрессия, используй `bugfix`.
6. Если добавляется поведение, workflow/API или требуется несколько честных stages, используй `capability`.
7. Если меняется структура без намеренного изменения поведения, используй `sweep`.
8. Если меняются docs, prompts, install/operator instructions, routers/adapters или `.aidp/*` как runtime-документация, используй `docs-operator`, если это не является частью другого active route.
9. Если создается artifact, package, release или handoff bundle, используй `delivery`.

Если подходят несколько маршрутов, выбирай маршрут с более сильным proof obligation и записывай интерпретацию в `.aidp/work.md`.

## Общие поля item

Каждый active item в `.aidp/work.md` должен иметь:

- item status;
- lifecycle mode;
- work route;
- route phase;
- route-specific next step;
- route-specific proof;
- risk;
- approval required;
- approval reason, если approval нужен или risk выше low;
- scope и allowed paths;
- blueprint context, если route касается architecture, ownership, API, state/data, runtime, packaging или durable boundaries;
- cleanup status, если создавались artifacts/state/side effects.

## Risk и approval

- `bootstrap`: обычно `medium`; `high`, если есть broad writes вне `.aidp/*` или сильное изменение существующих instruction files.
- `micro-patch`: обычно `low`.
- `capability`: обычно `medium`; `high` для auth, data, production, deployment, secrets, migrations или broad behavior.
- `bugfix`: `low` или `medium`; `high`, если затрагиваются critical data, security, production или broad behavior.
- `sweep`: обычно `medium`; `high` для schema, large migrations, destructive cleanup или cross-module rewrites.
- `audit`: `low`, пока read-only; risk растет, если fixes approved and executed.
- `docs-operator`: `low` или `medium`; `medium/high`, если меняются runtime core, routers или process rules.
- `delivery`: обычно `medium`; `high` для deployment, publishing, signing или production/external state.

High-risk action требует явного approval до risky action. Approval reason и boundary записываются в `.aidp/work.md`.

## Blueprint boundary check

Перед изменениями, которые затрагивают architecture, ownership, module/API/state/data/runtime/packaging/deployment boundaries или durable project structure, нужно прочитать релевантный раздел `.aidp/blueprint.md`.

В active item нужно записать одно из:

- blueprint context checked: `<section/neighborhood>`;
- blueprint gap found and parked;
- blueprint update required after confirmation;
- not applicable, потому что работа строго локальная и не меняет durable boundaries.

Если repository reality противоречит `.aidp/blueprint.md`, это observation. Выбери owner-файл и консолидируй или supersede через rules из `.aidp/verification.md`.

## AIDP package migration

Если AIDP уже установлена и truthfully initialized, upgrade пакета не является fresh bootstrap.

Предпочтительный маршрут:

- lifecycle mode: `normal`, если текущий hidden core консистентен;
- work route: `docs-operator`, если нужно добавить или обновить OS docs, route vocabulary, prompts, routers или owner-file rules.

Используй lifecycle mode `repair`, если текущий hidden core противоречив, stale, missing required state или unsafe.

Во время migration:

- сохраняй project-specific truth, язык, команды, proof policy, history, active/parked work и conventions;
- не сбрасывай `initialized: true` и `project.placeholder_values_present: false`, если core действительно initialized;
- не копируй generic template поверх подтвержденной repository truth;
- добавляй только missing/outdated mechanisms;
- записывай migration notes и proof в `.aidp/work.md`.

## Route: bootstrap

Используй, когда:

- `.aidp/os.yaml initialized: false`;
- `.aidp/os.yaml project.placeholder_values_present: true`;
- `.aidp/*` содержит template content;
- AIDP устанавливается впервые;
- setup был неполным и hidden core не содержит truthful project content.

Sequence:

1. Найди repository facts в code, manifests, tests, CI, docs, scripts и existing instructions.
2. Запиши raw findings в `Observed this session`.
3. Подтверди durable facts по repository reality.
4. Назначь owner-файлы для confirmed facts.
5. Заполни `.aidp/blueprint.md` confirmed architecture, invariants, ownership boundaries и canonical neighborhoods.
6. Заполни `.aidp/os.yaml`, `.aidp/work.md`, `.aidp/routes.md`, `.aidp/engineering.md`, `.aidp/verification.md`, `.aidp/history.md` только где нужно.
7. Сохрани truthful conventions; не заменяй их template language.
8. Удали или явно park placeholders.
9. Запиши risk, approval и cleanup status.
10. Выполни setup-exit checks.
11. Ставь `initialized: true` и `project.placeholder_values_present: false` только когда setup truthfully complete.

Proof:

- setup-exit checklist satisfied;
- owner files contain project-specific truth;
- no second canon;
- unresolved gaps parked or blockers recorded;
- cleanup status recorded if discovery/setup created artifacts.

## Route: micro-patch

Используй, когда изменение маленькое, локальное, не требует новой capability, architectural decision или broad refactor.

Sequence:

1. Уточни точное requested change.
2. Создай или переиспользуй micro item в `.aidp/work.md`.
3. Запиши status, risk, approval, allowed paths.
4. Запиши assumptions и simplest acceptable approach.
5. Пометь blueprint context as not applicable или смени route, если touched boundary шире локальной правки.
6. Сделай surgical change.
7. Выполни targeted proof.
8. Запиши cleanup status, если artifacts/state были созданы.
9. Обнови только truth layers, которые реально изменились.
10. Закрой с route proof и handoff.

Proof:

- targeted test/check/manual inspection for changed path;
- no unrelated changes;
- no hidden capability claim;
- cleanup proof if artifacts/state were created.

## Route: capability

Используй, когда добавляется user-visible behavior, workflow/API, multi-step feature или работа требует staged delivery and capability-level proof.

Sequence:

1. Определи capability goal.
2. Определи success criteria.
3. Запиши assumptions and competing interpretations.
4. Определи in scope/out of scope.
5. Запиши risk and approval requirements.
6. Прочитай релевантный `.aidp/blueprint.md` context до boundary-affecting design/writes.
7. Разбей на stages.
8. Активируй ровно один stage.
9. Закрой stage со stage proof.
10. Запиши cleanup per stage, если нужно.
11. Не помечай capability done до capability-level proof.
12. Sync blueprint/engineering/verification/routes/history только если их owned truth changed.

Proof:

- stage proof for each completed stage;
- cleanup proof for artifacts/state created by stages;
- capability-level proof for overall behavior;
- no stage completion mislabeled as capability completion.

## Route: bugfix

Используй, когда behavior incorrect, test fails, regression exists, user reports defect или invariant violated.

Sequence:

1. Сформулируй failure.
2. Reproduce issue или укажи existing failing proof.
3. Изолируй likely cause.
4. Если failure crosses boundary, прочитай relevant `.aidp/blueprint.md`.
5. Запиши risk and approval.
6. Patch minimally.
7. Докажи, что reproducer/regression proof passes.
8. Добавь или сохрани regression proof, если уместно.
9. Запиши cleanup для test artifacts/state.
10. Запиши worked/failed/not attempted в Attempt memory.
11. Консолидируй durable lessons только если они важны для future work.

Proof:

- failing proof before fix when practical;
- passing proof after fix;
- regression coverage or explicit reason if unavailable;
- cleanup proof if state/artifacts were created.

## Route: sweep

Используй для refactor, cleanup, migration, rename/reorg, dead-code removal или structural changes без intended behavior change.

Sequence:

1. Определи behavior invariant.
2. Определи allowed paths.
3. Прочитай relevant `.aidp/blueprint.md` context.
4. Запиши risk and approval.
5. Capture baseline proof if needed.
6. Сделай small structural changes.
7. Докажи behavior preserved.
8. Запиши cleanup status для generated files/caches/deleted artifacts/snapshots/test data/side effects.
9. Supersede stale canonical claims if structure changed.
10. Не добавляй behavior; если он нужен, меняй route на `capability`.

Proof:

- behavior preservation proof;
- targeted checks for affected boundaries;
- cleanup proof when artifacts/state changed;
- stale docs/routes/verification updated if ownership changed.

## Route: audit

Используй для consistency/drift/risk/architecture/proof/docs/OS-state review, когда сначала нужны findings.

Sequence:

1. Оставайся read-only by default.
2. Определи audit scope.
3. Risk остается `low`, пока audit read-only.
4. Сравни relevant owner files и repository reality.
5. Классифицируй findings: stale doc, broken proof, wrong owner file, worktree drift, router conflict, architecture contradiction, missing blueprint boundary context, setup/repair inconsistency, route mismatch, invalid item transition, missing risk/approval record, missing cleanup record.
6. Не исправляй silently.
7. Если fixes approved, создай explicit repair/sweep/docs-operator item.

Proof:

- findings traceable to files or observed repo state;
- no silent writes during read-only audit;
- proposed fixes have owner file, risk and route.

## Route: docs-operator

Используй для root docs, human docs, prompts, router presets, install instructions, `.aidp/*` docs-as-runtime-docs, optional contracts и migration уже installed AIDP core.

Sequence:

1. Определи document class: canonical runtime file, router/adapter, human guidance, prompt или optional contract.
2. Запиши risk and approval requirements.
3. Держи truth в правильном owner file.
4. Если docs touch durable project structure, architecture, ownership, APIs, state/data, runtime или packaging boundaries, update/verify `.aidp/blueprint.md`, не human-doc/router.
5. Не помещай runtime truth в human-docs.
6. Не помещай human explanation в machine facts.
7. Не позволяй routers become policy stores.
8. Для package migration сохраняй existing language, project truth, active state, history, commands, proof policy and conventions.
9. Проверь instruction duplication and second canon.
10. Verify install/bootstrap wording remains accurate.

Proof:

- owner-file alignment check;
- no duplicate durable rule in tool-facing router;
- no contradiction between root docs, human docs and `.aidp/*`;
- migration proof if updating installed AIDP core;
- cleanup proof if packaging/doc generation created artifacts.

## Route: delivery

Используй для archive/package/release artifact/final handoff bundle.

Sequence:

1. Подтверди deliverable and target package shape.
2. Запиши risk and approval.
3. Проверь required files present.
4. Проверь excluded files absent.
5. Verify installed core contains only intended runtime files.
6. Verify root docs and prompts present.
7. Если delivery/package shape changes durable boundaries, consult/update `.aidp/blueprint.md`.
8. Verify routers are thin and route-aware.
9. Verify no report/changelog/release-note noise unless explicitly requested.
10. Produce artifact.
11. Record delivery proof, cleanup status and handoff.

Proof:

- package structure checked;
- required docs checked;
- installed-core shape checked;
- route dispatcher present;
- excluded files absent;
- temporary build files cleaned or explicitly excluded;
- artifact path recorded.
