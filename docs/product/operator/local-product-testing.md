# Local Product Testing

Этот документ отвечает на один вопрос: какие команды доказывают, что локальный product contour жив.

## Release verification

```sh
pnpm release:verify
```

Это полный локальный release-ready gate без deployment: compliance, lint/typecheck/unit, builds, production compose image build, image size/content checks, supply-chain inventory artifact and product-local core/full/cleanup.

## Public Beta verification

```sh
pnpm release:beta:verify
```

Это canonical Public Beta gate. Он требует реальный `.env.prod`, проверяет prod env, beta nginx/compose route exposure, control-plane ownership, compliance/static/unit/build/image checks и пишет product beta readiness proof через `pnpm test:product:beta-readiness`.

Если `.env.prod` отсутствует или содержит placeholders, этот gate должен падать.

## Быстрый контур

```sh
pnpm test:product:local:core
```

Он покрывает обычный локальный продуктовый путь без внешних live credentials. RSS, website, API source и Email IMAP ingest проверяются детерминированными fixtures; Telegram и YouTube остаются вне локального product contour.

Ожидаемые части:

- lint/typecheck/unit;
- compose startup;
- RSS ingest;
- API source ingest;
- Email IMAP ingest;
- website ingest/admin flow;
- automation admin flow;
- MCP compose;
- web viewport/UI audit where included by harness.

## Полный локальный контур

```sh
pnpm test:product:local:full
```

Он добавляет discovery/live-provider evidence там, где это явно разрешено env и harness.

`website-matrix-compose` внутри full contour является `live-diagnostic`: classified external blocks, unsupported challenges and partial/empty public-site shapes produce `weak_with_classified_residual`, not a beta hard failure. To make those live-internet residuals fail the local product gate, run with `SIGNALOPS_STRICT_LIVE_INTERNET=1`.

Используйте full contour перед крупным handoff или когда менялась область discovery/website/MCP/operator runtime.

## Product Beta Readiness Proof

```sh
pnpm test:product:beta-readiness
```

Команда пишет `/tmp/signalops-product-beta-readiness-<runId>.json|md` с `kind=signalops-product-beta-readiness-proof`. Это продуктовый proof поверх control-plane ownership, beta route exposure, `test:product:local:core` and `test:product:local:full`.

## Total Live Product Audit

```sh
pnpm diagnostic:product:total-live
```

Это diagnostic local/live audit layer. Он проверяет required deterministic/runtime/provider/surface lanes and live diagnostic lanes. Retired legacy proof scripts are outside this audit model.

Команда пишет `/tmp/signalops-product-total-live-<runId>.json|md`. Возможные итоговые состояния:

- `pass`: required core/runtime/provider/surface lanes and deterministic provider fixtures passed;
- `weak`: required lanes passed, but live-internet diagnostic lanes have classified residuals;
- `fail`: preflight, compose, provider fixtures, required runtime/surface lanes or unclassified diagnostics failed.

API and Email IMAP сейчас честно fixture-backed: `test:providers:compose` обязателен, а external live API/IMAP помечаются как `not_applicable_with_reason` / `no_real_external_target_available`, пока нет реальных внешних test targets.

## Cleanup

```sh
pnpm test:product:local:cleanup
```

Cleanup нужен, если proof создал persistent local artifacts: users, channels, discovery profiles/candidates, MCP tokens, Mailpit deliveries or imported datasets.

## Команды по зонам

Static:

```sh
pnpm lint
pnpm typecheck
pnpm unit_tests
```

Acceptance:

```sh
pnpm test:mvp:internal
pnpm test:product:beta-readiness
```

Website:

```sh
pnpm test:website:compose
pnpm test:website:admin:compose
pnpm test:hard-sites:compose
```

Providers:

```sh
pnpm test:providers:compose
pnpm test:channel-auth:compose
```

Discovery:

```sh
pnpm test:discovery-enabled:compose
pnpm test:mcp:http:discovery
pnpm test:discovery:vnext-flow
```

Optional live-provider Discovery vNext checks are separate and gated by explicit env, credentials and positive budget: `pnpm test:discovery:vnext-mcp-live-gap-flow:*` and `pnpm test:discovery:vnext-mcp-live-signal-flow:*`.

Beta/security:

```sh
pnpm check:control-plane-ownership
pnpm check:beta-route-exposure
pnpm check:prod-env
```

MCP:

```sh
pnpm test:mcp:compose
pnpm test:mcp:http:auth
pnpm test:mcp:http:reads
pnpm test:mcp:http:writes
pnpm test:mcp:http:discovery
```

## Когда runtime-тесты не нужны

Если меняются только human-facing docs and non-runtime JSON assets, достаточно:

- локальные Markdown links;
- JSON parse validation;
- command parity against `package.json`;
- `git diff --check --`.

Такой sweep не меняет продуктовое поведение.
