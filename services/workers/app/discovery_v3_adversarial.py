from __future__ import annotations

import inspect
from collections import Counter
from typing import Any, Awaitable, Callable

from .discovery_v3_referee import decide_pack
from .discovery_v3_repair import repair_hypothesis_pack
from .discovery_v3_settings import DiscoveryV3Settings
from .discovery_v3_skeptic import normalize_skeptic_output


AsyncOrSync = Callable[..., Any | Awaitable[Any]]


async def _maybe_await(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


def _critique_types(critique: dict[str, Any]) -> list[str]:
    return [
        str(item.get("riskType") or "")
        for item in list(critique.get("critiques") or [])
        if isinstance(item, dict) and item.get("riskType")
    ]


async def refine_hypothesis_pack(
    input_payload: dict[str, Any],
    *,
    explorer: AsyncOrSync,
    skeptic_review: AsyncOrSync,
    skeptic_verify: AsyncOrSync,
    settings: DiscoveryV3Settings | None = None,
) -> dict[str, Any]:
    effective_settings = settings or DiscoveryV3Settings()
    explorer_pack = await _maybe_await(explorer(input_payload))
    current_pack = dict(explorer_pack or {})
    debate_log: list[dict[str, Any]] = []
    total_added = 0
    repeated_types: Counter[str] = Counter()

    for round_index in range(effective_settings.max_full_repair_rounds):
        critique = normalize_skeptic_output(
            await _maybe_await(
                skeptic_review(
                    {
                        "input": input_payload,
                        "hypothesisPack": current_pack,
                        "roundIndex": round_index,
                    }
                )
            )
        )
        debate_log.append({"round": round_index, "critique": critique})
        repeated_types.update(_critique_types(critique))

        if critique["decision"] in {"accept", "reject", "manual_review"}:
            break
        if critique["decision"] != "repair_required":
            break

        repaired_pack = repair_hypothesis_pack(
            current_pack,
            critique,
            effective_settings,
            total_added_so_far=total_added,
        )
        total_added += int(repaired_pack.get("repairMeta", {}).get("addedCount") or 0)
        current_pack = repaired_pack

        meaningful_change = float(current_pack.get("repairMeta", {}).get("meaningfulChangeScore") or 0)
        if meaningful_change < effective_settings.min_meaningful_change_score:
            break
        if any(
            count >= effective_settings.max_repeated_critique_types
            for count in repeated_types.values()
        ):
            break

    verification = normalize_skeptic_output(
        await _maybe_await(
            skeptic_verify(
                {
                    "input": input_payload,
                    "hypothesisPack": current_pack,
                    "debateLog": debate_log,
                }
            )
        )
    )
    if (
        effective_settings.force_manual_review_on_persistent_disagreement
        and float(verification.get("disagreementScore") or 0) >= 0.65
    ):
        for hypothesis in list(current_pack.get("hypotheses") or []):
            if isinstance(hypothesis, dict):
                hypothesis["refereeDecision"] = "manual_review"
                hypothesis["refereeReason"] = "persistent_disagreement"
        return {**current_pack, "debateLog": debate_log, "verification": verification}

    final_pack = decide_pack(current_pack, verification)
    return {**final_pack, "debateLog": debate_log, "verification": verification}
