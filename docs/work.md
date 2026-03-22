# Work

Это live execution document для репозитория.

Используй его для:

- short current memory;
- capability planning и stage breakdown;
- active work registry;
- active risks и known gaps;
- next recommended action;
- handoff state.

Не используй его как длинный журнал истории. Durable completed detail переносится в `docs/history.md`.

## Current mode

- Operating mode: normal
- Why now: request-driven full process-proof audit завершен; runtime core и documented proof paths повторно подтверждены на текущем repo state, активной implementation work сейчас нет.

## Current memory

- `docs/blueprint.md` остается главным architectural source of truth для schema, queues, boundaries и service responsibilities.
- Canonical internal/dev baseline зафиксирован как `pnpm dev:mvp:internal`, который запускает `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml ...`.
- Canonical root-level QA gates теперь существуют как `pnpm lint`, `pnpm unit_tests` и `pnpm integration_tests`.
- `pnpm integration_tests` является thin alias на `pnpm test:mvp:internal`; он остается full internal acceptance proof, но не расширяет acceptance truth beyond RSS-first ingest.
- RSS-first proof теперь состоит не только из single-channel smoke: добавлены `pnpm test:ingest:multi:compose` для 24 synthetic feeds и `pnpm test:ingest:soak:compose` для 60-feed soak на admin->ingest->workers path.
- Fetchers baseline для multi-RSS operation теперь явно использует enlarged `FETCHERS_BATCH_SIZE=100` и bounded `FETCHERS_CONCURRENCY=4`.
- `pnpm lint` объединяет ESLint для TS/Astro/infra scripts и Ruff для Python services; для Python части нужен отдельный host-side `ruff` из `infra/docker/python.dev-requirements.txt`.
- `pnpm unit_tests` теперь покрывает не только happy paths, но и additional RSS helper edge cases, queue classifier contracts, compiler defaults/error branches и threshold edge cases в scoring helpers.
- Acceptance scope по-прежнему RSS-first; `website`, `api` и `email_imap` ingest остаются вне internal MVP gate и требуют отдельного proof.
- Full process-proof audit от 2026-03-22 завершен как read-only pass без remediation: authority chain, command truth, repo-wide baseline и heavy compose-backed proofs совпали с текущим repo state.
- По итогам аудита не обнаружено новых `process docs stale`, `repo drift`, `environment blocker` или `proof failure` finding-ов; актуальными остаются только уже задокументированные proof/product gaps.

## Capability planning

### Active capabilities

- none

### Archived capabilities

