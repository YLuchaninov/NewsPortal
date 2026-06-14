from __future__ import annotations

import argparse
import json
from collections.abc import Awaitable, Callable, Mapping
from typing import Any


SmokeCommand = Callable[[], Awaitable[dict[str, Any]]]


def build_smoke_parser(command_names: list[str]) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="SignalOps worker smoke commands")
    subparsers = parser.add_subparsers(dest="command", required=True)
    for name in command_names:
        subparsers.add_parser(name)
    return parser


async def run_smoke_cli(commands: Mapping[str, SmokeCommand]) -> int:
    args = build_smoke_parser(sorted(commands)).parse_args()
    command = commands.get(args.command)
    if command is None:
        raise RuntimeError(f"Unknown worker smoke command: {args.command}")
    result = await command()
    print(json.dumps(result, ensure_ascii=True))
    return 0
