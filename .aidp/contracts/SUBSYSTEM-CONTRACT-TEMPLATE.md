# Шаблон deep contract подсистемы

Этот файл является шаблоном, а не repository truth. Копируй его в новый `.aidp/contracts/<subsystem>.md` только когда compact core недостаточен.

## Подсистема

- Имя:
- Владельцы кода/границ:
- Основные runtime surfaces:
- Основные файлы/пакеты:

## Почему нужен contract

Кратко объясни, какая сложность не помещается в `.aidp/blueprint.md`, `.aidp/engineering.md` и `.aidp/verification.md`.

## Ответственности

- Ответственность:
- Ответственность:
- Ответственность:

## Интерфейсы и границы

- Внешние интерфейсы:
- Внутренние интерфейсы:
- Границы, которые должны оставаться явными:
- Что не должно стать hidden coupling:

## Модель данных или состояния

- Primary durable state:
- Derived artifacts:
- Runtime/transient state:
- Migration concerns:

## Runtime и delivery concerns

- Entry points:
- Build/packaging surface:
- Environment constraints:
- Operational toggles or safe defaults:

## Риски и proof expectations

- Зона риска:
- Минимальный proof:
- Trigger для stronger proof:
- Правило cleanup или residual artifacts:

## Правила изменений

- Что не должно drift:
- Какие файлы обычно меняются вместе:
- Какие изменения требуют stronger proof или approval:
- Когда обновлять этот contract:
