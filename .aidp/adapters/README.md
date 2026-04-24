# Router Presets

Этот каталог содержит тонкие router-presets для разных AI-инструментов.
Они не являются канонической runtime-истиной и только направляют инструмент к `.aidp/*`.

## Доступные presets

- `presets/common/AGENTS.md`
- `presets/claude/CLAUDE.md`
- `presets/cursor/AGENTS.md`
- `presets/codex/AGENTS.md`
- `presets/copilot/.github/copilot-instructions.md`

## Правило materialization

По умолчанию материализуй только тот preset, который нужен реально используемому инструменту.
Если целевой tool-facing файл уже существует и содержит правдивые инструкции, не перезаписывай его вслепую: внеси только тонкое AIDP-router поведение.

После materialization router остается указателем. Долговечная repository-specific истина все равно принадлежит только `.aidp/*`.
