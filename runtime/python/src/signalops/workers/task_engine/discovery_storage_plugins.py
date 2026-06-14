from __future__ import annotations

from typing import Any

from .discovery_plugin_common import ContextTaskPlugin, _non_reserved_context
from .discovery_runtime import resolve_runtime_call


def _get_discovery_runtime() -> Any:
    from . import discovery_plugins as _registry_owner

    return _registry_owner.get_discovery_runtime()


class DbStorePlugin(ContextTaskPlugin):
    name = "utility.db_store"
    description = "Persist part of the sequence context through a pluggable storage adapter."
    category = "utility"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        payload_field = self._resolve_optional_string(
            options=options,
            context=context,
            key="payload_field",
            aliases=("payloadField",),
        )
        record_key = self._resolve_optional_string(
            options=options,
            context=context,
            key="record_key",
            aliases=("recordKey",),
        )
        if record_key is None:
            record_key_field = self._resolve_optional_string(
                options=options,
                context=context,
                key="record_key_field",
                aliases=("recordKeyField",),
            )
            if record_key_field is not None:
                record_key = self._resolve_required_string(
                    options={},
                    context=context,
                    key=record_key_field,
                )
        record_key = record_key or str(context.get("_run_id"))
        namespace = self._resolve_optional_string(
            options=options,
            context=context,
            key="namespace",
        )
        payload = options.get(
            "payload",
            context.get(payload_field) if payload_field else _non_reserved_context(context),
        )

        runtime = _get_discovery_runtime()
        receipt = await resolve_runtime_call(
            runtime.db_store.store(
                record_key=record_key,
                payload=payload,
                namespace=namespace,
            )
        )
        return {
            "stored": True,
            "store_receipt": receipt,
            "stored_record_key": record_key,
        }

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="payload_field",
            aliases=("payloadField",),
        )
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="record_key",
            aliases=("recordKey",),
        )
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="record_key_field",
            aliases=("recordKeyField",),
        )
        self._validate_optional_non_empty_string(options, errors, option_key="namespace")
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "payload_field": "Context field containing the payload to store.",
            "record_key": "Stable storage key for the persisted record.",
            "record_key_field": "Context field containing the storage key.",
            "namespace": "Optional storage namespace.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "stored": "Whether the storage adapter acknowledged the write.",
            "store_receipt": "Adapter-specific storage receipt.",
            "stored_record_key": "Record key used for the store operation.",
        }
