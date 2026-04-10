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

- `docs/contracts/browser-assisted-websites.md`
  Durable contract для JS-heavy / soft anti-bot website handling: fetchers-owned browser runtime, internal discovery probe, browser provenance, unsupported challenge policy и deterministic local hard-site proof.
- `docs/contracts/content-model.md`
  Durable contract для публичной universal-content модели: `content_item`, `content_kind`, `system interest`, `user interest`, `system-selected collection`, and the rule that editorial/article is one subtype rather than the product-wide default.
- `docs/contracts/discovery-agent.md`
  Durable contract для adaptive discovery cutover: graph-first mission model, hypothesis-class registry, source profiling/scoring, portfolio snapshots, feedback loop, re-evaluation и proof contour under `/maintenance/discovery/*`.
- `docs/contracts/independent-recall-discovery.md`
  Durable contract для additive independent-recall discovery cutover: generic source-quality snapshots, neutral recall-first acquisition, promotion boundaries and compatibility rules with the existing graph-first mission flow.
- `docs/contracts/feed-ingress-adapters.md`
  Durable contract для aggregator-aware RSS/Atom intake: internal adapter strategies, Reddit/HN/Google normalization, pre-ingest stale gating, adapter provenance и operator/API visibility without new provider types.
- `docs/contracts/zero-shot-interest-filtering.md`
  Durable cutover contract для перехода к full-flow zero-shot filtering architecture: raw observations, canonical documents, duplicate/story clustering, verification state, semantic interest filtering, final selection truth и doc-sync/cutover discipline.
- `docs/contracts/test-access-and-fixtures.md`
  Repo-specific contract для stateful backend test access, fixture creation, persistent artifact tracking и cleanup discipline.
- `docs/contracts/universal-task-engine.md`
  Durable contract для staged Universal Task Engine migration: sequence data model, `q.sequence`, executor/plugin boundaries, trigger routing shape, cutover discipline и minimum proof before the new engine becomes default runtime.
- `docs/contracts/SUBSYSTEM-CONTRACT-TEMPLATE.md`
  Reusable template для новых deep contract docs, когда compact core уже недостаточен.
