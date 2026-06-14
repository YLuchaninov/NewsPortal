from __future__ import annotations

import abc
import json
from typing import Any, Mapping

from pydantic import ValidationError

from .exceptions import TaskExecutionError
from .models import (
    TaskDefinitionPayload,
    format_task_definition_validation_errors,
)
from .plugin_contracts import TaskPluginContract, TaskPluginOutputCaps

DEFAULT_PLUGIN_OUTPUT_CAPS = TaskPluginOutputCaps()


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

    def options_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "additionalProperties": True,
        }

    def context_schema(self) -> dict[str, Any]:
        inputs = self.describe_inputs()
        return {
            "type": "object",
            "properties": {key: {"description": description} for key, description in inputs.items()},
            "required": self.context_requirements(),
            "additionalProperties": True,
        }

    def output_schema(self) -> dict[str, Any]:
        outputs = self.describe_outputs()
        return {
            "type": "object",
            "properties": {key: {"description": description} for key, description in outputs.items()},
            "additionalProperties": True,
        }

    def context_requirements(self) -> list[str]:
        return sorted(self.describe_inputs())

    def output_caps(self) -> TaskPluginOutputCaps:
        return DEFAULT_PLUGIN_OUTPUT_CAPS

    def retry_classification(self) -> str:
        return "task_retry_with_transient_database_retry"

    def error_codes(self) -> list[str]:
        return []

    def contract(self) -> TaskPluginContract:
        return TaskPluginContract(
            module=self.name,
            category=self.category,
            description=self.description,
            options_schema=self.options_schema(),
            context_schema=self.context_schema(),
            context_requirements=self.context_requirements(),
            output_schema=self.output_schema(),
            output_caps=self.output_caps(),
            retry_classification=self.retry_classification(),
            error_codes=self.error_codes(),
        )

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
                    "contract": plugin.contract().model_dump(mode="json"),
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
            try:
                task_payload = TaskDefinitionPayload.model_validate(node)
            except ValidationError as error:
                for validation_error in format_task_definition_validation_errors(error):
                    errors.append(f"Task at index {index}: {validation_error}.")
                continue

            key_value = node.get("key")
            module_value = node.get("module")
            options_value = task_payload.options

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
            for validation_error in validate_plugin_options_contract(plugin, dict(options_value)):
                errors.append(f"Task {key_value or index}: {validation_error}")

        return errors


TASK_REGISTRY = TaskPluginRegistry()


def validate_plugin_options_contract(plugin: TaskPlugin, options: Mapping[str, Any]) -> list[str]:
    if not isinstance(options, Mapping):
        return ["options must be an object."]
    return plugin.validate_options(dict(options))


def require_valid_plugin_options(plugin: TaskPlugin, options: Mapping[str, Any]) -> None:
    errors = validate_plugin_options_contract(plugin, options)
    if errors:
        raise TaskExecutionError(
            f"Task plugin {plugin.name} received invalid options: {'; '.join(errors)}",
            retryable=False,
            error_code="task_plugin.invalid_options",
            retry_hint="after_operator_fix",
        )


def validate_plugin_output_contract(plugin: TaskPlugin, result: Mapping[str, Any]) -> None:
    contract = plugin.contract()
    caps = contract.output_caps
    if len(result) > caps.max_keys:
        raise TaskExecutionError(
            f"Task plugin {plugin.name} returned {len(result)} output keys; "
            f"max is {caps.max_keys}.",
            retryable=False,
            error_code="task_plugin.output_too_many_keys",
            retry_hint="after_operator_fix",
        )

    try:
        encoded = json.dumps(result, default=str, ensure_ascii=False).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise TaskExecutionError(
            f"Task plugin {plugin.name} returned non-serializable output.",
            retryable=False,
            error_code="task_plugin.output_not_serializable",
            retry_hint="after_operator_fix",
        ) from error

    if len(encoded) > caps.max_json_bytes:
        raise TaskExecutionError(
            f"Task plugin {plugin.name} returned {len(encoded)} output bytes; "
            f"max is {caps.max_json_bytes}.",
            retryable=False,
            error_code="task_plugin.output_too_large",
            retry_hint="after_operator_fix",
        )
