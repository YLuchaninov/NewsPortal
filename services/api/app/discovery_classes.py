from __future__ import annotations

import json
from typing import Any, Callable


class DiscoveryClassConflict(ValueError):
    pass


class DiscoveryClassNotFound(LookupError):
    pass


class DiscoveryClassValidation(ValueError):
    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


def create_discovery_class(
    payload: Any,
    *,
    get_discovery_class_func: Callable[[str], dict[str, Any]],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> dict[str, Any]:
    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into discovery_hypothesis_classes (
                  class_key,
                  display_name,
                  description,
                  status,
                  generation_backend,
                  default_provider_types,
                  prompt_instructions,
                  seed_rules_json,
                  max_per_mission,
                  sort_order,
                  config_json
                )
                values (
                  %s,
                  %s,
                  %s,
                  %s,
                  %s,
                  %s::text[],
                  %s,
                  %s::jsonb,
                  %s,
                  %s,
                  %s::jsonb
                )
                returning class_key
                """,
                (
                    payload.class_key,
                    payload.display_name,
                    payload.description,
                    payload.status,
                    payload.generation_backend,
                    payload.default_provider_types,
                    payload.prompt_instructions,
                    json.dumps(payload.seed_rules_json),
                    payload.max_per_mission,
                    payload.sort_order,
                    json.dumps(payload.config_json),
                ),
            )
            row = cursor.fetchone()
    if row is None:
        raise DiscoveryClassConflict("Discovery class creation did not return a row.")
    return get_discovery_class_func(str(row["class_key"]))


def update_discovery_class(
    class_key: str,
    payload: Any,
    *,
    get_discovery_class_func: Callable[[str], dict[str, Any]],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> dict[str, Any]:
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise DiscoveryClassValidation(
            ["At least one field must be provided for class update."]
        )
    assignments: list[str] = []
    params: list[Any] = []
    for field_name, column_name, cast_suffix, as_json in (
        ("display_name", "display_name", "", False),
        ("description", "description", "", False),
        ("status", "status", "", False),
        ("generation_backend", "generation_backend", "", False),
        ("default_provider_types", "default_provider_types", "::text[]", False),
        ("prompt_instructions", "prompt_instructions", "", False),
        ("seed_rules_json", "seed_rules_json", "::jsonb", True),
        ("max_per_mission", "max_per_mission", "", False),
        ("sort_order", "sort_order", "", False),
        ("config_json", "config_json", "::jsonb", True),
    ):
        if field_name in values:
            assignments.append(f"{column_name} = %s{cast_suffix}")
            params.append(json.dumps(values[field_name]) if as_json else values[field_name])
    assignments.append("updated_at = now()")
    params.append(class_key)
    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update discovery_hypothesis_classes
                set {', '.join(assignments)}
                where class_key = %s
                returning class_key
                """,
                tuple(params),
            )
            row = cursor.fetchone()
    if row is None:
        raise DiscoveryClassNotFound(f"Discovery class {class_key} was not found.")
    return get_discovery_class_func(class_key)


def delete_discovery_class(
    class_key: str,
    *,
    get_discovery_class_func: Callable[[str], dict[str, Any]],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> dict[str, Any]:
    get_discovery_class_func(class_key)
    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select count(*)::int as hypothesis_count
                from discovery_hypotheses
                where class_key = %s
                """,
                (class_key,),
            )
            blocker_row = cursor.fetchone() or {}
            if int(blocker_row.get("hypothesis_count") or 0) > 0:
                raise DiscoveryClassConflict(
                    "Discovery class already has generated hypotheses. Archive it instead of deleting it."
                )
            cursor.execute(
                """
                delete from discovery_hypothesis_classes
                where class_key = %s
                returning class_key
                """,
                (class_key,),
            )
            row = cursor.fetchone()
    if row is None:
        raise DiscoveryClassNotFound(f"Discovery class {class_key} was not found.")
    return {"class_key": str(row["class_key"]), "deleted": True}
