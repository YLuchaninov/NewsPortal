# Local Product Testing

Этот документ отвечает на один вопрос: какие команды доказывают, что локальный product contour жив.

## Release verification

```sh
pnpm release:verify
```

Это полный локальный release-ready gate без deployment: compliance, lint/typecheck/unit, builds, production compose image build, image size/content checks, supply-chain inventory artifact and product-local core/full/cleanup.

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

Используйте full contour перед крупным handoff или когда менялась область discovery/website/MCP/operator runtime.

## Mega Flow для Examples A/B/C

```sh
pnpm test:product:mega-flow:compose
```

Это live-pass gate для трех продуктовых доменов из Examples A/B/C:

- Example A: job board / hiring discovery;
- Example B: developer news discovery;
- Example C: outsourcing / procurement discovery.

Команда пишет `/tmp/newsportal-product-mega-flow-<runId>.json|md`. После Discovery vNext cutover она проверяет только текущие product/runtime/provider/read-surface gates; отдельный live-yield proof для старой discovery модели удален.

## Total Live Product Audit

```sh
pnpm test:product:total-live:compose
```

Это самый широкий local/live audit layer. Он запускает strict A/B/C mega-flow как hard gate, затем расширяет proof на website/admin, automation admin, relay phases, worker smokes, browser UI audit, MCP and live diagnostic lanes.

Команда пишет `/tmp/newsportal-product-total-live-<runId>.json|md`. Возможные итоговые состояния:

- `pass`: strict A/B/C mega-flow, required core/runtime/provider/surface lanes and deterministic provider fixtures passed;
- `weak`: required lanes passed, but live-internet diagnostic lanes have classified residuals;
- `fail`: preflight, compose, strict A/B/C selection, provider fixtures, required runtime/surface lanes or unclassified diagnostics failed.

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
pnpm integration_tests
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
