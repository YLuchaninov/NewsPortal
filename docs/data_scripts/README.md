# Data Script Assets

Этот каталог хранит importable example assets и operator-facing reference bundles для ручного импорта, локальных экспериментов и объяснения текущих corpus/template наборов.

## Что находится в каталоге

- [`it_news.json`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/it_news.json)
  Пример набора RSS-каналов по IT/news domain.
- [`outsource.json`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/outsource.json)
  Большой source bundle для outsourcing-oriented corpus discovery/import.
- [`outsource_cleaned_balanced_tenders_and_company_signals.json`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/outsource_cleaned_balanced_tenders_and_company_signals.json)
  Более узкий и очищенный source bundle для tenders/company-signal monitoring.
- [`web.bulk-import.json`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/web.bulk-import.json)
  Derived website-only shared bulk-import bundle with explicit `providerType: "website"` on every row.
- [`outsource_balanced_templates.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/outsource_balanced_templates.md)
  Focused outsourcing-only companion к Example C в [`EXAMPLES.md`](/Users/user/Documents/workspace/my/NewsPortal/EXAMPLES.md), если нужен короткий one-scenario cheat sheet без остальных built-in examples.
- [`outsource_balanced_templates.json`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/outsource_balanced_templates.json)
  Legacy/reference asset для ручного сравнения или переноса значений в админку. Не используется кодом как runtime truth и не заменяет Example C в [`EXAMPLES.md`](/Users/user/Documents/workspace/my/NewsPortal/EXAMPLES.md).

## Важное различие

Для built-in example bundles primary human-facing source теперь должен быть [`EXAMPLES.md`](/Users/user/Documents/workspace/my/NewsPortal/EXAMPLES.md). Файлы в этом каталоге помогают узкому use case или ручному переносу, но не должны переопределять тот walkthrough.

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

Файлы [`it_news.json`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/it_news.json), [`outsource.json`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/outsource.json), [`outsource_cleaned_balanced_tenders_and_company_signals.json`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/outsource_cleaned_balanced_tenders_and_company_signals.json) и [`web.bulk-import.json`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/web.bulk-import.json) содержат массивы channel-import rows.

Shared admin bulk import now requires row-level `providerType` on every JSON row. The importer no longer infers provider mode from the screen or from a top-level bulk setting, so example bundles in this directory should keep `providerType` explicit even when every row belongs to the same provider family.

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

[`outsource_balanced_templates.json`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/outsource_balanced_templates.json) может содержать:

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
- `selection_profile_policy`
- `candidate_positive_signals`
- `candidate_negative_signals`

`llm_templates` сейчас описывают rows с полями:

- `template_name`
- `scope`
- `prompt_template`

Важно:

- этот JSON больше не должен считаться каноническим runtime bundle;
- operational/remediation code не должен читать его по умолчанию;
- для live runtime operator должен опираться на admin UI и БД, а Markdown handbook — использовать как human guidance.
- новые `selection_profile_policy` и `candidate_*_signals` в этом JSON являются reference-example слоем, чтобы оператор мог не потерять текущие настройки при ручном переносе в админку.

## Проверка в рамках текущего sweep

Во время текущего прохода было проверено:

- все `docs/data_scripts/*.json` синтаксически валидны;
- channel bundles не содержат provider types вне текущего durable contract после исправления legacy `atom` rows;
- частично отсутствующие `requestTimeoutMs` / `userAgent` / `preferContentEncoded` являются допустимыми optional overrides, а не поврежденными rows;
- legacy template JSON остается syntactically valid reference asset, но не рассматривается как machine-owned runtime truth.
