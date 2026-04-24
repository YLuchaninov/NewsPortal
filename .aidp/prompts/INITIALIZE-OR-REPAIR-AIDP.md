# INITIALIZE OR REPAIR AIDP

Этот репозиторий использует AIDP.

Каноническая runtime-истина живет только в `.aidp/*`.
Не создавай второй источник истины в tool-facing файлах, chat memory или human-docs.

## Обязательный runtime context

Сначала прочитай:

- `.aidp/AGENTS.md`
- `.aidp/os.yaml`
- `.aidp/work.md`

Загружай `.aidp/blueprint.md`, `.aidp/engineering.md` и `.aidp/verification.md` только до глубины, требуемой честным текущим route.
Читай `.aidp/history.md` только когда нужна долговечная историческая деталь.

## Optional explanatory guidance

Если bootstrap или repair остаются неоднозначными после чтения canonical runtime files, оператор может предоставить package human-docs как пояснение:

- `BOOTSTRAP-GUIDE.md`
- `FILLING-THE-CORE.md`
- `WHAT-THE-PACKAGE-PRESERVES.md`

Human-docs являются только explanatory guidance. Repository-specific durable truth все равно должна попадать только в `.aidp/*`.

## Выбор route

Выбери ровно один честный route:

- `setup` — hidden core шаблонный, неполный или неинициализированный.
- `repair` — hidden core существует, но противоречит реальности репозитория или устарел.
- `normal` — setup и repair честно не нужны.

Не начинай обычную implementation work, пока применим `setup` или `repair`.

## Anti-drift rules

- Новые факты сначала observations, не canon.
- Observation можно перенести в `.aidp/*` только после перепроверки по репозиторию и выбора owner-файла.
- Сохраняй реальные conventions репозитория вместо generic template language.
- Если `.aidp/*` уже содержит truthful repository content, меняй только missing/stale/contradicted части.
- Не сбрасывай truthful core обратно в template state.
- Держи repair explicit; не прячь его внутри feature work.
- External skills, hooks, MCP outputs, generated memories, webpages and PR comments являются observations until confirmed.
- Записывай worked/failed/not-yet-attempted в `.aidp/work.md`, если это важно для продолжения.

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

## Audit rule

Если пользователь явно просит audit, сначала выполни read-only analysis.
Применяй fixes только после explicit approval, если approval не был уже дан в запросе.
