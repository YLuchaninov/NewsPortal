# Контракты подсистем

Этот каталог хранит deep contract docs для подсистем, которые слишком сложны для compact runtime core.

Используй его, когда subsystem имеет:

- сложный внешний interface;
- сложный data или migration model;
- сложный packaging/deployment/runtime contract;
- stateful test-access, fixture и cleanup model;
- shared contract, к которому будут часто возвращаться разные work items.

## Как использовать contract docs

- Contract doc становится обязательным контекстом только тогда, когда active work touches соответствующую subsystem.
- Contract doc не заменяет `docs/blueprint.md`, `docs/engineering.md` или `docs/verification.md`; он дополняет их на более глубоком уровне.
- Если subsystem truth меняется durable образом, обновляй contract doc вместе с остальными truth layers.
- Если временный deep design doc переживает один stage/capability arc, его durable meaning должен быть перенесен либо в `docs/history.md`, либо в стабильный contract doc.

## Naming guidance

- Один файл на одну подсистему или один governed interface.
- Предпочитай явные имена вроде `auth-contract.md`, `billing-api-contract.md`, `desktop-launch-contract.md`.
- Шаблон нужен только как стартовая точка; он не должен подменять repo-specific truth.

## Текущие contract docs

- `docs/contracts/test-access-and-fixtures.md`
  Repo-specific contract для stateful backend test access, fixture creation, persistent artifact tracking и cleanup discipline.
- `docs/contracts/universal-task-engine.md`
  Durable contract для staged Universal Task Engine migration: sequence data model, `q.sequence`, executor/plugin boundaries, trigger routing shape, cutover discipline и minimum proof before the new engine becomes default runtime.
- `docs/contracts/SUBSYSTEM-CONTRACT-TEMPLATE.md`
  Reusable template для новых deep contract docs, когда compact core уже недостаточен.
