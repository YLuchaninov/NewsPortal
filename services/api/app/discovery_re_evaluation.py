from __future__ import annotations

from typing import Any, Awaitable, Callable


async def request_discovery_re_evaluation(
    payload: Any | None,
    *,
    discovery_coordinator_repository_factory: Callable[[], Any],
    re_evaluate_sources_func: Callable[..., Awaitable[dict[str, Any]]],
) -> dict[str, Any]:
    repository = discovery_coordinator_repository_factory()
    return await re_evaluate_sources_func(
        mission_id=(payload.mission_id if payload else None),
        repository=repository,
    )
