# Data Script Assets

Этот каталог хранит importable example assets и operator-facing reference bundles для ручного импорта, локальных экспериментов и объяснения текущих corpus/template наборов.

## Что находится в каталоге

- [`it_news.json`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/it_news.json)
  Пример набора RSS-каналов по IT/news domain.
- [`outsource.json`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/outsource.json)
  Большой source bundle для outsourcing-oriented corpus discovery/import.
- [`outsource_cleaned_balanced_tenders_and_company_signals.json`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/outsource_cleaned_balanced_tenders_and_company_signals.json)
  Более узкий и очищенный source bundle для tenders/company-signal monitoring.
- [`outsource_balanced_templates.json`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/outsource_balanced_templates.json)
  Canonical import bundle для system-interest templates и LLM templates.
- [`outsource_balanced_templates.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/outsource_balanced_templates.md)
  Объяснение, как устроен balanced outsourcing template bundle.

## Важное различие

Эти JSON-файлы не являются global runtime config системы.

Они используются как:

- import/export assets;
- corpus/bootstrap bundles;
- operator-facing examples;
- reproducible reference inputs для ручной настройки.

Каноническая runtime truth все равно живет в:

- PostgreSQL (`source_channels`, `interest_templates`, `criteria`, `selection_profiles`, и т.д.);
- runtime/process docs;
- migrations и коде.

## Channel bundle schema

Файлы [`it_news.json`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/it_news.json), [`outsource.json`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/outsource.json) и [`outsource_cleaned_balanced_tenders_and_company_signals.json`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/outsource_cleaned_balanced_tenders_and_company_signals.json) содержат массивы channel-import rows.

Обязательный минимум для таких rows:

- `name`
- `providerType`
- `fetchUrl`
- `language`
- `pollIntervalSeconds`
- `adaptiveEnabled`
- `maxPollIntervalSeconds`
- `maxItemsPerPoll`
- `isActive`

Опциональные override-поля:

- `requestTimeoutMs`
- `userAgent`
- `preferContentEncoded`

Если эти override-поля отсутствуют у отдельных rows, это не считается неполной конфигурацией: runtime/admin import path может использовать свои дефолты.

## Provider-type truth

Для shipped runtime operator-ready provider types сейчас truthful являются:

- `rss`
- `website`
- `api`
- `email_imap`
- `youtube` как future-oriented provider type в blueprint/config model

Важно:

- RSS/Atom distinction не должна жить как отдельный `providerType`.
- Atom feeds должны импортироваться через `providerType = "rss"` и при необходимости различаться внутренним parser/adapter behavior.

В рамках этого doc sweep `outsource.json` был синхронизирован с этой truth: legacy rows с `providerType = "atom"` приведены к `providerType = "rss"`.

## Template bundle schema

[`outsource_balanced_templates.json`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/outsource_balanced_templates.json) содержит:

- `interest_templates`
- `llm_templates`

`interest_templates` сейчас описывают template-import rows с полями:

- `name`
- `description`
- `priority`
- `time_window_hours`
- `allowed_content_kinds`
- `must_have_terms`
- `must_not_have_terms`
- `positive_prototypes`
- `negative_prototypes`

`llm_templates` сейчас описывают rows с полями:

- `template_name`
- `scope`
- `prompt_template`

Если будущий import/export contract расширится, этот README нужно синхронизировать вместе с самими JSON assets.

## Проверка в рамках текущего sweep

Во время текущего прохода было проверено:

- все `docs/data_scripts/*.json` синтаксически валидны;
- channel bundles не содержат provider types вне текущего durable contract после исправления legacy `atom` rows;
- частично отсутствующие `requestTimeoutMs` / `userAgent` / `preferContentEncoded` являются допустимыми optional overrides, а не поврежденными rows;
- template bundle содержит ожидаемые верхнеуровневые секции `interest_templates` и `llm_templates`.
