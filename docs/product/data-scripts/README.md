# Data Script Assets

Этот каталог хранит JSON и companion notes для ручного импорта, локальных экспериментов и демонстрационных сценариев.

Это не global config системы. Runtime-данные живут в PostgreSQL, а operator меняет их через admin/control-plane surfaces.

## Файлы

- `it_news.json` — пример RSS-каналов для IT/news domain.
- `outsource.json` — широкий source bundle для outsourcing-oriented corpus.
- `outsource_cleaned_balanced_tenders_and_company_signals.json` — более узкий bundle для tenders/company-signal monitoring.
- `web.bulk-import.json` — website-only bulk import bundle, все rows имеют `providerType: "website"`.
- `web.json` — website reference bundle.
- `outsource_balanced_templates.json` — stale/reference-only values for templates and interests; use it for manual comparison, not as a competing source of truth.

## Channel rows

Channel import rows должны явно указывать `providerType`. Importer не должен угадывать provider mode по экрану или имени файла.

Минимальные поля:

- `name`
- `providerType`
- `fetchUrl`
- `language`
- `pollIntervalSeconds`
- `adaptiveEnabled`
- `maxPollIntervalSeconds`
- `maxItemsPerPoll`
- `isActive`

Optional overrides:

- `requestTimeoutMs`
- `userAgent`
- `preferContentEncoded`

Если optional override отсутствует, это не ошибка: runtime/admin path использует свои defaults.

## Provider types

Для текущей модели допустимы:

- `rss`
- `website`
- `api`
- `email_imap`
- `youtube` как declared provider value без полного operator runtime baseline

Atom feeds импортируются как `rss`. Различие RSS/Atom принадлежит adapter layer, а не `providerType`.

## Template rows

`outsource_balanced_templates.json` может содержать:

- `interest_templates`
- `llm_templates`

Он полезен как reference для ручной настройки, но не является machine-owned runtime config.

Если значения из этого JSON расходятся с Example C в `docs/product/operator/examples/EXAMPLES.md`, live MCP/admin read-back или `operator.funnel.audit`, JSON считается устаревшим reference evidence. Не применяйте его напрямую поверх live config без MCP calibration/read-back.

Человеческое описание outsourcing scenario теперь живет в [Example Bundles](../operator/examples/EXAMPLES.md), чтобы не держать отдельную companion note рядом с asset-файлами.

## Проверка

Для этого каталога достаточно:

- parse-check всех JSON;
- проверка provider types;
- проверка, что assets не объявлены единственным местом runtime-правды.
