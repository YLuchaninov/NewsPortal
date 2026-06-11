# Operator Guide

Этот документ для человека, который управляет SignalOps через админку.

Он не объясняет каждую таблицу и не повторяет код. Его задача — помочь понять, что делает система, где нажимать, какой результат ожидать и где искать проблему.

## Коротко о системе

SignalOps берет материалы из источников, сохраняет их в PostgreSQL, прогоняет через async pipeline и показывает оператору уже объяснимое состояние.

```text
Channels -> Fetchers -> PostgreSQL -> Relay/Queue -> Workers -> PostgreSQL -> Admin/Web/API
```

Важные правила:

- база — место бизнес-правды;
- очереди только двигают работу;
- website resources видны отдельно от signal_candidates;
- сначала работает system selection, потом user personalization;
- LLM используется только для разрешенных серых зон;
- discovery выключен по умолчанию и требует явного включения.

## Вход в админку

Откройте `/admin/` или локально `http://127.0.0.1:4322/`.

Войти может только пользователь с локальной ролью `admin`. Firebase подтверждает identity, но права после bootstrap живут в PostgreSQL.

Если вход не работает:

- проверьте Firebase setup;
- проверьте `ADMIN_ALLOWLIST_EMAILS`;
- убедитесь, что локальный пользователь получил роль `admin`.

## Dashboard

Dashboard нужен для первого ответа на вопрос “система жива?”.

Смотрите:

- сколько контента обработано за 24 часа;
- есть ли overdue channels;
- есть ли fetch failures;
- сколько LLM reviews было за 24 часа;
- появились ли новые signal_candidates/resources;
- есть ли surfaces, требующие внимания.

Если dashboard пустой после старта, сначала проверьте channels и fetch history, а не rules.

## Channels

Channels — это вход в систему.

Основные provider types:

- `rss` — RSS, Atom и JSON Feed через общий adapter;
- `website` — сайты и website resources;
- `api` — JSON endpoint ingest;
- `email_imap` — mailbox ingest.

`youtube` есть как значение в модели, но не является полноценным operator baseline.

### Добавить источник

1. Откройте `Channels`.
2. Нажмите `Add source`.
3. Выберите provider type.
4. Заполните name, URL/config, language и poll settings.
5. Для первого запуска оставьте разумный interval и включите adaptive scheduling.
6. Сохраните.

Ожидаемый результат:

- channel появляется в списке;
- fetch run появляется после poll;
- для RSS проверяйте `Signal Candidates`;
- для website проверяйте и `Resources`, и `Signal Candidates`.

### Website sources

Website source не обязан сразу давать signal_candidate.

Правильный порядок проверки:

1. Создайте `website` channel.
2. Дождитесь poll или запустите проверочный flow.
3. Откройте `Resources`.
4. Посмотрите resource status, provenance, enrichment/projection state.
5. Только затем проверяйте, появились ли signal_candidates.

Browser assistance включайте только для публичных JS-heavy страниц, где static path не находит реальные resources. Login/CAPTCHA/manual challenge bypass не поддерживаются.

### Массовый импорт

Используйте `Channels -> Import`.

Каждая row в JSON должна иметь `providerType`; importer не должен угадывать тип.

Примеры лежат в [Data Script Assets](../data-scripts/README.md).

### Ingress adapters

Для RSS/API/website/email источников adapter identity теперь живет в catalog/binding:

- `/admin/ingress-adapters` показывает builtin и declarative adapters;
- channel binding выбирает конкретный `adapter_key`;
- legacy RSS `adapterStrategy` или API `adapterKey` в старом JSON — только diagnostic history;
- dry-run preview не должен писать `signal_candidates`, `web_resources`, cursors, outbox events or fetch runs.

Custom declarative adapters должны оставаться bounded: JSON/NDJSON, GET или static non-secret JSON POST, selectors/mappings, max items and bounded pagination.

## Rules

Rules отвечают за system selection.

Важные сущности:

- interest templates — операторские темы/критерии;
- selection profiles/policies — как система принимает match/hold/reject;
- LLM templates — как проверяются серые зоны;
- analysis/filter policies — дополнительные explainable gates.

Практический минимум:

1. Создайте активные system interests.
2. Проверьте positive/negative prototypes.
3. Создайте LLM templates для `criteria` и `global`, если используете LLM review.
4. Запустите reindex/backfill, если нужно применить новые rules к старому контенту.

Scope `interests` не является обязательным baseline для LLM review. Не делайте его hot path без отдельного решения.

### Signal visibility и hard gates

Полный reference: [Hidden-Signal Selection Reference](./hidden-signal-selection.md).

Перед tuning классифицируйте интерес как один из типов:

- `explicit_marker` — явный сигнал с доказанным обязательным маркером;
- `hidden_intent` — скрытый или операционный intent, где нужная формулировка может вообще не использовать ваши термины;
- `mixed` — несколько evidence paths в одном бизнес-смысле, например явные notices плюс скрытый операционный спрос.

