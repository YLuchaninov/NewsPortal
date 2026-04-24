# Product Documentation Index

Этот каталог хранит каноническую документацию разрабатываемой системы NewsPortal.

## По аудитории

- [Operator Guide](./operator/HOW_TO_USE.md)
  Повседневная работа в админке, источники, правила, статьи, кластеры и обслуживание.
- [Manual MVP Runbook](./operator/manual-mvp-runbook.md)
  Полный локальный walkthrough с bootstrap, проверками, cleanup и optional delivery/discovery lanes.
- [Example Bundles](./operator/examples/EXAMPLES.md)
  Готовые RSS/template-конфигурации для типовых продуктовых сценариев.
- [Discovery Testing Handbook](./operator/examples/DISCOVERY_MODE_TESTING.md)
  Bounded operator guide для discovery runtime, graph-first missions и independent recall.
- [Website Source Examples](./operator/examples/WEBSITE_SOURCE_EXAMPLES.md)
  Live website-source кейсы и ожидания по `/admin/resources`.
- [Website Source Testing](./operator/examples/WEBSITE_SOURCES_TESTING.md)
  Пошаговый operator checklist для website lane.
- [MCP Operator Docs](./operator/mcp/README.md)
  Подключение клиентов, HTTP smoke и локально-удаленное testing guidance.
- [Firebase Setup](./operator/setup/firebase_setup.md)
  Product-side bootstrap для локальной admin/web auth настройки.

## По типу документа

- [Product Blueprint](./architecture/product-blueprint.md)
  Канонический полный architecture/reference документ для самого продукта.
- [Architecture Overview](./architecture/architecture-overview.md)
  Быстрый high-level обзор текущей архитектуры.
- [Architecture Migration Notes](./architecture/NEW_ARCHITECTURE.md)
  Lessons learned и эволюция архитектурного подхода.
- [Candidate Recall Plan](./architecture/generic-candidate-recall-plan.md)
  Product-side strategy document для noisy-field candidate recall.
- [Website Ingestion Audit](./audits/website-ingestion-scraping-audit-2026-04-15.md)
  Подтвержденный продуктовый аудит website lane.
- [Data Script Assets](./data-scripts/README.md)
  Importable bundles, reference assets и companion docs для manual setup.

## Canonical Rule

- Канонические product-doc пути теперь живут только под `docs/product/**`.
- Канонический полный product blueprint живет в `docs/product/architecture/product-blueprint.md`.
- `.aidp/blueprint.md` остается только runtime-facing shell для agent/runtime core.
- В корне репозитория product-stub файлы больше не поддерживаются: root product entrypoint остается только `README.md`.
- Compatibility stubs сохранены только на legacy Markdown путях внутри `docs/`, где это помогает мягкой миграции.
