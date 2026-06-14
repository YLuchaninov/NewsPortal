from __future__ import annotations

import asyncio
from typing import Awaitable, Callable

from infra.scripts.workers.smoke_cli import run_smoke_cli
from infra.scripts.workers.smoke_fixtures import verify_system_feed_result_consistency
from infra.scripts.workers.smoke_handlers import (
    run_cluster_match_notify_smoke,
    run_criterion_compile_smoke,
    run_discovery_enabled_smoke,
    run_embed_smoke,
    run_interest_compile_smoke,
    run_llm_budget_stop_smoke,
    run_llm_cost_proof_smoke,
    run_normalize_dedup_smoke,
    run_reindex_backfill_smoke,
)

SmokeCommand = Callable[[], Awaitable[dict[str, object]]]

SMOKE_COMMANDS: dict[str, SmokeCommand] = {
    "normalize-dedup": run_normalize_dedup_smoke,
    "embed": run_embed_smoke,
    "interest-compile": run_interest_compile_smoke,
    "criterion-compile": run_criterion_compile_smoke,
    "cluster-match-notify": run_cluster_match_notify_smoke,
    "discovery-enabled": run_discovery_enabled_smoke,
    "llm-budget-stop": run_llm_budget_stop_smoke,
    "llm-cost-proof": run_llm_cost_proof_smoke,
    "reindex-backfill": run_reindex_backfill_smoke,
}


async def run() -> int:
    return await run_smoke_cli(SMOKE_COMMANDS)


def main() -> None:
    raise SystemExit(asyncio.run(run()))


__all__ = ["SMOKE_COMMANDS", "main", "run", "verify_system_feed_result_consistency"]


if __name__ == "__main__":
    main()
