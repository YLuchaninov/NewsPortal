from __future__ import annotations

import argparse
import asyncio
import json
import logging

from .config import load_indexer_config
from .store import InterestCentroidIndexer


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="NewsPortal phase-3 indexer tools")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("rebuild-interest-centroids")
    subparsers.add_parser("rebuild-event-cluster-centroids")
    subparsers.add_parser("check-interest-centroids")
    subparsers.add_parser("check-event-cluster-centroids")
    return parser


async def run() -> int:
    args = build_parser().parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    indexer = InterestCentroidIndexer(load_indexer_config())

    if args.command == "rebuild-interest-centroids":
        result = await indexer.rebuild_interest_centroids()
        print(json.dumps(result, ensure_ascii=True))
        return 0

    if args.command == "rebuild-event-cluster-centroids":
        result = await indexer.rebuild_event_cluster_centroids()
        print(json.dumps(result, ensure_ascii=True))
        return 0

    if args.command == "check-interest-centroids":
        result = await indexer.check_interest_centroids()
        print(json.dumps(result, ensure_ascii=True))
        return 0 if result["isConsistent"] else 1

    if args.command == "check-event-cluster-centroids":
        result = await indexer.check_event_cluster_centroids()
        print(json.dumps(result, ensure_ascii=True))
        return 0 if result["isConsistent"] else 1

    raise ValueError(f"Unsupported command: {args.command}")


def main() -> None:
    raise SystemExit(asyncio.run(run()))


if __name__ == "__main__":
    main()