| Capability ID | Title | Status | Full completion condition | Final proof | Notes |
|---|---|---|---|---|---|
| C-PROCESS-PROOF-AUDIT | Full process-proof audit | archived | Runtime/process docs, command surface, repo-wide proof baseline и heavy compose-backed RSS-first acceptance повторно подтверждены against current repo state; каждый drift/fail должен был быть явно классифицирован, но новых findings не выявлено | `pnpm check:scaffold`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm unit_tests`, `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml config --services`, `pnpm dev:mvp:internal`, `pnpm integration_tests`, `pnpm test:ingest:multi:compose`, `pnpm test:ingest:soak:compose`, command-truth review passed on 2026-03-22 | Audit завершен read-only; durable detail перенесен в `docs/history.md`. |
| C-MULTI-RSS-FLOW | Multi-RSS full flow hardening | archived | RSS-first path `admin -> source_channels -> fetchers -> relay -> workers` стабилен и доказан для 50-100 synthetic feeds; scheduler изолирует channel-level failures; admin surface умеет single + bulk RSS management; layered proof включает unit, medium multi-channel integration и отдельный heavy soak | `pnpm unit_tests`, `pnpm typecheck`, `pnpm lint:ts`, `pnpm test:ingest:multi:compose`, `pnpm test:ingest:soak:compose`, `git diff --check` passed on 2026-03-22 | Durable detail перенесен в `docs/history.md`. |
| C-ROOT-QA-GATES | Root-level QA gates | archived | Repo имеет канонические root-level `pnpm lint`, `pnpm unit_tests`, `pnpm integration_tests`; первые два запускают реальные TS/Astro + Python checks без DB/Redis/Docker, третий делегирует full internal acceptance на `pnpm test:mvp:internal`; runtime core и README синхронизированы с новым proof contract | `pnpm lint`, `pnpm unit_tests`, `pnpm integration_tests`, `git diff --check` passed on 2026-03-22 | Durable detail перенесен в `docs/history.md`. |
| C-MVP-READY | Internal MVP readiness | archived | `pnpm build` проходит; canonical `compose.yml + compose.dev.yml` path задокументирован и исполним; admin bootstrap не требует ручного SQL; есть один live delivery proof через локальный SMTP sink; repo-level `pnpm test:mvp:internal` проходит | `pnpm build`, `pnpm test:mvp:internal` и supporting proofs passed on 2026-03-22 | Durable detail перенесен в `docs/history.md`. |

## Active execution state

### Primary active item

- ID: none
- Why this is the primary active work: активных implementation items нет; следующий запрос должен стартовать с нового truthful work item.

### Secondary active item

- ID: none
- Why it exists: `multi_agent_allowed: false`; параллельный active item отсутствует.

### Active risks

- Risk 1: `website`, `api` и `email_imap` ingest все еще не покрыты единым acceptance gate, поэтому их нельзя считать readiness-proof по аналогии с RSS-first path.
- Risk 2: `pnpm lint` для Python части зависит от отдельной host-side установки `ruff`, поэтому zero-setup ожидание от одного `pnpm install` по-прежнему неверно.
- Risk 3: `pnpm integration_tests`, `pnpm test:ingest:multi:compose` и `pnpm test:ingest:soak:compose` зависят от валидных `FIREBASE_*`, корректного `ADMIN_ALLOWLIST_EMAILS`, loopback fixture networking и Docker Compose access.

### Known gaps

- Proof gap: Python services по-прежнему не имеют repo-level typecheck gate, сопоставимого с `pnpm typecheck`.
- Proof gap: `pnpm unit_tests` сейчас покрывает только deterministic pure logic; DB/Redis/queue/network boundaries по-прежнему доказываются integration/smoke path.
- Product gap: `website`, `api` и `email_imap` ingest остаются вне доказанного internal MVP scope.
- Proof gap: multi-channel RSS proofs сейчас compose-backed и не имеют отдельного lightweight host-only variant without Docker/Firebase.
- Audit note: full process-proof audit на текущем tree не выявил новых drift/failure findings сверх уже перечисленных gaps.

### Next recommended action

- Next step: none
- Why this is next: full process-proof audit завершен без новых findings; следующая работа должна оформляться отдельным item в зависимости от нового user goal.

### Handoff state

- Current item status: активных work items нет; capability `C-PROCESS-PROOF-AUDIT` завершена и архивирована.
- What is already proven: authority chain и runtime core выглядят initialized; top-level structure, entrypoints и command surface сходятся с `AGENTS.md`, `docs/verification.md`, `.aidp/os.yaml`, `README.md` и `package.json`; `pnpm check:scaffold`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm unit_tests`, `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml config --services`, `pnpm dev:mvp:internal`, `pnpm integration_tests`, `pnpm test:ingest:multi:compose` и `pnpm test:ingest:soak:compose` проходят на текущем tree.
- What is still unproven or blocked: отдельного end-to-end acceptance proof для `website`, `api` и `email_imap` ingest по-прежнему нет; root-level Python typecheck gate отсутствует; multi-channel RSS proof по-прежнему зависит от Docker/Firebase path.
- Scope or coordination warning for the next agent: audit завершен read-only и не нашел новых drift/failure findings; не переоткрывай его, если пользователь не просит новый verification pass или remediation item.

### Recently changed

- 2026-03-22 — завершен capability `C-PROCESS-PROOF-AUDIT`: full read-only audit подтвердил authority chain, command truth, repo-wide proof baseline и heavy compose-backed RSS-first acceptance без новых findings.
- 2026-03-22 — завершена capability `C-MULTI-RSS-FLOW`: fetcher scheduler получил bounded concurrency + all-settled isolation, admin RSS surface расширен до single/bulk management, добавлены multi-channel compose proofs на 24 и 60 feeds.
- 2026-03-22 — добавлены `pnpm test:ingest:multi:compose` и `pnpm test:ingest:soak:compose` на базе `infra/scripts/test-rss-multi-flow.mjs`.
- 2026-03-22 — fetchers baseline обновлен до `FETCHERS_BATCH_SIZE=100` и `FETCHERS_CONCURRENCY=4` для realistic multi-RSS polling.
- 2026-03-22 — root `unit_tests` расширен edge-case coverage для RSS helpers, queue classifiers, compiler defaults/error branches и scoring thresholds.
- 2026-03-22 — добавлены canonical root-level gates `pnpm lint`, `pnpm unit_tests` и `pnpm integration_tests`.
- 2026-03-22 — добавлены root ESLint/Ruff config и deterministic unit suites для TS RSS/queue helpers и Python embedding/compiler/scoring helpers.
- 2026-03-22 — `pnpm integration_tests` зафиксирован как thin alias на `pnpm test:mvp:internal`; acceptance scope сознательно оставлен RSS-first.
- 2026-03-22 — `pnpm test:mvp:internal` доведен до green end-to-end proof на canonical compose.dev baseline.
- 2026-03-22 — completed detail по root QA gates, internal MVP readiness и multi-RSS full flow перенесен в `docs/history.md`.

## Active work index

- No active or ready work items.
- Completed archives moved to `docs/history.md`.
