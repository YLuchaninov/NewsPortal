# AGENTS.md

Если в репозитории есть `.aidp/`, AIDP активен.

<!-- aidp-router:start -->
Этот файл является только тонким router-файлом для инструментов. Каноническая runtime-истина живет только в `.aidp/*`; не дублируй здесь архитектуру, команды, рабочее состояние или исторические решения.

Перед обычной работой:
1. Прочитай `.aidp/AGENTS.md`.
2. Прочитай `.aidp/os.yaml`.
3. Прочитай `.aidp/work.md`.
4. Прочитай `.aidp/routes.md`.
5. Выбери честный lifecycle mode: `setup`, `repair` или `normal`.
6. Если lifecycle mode = `normal`, выбери work route из `.aidp/routes.md`.
7. После выбора lifecycle mode и work route следуй более глубокому порядку чтения из `.aidp/AGENTS.md`.

Используй `setup`, если скрытое ядро еще шаблонное, неполное или не инициализировано.
Используй `repair`, если скрытое ядро есть, но противоречит реальности репозитория.
Используй `normal` только когда setup и repair честно не нужны.

Lifecycle mode недостаточен для выполнения задачи. `normal` не является work route.
Правильная модель: lifecycle mode -> work route -> planning/specification if required -> route sequence -> route proof -> sync.

Plan Mode, Ask Mode, design mode, Spec Kit и external specs являются optional aids. Они не заменяют AIDP route selection. Если selected route requires planning и tool-native/external planner unavailable, используй AIDP-native planning в `.aidp/work.md`.

Наблюдения не становятся канонической истиной, пока они не перепроверены по репозиторию и не записаны в правильный owner-файл под `.aidp/*`.
Durable truth нельзя хранить в этом router-файле.
Если явно запрошен аудит, сначала выполняй read-only анализ и применяй исправления только после явного разрешения.

Monitor-readable blocks, dashboard state, derived warnings and consolidation pressure are projections/recommendations, not canon and not proof. Do not place monitor blocks in this router.

Перед product/source/config/test writes `.aidp/work.md` must already contain a matching active item; a verbal promise is not enough.

Document Intake / Requirement Intake is a `docs-operator` subprocedure, not a route. Memory consolidation review is an `audit` subprocedure, not a route.
<!-- aidp-router:end -->
