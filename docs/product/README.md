# Документация SignalOps

Этот каталог объясняет SignalOps человеческим языком: что это за система, как она работает, где ее важные границы и как оператору с ней жить.

Здесь не хранится runtime-память для AI-агентов. Она живет в `.aidp/*`. Документы ниже нужны людям: инженерам, операторам и владельцам продукта.

## С чего начать

- [Architecture Overview](./architecture/architecture-overview.md) — короткая карта системы и главных потоков.
- [Product Blueprint](./architecture/product-blueprint.md) — главное описание продукта, архитектурных принципов и ограничений.
- [Repository Taxonomy](./architecture/repository-taxonomy.md) — где живут source, tests, proof harnesses, infra scripts, fixtures and generated artifacts.
- [Public Beta Readiness](./beta-readiness.md) — beta contract: provider matrix, canonical gates, single-host compose/nginx, prod env and ops.
- [Nonstandard Technical Decisions](./architecture/nonstandard-technical-decisions.md) — ключевые нестандартные решения, tradeoffs и внешние аналоги.
- [Operator Guide](./operator/HOW_TO_USE.md) — повседневная работа в админке.
- [Hidden-Signal Selection Reference](./operator/hidden-signal-selection.md) — три типа сигналов, hard-gate safety, candidateSignals и replay proof.
- [Manual MVP Runbook](./operator/manual-mvp-runbook.md) — как поднять локальный контур и пройти ручную проверку.
- [Local Product Testing](./operator/local-product-testing.md) — какие команды доказывают текущий локальный продуктовый контур.
- [Documentation Inventory](../documentation-inventory.md) — карта docs и их статус после Discovery vNext/plugin sync.

## Практические справочники

- [Hidden-Signal Selection](./operator/hidden-signal-selection.md) — operator reference для `explicit_marker`, `hidden_intent`, `mixed` и proof loops.
- [Website Source Testing](./operator/examples/WEBSITE_SOURCES_TESTING.md) — operator checklist для website lane и `Resources`.
- [Discovery vNext Blueprint](../discovery_vnext_blueprint.md) — active source specification for vNext-only discovery.
- [MCP Operator Docs](./operator/mcp/README.md) — вход в MCP-документы.
- [MCP Client Setup](./operator/mcp/client-setups.md), [HTTP Smoke](./operator/mcp/http-smoke.md), [MCP Testing](./operator/mcp/testing.md) — проверенные MCP setup/smoke/proof инструкции.
- [Firebase Setup](./operator/setup/firebase_setup.md) — настройка Firebase для локального admin/web входа.
- [Old Operator Examples](./operator/old_examples/README.md) — historical example-only reference; not active operator instructions.

## Как читать эти документы

- Если нужно понять систему целиком, читайте `architecture`.
- Если нужно выполнить работу руками, читайте `operator`.
- Если нужен готовый fixture для ручного импорта, смотрите `data-scripts`, но не используйте его как acceptance path.
- Если нужен старый пример для сравнения, смотрите `operator/old_examples`, но не применяйте его как acceptance path.
- Если документ начинает повторять код построчно, это ошибка: в `docs/` должна оставаться суть, а не копия реализации.

## Правило правды

Код, миграции, package scripts и `.aidp/*` проверяются раньше документации. Если текст спорит с системой, текст надо исправить.
