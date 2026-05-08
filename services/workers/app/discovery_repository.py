from __future__ import annotations

from typing import NoReturn

from .discovery_v3_repository import DiscoveryV3Repository


class LegacyDiscoveryRuntimeRemoved(RuntimeError):
    """Raised when old mission/recall discovery repository code is invoked after v3 cutover."""


def _raise_removed() -> NoReturn:
    raise LegacyDiscoveryRuntimeRemoved(
        "Legacy mission/recall discovery repository was removed by the resilient discovery v3 "
        "cutover. Use DiscoveryV3Repository and discovery_v3_orchestrator instead."
    )


class DiscoveryCoordinatorRepository:
    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _raise_removed()


__all__ = [
    "DiscoveryCoordinatorRepository",
    "DiscoveryV3Repository",
    "LegacyDiscoveryRuntimeRemoved",
]
