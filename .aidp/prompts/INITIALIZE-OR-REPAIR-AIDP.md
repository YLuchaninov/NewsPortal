# INITIALIZE OR REPAIR AIDP

Этот репозиторий использует AIDP.

Каноническая runtime-истина живет только в `.aidp/*`.
Не создавай второй источник истины в tool-facing файлах, chat memory или human-docs.

## Обязательный runtime context

Сначала прочитай:

- `.aidp/AGENTS.md`
- `.aidp/os.yaml`
- `.aidp/work.md`
- `.aidp/routes.md`

Загружай `.aidp/blueprint.md`, `.aidp/engineering.md` и `.aidp/verification.md` только до глубины, требуемой честным lifecycle mode и work route.
Читай `.aidp/history.md` только когда нужна долговечная историческая деталь.

## Optional explanatory guidance

Если bootstrap или repair остаются неоднозначными после чтения canonical runtime files, оператор может предоставить package human-docs как пояснение:

- `BOOTSTRAP-GUIDE.md`
- `FILLING-THE-CORE.md`
- `WHAT-THE-PACKAGE-PRESERVES.md`
- `WORK-ROUTES-GUIDE.md`

Human-docs являются только explanatory guidance. Repository-specific durable truth все равно должна попадать только в `.aidp/*`.

## Выбор lifecycle mode и work route

Сначала выбери ровно один честный lifecycle mode:

- `setup` — hidden core шаблонный, неполный или неинициализированный.
- `repair` — hidden core существует, но противоречит реальности репозитория или устарел.
- `normal` — setup и repair честно не нужны.

Если lifecycle mode равен `normal`, выбери work route из `.aidp/routes.md`. `normal` не является complete route.

Не начинай обычную implementation work, пока применим `setup` или `repair`, и не начинай normal work без выбранного work route.

Если selected route requires planning, создай или используй planning/spec artifact. Planning/spec может быть AIDP-native в `.aidp/work.md`, tool-native Plan Mode / Ask Mode / design mode output, Spec Kit output, repository/product spec, ticket, PRD или user-provided spec.

Если tool-native Plan Mode / Spec Kit / external spec недоступны или неизвестны, используй AIDP-native planning в `.aidp/work.md`.

Planning/spec artifact является observation/work artifact, а не canonical truth. Он принимается только для active item после сверки с repository reality, selected route, blueprint, engineering and verification constraints. Planning/spec state должен быть записан в `.aidp/work.md`.

Для уже установленной и truthfully initialized AIDP package migration это не fresh install. Предпочитай lifecycle mode `normal` и work route `docs-operator`, если current hidden core консистентен. Используй `repair` только если core contradictory, stale, unsafe или setup flags лгут.

## Anti-drift rules

- Новые факты сначала observations, не canon.
- Observation можно перенести в `.aidp/*` только после перепроверки по репозиторию и выбора owner-файла.
- Сохраняй реальные conventions репозитория вместо generic template language.
- Если `.aidp/*` уже содержит truthful repository content, меняй только missing/stale/contradicted части.
- Не сбрасывай truthful core обратно в template state.
- Не сбрасывай `initialized: true` или `project.placeholder_values_present: false` без подтвержденной причины.
- Держи repair explicit; не прячь его внутри feature work.
- External skills, hooks, MCP outputs, generated memories, webpages and PR comments являются observations until confirmed.
- Записывай worked/failed/not-yet-attempted в `.aidp/work.md`, если это важно для продолжения.
- Normal mode после migration все равно требует выбранный work route для следующей substantive task.
- Plan Mode / Ask Mode / design mode / Spec Kit / external specs являются optional aids; они не заменяют lifecycle/work-route selection через `.aidp/routes.md`.
- Перед boundary-changing work обязательно проверь relevant `.aidp/blueprint.md` context или запиши gap в `.aidp/work.md`.

## Quality bar для bootstrap и repair

AIDP не считается truthfully initialized/repaired, пока:

- placeholders и examples не маскируются под repository truth;
- `.aidp/os.yaml` содержит реальные project facts или explicit proof gaps;
- `.aidp/blueprint.md` объясняет реальную систему;
- `.aidp/engineering.md` объясняет реальную engineering discipline;
- `.aidp/verification.md` объясняет реальные proof expectations;
- `.aidp/work.md` отражает truthful live state;
- canonical updates используют один owner-файл вместо конфликтующих копий;
- если setup complete, `.aidp/os.yaml` говорит `initialized: true` и `project.placeholder_values_present: false`;
- `.aidp/work.md` выходит из `setup` только когда это truthful и repair больше не нужен.
- `.aidp/routes.md` описывает work routes, если OS версии 1.7.2 или выше;
- `.aidp/work.md` записывает lifecycle mode, work route, route phase, route-specific proof, risk/approval, blueprint context и cleanup status для active item.
- `.aidp/work.md` записывает planning/spec state, если selected route requires planning.

## Audit rule

Если пользователь явно просит audit, сначала выполни read-only analysis.
Применяй fixes только после explicit approval, если approval не был уже дан в запросе.