Для `hidden_intent` и `unknown` baseline должен оставлять `must_have_terms=[]` и `short_tokens_required=[]`. `must_have_terms` работает как any-of, но это всё равно hard pre-semantic gate: item без одного из терминов не дойдет до semantic/gray/LLM path. `short_tokens_required` — extracted-token requirement, а не замена OR keywords.

Для `explicit_marker` hard gate допустим только после proof: representative samples должны показать, что marker действительно обязательный, затем нужен bounded replay и `operator.report.verify`. Для `mixed` не ставьте общий global hard gate на весь interest; разделите смысл на lane-like system interests/config entries или явно отделите hidden lane от explicit-marker lane.

Для hidden/mixed recovery используйте:

- representative positive prototypes как настоящие snippets, не keyword piles;
- `candidateSignals` с literal cue fragments в `group.cues`;
- near-miss negative prototypes and negative cue groups;
- content-kind/source-context evidence;
- bounded `docIds` replay and report verification.

Админка и API теперь показывают advisory warnings для unsafe hard gates, phrase-like short tokens, label-like candidate cues and weak cue groups. Эти warnings не запрещают save, но требуют read-back и sample proof before broadening.

## Signal Candidates, Resources and Clusters

`Signal Candidates` показывают editorial/content items.

`Resources` показывают website-level truth: найденные страницы, документы, newsroom entries, downloads and projection state.

`Clusters` показывают группировку событий.

Если материал “пропал”, проверьте по порядку:

1. channel fetch history;
2. resource/signal_candidate row;
3. dedup state;
4. cluster/verification state;
5. selection diagnostics;
6. LLM review/budget state;
7. final decision.

## Reindex and Backfill

Reindex нужен, когда изменились rules/profiles/templates или нужно переиграть historical content.

Правила безопасности:

- backfill должен быть видимым как job/run;
- historical replay не должен рассылать retro notifications;
- результат должен объяснять counts and residuals;
- для selection replay проверяйте `selection_replay` / `selectionReplay`: `selectionReplayTargetCount`, `selectionReplayedCount`, `enrichmentTargetCount`, `enrichmentProcessedCount` and `skippedSelectionDueToEnrichmentState`;
- completed job без replay counters не является достаточным доказательством, что старые rows пересчитаны по текущему profile;
- если job завис, смотрите maintenance/read-model surfaces и worker logs.

## Automation and Task Plugins

Sequence runtime показывает multi-step work как visible runs and task runs. Каждый step использует зарегистрированный TaskPlugin с options/context/output contract metadata.

Практически:

- смотрите available plugins before editing a sequence;
- не пытайтесь загрузить произвольный код через admin/MCP;
- для Default Reindex используйте `maintenance.reindex.request`, а не ручной запуск sequence без reindex job context;
- после write action всегда делайте read-back и, для итоговых отчетов, `operator.report.verify`.

## Observability

Observability должна отвечать на вопросы:

- какие источники ломаются;
- что произошло с конкретным channel/resource/signal_candidate;
- сколько стоит LLM/discovery;
- что можно retry;
- какие errors являются upstream residuals, а какие regression.

Для LLM смотрите budget summary and review history. Для website смотрите fetch runs, resources and enrichment/projection state. Для discovery смотрите vNext runs, artifacts, candidates, source inventory, policies, adapter backlog, replay and rollback.

## Discovery

Discovery выключен по умолчанию.

Используйте его, когда нужно найти новые источники через vNext artifacts and source inventory:

1. Включите env/config явно.
2. Проверьте bounded smoke.
3. Создайте vNext run and `DiscoveryBrief`.
4. Запустите bounded candidate/probe/understand/route flow.
5. Review candidates, SourceUnderstanding and RoutingDecision.
6. Register probation only through the vNext handoff/source registrar path.

Для подробного сценария используйте `/admin/discovery` and `discovery.*` MCP vNext tools.

## MCP

MCP service нужен для operator tooling. Он не заменяет admin, а дает bounded tools with token scopes.

Начните с [MCP Operator Docs](./mcp/README.md).

## Нормальный порядок первого запуска

1. Поднять stack по [Manual MVP Runbook](./manual-mvp-runbook.md).
2. Убедиться, что `/admin` открывается.
3. Создать или импортировать RSS channel.
4. Дождаться signal_candidate flow.
5. Создать system interests.
6. Запустить reindex/backfill при необходимости.
7. Проверить Signal Candidates, Clusters, Observability.
8. Добавить website channel и проверить Resources.
9. Только после этого включать discovery или live provider paths.

## Когда остановиться

Остановитесь и не “докручивайте руками”, если:

- auth/admin role ведет себя непонятно;
- channel пишет ошибки авторизации или unsupported provider state;
- website уперся в CAPTCHA/login/manual challenge;
- LLM/discovery budget исчерпан;
- backfill может разослать внешние уведомления;
- dashboard и maintenance API спорят друг с другом.

В таких случаях сначала нужен proof/debug path, а не новые настройки.
