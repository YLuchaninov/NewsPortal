# Universal Task Engine — Архитектура (замена article processing pipeline)

## Содержание

1. [Назначение](#1-назначение)
2. [Текущая архитектура и её ограничения](#2-текущая-архитектура-и-её-ограничения)
3. [Новая архитектура: Universal Task Engine](#3-новая-архитектура-universal-task-engine)
4. [Модель данных](#4-модель-данных)
5. [Формат TaskGraph](#5-формат-taskgraph)
6. [Task Plugin — интерфейс](#6-task-plugin--интерфейс)
7. [Реестр плагинов](#7-реестр-плагинов)
8. [Движок выполнения (Sequence Runner)](#8-движок-выполнения-sequence-runner)
9. [Pipeline-плагины (замена текущих workers)](#9-pipeline-плагины-замена-текущих-workers)
10. [Discovery-плагины (новые возможности)](#10-discovery-плагины-новые-возможности)
11. [Маршрутизация событий: от фиксированной к декларативной](#11-маршрутизация-событий-от-фиксированной-к-декларативной)
12. [API-слой](#12-api-слой)
13. [Потоки данных](#13-потоки-данных)
14. [Планировщик и Cron](#14-планировщик-и-cron)
15. [Обработка ошибок и ретраи](#15-обработка-ошибок-и-ретраи)
16. [Наблюдаемость и статусы](#16-наблюдаемость-и-статусы)
17. [Миграция с текущей архитектуры](#17-миграция-с-текущей-архитектуры)
18. [Будущее: Agent-построитель последовательностей](#18-будущее-agent-построитель-последовательностей)
19. [Этапы реализации](#19-этапы-реализации)
20. [Диаграммы](#20-диаграммы)
21. [Приложения](#21-приложения)

---

## 1. Назначение

Universal Task Engine **заменяет** текущий hardcoded article processing pipeline (outbox events → BullMQ queues → Python workers с фиксированной маршрутизацией) единой системой выполнения произвольных последовательностей задач.

### Что уходит

- 12 отдельных BullMQ очередей с фиксированными Python worker handlers (`q.normalize`, `q.dedup`, `q.embed`, `q.match.criteria`, `q.cluster`, `q.match.interests`, `q.notify`, `q.llm.review`, `q.feedback.ingest`, `q.reindex`, `q.interest.compile`, `q.criterion.compile`)
- Фиксированная маршрутизация в `buildOutboxEventQueueMap()` — жёсткая привязка outbox event types к queue names
- Монолитный `services/workers/app/main.py` (~4300 строк) с 12 handler-функциями
- Жёсткий state machine статей: `raw → normalized → deduped → embedded → clustered → matched → notified`

### Что приходит

- **Один движок** (Sequence Runner), который выполняет последовательности задач по декларативному описанию (TaskGraph)
- **Плагинная архитектура**: каждый текущий worker handler становится отдельным TaskPlugin
- **Декларативная маршрутизация**: какие задачи выполнять при каком событии — описывается как sequence, а не как hardcode в TypeScript
- **Расширяемость**: помимо текущих pipeline-задач, появляются задачи source discovery, hypothesis testing, content enrichment
- **Готовность к агентам**: формат TaskGraph может генерироваться программно (LLM/агент)

### Ключевые свойства

- **Независимые задачи**: каждая задача — self-contained единица с чистым интерфейсом
- **Декларативное описание**: последовательность задаётся как JSON (TaskGraph)
- **Последовательное выполнение**: задачи выполняются строго по порядку (MVP, без ветвлений)
- **Накопление контекста**: каждая задача получает и обогащает общий context
- **Плагинная архитектура**: новые задачи добавляются без изменения движка
- **Обратная совместимость**: дефолтная article processing sequence воспроизводит текущее поведение pipeline

---

## 2. Текущая архитектура и её ограничения

### 2.1 Текущий pipeline

```
Fetcher (TypeScript)
  │
  │ INSERT articles (processing_state = 'raw')
  │ INSERT outbox_events (article.ingest.requested)
  │
  ▼
Relay (TypeScript) — polls outbox_events, dispatches to BullMQ
  │
  ├─► q.normalize ─► process_normalize() ─► state='normalized', emit article.normalized
  │     │
  │     ├─► q.dedup ─► process_dedup() ─► state='deduped' (or discard), emit article.normalized (passthrough)
  │     │
  │     └─► q.embed (if enableEmbedFanout) ─► process_embed() ─► state='embedded', emit article.embedded
  │           │
  │           └─► q.match.criteria ─► process_match_criteria() ─► emit article.criteria.matched
  │                 │
  │                 └─► q.cluster ─► process_cluster() ─► state='clustered', emit article.clustered
  │                       │
  │                       └─► q.match.interests ─► process_match_interests() ─► state='matched', emit article.interests.matched
  │                             │
  │                             └─► q.notify ─► process_notify() ─► state='notified', deliver notifications
  │
  ├─► q.llm.review ─► process_llm_review()
  ├─► q.feedback.ingest ─► process_feedback_ingest()
  ├─► q.reindex ─► process_reindex()
  ├─► q.interest.compile ─► process_interest_compile()
  └─► q.criterion.compile ─► process_criterion_compile()
```

### 2.2 Что фиксировано и не может меняться

Маршрутизация задана статически в `packages/contracts/src/queue.ts`:

```typescript
// buildOutboxEventQueueMap() — жёсткая маршрутная карта
{
  "article.ingest.requested":      ["q.normalize"],
  "article.normalized":            ["q.dedup"],      // или ["q.dedup", "q.embed"]
  "article.embedded":              ["q.match.criteria"],
  "article.criteria.matched":      ["q.cluster"],
  "article.clustered":             ["q.match.interests"],
  "article.interests.matched":     ["q.notify"],
  ...
}
```

Чтобы изменить порядок, добавить шаг, убрать шаг или вставить условие — нужно менять TypeScript-код в contracts, перекомпилировать relay, перезапустить. Нельзя:

- Запустить статью через другую цепочку шагов
- Добавить новый шаг без модификации маршрутной карты
- Выполнить только часть pipeline (например, только normalize + embed)
- Переиспользовать шаги pipeline в другом контексте (source discovery, enrichment)
- Программно сгенерировать pipeline (для AI agent)

### 2.3 Ограничения текущей реализации

1. **Монолит**: все 12 handlers в одном файле main.py (~4300 строк)
2. **Глобальные singleton-ы**: `EMBEDDING_PROVIDER`, `FEATURE_EXTRACTOR`, `INTEREST_COMPILER`, `CRITERION_COMPILER`, `INTEREST_INDEXER` — инициализируются при импорте модуля
3. **Фиксированная маршрутизация**: изменение routing = изменение кода + redeploy
4. **Нет reusability**: normalize, embed, match — полезны не только для article pipeline, но привязаны к нему намертво
5. **Нет observability на уровне pipeline**: можно видеть статус отдельной задачи в queue, но нет целостного "run" с прогрессом

---

## 3. Новая архитектура: Universal Task Engine

### 3.1 Общая схема

```
┌──────────────────────────────────────────────────────────────────────┐
│                           NewsPortal                                  │
│                                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────────────────┐    │
│  │ apps/web │  │apps/admin│  │  services/api (FastAPI)           │    │
│  │(Astro)   │  │(Astro)   │  │  /maintenance/sequences          │    │
│  └──────────┘  └──────────┘  │  /maintenance/sequences/:id/runs  │    │
│                               │  /maintenance/sequence-plugins    │    │
│                               └──────────┬───────────────────────┘    │
│                                          │                            │
│  ┌───────────────┐            ┌──────────▼──────────┐                │
│  │ services/     │            │     PostgreSQL       │                │
│  │ fetchers      │            │                      │                │
│  │ (TypeScript)  │            │  sequences           │                │
│  │               │            │  sequence_runs       │                │
│  │ RSS / IMAP    │──insert──►│  sequence_task_runs  │                │
│  │ fetch         │ articles + │  articles            │                │
│  │               │ outbox     │  outbox_events       │                │
│  └───────────────┘            │  source_channels     │                │
│                               │  ...                 │                │
│                               └──────────┬──────────┘                │
│                                          │                            │
│  ┌──────────────────┐         ┌──────────▼──────────┐                │
│  │ services/relay    │◄─poll──│  outbox_events       │                │
│  │ (TypeScript)      │        └─────────────────────┘                │
│  │                   │                                                │
│  │ event → sequence  │────────────────────┐                          │
│  │ routing           │                    ▼                          │
│  └──────────────────┘         ┌───────────────────────┐              │
│                               │   Redis / BullMQ       │              │
│                               │                        │              │
│                               │   q.sequence           │              │
│                               └───────────┬───────────┘              │
│                                           │                          │
│                               ┌───────────▼───────────┐              │
│                               │  Sequence Runner       │              │
│                               │  (Python)              │              │
│                               │                        │              │
│                               │  Pipeline plugins:     │              │
│                               │   Normalize            │              │
│                               │   Dedup                │              │
│                               │   Embed                │              │
│                               │   MatchCriteria        │              │
│                               │   Cluster              │              │
│                               │   MatchInterests       │              │
│                               │   Notify               │              │
│                               │   LlmReview            │              │
│                               │   InterestCompile      │              │
│                               │   CriterionCompile     │              │
│                               │                        │              │
│                               │  Discovery plugins:    │              │
│                               │   WebSearch            │              │
│                               │   RssProbe             │              │
│                               │   RelevanceScorer      │              │
│                               │   LlmAnalyzer          │              │
│                               │   SourceRegistrar      │              │
│                               │   ...                  │              │
│                               └────────────────────────┘              │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 Ключевое изменение

**Вместо**: outbox event → relay → hardcoded queue mapping → individual worker

**Теперь**: outbox event → relay → sequence lookup → `q.sequence` → Sequence Runner → execute TaskGraph plugins in order

Relay больше не маршрутизирует по `buildOutboxEventQueueMap()`. Вместо этого он ищет matching sequence definition и создаёт sequence run.

### 3.3 Что остаётся без изменений

- **Fetchers** (TypeScript) продолжают вставлять articles + outbox events как сейчас
- **Relay** (TypeScript) продолжает поллить outbox_events, но маршрутизация меняется
- **PostgreSQL** остаётся единственной БД
- **Redis + BullMQ** остаётся инфраструктурой очередей
- **ML-библиотеки** (`ml.app`, `indexer.app`) переиспользуются плагинами
- **Inbox idempotency** (`inbox_processed_events`) сохраняется

---

## 4. Модель данных

### 4.1 Таблица `sequences`

Центральная сущность — описание последовательности задач.

```sql
create table sequences (
  sequence_id     uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  task_graph      jsonb not null,                  -- упорядоченный список задач (TaskGraph)
  status          text not null default 'draft',   -- draft | active | archived
  trigger_event   text,                            -- outbox event type, который запускает эту sequence
                                                   -- (например, 'article.ingest.requested')
                                                   -- null = только manual/cron/agent trigger
  cron            text,                            -- cron-выражение для периодического запуска
  max_runs        int,                             -- лимит запусков (null = без лимита)
  run_count       int not null default 0,          -- счётчик выполненных запусков
  tags            text[] not null default '{}',    -- теги для группировки
  created_by      text,                            -- кто создал (user_id или 'agent' или 'system')
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_sequences_trigger_event on sequences(trigger_event) where trigger_event is not null;
create index idx_sequences_status on sequences(status);
```

**Статусы:**
- `draft` — создана, но ещё не запускалась
- `active` — готова к запуску (вручную, по cron, по trigger event)
- `archived` — деактивирована, не запускается

**Новое поле `trigger_event`** — это ключевое отличие от параллельной подсистемы. Когда relay получает outbox event, он ищет активные sequences с matching `trigger_event` и создаёт run для каждой.

### 4.2 Таблица `sequence_runs`

Каждый запуск последовательности.

```sql
create table sequence_runs (
  run_id          uuid primary key default gen_random_uuid(),
  sequence_id     uuid not null references sequences(sequence_id) on delete cascade,
  status          text not null default 'pending',  -- pending | running | completed | failed | cancelled
  context_json    jsonb not null default '{}',       -- накопленный context между задачами
  trigger_type    text not null default 'manual',    -- manual | cron | agent | api | event
  trigger_meta    jsonb,                             -- метаданные триггера (для event: event payload)
  started_at      timestamptz,
  finished_at     timestamptz,
  error_text      text,
  created_at      timestamptz not null default now()
);

create index idx_sequence_runs_sequence_id on sequence_runs(sequence_id);
create index idx_sequence_runs_status on sequence_runs(status);
```

**Статусы:**
- `pending` — создан, ожидает обработки Sequence Runner
- `running` — выполняется
- `completed` — все задачи завершены успешно
- `failed` — одна из задач завершилась с ошибкой
- `cancelled` — отменён

**trigger_type = 'event'** — когда sequence запущена через outbox event (замена текущего hardcoded routing).

### 4.3 Таблица `sequence_task_runs`

Запуск каждой отдельной задачи в рамках run.

```sql
create table sequence_task_runs (
  task_run_id     uuid primary key default gen_random_uuid(),
  run_id          uuid not null references sequence_runs(run_id) on delete cascade,
  task_index      int not null,                     -- порядковый номер задачи (0-based)
  task_key        text not null,                    -- ключ задачи из TaskGraph
  module          text not null,                    -- тип плагина ("Normalize", "Embed", "WebSearch", ...)
  status          text not null default 'pending',  -- pending | running | completed | failed | skipped
  options_json    jsonb not null default '{}',      -- настройки задачи (из TaskGraph)
  input_json      jsonb,                            -- context на входе
  output_json     jsonb,                            -- результат задачи
  started_at      timestamptz,
  finished_at     timestamptz,
  error_text      text,
  duration_ms     int,                              -- время выполнения в мс
  created_at      timestamptz not null default now()
);

create index idx_sequence_task_runs_run_id on sequence_task_runs(run_id);
create index idx_sequence_task_runs_status on sequence_task_runs(status);
```

### 4.4 ER-диаграмма

```
sequences (1) ──── (N) sequence_runs (1) ──── (N) sequence_task_runs
    │
    └── trigger_event: links to outbox event types
```

---

## 5. Формат TaskGraph

TaskGraph — это JSON-массив, хранящийся в `sequences.task_graph`. Каждый элемент описывает одну задачу.

### 5.1 Схема элемента TaskGraph

```typescript
interface TaskGraphNode {
  key: string;          // Уникальный ключ задачи в рамках графа (e.g. "normalize", "embed")
  module: string;       // Тип плагина (e.g. "Normalize", "Embed", "WebSearch")
  options: {            // Настройки, специфичные для module
    [key: string]: any;
  };
  enabled?: boolean;    // По умолчанию true; false → задача пропускается
  retry?: {             // Настройки ретраев (опционально)
    attempts: number;   // Количество попыток (default: 1)
    delay_ms: number;   // Задержка между попытками в мс (default: 1000)
  };
  timeout_ms?: number;  // Таймаут выполнения в мс (default: 60000)
}

type TaskGraph = TaskGraphNode[];
```

### 5.2 Правила

1. TaskGraph — **упорядоченный массив**. Задачи выполняются строго по индексу: `[0]` → `[1]` → `[2]` → ...
2. Каждый `key` должен быть **уникальным** в рамках графа
3. Каждый `module` должен **существовать** в реестре плагинов
4. `options` **валидируются** через `validate_options()` плагина при создании/обновлении sequence

### 5.3 Практическое naming rule для production-систем

Для toy/MVP примеров подойдут короткие имена модулей вроде `Normalize` или `WebSearch`, но реальная миграция NewsPortal показала, что для долгоживущего runtime лучше сразу использовать **stable dotted module IDs**:

- `article.normalize`
- `article.match_criteria`
- `maintenance.reindex`
- `discovery.web_search`
- `enrichment.article_enricher`

Это снижает риск коллизий, делает registry/API/catalog стабильнее и упрощает staged migration, когда рядом временно сосуществуют legacy adapters и новые plugin implementations.

### 5.4 Примеры TaskGraph

#### Default Article Processing Pipeline (замена текущего hardcoded pipeline)

Эта sequence создаётся при миграции. Она привязана к `trigger_event: 'article.ingest.requested'` и воспроизводит текущее поведение pipeline.

```json
[
  {
    "key": "normalize",
    "module": "Normalize",
    "options": {},
    "timeout_ms": 30000
  },
  {
    "key": "dedup",
    "module": "Dedup",
    "options": {},
    "timeout_ms": 30000
  },
  {
    "key": "embed",
    "module": "Embed",
    "options": {},
    "timeout_ms": 60000
  },
  {
    "key": "match_criteria",
    "module": "MatchCriteria",
    "options": {},
    "timeout_ms": 60000
  },
  {
    "key": "cluster",
    "module": "Cluster",
    "options": {},
    "timeout_ms": 60000
  },
  {
    "key": "match_interests",
    "module": "MatchInterests",
    "options": {},
    "timeout_ms": 120000
  },
  {
    "key": "notify",
    "module": "Notify",
    "options": {},
    "timeout_ms": 120000
  }
]
```

#### Source Discovery Pipeline (новая возможность)

```json
[
  {
    "key": "search_rss",
    "module": "WebSearch",
    "options": {
      "query": "ukraine technology news RSS feed",
      "count": 30,
      "type": "web"
    },
    "timeout_ms": 30000
  },
  {
    "key": "validate_urls",
    "module": "UrlValidator",
    "options": {
      "timeout_ms": 5000,
      "filter_patterns": ["*.rss", "*.xml", "*/feed/*", "*/rss/*"]
    }
  },
  {
    "key": "probe_rss",
    "module": "RssProbe",
    "options": {
      "sample_count": 5,
      "timeout_ms": 10000
    }
  },
  {
    "key": "score_relevance",
    "module": "RelevanceScorer",
    "options": {
      "target_topics": ["technology", "startups", "ukraine"],
      "min_score": 0.6
    }
  },
  {
    "key": "register_sources",
    "module": "SourceRegistrar",
    "options": {
      "auto_enable": false,
      "default_fetch_interval_minutes": 60
    }
  }
]
```

#### Hypothesis Testing Pipeline

```json
[
  {
    "key": "expand_hypothesis",
    "module": "LlmAnalyzer",
    "options": {
      "prompt_template": "expand_search_queries",
      "input_field": "hypothesis",
      "output_field": "search_queries"
    }
  },
  {
    "key": "search_sources",
    "module": "WebSearch",
    "options": {
      "query_field": "search_queries",
      "count": 20
    }
  },
  {
    "key": "probe_feeds",
    "module": "RssProbe",
    "options": { "sample_count": 3 }
  },
  {
    "key": "sample_content",
    "module": "ContentSampler",
    "options": {
      "articles_per_source": 5,
      "timeout_ms": 15000
    }
  },
  {
    "key": "evaluate",
    "module": "LlmAnalyzer",
    "options": {
      "prompt_template": "evaluate_sources",
      "output_field": "evaluation"
    }
  },
  {
    "key": "store_results",
    "module": "DbStore",
    "options": { "target": "sequence_results" }
  }
]
```

#### Custom Article Pipeline (пример: только normalize + embed, без notification)

```json
[
  {
    "key": "normalize",
    "module": "Normalize",
    "options": {}
  },
  {
    "key": "embed",
    "module": "Embed",
    "options": {}
  }
]
```

Это невозможно в текущей архитектуре — каждый article проходит всю цепочку. В новой — можно создать альтернативные sequence и привязать к другому trigger.

---

## 6. Task Plugin — интерфейс

### 6.1 Базовый класс

```python
from __future__ import annotations

import abc
from typing import Any


class TaskPlugin(abc.ABC):
    """Базовый класс для всех task-плагинов.

    Все текущие worker handlers и все новые задачи реализуют этот интерфейс.
    """

    # ── Метаданные ──

    name: str               # Уникальное имя плагина (= module в TaskGraph)
    description: str        # Человекочитаемое описание
    category: str           # "pipeline" | "discovery" | "enrichment" | "utility"

    # ── Контракт ──

    @abc.abstractmethod
    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Выполняет задачу.

        Args:
            options: настройки задачи из TaskGraph (task_graph[i].options)
            context: накопленный контекст от предыдущих задач

        Returns:
            Обновлённый context. Движок мерджит результат в общий context.
            Возвращайте только НОВЫЕ или ИЗМЕНЁННЫЕ ключи.

        Raises:
            TaskExecutionError: при ожидаемой ошибке
            Exception: при неожиданной ошибке (run прерывается)
        """
        ...

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        """
        Валидирует options задачи.

        Returns:
            Список ошибок. Пустой список = валидация пройдена.
        """
        return []

    def describe_outputs(self) -> dict[str, str]:
        """
        Описывает ключи, которые задача добавляет в context.
        Используется для документации и для agent-построителя.
        """
        return {}

    def describe_inputs(self) -> dict[str, str]:
        """
        Описывает ключи, которые задача ожидает в context.
        Используется для валидации графа и для agent-построителя.
        """
        return {}
```

### 6.2 Контракт context

Context — это mutable dict, который передаётся от задачи к задаче. Каждая задача:
- **Читает** нужные ей ключи из context
- **Возвращает** dict с новыми/обновлёнными ключами
- Движок **мерджит** результат в context через `context.update(result)`

Зарезервированные ключи context (начинаются с `_`):

| Ключ | Тип | Описание |
|------|-----|----------|
| `_sequence_id` | `str` | UUID последовательности |
| `_run_id` | `str` | UUID текущего запуска |
| `_task_key` | `str` | Ключ текущей задачи |
| `_task_index` | `int` | Индекс текущей задачи |
| `_trigger_type` | `str` | Тип триггера (manual / cron / agent / event) |
| `_trigger_meta` | `dict` | Метаданные триггера (для event: оригинальный event payload) |

**Для pipeline-плагинов** context содержит ключевые данные текущей статьи:

| Ключ | Тип | Описание |
|------|-----|----------|
| `doc_id` | `str` | UUID документа (из outbox event payload) |
| `event_id` | `str` | UUID outbox event, который запустил sequence |

Pipeline-плагины (Normalize, Embed, etc.) читают данные из PostgreSQL по `doc_id`, как и текущие workers.

### 6.3 Исключения

```python
class TaskExecutionError(Exception):
    """Ожидаемая ошибка выполнения задачи."""

    def __init__(self, message: str, *, retryable: bool = False):
        super().__init__(message)
        self.retryable = retryable


class TaskValidationError(Exception):
    """Ошибка валидации options."""

    def __init__(self, errors: list[str]):
        super().__init__(f"Validation failed: {'; '.join(errors)}")
        self.errors = errors
```

### 6.4 Lifecycle hooks (опционально)

```python
class TaskPlugin(abc.ABC):
    # ...

    async def on_before_execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> None:
        """Вызывается перед execute. Для подготовки ресурсов."""
        pass

    async def on_after_execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
        result: dict[str, Any],
    ) -> None:
        """Вызывается после успешного execute. Для cleanup."""
        pass

    async def on_error(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
        error: Exception,
    ) -> None:
        """Вызывается при ошибке. Для cleanup и логирования."""
        pass
```

---

## 7. Реестр плагинов

### 7.1 Структура

```python
class TaskPluginRegistry:
    """Центральный реестр всех task-плагинов."""

    _plugins: dict[str, type[TaskPlugin]]

    def register(self, plugin_class: type[TaskPlugin]) -> None:
        """Регистрирует плагин по его name."""
        ...

    def get(self, module: str) -> type[TaskPlugin]:
        """Возвращает класс плагина по module name. Raises KeyError."""
        ...

    def list_all(self) -> list[dict[str, str]]:
        """Список всех плагинов с метаданными (для API и agent)."""
        ...

    def validate_task_graph(self, task_graph: list[dict]) -> list[str]:
        """
        Валидирует TaskGraph:
        1. Уникальность key
        2. Существование module в реестре
        3. Валидация options каждой задачи
        4. Проверка совместимости inputs/outputs (опционально)

        Returns:
            Список ошибок. Пустой список = граф валиден.
        """
        ...

# Глобальный singleton
TASK_REGISTRY = TaskPluginRegistry()
```

### 7.2 Авторегистрация

```python
# services/workers/app/tasks/__init__.py

# Pipeline plugins (замена текущих worker handlers)
from .normalize import NormalizePlugin
from .dedup import DedupPlugin
from .embed import EmbedPlugin
from .match_criteria import MatchCriteriaPlugin
from .cluster import ClusterPlugin
from .match_interests import MatchInterestsPlugin
from .notify import NotifyPlugin
from .llm_review import LlmReviewPlugin
from .feedback_ingest import FeedbackIngestPlugin
from .reindex import ReindexPlugin
from .interest_compile import InterestCompilePlugin
from .criterion_compile import CriterionCompilePlugin

# Discovery plugins (новые возможности)
from .web_search import WebSearchPlugin
from .rss_probe import RssProbePlugin
from .content_sampler import ContentSamplerPlugin
from .relevance_scorer import RelevanceScorerPlugin
from .llm_analyzer import LlmAnalyzerPlugin
from .source_registrar import SourceRegistrarPlugin
from .url_validator import UrlValidatorPlugin
from .db_store import DbStorePlugin
from .article_loader import ArticleLoaderPlugin
from .article_enricher import ArticleEnricherPlugin

# Pipeline
TASK_REGISTRY.register(NormalizePlugin)
TASK_REGISTRY.register(DedupPlugin)
TASK_REGISTRY.register(EmbedPlugin)
TASK_REGISTRY.register(MatchCriteriaPlugin)
TASK_REGISTRY.register(ClusterPlugin)
TASK_REGISTRY.register(MatchInterestsPlugin)
TASK_REGISTRY.register(NotifyPlugin)
TASK_REGISTRY.register(LlmReviewPlugin)
TASK_REGISTRY.register(FeedbackIngestPlugin)
TASK_REGISTRY.register(ReindexPlugin)
TASK_REGISTRY.register(InterestCompilePlugin)
TASK_REGISTRY.register(CriterionCompilePlugin)

# Discovery
TASK_REGISTRY.register(WebSearchPlugin)
TASK_REGISTRY.register(RssProbePlugin)
TASK_REGISTRY.register(ContentSamplerPlugin)
TASK_REGISTRY.register(RelevanceScorerPlugin)
TASK_REGISTRY.register(LlmAnalyzerPlugin)
TASK_REGISTRY.register(SourceRegistrarPlugin)
TASK_REGISTRY.register(UrlValidatorPlugin)
TASK_REGISTRY.register(DbStorePlugin)
TASK_REGISTRY.register(ArticleLoaderPlugin)
TASK_REGISTRY.register(ArticleEnricherPlugin)
```

---

## 8. Движок выполнения (Sequence Runner)

### 8.1 Компоненты

```
┌────────────────────────────────────────────────────────────┐
│              Sequence Runner (Worker)                        │
│                                                             │
│  ┌─────────────────┐    ┌────────────────────────────────┐ │
│  │ BullMQ Worker    │    │ TaskPluginRegistry              │ │
│  │ (q.sequence)     │    │                                 │ │
│  │                  │    │  Pipeline: Normalize, Dedup,    │ │
│  │                  │    │  Embed, MatchCriteria, Cluster, │ │
│  │                  │    │  MatchInterests, Notify, ...    │ │
│  │                  │    │                                 │ │
│  │                  │    │  Discovery: WebSearch, RssProbe,│ │
│  │                  │    │  LlmAnalyzer, Scorer, ...      │ │
│  └────────┬─────────┘    └────────────────────────────────┘ │
│           │                                                 │
│  ┌────────▼─────────┐    ┌────────────────────────────────┐ │
│  │ SequenceExecutor  │    │ PostgreSQL + Redis              │ │
│  │ (linear traversal,│    │ (sequences, runs, task_runs,   │ │
│  │  context mgmt,    │    │  articles, outbox_events)      │ │
│  │  status tracking) │    │                                 │ │
│  └──────────────────┘    └────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### 8.2 Алгоритм выполнения

```
1. BullMQ Worker берёт job из очереди q.sequence
   Job payload: { run_id: "uuid", sequence_id: "uuid" }

2. Загружаем sequence и обновляем run:
   - SELECT ... FROM sequences WHERE sequence_id = ?
   - UPDATE sequence_runs SET status = 'running', started_at = now() WHERE run_id = ?

3. Парсим task_graph: TaskGraphNode[]

4. Инициализируем context:
   context = {
     "_sequence_id": sequence_id,
     "_run_id": run_id,
     "_trigger_type": trigger_type,
     "_trigger_meta": trigger_meta,
     ...initial_context (из trigger_meta — например, doc_id и event_id для pipeline sequences)
   }

5. Для каждой задачи task_graph[i] (последовательно):

   a. Проверяем enabled (если false → skip)

   b. Создаём task_run запись:
      INSERT INTO sequence_task_runs (run_id, task_index, task_key, module, status, options_json, input_json)
      VALUES (?, i, task.key, task.module, 'running', task.options, context)

   c. Находим плагин:
      plugin_class = TASK_REGISTRY.get(task.module)
      plugin = plugin_class()

   d. Вызываем lifecycle:
      await plugin.on_before_execute(options, context)

   e. Выполняем с таймаутом и ретраями:
      result = await asyncio.wait_for(
        plugin.execute(task.options, context),
        timeout=task.timeout_ms / 1000
      )

   f. Мерджим результат:
      context.update(result)

   g. Обновляем task_run:
      UPDATE sequence_task_runs
      SET status = 'completed', output_json = result, finished_at = now(), duration_ms = ...
      WHERE task_run_id = ?

   h. При ошибке:
      - Если retryable и attempts осталось → повторяем
      - Иначе → UPDATE task_run SET status = 'failed', error_text = ...
      - UPDATE sequence_runs SET status = 'failed', error_text = ..., finished_at = now()
      - BREAK

6. Если все задачи завершились успешно:
   UPDATE sequence_runs
   SET status = 'completed', context_json = context, finished_at = now()
   WHERE run_id = ?

7. Обновляем sequences.run_count:
   UPDATE sequences SET run_count = run_count + 1 WHERE sequence_id = ?
```

### 8.3 Управление context

```python
class ContextManager:
    """Управляет context между задачами."""

    def __init__(self, initial: dict[str, Any]):
        self._data = dict(initial)

    @property
    def data(self) -> dict[str, Any]:
        return dict(self._data)

    def merge(self, result: dict[str, Any]) -> None:
        """Мерджит результат задачи в context."""
        for key, value in result.items():
            if key.startswith("_"):
                continue  # зарезервированные ключи нельзя перезаписывать
            self._data[key] = value

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)

    def snapshot(self) -> dict[str, Any]:
        """Снимок context для сохранения в БД."""
        return {
            key: value
            for key, value in self._data.items()
            if _is_json_serializable(value)
        }
```

### 8.4 Специальное поведение для pipeline-плагинов

Pipeline-плагины (Normalize, Dedup, Embed, etc.) работают иначе, чем discovery-плагины:

- **Читают данные из БД** по `context["doc_id"]`, а не из context
- **Пишут результаты в БД** (обновляют articles, вставляют в связанные таблицы)
- **Возвращают в context** метаданные (например, `{"processing_state": "normalized", "dedup_result": "unique"}`)
- **Могут прерывать цепочку** (например, Dedup может вернуть `{"_stop": true}` для дубликатов)

Это сохраняет thin-payload подход текущих workers — данные статьи лежат в PostgreSQL, а не передаются в BullMQ payload.

---

## 9. Pipeline-плагины (замена текущих workers)

Каждый текущий worker handler из `main.py` становится отдельным TaskPlugin. Логика внутри плагина **идентична** текущему handler — переносится as-is с минимальными адаптациями.

### 9.1 NormalizePlugin

- **Module:** `Normalize`
- **Category:** `pipeline`
- **Заменяет:** `process_normalize()` из main.py
- **Что делает:** Unicode normalization, HTML cleanup, field extraction, word count, language detection
- **Context input:** `doc_id`
- **Context output:** `{ "processing_state": "normalized" }`
- **Side effects:** UPDATE articles SET processing_state = 'normalized', title = ..., body = ..., ...

### 9.2 DedupPlugin

- **Module:** `Dedup`
- **Category:** `pipeline`
- **Заменяет:** `process_dedup()` из main.py
- **Что делает:** Fingerprint-based deduplication (URL, title hash, content hash)
- **Context input:** `doc_id`
- **Context output:** `{ "processing_state": "deduped", "dedup_result": "unique" | "duplicate", "_stop": bool }`
- **Side effects:** UPDATE articles SET processing_state = 'deduped'; для дубликатов — UPDATE SET is_duplicate = true
- **Особенность:** Если `_stop = true` (дубликат), Sequence Runner прекращает выполнение этого run (не error, а early termination)

### 9.3 EmbedPlugin

- **Module:** `Embed`
- **Category:** `pipeline`
- **Заменяет:** `process_embed()` из main.py
- **Что делает:** Генерирует embedding через `EMBEDDING_PROVIDER`, сохраняет вектор
- **Context input:** `doc_id`
- **Context output:** `{ "processing_state": "embedded" }`
- **Side effects:** UPDATE articles SET embedding = ..., processing_state = 'embedded'
- **Использует:** `EMBEDDING_PROVIDER` из `ml.app`

### 9.4 MatchCriteriaPlugin

- **Module:** `MatchCriteria`
- **Category:** `pipeline`
- **Заменяет:** `process_match_criteria()` из main.py
- **Что делает:** Сопоставляет статью с критериями пользователей (semantic + lexical + meta scoring)
- **Context input:** `doc_id`
- **Context output:** `{ "criteria_match_count": N }`
- **Side effects:** INSERT INTO article_criterion_matches; может emit LLM review events
- **Использует:** `FEATURE_EXTRACTOR`, `CRITERION_COMPILER`, scoring functions

### 9.5 ClusterPlugin

- **Module:** `Cluster`
- **Category:** `pipeline`
- **Заменяет:** `process_cluster()` из main.py
- **Что делает:** Кластеризация статей в event_clusters
- **Context input:** `doc_id`
- **Context output:** `{ "processing_state": "clustered", "cluster_id": "..." }`
- **Side effects:** INSERT/UPDATE event_clusters; UPDATE articles SET cluster_id = ..., processing_state = 'clustered'
- **Использует:** `INTEREST_INDEXER` (HNSW), scoring functions

### 9.6 MatchInterestsPlugin

- **Module:** `MatchInterests`
- **Category:** `pipeline`
- **Заменяет:** `process_match_interests()` из main.py
- **Что делает:** Сопоставляет статью/кластер с интересами пользователей
- **Context input:** `doc_id`
- **Context output:** `{ "processing_state": "matched", "interest_match_count": N }`
- **Side effects:** INSERT INTO article_interest_matches; может emit LLM review events
- **Использует:** `INTEREST_COMPILER`, `INTEREST_INDEXER`, scoring functions

### 9.7 NotifyPlugin

- **Module:** `Notify`
- **Category:** `pipeline`
- **Заменяет:** `process_notify()` из main.py
- **Что делает:** Создаёт уведомления для matched interests, доставляет через channels (Telegram, WebPush, etc.)
- **Context input:** `doc_id`
- **Context output:** `{ "processing_state": "notified", "notifications_sent": N }`
- **Side effects:** INSERT INTO notifications; dispatch через delivery channels
- **Использует:** `dispatch_channel_message`, notification preferences

### 9.8 LlmReviewPlugin

- **Module:** `LlmReview`
- **Category:** `pipeline`
- **Заменяет:** `process_llm_review()` из main.py
- **Что делает:** LLM review для criterion/interest matches
- **Отдельная sequence:** Триггерится отдельно (не часть основной article pipeline sequence)

### 9.9 FeedbackIngestPlugin

- **Module:** `FeedbackIngest`
- **Category:** `pipeline`
- **Заменяет:** `process_feedback_ingest()` из main.py

### 9.10 ReindexPlugin

- **Module:** `Reindex`
- **Category:** `pipeline`
- **Заменяет:** `process_reindex()` из main.py

### 9.11 InterestCompilePlugin

- **Module:** `InterestCompile`
- **Category:** `pipeline`
- **Заменяет:** `process_interest_compile()` из main.py

### 9.12 CriterionCompilePlugin

- **Module:** `CriterionCompile`
- **Category:** `pipeline`
- **Заменяет:** `process_criterion_compile()` из main.py

### 9.13 Паттерн переноса handler → plugin

Каждый handler переносится по единому паттерну:

```python
# Было: main.py
async def process_normalize(job: Job, _job_token: str) -> dict[str, Any]:
    data = job.data
    doc_id = data.get("docId") or data.get("aggregateId")
    # ... 100+ строк логики ...
    return {"status": "ok"}

# Стало: tasks/normalize.py
class NormalizePlugin(TaskPlugin):
    name = "Normalize"
    description = "Unicode normalization, HTML cleanup, field extraction"
    category = "pipeline"

    async def execute(self, options: dict, context: dict) -> dict:
        doc_id = context["doc_id"]
        # ... та же логика, вынесенная из process_normalize() ...
        return {"processing_state": "normalized"}
```

Внутренняя логика (DB queries, ML calls, scoring) переносится as-is. Меняется только обёртка.

---

## 10. Discovery-плагины (новые возможности)

### 10.1 WebSearch

- **Module:** `WebSearch`
- **Category:** `discovery`
- **Описание:** Поиск в вебе через DuckDuckGo
- **Options:**

  | Поле | Тип | Default | Описание |
  |------|-----|---------|----------|
  | `query` | `str` | required | Поисковый запрос |
  | `query_field` | `str?` | null | Берёт query из context[query_field] |
  | `count` | `int` | 20 | Макс. количество результатов |
  | `type` | `str` | "web" | "web" или "news" |
  | `time` | `str?` | null | "day", "week", "month", "year" |

- **Context output:** `{ "search_results": [{ "url": "...", "title": "...", "snippet": "..." }] }`

### 10.2 UrlValidator

- **Module:** `UrlValidator`
- **Category:** `discovery`
- **Описание:** Проверяет доступность URL, фильтрует по паттернам
- **Context output:** `{ "validated_urls": [{ "url": "...", "status": 200, "content_type": "...", "is_rss_candidate": true }] }`

### 10.3 RssProbe

- **Module:** `RssProbe`
- **Category:** `discovery`
- **Описание:** Парсит URL как RSS/Atom ленту, извлекает sample записей
- **Context output:** `{ "probed_feeds": [{ "url": "...", "is_valid_rss": true, "feed_title": "...", "sample_entries": [...] }] }`

### 10.4 ContentSampler

- **Module:** `ContentSampler`
- **Category:** `discovery`
- **Описание:** Скачивает полный контент N статей из каждого source для оценки качества
- **Context output:** `{ "sampled_content": [{ "source_url": "...", "articles": [...] }] }`

### 10.5 RelevanceScorer

- **Module:** `RelevanceScorer`
- **Category:** `discovery`
- **Описание:** Semantic scoring через embeddings
- **Использует:** `EMBEDDING_PROVIDER` из `ml.app`
- **Context output:** `{ "scored_sources": [{ "source_url": "...", "relevance_score": 0.78, "passes_threshold": true }] }`

### 10.6 LlmAnalyzer

- **Module:** `LlmAnalyzer`
- **Category:** `discovery`
- **Описание:** Универсальный LLM-обработчик (Gemini)
- **Использует:** `review_with_gemini` из `workers.app.gemini`
- **Context output:** `{ [output_field]: <LLM response> }`

### 10.7 SourceRegistrar

- **Module:** `SourceRegistrar`
- **Category:** `discovery`
- **Описание:** Регистрирует validated sources как `source_channels` в БД
- **Side effects:** INSERT source_channels; INSERT outbox_events → fetcher подхватит новые каналы
- **Context output:** `{ "registered_channels": [{ "channel_id": "...", "url": "...", "enabled": false }] }`

### 10.8 DbStore

- **Module:** `DbStore`
- **Category:** `utility`
- **Описание:** Сохраняет context или его часть как JSON-результат
- **Context output:** `{ "stored": true }`

### 10.9 ArticleLoader

- **Module:** `ArticleLoader`
- **Category:** `enrichment`
- **Описание:** Загружает статьи из БД по фильтрам (для content enrichment sequences)
- **Context output:** `{ "articles": [{ "doc_id": "...", "title": "...", "body": "...", ... }] }`

### 10.10 ArticleEnricher

- **Module:** `ArticleEnricher`
- **Category:** `enrichment`
- **Описание:** Записывает enrichment-данные обратно в статьи
- **Context output:** `{ "enriched_count": 42 }`

---

## 11. Маршрутизация событий: от фиксированной к декларативной

Это ключевое архитектурное изменение. Текущая маршрутизация полностью заменяется.

### 11.1 Было: hardcoded routing

```typescript
// packages/contracts/src/queue.ts
function buildOutboxEventQueueMap() {
  return {
    "article.ingest.requested":      ["q.normalize"],
    "article.normalized":            ["q.dedup"],
    "article.embedded":              ["q.match.criteria"],
    "article.criteria.matched":      ["q.cluster"],
    ...
  };
}
```

Relay использовал эту карту, чтобы dispatch'ить outbox events в правильные очереди. Каждый шаг pipeline завершался outbox event → relay dispatch → следующая очередь.

### 11.2 Стало: declarative sequence routing

```
Fetcher вставляет outbox event: article.ingest.requested
  │
  ▼
Relay поллит outbox_events
  │
  ├─ Ищет в таблице sequences: WHERE trigger_event = 'article.ingest.requested' AND status = 'active'
  │
  ├─ Находит sequence (например, "Default Article Pipeline")
  │
  ├─ Создаёт sequence_run с trigger_type = 'event', trigger_meta = { docId: "...", eventId: "..." }
  │
  └─ Публикует job в q.sequence: { run_id, sequence_id }
      │
      ▼
  Sequence Runner берёт job и выполняет TaskGraph:
    Normalize → Dedup → Embed → MatchCriteria → Cluster → MatchInterests → Notify
```

### 11.3 Что меняется в Relay

Relay (`services/relay/src/relay.ts`) больше не использует `buildOutboxEventQueueMap()` для sequence-managed events. Вместо этого:

```typescript
// Новая логика в OutboxRelay.processEvent()
async processEvent(event: OutboxEvent): Promise<void> {
  // 1. Ищем matching sequences
  const sequences = await this.findActiveSequences(event.event_type);

  if (sequences.length > 0) {
    // 2. Для каждой matching sequence создаём run
    for (const seq of sequences) {
      const runId = randomUUID();
      await this.createSequenceRun(runId, seq.sequence_id, {
        trigger_type: 'event',
        trigger_meta: event.payload,
        initial_context: {
          doc_id: event.aggregate_id,
          event_id: event.event_id,
          event_type: event.event_type,
          ...event.payload,
        },
      });

      // 3. Публикуем в q.sequence
      await this.sequenceQueue.add('run', {
        run_id: runId,
        sequence_id: seq.sequence_id,
      });
    }
    return;
  }

  if (isSequenceManagedEvent(event.event_type)) {
    // В production-safe варианте нельзя молча "проглотить" управляемое событие.
    // Иначе мы потеряем обработку без явного сигнала оператору.
    throw new Error(`No active sequence routing for ${event.event_type}`);
  }

  // Только non-sequence events могут безопасно уйти в legacy/direct fallback map.
  await this.enqueueLegacyFallback(event);
}
```

Практический lesson learned: для sequence-managed trigger-ов отсутствие active sequence должно считаться **routing failure**, а не "ничего не произошло". Silent skip слишком опасен для production.

### 11.4 Какие events остаются нужны

**Входные events** (от внешних систем, не от pipeline stages):
- `article.ingest.requested` — от fetchers, когда статья записана в БД
- `source.channel.sync.requested` — триггер для fetcher
- `interest.compile.requested` — от API при изменении interest
- `criterion.compile.requested` — от API при изменении criterion
- `llm.review.requested` — от MatchCriteria/MatchInterests плагинов
- `notification.feedback.recorded` — от API при feedback
- `reindex.requested` — от API/admin

**Events между pipeline stages — больше не нужны как default relay ownership:**
- ~~`article.normalized`~~ — Normalize и Dedup теперь в одной sequence
- ~~`article.embedded`~~ — Embed и MatchCriteria в одной sequence
- ~~`article.criteria.matched`~~ — MatchCriteria и Cluster в одной sequence
- ~~`article.clustered`~~ — Cluster и MatchInterests в одной sequence
- ~~`article.interests.matched`~~ — MatchInterests и Notify в одной sequence

Pipeline-промежуточные events больше не нужны как обычный transport между stage-ами, потому что шаги общаются через context внутри одного sequence run. На практике полезно оставить их как compatibility constants на время миграции, но default runtime не должен их fanout-ить и не должен silently запускать их параллельно с sequence path.

### 11.5 Default sequences (создаются при миграции)

| Sequence | trigger_event | TaskGraph |
|----------|---------------|-----------|
| Default Article Pipeline | `article.ingest.requested` | Normalize → Dedup → Embed → MatchCriteria → Cluster → MatchInterests → Notify |
| Interest Compile | `interest.compile.requested` | InterestCompile |
| Criterion Compile | `criterion.compile.requested` | CriterionCompile |
| LLM Review | `llm.review.requested` | LlmReview |
| Feedback Ingest | `notification.feedback.recorded` | FeedbackIngest |
| Reindex | `reindex.requested` | Reindex |

Эти sequences воспроизводят текущее поведение 1-в-1.

---

## 12. API-слой

Все эндпоинты через Python FastAPI (`services/api/`).

Практический lesson learned из NewsPortal: sequence management сначала лучше держать **только на internal/maintenance surface**, а не сразу выводить в публичный `/api/*` contract. Это уменьшает blast radius во время миграции и позволяет дольше сохранять operator-only semantics.

### 12.1 Sequences CRUD

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/maintenance/sequences` | Список sequences (с пагинацией) |
| GET | `/maintenance/sequences/:sequenceId` | Получить sequence по ID |
| POST | `/maintenance/sequences` | Создать sequence (с валидацией TaskGraph) |
| PATCH | `/maintenance/sequences/:sequenceId` | Частично обновить sequence |
| DELETE | `/maintenance/sequences/:sequenceId` | Soft-archive sequence, а не hard delete |

### 12.2 Sequence Runs

| Метод | URL | Описание |
|-------|-----|----------|
| POST | `/maintenance/sequences/:sequenceId/runs` | Запустить sequence (создаёт run + job в q.sequence) |
| GET | `/maintenance/sequence-runs/:runId` | Детали run |
| GET | `/maintenance/sequence-runs/:runId/task-runs` | Детали task-runs |
| POST | `/maintenance/sequence-runs/:runId/cancel` | Cancel pending run |

### 12.3 Task Plugins

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/maintenance/sequence-plugins` | Список доступных плагинов (для operator/agent) |
| GET | `/maintenance/agent/sequence-tools` | Agent-facing tool catalog |
| POST | `/maintenance/agent/sequences` | Создать draft sequence и опционально сразу запустить |

Дополнительные практические правила:

- manual run path сначала пишет `sequence_runs` в PostgreSQL и только потом best-effort enqueue-ит `q.sequence`;
- если enqueue не удался, run должен быть отмечен как `failed` с recorded dispatch error;
- cancel лучше честно ограничить `pending` runs, пока не реализована cooperative cancellation для `running`.

### 12.4 Request/Response примеры

#### Создание discovery sequence

```
POST /maintenance/sequences
{
  "title": "Discover Ukraine Tech RSS",
  "description": "Поиск RSS-каналов по теме tech + Ukraine",
  "task_graph": [
    { "key": "search", "module": "discovery.web_search", "options": { "query": "...", "count": 20 } },
    { "key": "probe", "module": "discovery.rss_probe", "options": { "sample_count": 3 } },
    { "key": "score", "module": "discovery.relevance_scorer", "options": { "target_topics": ["tech"] } },
    { "key": "register", "module": "discovery.source_registrar", "options": {} }
  ],
  "tags": ["discovery", "ukraine", "tech"]
}

Response 201:
{
  "sequence_id": "a1b2c3d4-...",
  "title": "Discover Ukraine Tech RSS",
  "status": "draft",
  ...
}
```

#### Запуск sequence

```
POST /maintenance/sequences/a1b2c3d4-.../runs
{
  "initial_context": {
    "hypothesis": "Ukrainian tech startups blog on Medium and Substack"
  }
}

Response 202:
{
  "run_id": "e5f6g7h8-...",
  "status": "pending"
}
```

---

## 13. Потоки данных

### 13.1 Article Processing Flow (замена текущего pipeline)

```
Fetcher                         Relay                    Sequence Runner
───────                         ─────                    ───────────────

INSERT article                  poll outbox_events
INSERT outbox_event             │
  (article.ingest.requested)    │
                                │ find sequence with
                                │ trigger_event = 'article.ingest.requested'
                                │
                                │ create sequence_run
                                │ add job to q.sequence
                                │                        pick up job
                                │                        │
                                │                        │ context = { doc_id, event_id }
                                │                        │
                                │                        ├─ Normalize plugin
                                │                        │  read article from DB
                                │                        │  normalize fields
                                │                        │  UPDATE articles
                                │                        │  context += { processing_state: "normalized" }
                                │                        │
                                │                        ├─ Dedup plugin
                                │                        │  check fingerprints
                                │                        │  if duplicate: context += { _stop: true }
                                │                        │  else: context += { processing_state: "deduped" }
                                │                        │
                                │                        ├─ Embed plugin
                                │                        │  generate embedding
                                │                        │  UPDATE articles SET embedding = ...
                                │                        │  context += { processing_state: "embedded" }
                                │                        │
                                │                        ├─ MatchCriteria plugin
                                │                        │  score against criteria
                                │                        │  INSERT article_criterion_matches
                                │                        │
                                │                        ├─ Cluster plugin
                                │                        │  find/create event_cluster
                                │                        │  UPDATE articles SET cluster_id = ...
                                │                        │
                                │                        ├─ MatchInterests plugin
                                │                        │  score against interests
                                │                        │  INSERT article_interest_matches
                                │                        │
                                │                        └─ Notify plugin
                                │                           create notifications
                                │                           deliver via channels
                                │                           context += { processing_state: "notified" }
                                │
                                │                        mark sequence_run = completed
```

### 13.2 Source Discovery Flow (новый)

```
              Context:
              {}
              │
    ┌─────────▼──────────┐
    │   WebSearch         │  query: "ukraine tech RSS"
    └─────────┬──────────┘
              │  + search_results: [{url, title, snippet}]
              │
    ┌─────────▼──────────┐
    │   UrlValidator      │  проверяет доступность, фильтрует RSS-кандидаты
    └─────────┬──────────┘
              │  + validated_urls: [{url, status, content_type}]
              │
    ┌─────────▼──────────┐
    │   RssProbe          │  парсит feeds, извлекает sample entries
    └─────────┬──────────┘
              │  + probed_feeds: [{url, feed_title, sample_entries}]
              │
    ┌─────────▼──────────┐
    │   RelevanceScorer   │  semantic scoring через embeddings
    └─────────┬──────────┘
              │  + scored_sources: [{source_url, relevance_score, passes_threshold}]
              │
    ┌─────────▼──────────┐
    │   SourceRegistrar   │  → INSERT source_channels
    └─────────┬──────────┘  → INSERT outbox_events → fetcher подхватит
              │  + registered_channels: [{channel_id, url, enabled}]
              ▼
              Context сохранён в sequence_runs.context_json
```

### 13.3 Hypothesis Testing Flow (новый)

```
              Context:
              { hypothesis: "Ukrainian ML engineers blog on Substack" }
              │
    ┌─────────▼──────────┐
    │   LlmAnalyzer       │  Расширяет гипотезу в search queries
    └─────────┬──────────┘
              │  + search_queries: ["ukraine ML substack", ...]
              │
    ┌─────────▼──────────┐
    │   WebSearch          │  Ищет по каждому query
    └─────────┬──────────┘
              │  + search_results: [...]
              │
    ┌─────────▼──────────┐
    │   RssProbe           │  Проверяет кандидаты
    └─────────┬──────────┘
              │  + probed_feeds: [...]
              │
    ┌─────────▼──────────┐
    │   ContentSampler     │  Скачивает sample статей
    └─────────┬──────────┘
              │  + sampled_content: [...]
              │
    ┌─────────▼──────────┐
    │   LlmAnalyzer        │  Оценивает качество и релевантность
    └─────────┬──────────┘
              │  + evaluation: { verdict, reasoning }
              │
    ┌─────────▼──────────┐
    │   DbStore            │  Сохраняет результат
    └─────────┬──────────┘
              ▼  Результат доступен через API
```

---

## 14. Планировщик и Cron

### 14.1 Cron-запуск

Production-safe baseline лучше строить не на BullMQ Repeatable Jobs, а на **DB-backed minute scheduler**:

- worker/scheduler периодически перечитывает active sequences с заполненным `cron`;
- для текущей due-minute создаёт `sequence_run`;
- пишет `trigger_type = 'cron'` и `trigger_meta.scheduledFor`;
- enqueue-ит обычный thin job в `q.sequence`.

Это держит authoritative schedule truth в PostgreSQL и упрощает observability. Catch-up/backfill scheduling для пропущенных интервалов лучше считать отдельной capability, а не молча включать в MVP.

### 14.2 Manual запуск

```python
# POST /maintenance/sequences/:id/runs
async def trigger_run(sequence_id: str, initial_context: dict | None) -> str:
    run_id = str(uuid.uuid4())
    await create_run(run_id, sequence_id, trigger_type="manual", trigger_meta=initial_context)
    # Ставим thin job напрямую в q.sequence (без outbox, для manual triggers)
    # Если dispatch не удался, run нужно пометить failed, а не оставлять "висящим".
    await sequence_queue.add("run", {"run_id": run_id, "sequence_id": sequence_id})
    return run_id
```

### 14.3 Event-triggered запуск

Описан в разделе 11 — relay находит matching sequences и создаёт runs.

### 14.4 Agent-triggered запуск

В будущем agent будет создавать sequences через API и запускать их с `trigger_type: "agent"`.

---

## 15. Обработка ошибок и ретраи

### 15.1 Уровни ошибок

| Уровень | Поведение |
|---------|-----------|
| **Task error (retryable)** | Повторяем task до `retry.attempts`. Все попытки исчерпаны → task failed → run failed |
| **Task error (non-retryable)** | Task failed → run failed |
| **Early termination (`_stop`)** | Не ошибка. Run завершается как completed, оставшиеся tasks — skipped |
| **Timeout** | Как non-retryable error |
| **Infrastructure error** | BullMQ ретраит весь job |

### 15.2 `_stop` для Dedup

Dedup-плагин может вернуть `{"_stop": true}` для дубликатов. Sequence Runner обрабатывает это как нормальное early termination:

```python
result = await plugin.execute(options, context)
context.update(result)

if context.get("_stop"):
    # Mark remaining tasks as skipped, mark run as completed
    for remaining in task_graph[i+1:]:
        create_task_run(status="skipped", ...)
    update_run(status="completed", ...)
    break
```

### 15.3 Retry config

Из TaskGraph node:

```json
{
  "key": "embed",
  "module": "Embed",
  "retry": { "attempts": 3, "delay_ms": 2000 },
  "timeout_ms": 60000
}
```

Default: `attempts: 1`, `delay_ms: 1000`, `timeout_ms: 60000`

---

## 16. Наблюдаемость и статусы

### 16.1 Преимущество над текущей архитектурой

Сейчас нет единого "run" для article processing — каждый шаг это отдельный BullMQ job, и отследить прогресс статьи через pipeline можно только по `processing_state` в articles.

С task engine каждая статья получает `sequence_run` с полным набором `sequence_task_runs`, что даёт:

- Полную историю обработки каждой статьи
- Точные тайминги каждого шага
- Место ошибки (какой плагин, какой input)
- Возможность перезапуска

### 16.2 Polling endpoint

```
GET /maintenance/sequence-runs/:runId

Response:
{
    "run_status": "running",
    "tasks": [
        { "key": "normalize", "module": "Normalize", "status": "completed", "duration_ms": 120 },
        { "key": "dedup", "module": "Dedup", "status": "completed", "duration_ms": 45 },
        { "key": "embed", "module": "Embed", "status": "running", "duration_ms": null },
        { "key": "match_criteria", "module": "MatchCriteria", "status": "pending" },
        { "key": "cluster", "module": "Cluster", "status": "pending" },
        { "key": "match_interests", "module": "MatchInterests", "status": "pending" },
        { "key": "notify", "module": "Notify", "status": "pending" }
    ],
    "progress": { "completed": 2, "total": 7, "percent": 28 }
}
```

---

## 17. Миграция с текущей архитектуры

### 17.1 Стратегия: additive foundation, parity, затем один cutover

Миграция **не big-bang по подготовке**, но и **не live dual-run** для production pipeline. Практический порядок безопаснее такой:

1. **Создать DDL и инфраструктуру** task engine (таблицы, Sequence Runner, plugin registry)
2. **Перенести handler-логику** в plugins/adapter plugins без изменения default routing
3. **Создать default sequences** в `draft`/`disabled` или additive-ready состоянии
4. **Подготовить parity harness** и targeted smoke suite против текущего runtime
5. **Включить relay lookup и worker sequence runtime за feature flags**, не удаляя legacy path заранее
6. **Сделать один cutover**: активировать default sequences, переключить relay/worker defaults, suppress-ить legacy intermediate fanout
7. **Только после green proof** удалить старый default routing/consumers

Почему не стоит делать live parallel run для article pipeline:

- легко получить двойной `match`/`notify`;
- downstream derived tables начинают дрейфовать;
- suppression/idempotency логика становится нечитаемой;
- отладка regressions усложняется в разы.

### 17.2 Что меняется в каждом сервисе

| Сервис | Изменения |
|--------|-----------|
| `services/workers/` | Практически полезно сначала вынести engine в отдельный namespace (`app/task_engine/*`) и временно оборачивать legacy handlers adapter-плагинами. Startup code меняется: default runtime становится `q.sequence`, а legacy consumers остаются opt-in |
| `services/relay/` | Вместо `buildOutboxEventQueueMap()` для managed triggers — lookup в sequences table + create `sequence_run` + enqueue thin `q.sequence` job. Для managed events без active sequence route лучше fail-ить outbox row, а не silently skip |
| `packages/contracts/` | Добавляется `SEQUENCE_QUEUE`. Промежуточные pipeline event types можно оставить как compatibility constants, но default queue mappings для них должны исчезнуть |
| `services/api/` | Sequence endpoints лучше сначала держать во internal maintenance surface: CRUD, manual run, cancel, run status, task-run detail, plugin catalog, agent draft/create-run |
| `database/` | Новый DDL phase (Phase 5) с таблицами sequences, sequence_runs, sequence_task_runs. Миграция для seed default sequences |
| `services/fetchers/` | **Без изменений** — продолжают вставлять articles + outbox events как сейчас |

### 17.3 Обратная совместимость

- `processing_state` в articles сохраняется — pipeline-плагины продолжают обновлять его
- Inbox idempotency (`inbox_processed_events`) сохраняется — используется внутри pipeline-плагинов
- Все ML-модели и индексы используются плагинами через те же runtime boundaries; на промежуточной миграционной стадии допустимы adapter-плагины поверх legacy handlers
- API для articles, interests, criteria, notifications — без изменений

### 17.4 Что можно удалить после полной миграции

- `buildOutboxEventQueueMap()` в contracts (или значительно упростить)
- Промежуточные event types: `article.normalized`, `article.embedded`, `article.clustered`, `article.criteria.matched`, `article.interests.matched`
- 12 отдельных queue констант и consumer констант из main.py / queue.ts
- Монолитный main.py (заменён plugin-файлами)

---

## 18. Будущее: Agent-построитель последовательностей

### 18.1 Концепция

Agent — это компонент, который:
1. Получает **гипотезу или интерес** от пользователя
2. **Генерирует TaskGraph** через LLM, используя реестр плагинов как tool catalog
3. **Запускает sequence** через API
4. **Анализирует результаты** запуска
5. **Итеративно уточняет** — создаёт follow-up sequences

### 18.2 LLM Tool Description

Каждый плагин предоставляет описание для LLM через `describe_inputs()` и `describe_outputs()`:

```python
{
    "available_plugins": [
        {
            "module": "WebSearch",
            "category": "discovery",
            "description": "Search the web using DuckDuckGo",
            "inputs": {},
            "outputs": { "search_results": "Array of {url, title, snippet} objects" },
            "options_schema": { "query": { "type": "string", "required": true }, ... }
        },
        {
            "module": "Normalize",
            "category": "pipeline",
            "description": "Normalize article text: Unicode cleanup, HTML strip, field extraction",
            "inputs": { "doc_id": "Article UUID" },
            "outputs": { "processing_state": "New processing state" }
        },
        // ... все плагины
    ]
}
```

### 18.3 Почему task engine нужен ДО agent'а

Agent без task engine бессмысленен — ему некуда отправлять задачи. Task engine:
- Предоставляет **исполняемую платформу** для агента
- Обеспечивает **наблюдаемость** (что агент делал, какие результаты)
- Гарантирует **воспроизводимость** (sequence можно перезапустить)
- Позволяет **человеку вмешаться** (отменить, модифицировать)

---

## 19. Этапы реализации

### Stage 1: Foundation (DDL + Engine Core)

**Цель:** Рабочий движок, способный выполнять последовательности задач.

1. Создать DDL (Phase 5): `sequences`, `sequence_runs`, `sequence_task_runs`
2. Создать миграцию
3. Добавить `SEQUENCE_QUEUE` в contracts
4. Реализовать `TaskPlugin` базовый класс и exceptions
5. Реализовать `TaskPluginRegistry`
6. Реализовать `SequenceExecutor` (движок выполнения, context management, `_stop` handling)
7. Подключить BullMQ worker для `q.sequence`
8. **Proof:** unit-тесты для executor с mock-плагинами

### Stage 2: Pipeline Plugins (перенос текущих workers)

**Цель:** Все текущие worker handlers перенесены в TaskPlugin-формат.

1. `NormalizePlugin` ← `process_normalize()`
2. `DedupPlugin` ← `process_dedup()` (с `_stop` для дубликатов)
3. `EmbedPlugin` ← `process_embed()`
4. `MatchCriteriaPlugin` ← `process_match_criteria()`
5. `ClusterPlugin` ← `process_cluster()`
6. `MatchInterestsPlugin` ← `process_match_interests()`
7. `NotifyPlugin` ← `process_notify()`
8. `LlmReviewPlugin` ← `process_llm_review()`
9. `FeedbackIngestPlugin` ← `process_feedback_ingest()`
10. `ReindexPlugin` ← `process_reindex()`
11. `InterestCompilePlugin` ← `process_interest_compile()`
12. `CriterionCompilePlugin` ← `process_criterion_compile()`
13. **Proof:** каждый плагин проходит тесты, эквивалентные текущему поведению

### Stage 3: Default Sequences + Relay Prep

**Цель:** Подготовить relay/runtime к cutover без live dual execution.

1. Создать default sequences (article pipeline, compile, review, etc.) — seed в миграции
2. Изменить Relay: sequence lookup вместо `buildOutboxEventQueueMap()` для managed triggers
3. Оставить runtime за feature flags или inactive seeds до финального переключения
4. Верификация: parity harness + routing proof для `sequence_runs` и thin `q.sequence` payloads
5. **Proof:** relay/queue smoke без удаления старого default path

### Stage 4: Internal Maintenance API

**Цель:** operator/agent surface для sequence management без расширения public API.

1. CRUD для sequences
2. Manual run / cancel / run status / task-run details
3. Plugin catalog
4. Agent draft-sequence create/run surface
5. **Proof:** targeted API tests + dispatch failure status handling
### Stage 5: Discovery Plugins (новые возможности)

**Цель:** Работающий source discovery pipeline.

1. `WebSearchPlugin`
2. `UrlValidatorPlugin`
3. `RssProbePlugin`
4. `ContentSamplerPlugin`
5. `RelevanceScorerPlugin`
6. `LlmAnalyzerPlugin`
7. `SourceRegistrarPlugin`
8. `DbStorePlugin`
9. **Proof:** end-to-end тест source discovery pipeline

### Stage 6: Final Cutover and Cleanup

**Цель:** sequence runtime становится default owner production flow.

1. Активировать default sequences
2. Переключить relay/worker defaults на sequence runtime
3. Suppress-ить legacy intermediate article fanout
4. Оставить legacy consumers только как explicit opt-in compatibility path
5. Прогнать cutover-specific unit + typecheck + compose smokes
6. После green proof убрать старый default routing/consumers

1. CRUD для sequences
2. Run management (запуск, отмена, статусы)
3. Plugin catalog endpoint
4. **Proof:** API smoke тесты

### Stage 6: Cron + Scheduling

**Цель:** Периодические запуски.

1. BullMQ JobScheduler для cron sequences
2. Bootstrap из БД при старте worker'а
3. **Proof:** cron smoke тест

### Stage 7: Content Enrichment Plugins

**Цель:** Работающий content enrichment pipeline.

1. `ArticleLoaderPlugin`
2. `ArticleEnricherPlugin`
3. **Proof:** enrichment end-to-end тест

### Stage 8: Agent Integration

**Цель:** LLM agent, который строит и запускает sequences.

1. Agent service / endpoint
2. Plugin catalog → LLM tool descriptions
3. Iterative execution loop
4. **Proof:** agent создаёт и запускает discovery sequence по гипотезе

---

## 20. Диаграммы

### 20.1 До и после: маршрутизация events

```
БЫЛО:
  outbox event → relay → buildOutboxEventQueueMap() → q.normalize → worker
                                                    → relay → q.dedup → worker
                                                    → relay → q.embed → worker
                                                    → ... (6+ hops через outbox/relay)

СТАЛО:
  outbox event → relay → sequence lookup → q.sequence → Sequence Runner
                                                        → Normalize → Dedup → Embed → ... (всё в одном run)
```

### 20.2 Жизненный цикл Sequence

```
     ┌───────┐
     │ draft │ ← создана, TaskGraph задан
     └───┬───┘
         │ activate
     ┌───▼────┐
     │ active │ ← готова к запуску (manual / cron / event trigger)
     └───┬────┘
         │                              ┌──────────────────────┐
         │ run                          │     Sequence Run     │
         │──────────────────────────────┤                      │
         │                              │  pending → running   │
         │                              │  → completed/failed  │
         │                              └──────────────────────┘
         │ archive
     ┌───▼──────┐
     │ archived │ ← деактивирована
     └──────────┘
```

### 20.3 Sequence Run — внутренний процесс

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                     Sequence Run                                 │
  │                                                                  │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐       ┌──────────┐   │
  │  │Normalize │─►│ Dedup    │─►│ Embed    │─►...─►│ Notify   │   │
  │  └──────────┘  └──────────┘  └──────────┘       └──────────┘   │
  │                                                                  │
  │  Context: {doc_id} → +normalized → +deduped → +embedded → ...   │
  └─────────────────────────────────────────────────────────────────┘

  При Dedup → duplicate:

  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────┐
  │Normalize │─►│ Dedup    │  │ Embed    │  │ Match... │  │Notify│
  │completed │  │completed │  │ SKIPPED  │  │ SKIPPED  │  │SKIP  │
  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────┘
                 _stop=true
                 run.status = "completed" (early termination)
```

### 20.4 Полная системная диаграмма (после миграции)

```
┌──────────────────────────────────────────────────────────────────────┐
│                           NewsPortal                                  │
│                                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────────────────┐    │
│  │ apps/web │  │apps/admin│  │  services/api (FastAPI)           │    │
│  │(Astro)   │  │(Astro)   │  │                                   │    │
│  └──────────┘  └──────────┘  │  /api/articles, /api/interests   │    │
│                               │  /maintenance/sequences ← NEW    │    │
│                               │  /maintenance/sequences/:id/runs  │    │
│                               │  /maintenance/sequence-plugins    │    │
│                               └──────────┬───────────────────────┘    │
│                                          │                            │
│  ┌───────────────┐            ┌──────────▼──────────┐                │
│  │ services/     │            │     PostgreSQL       │                │
│  │ fetchers      │──insert──►│                      │                │
│  │ (TypeScript)  │ articles + │  sequences    ← NEW │                │
│  │               │ outbox     │  sequence_runs← NEW │                │
│  │ RSS / IMAP    │            │  seq_task_runs← NEW │                │
│  └───────────────┘            │  articles            │                │
│                               │  outbox_events       │                │
│                               │  source_channels     │                │
│                               │  ...                 │                │
│                               └──────────┬──────────┘                │
│                                          │                            │
│  ┌──────────────────┐         ┌──────────▼──────────┐                │
│  │ services/relay    │◄─poll──│  outbox_events       │                │
│  │ (TypeScript)      │        └─────────────────────┘                │
│  │                   │                                                │
│  │ event → sequence  │────────────────────┐                          │
│  │ lookup + dispatch │                    ▼                          │
│  └──────────────────┘         ┌───────────────────────┐              │
│                               │   Redis / BullMQ       │              │
│                               │   q.sequence           │              │
│                               └───────────┬───────────┘              │
│                                           │                          │
│                               ┌───────────▼───────────┐              │
│                               │  Sequence Runner       │              │
│                               │  (Python)              │              │
│                               │                        │              │
│                               │  22 plugins:           │              │
│                               │   12 pipeline          │              │
│                               │   10 discovery/enrich  │              │
│                               │                        │              │
│                               │  Executes TaskGraphs   │              │
│                               │  from sequences table  │              │
│                               └────────────────────────┘              │
└──────────────────────────────────────────────────────────────────────┘

Нет 12 отдельных очередей. Один q.sequence. Один runner. 22 плагина.
```

---

## 21. Приложения

### Приложение А. Сравнение с Customer Screener (reference)

| Аспект | Customer Screener | NewsPortal Task Engine (MVP) |
|--------|------------------|------------------------------|
| Граф задач | DAG с ветвлениями, conditional edges | Линейная последовательность |
| Условия | Jexl expressions на рёбрах | `_stop` для early termination |
| UI | ReactFlow визуальный редактор | API only |
| Плагины (язык) | TypeScript (npm packages) | Python (модули внутри workers) |
| Данные между задачами | `{ articles: [...] }` — единый формат | `context: dict` — произвольный dict |
| Очереди | Отдельная очередь на каждый module | Одна общая очередь `q.sequence` |
| Scheduling | BullMQ JobScheduler + cron | BullMQ JobScheduler + cron |
| Замена pipeline | Нет (standalone) | Да — полная замена article processing pipeline |

### Приложение Б. Маппинг старых workers → новых плагинов

| Старый worker (main.py) | Queue | Новый плагин | Module name |
|--------------------------|-------|-------------|-------------|
| `process_normalize()` | `q.normalize` | `NormalizePlugin` | `Normalize` |
| `process_dedup()` | `q.dedup` | `DedupPlugin` | `Dedup` |
| `process_embed()` | `q.embed` | `EmbedPlugin` | `Embed` |
| `process_match_criteria()` | `q.match.criteria` | `MatchCriteriaPlugin` | `MatchCriteria` |
| `process_cluster()` | `q.cluster` | `ClusterPlugin` | `Cluster` |
| `process_match_interests()` | `q.match.interests` | `MatchInterestsPlugin` | `MatchInterests` |
| `process_notify()` | `q.notify` | `NotifyPlugin` | `Notify` |
| `process_llm_review()` | `q.llm.review` | `LlmReviewPlugin` | `LlmReview` |
| `process_feedback_ingest()` | `q.feedback.ingest` | `FeedbackIngestPlugin` | `FeedbackIngest` |
| `process_reindex()` | `q.reindex` | `ReindexPlugin` | `Reindex` |
| `process_interest_compile()` | `q.interest.compile` | `InterestCompilePlugin` | `InterestCompile` |
| `process_criterion_compile()` | `q.criterion.compile` | `CriterionCompilePlugin` | `CriterionCompile` |

### Приложение В. Ограничения MVP

1. **Только линейные последовательности** — нет ветвлений, параллельных веток, conditional edges
2. **Нет UI** — управление только через API
3. **Нет версионирования** sequences — при обновлении TaskGraph перезаписывается
4. **Нет partial restart** — при ошибке нужно перезапускать всю sequence
5. **Одна очередь** — все sequences выполняются в `q.sequence`
6. **Нет approval gates** — нельзя поставить задачу на паузу и ждать human approval

### Приложение Г. Post-MVP расширения

1. **DAG с ветвлениями** — conditional edges, параллельные ветки
2. **Visual editor** — ReactFlow в admin panel
3. **Agent-построитель** — LLM генерирует TaskGraph
4. **Approval gates** — human-in-the-loop
5. **Partial restart** — продолжение с failed задачи
6. **Priority queues** — разные приоритеты
7. **Sequence templates** — шаблоны часто используемых последовательностей
8. **Context schema validation** — проверка совместимости inputs/outputs
9. **Metrics and dashboards** — статистика
