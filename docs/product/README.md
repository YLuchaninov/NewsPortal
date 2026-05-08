# Документация NewsPortal

Этот каталог объясняет NewsPortal человеческим языком: что это за система, как она работает, где ее важные границы и как оператору с ней жить.

Здесь не хранится runtime-память для AI-агентов. Она живет в `.aidp/*`. Документы ниже нужны людям: инженерам, операторам и владельцам продукта.

## С чего начать

- [Architecture Overview](./architecture/architecture-overview.md) — короткая карта системы и главных потоков.
- [Product Blueprint](./architecture/product-blueprint.md) — главное описание продукта, архитектурных принципов и ограничений.
- [Operator Guide](./operator/HOW_TO_USE.md) — повседневная работа в админке.
- [Manual MVP Runbook](./operator/manual-mvp-runbook.md) — как поднять локальный контур и пройти ручную проверку.
- [Local Product Testing](./operator/local-product-testing.md) — какие команды доказывают текущий локальный продуктовый контур.

## Практические справочники

- [Example Bundles](./operator/examples/EXAMPLES.md) — проверенные RSS/template-конфигурации для manual testing.
- [Website Source Examples](./operator/examples/WEBSITE_SOURCE_EXAMPLES.md) — проверенные live website-source примеры с ожидаемыми `web_resources`.
- [Website Source Testing](./operator/examples/WEBSITE_SOURCES_TESTING.md) — operator checklist для website lane и `Resources`.
- [Discovery Mode Testing](./operator/examples/DISCOVERY_MODE_TESTING.md) — проверенные discovery сценарии и replay settings.
- [Resilient Discovery Operator Guide](./operator/discovery/resilient-discovery.md) — новая evidence-bounded discovery модель: targets, coverage, provider cards, direct/hidden signals, endpoint actions.
- [MCP Operator Docs](./operator/mcp/README.md) — вход в MCP-документы.
- [MCP Client Setup](./operator/mcp/client-setups.md), [HTTP Smoke](./operator/mcp/http-smoke.md), [MCP Testing](./operator/mcp/testing.md) — проверенные MCP setup/smoke/proof инструкции.
- [Firebase Setup](./operator/setup/firebase_setup.md) — настройка Firebase для локального admin/web входа.
- [Data Script Assets](./data-scripts/README.md) — JSON/assets для ручного импорта и экспериментов.

## Как читать эти документы

- Если нужно понять систему целиком, читайте `architecture`.
- Если нужно выполнить работу руками, читайте `operator`.
- Если нужен готовый пример данных, смотрите `operator/examples` и `data-scripts`.
- Если документ начинает повторять код построчно, это ошибка: в `docs/` должна оставаться суть, а не копия реализации.

## Правило правды

Код, миграции, package scripts и `.aidp/*` проверяются раньше документации. Если текст спорит с системой, текст надо исправить.
