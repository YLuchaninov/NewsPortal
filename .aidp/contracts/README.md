# Контракты подсистем

Этот каталог хранит deep contract docs для подсистем, которым недостаточно compact AIDP core.

Используй contract doc, когда work item касается:

- сложного external/internal interface;
- durable data или migration model;
- runtime/delivery boundary;
- stateful test-access, fixtures или cleanup;
- shared contract, к которому будут возвращаться разные work items.

## Правила

- Contract doc обязателен только для active work, который трогает соответствующую subsystem.
- Contract doc дополняет `.aidp/blueprint.md`, `.aidp/engineering.md` и `.aidp/verification.md`, но не заменяет их.
- Если durable subsystem truth меняется, обновляй contract doc и другие owner-файлы только по их ответственности.
- Не создавай параллельные durable subsystem contracts под `docs/`; product docs may link here when they need runtime truth.

## Текущие AIDP contracts

- `.aidp/contracts/article-pipeline-core.md` — ingest-to-selection ownership, canonical reuse, final-selection truth, compatibility projections and reset/preserve discipline.
- `.aidp/contracts/auth-session-boundary.md` — Firebase web/admin identity, local PostgreSQL roles, cookies, allowlist and nginx `/admin` boundary.
- `.aidp/contracts/browser-assisted-websites.md` — JS-heavy website fallback, fetchers-owned browser runtime, auth header safety, provenance and hard-site proof.
- `.aidp/contracts/content-model.md` — public universal content vocabulary, content items, content kinds, system-selected collection and user-match layering.
- `.aidp/contracts/discovery-agent.md` — graph-first plus bounded recall discovery control plane, policy profiles, source scoring, portfolio, feedback and safe runtime flags.
- `.aidp/contracts/feed-ingress-adapters.md` — aggregator-aware RSS/Atom adapter strategies, max-entry-age gating, canonical URL normalization and provenance.
- `.aidp/contracts/independent-recall-discovery.md` — neutral recall missions/candidates, generic source quality and recall-candidate promotion boundaries.
- `.aidp/contracts/mcp-control-plane.md` — remote admin MCP endpoint, token/scopes, tools/resources/prompts, audit and delivery boundary.
- `.aidp/contracts/notifications-and-digests.md` — web push, Telegram, email digest, channel bindings, preferences, delivery logs, scheduler and Mailpit-local proof.
- `.aidp/contracts/runtime-migrations-and-derived-state.md` — compose/nginx delivery, ordered migrations, `schema_migrations`, HNSW rebuild/check and derived-state rules.
- `.aidp/contracts/test-access-and-fixtures.md` — stateful backend test access, fixture creation, persistent artifact tracking and cleanup discipline.
- `.aidp/contracts/universal-selection-profiles.md` — profile-driven selection semantics, hold vs LLM policy, explainability and replay provenance.
- `.aidp/contracts/universal-task-engine.md` — sequence runtime, `q.sequence`, TaskGraph/plugin lifecycle, relay handoff and automation workspace boundary.
- `.aidp/contracts/zero-shot-interest-filtering.md` — canonical documents, observations, verification, interest filters, final selection and compatibility cutover.
- `.aidp/contracts/SUBSYSTEM-CONTRACT-TEMPLATE.md` — русскоязычный шаблон для новых deep contracts.

## Связь со старыми contract docs

Durable runtime truth из старых `docs/contracts/*` перенесена в `.aidp/contracts/*` 2026-04-24. Старые duplicate docs удалены из `docs/`, чтобы не поддерживать второй источник правды.

Если product doc и `.aidp/contracts/*` расходятся, сначала сверяйся с текущим кодом/миграциями/тестами, затем обновляй правильный owner-файл.
