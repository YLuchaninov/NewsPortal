from __future__ import annotations

import abc
from typing import Any, Mapping


class TaskPlugin(abc.ABC):
    """Base class for sequence-executed plugins."""

    name: str
    description: str
    category: str

    @abc.abstractmethod
    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute the task and return context updates."""

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        return []

    def describe_outputs(self) -> dict[str, str]:
        return {}

    def describe_inputs(self) -> dict[str, str]:
        return {}

    async def on_before_execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> None:
        return None

    async def on_after_execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
        result: dict[str, Any],
    ) -> None:
        return None

    async def on_error(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
        error: Exception,
    ) -> None:
        return None


class TaskPluginRegistry:
    """Central registry of available task plugins."""

    def __init__(self) -> None:
        self._plugins: dict[str, type[TaskPlugin]] = {}

    def register(self, plugin_class: type[TaskPlugin]) -> None:
        plugin_name = getattr(plugin_class, "name", None)
        if not plugin_name:
            raise ValueError("Task plugins must define a non-empty name.")

        existing = self._plugins.get(plugin_name)
        if existing and existing is not plugin_class:
            raise ValueError(f"Plugin {plugin_name} is already registered.")

        self._plugins[plugin_name] = plugin_class

    def get(self, module: str) -> type[TaskPlugin]:
        try:
            return self._plugins[module]
        except KeyError as error:
            raise KeyError(f"Unknown task plugin module {module}.") from error

    def create(self, module: str) -> TaskPlugin:
        return self.get(module)()

    def list_all(self) -> list[dict[str, Any]]:
        metadata: list[dict[str, Any]] = []

        for module, plugin_class in sorted(self._plugins.items()):
            plugin = plugin_class()
            metadata.append(
                {
                    "module": module,
                    "description": plugin.description,
                    "category": plugin.category,
                    "inputs": plugin.describe_inputs(),
                    "outputs": plugin.describe_outputs(),
                }
            )

        return metadata

    def validate_task_graph(self, task_graph: list[dict[str, Any]] | list[Mapping[str, Any]]) -> list[str]:
        errors: list[str] = []
        seen_keys: set[str] = set()

        for index, node in enumerate(task_graph):
            if not isinstance(node, Mapping):
                errors.append(f"Task at index {index} must be an object.")
                continue

            key_value = node.get("key")
            module_value = node.get("module")
            options_value = node.get("options", {})

            if not isinstance(key_value, str) or not key_value:
                errors.append(f"Task at index {index} must declare a non-empty key.")
            elif key_value in seen_keys:
                errors.append(f"Task key {key_value} is duplicated.")
            else:
                seen_keys.add(key_value)

            if not isinstance(module_value, str) or not module_value:
                errors.append(f"Task {key_value or index} must declare a non-empty module.")
                continue

            if module_value not in self._plugins:
                errors.append(f"Task {key_value or index} references unknown module {module_value}.")
                continue

            if not isinstance(options_value, Mapping):
                errors.append(f"Task {key_value or index} options must be an object.")
                continue

            plugin = self._plugins[module_value]()
            for validation_error in plugin.validate_options(dict(options_value)):
                errors.append(f"Task {key_value or index}: {validation_error}")

        return errors


TASK_REGISTRY = TaskPluginRegistry()
