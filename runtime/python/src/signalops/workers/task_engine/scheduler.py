from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Protocol

from .models import SequenceDefinition


UTC = timezone.utc
_CRON_FIELD_LIMITS = (
    ("minute", 0, 59),
    ("hour", 0, 23),
    ("day_of_month", 1, 31),
    ("month", 1, 12),
    ("day_of_week", 0, 6),
)
_MONTH_ALIASES = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}
_WEEKDAY_ALIASES = {
    "sun": 0,
    "mon": 1,
    "tue": 2,
    "wed": 3,
    "thu": 4,
    "fri": 5,
    "sat": 6,
}


class SequenceCronRepository(Protocol):
    async def list_active_cron_sequences(self) -> list[SequenceDefinition]: ...

    async def create_pending_cron_run(
        self,
        *,
        sequence_id: str,
        scheduled_for: datetime,
        trigger_meta: dict[str, Any],
    ) -> str | None: ...

    async def mark_run_failed(
        self,
        run_id: str,
        *,
        context_json: dict[str, Any],
        error_text: str,
    ) -> None: ...


@dataclass(frozen=True)
class CronField:
    values: frozenset[int]
    wildcard: bool


@dataclass(frozen=True)
class CronExpression:
    raw: str
    minute: CronField
    hour: CronField
    day_of_month: CronField
    month: CronField
    day_of_week: CronField

    def matches(self, when: datetime) -> bool:
        moment = when.astimezone(UTC).replace(second=0, microsecond=0)
        cron_weekday = (moment.weekday() + 1) % 7
        minute_match = moment.minute in self.minute.values
        hour_match = moment.hour in self.hour.values
        month_match = moment.month in self.month.values
        day_match = moment.day in self.day_of_month.values
        weekday_match = cron_weekday in self.day_of_week.values

        if self.day_of_month.wildcard and self.day_of_week.wildcard:
            calendar_match = True
        elif self.day_of_month.wildcard:
            calendar_match = weekday_match
        elif self.day_of_week.wildcard:
            calendar_match = day_match
        else:
            calendar_match = day_match or weekday_match

        return minute_match and hour_match and month_match and calendar_match


def parse_cron_expression(expression: str) -> CronExpression:
    normalized = expression.strip()
    parts = normalized.split()
    if len(parts) != 5:
        raise ValueError("Cron expression must contain exactly five fields.")

    fields: list[CronField] = []
    for (field_name, minimum, maximum), raw_part in zip(_CRON_FIELD_LIMITS, parts, strict=True):
        aliases = None
        if field_name == "month":
            aliases = _MONTH_ALIASES
        elif field_name == "day_of_week":
            aliases = _WEEKDAY_ALIASES
        allow_seven = field_name == "day_of_week"
        fields.append(
            _parse_cron_field(
                raw_part,
                field_name=field_name,
                minimum=minimum,
                maximum=maximum,
                aliases=aliases,
                allow_day_of_week_seven=allow_seven,
            )
        )

    return CronExpression(
        raw=normalized,
        minute=fields[0],
        hour=fields[1],
        day_of_month=fields[2],
        month=fields[3],
        day_of_week=fields[4],
    )


def _parse_cron_field(
    raw: str,
    *,
    field_name: str,
    minimum: int,
    maximum: int,
    aliases: dict[str, int] | None,
    allow_day_of_week_seven: bool,
) -> CronField:
    text = raw.strip().lower()
    if not text:
        raise ValueError(f"Cron {field_name} field must not be empty.")

    if text == "*":
        return CronField(values=frozenset(range(minimum, maximum + 1)), wildcard=True)

    values: set[int] = set()
    for chunk in text.split(","):
        chunk = chunk.strip()
        if not chunk:
            raise ValueError(f"Cron {field_name} field contains an empty list entry.")

        if "/" in chunk:
            base, step_text = chunk.split("/", 1)
            if not step_text.isdigit() or int(step_text) <= 0:
                raise ValueError(f"Cron {field_name} field has an invalid step value.")
            step = int(step_text)
        else:
            base = chunk
            step = 1

        if base == "*":
            start = minimum
            end = maximum
        elif "-" in base:
            left, right = base.split("-", 1)
            start = _parse_cron_atom(
                left,
                field_name=field_name,
                minimum=minimum,
                maximum=maximum,
                aliases=aliases,
                allow_day_of_week_seven=allow_day_of_week_seven,
            )
            end = _parse_cron_atom(
                right,
                field_name=field_name,
                minimum=minimum,
                maximum=maximum,
                aliases=aliases,
                allow_day_of_week_seven=allow_day_of_week_seven,
            )
            if start > end:
                raise ValueError(f"Cron {field_name} field range must be ascending.")
        else:
            start = _parse_cron_atom(
                base,
                field_name=field_name,
                minimum=minimum,
                maximum=maximum,
                aliases=aliases,
                allow_day_of_week_seven=allow_day_of_week_seven,
            )
            end = start

        for value in range(start, end + 1, step):
            if allow_day_of_week_seven and value == 7:
                value = 0
            values.add(value)

    if not values:
        raise ValueError(f"Cron {field_name} field resolved to an empty set.")

    return CronField(values=frozenset(values), wildcard=False)


def _parse_cron_atom(
    raw: str,
    *,
    field_name: str,
    minimum: int,
    maximum: int,
    aliases: dict[str, int] | None,
    allow_day_of_week_seven: bool,
) -> int:
    text = raw.strip().lower()
    if aliases and text in aliases:
        return aliases[text]

    if not text.isdigit():
        raise ValueError(f"Cron {field_name} field contains unsupported token {raw!r}.")

    value = int(text)
    if allow_day_of_week_seven and value == 7:
        return 7
    if value < minimum or value > maximum:
        raise ValueError(
            f"Cron {field_name} field value {value} is outside the supported range {minimum}-{maximum}."
        )
    return value


class SequenceCronScheduler:
    def __init__(
        self,
        *,
        repository: SequenceCronRepository,
        enqueue_run: Callable[[str, str], Awaitable[None]],
        now: Callable[[], datetime] | None = None,
        sleep: Callable[[float], Awaitable[None]] | None = None,
        poll_interval_seconds: float = 30.0,
    ):
        self._repository = repository
        self._enqueue_run = enqueue_run
        self._now = now or (lambda: datetime.now(tz=UTC))
        self._sleep = sleep or asyncio.sleep
        self._poll_interval_seconds = max(1.0, float(poll_interval_seconds))

    async def tick(self) -> list[dict[str, Any]]:
        scheduled_for = self._current_minute()
        outcomes: list[dict[str, Any]] = []

        for sequence in await self._repository.list_active_cron_sequences():
            cron_text = (sequence.cron or "").strip()
            if not cron_text:
                continue

            try:
                expression = parse_cron_expression(cron_text)
            except ValueError:
                continue
            if not expression.matches(scheduled_for):
                continue

            trigger_meta = {
                "source": "sequence_cron_scheduler",
                "cron": cron_text,
                "scheduledFor": scheduled_for.isoformat(),
            }
            run_id = await self._repository.create_pending_cron_run(
                sequence_id=sequence.sequence_id,
                scheduled_for=scheduled_for,
                trigger_meta=trigger_meta,
            )
            if run_id is None:
                continue

            try:
                await self._enqueue_run(run_id, sequence.sequence_id)
                outcomes.append(
                    {
                        "sequenceId": sequence.sequence_id,
                        "runId": run_id,
                        "status": "enqueued",
                        "scheduledFor": trigger_meta["scheduledFor"],
                    }
                )
            except Exception as error:
                await self._repository.mark_run_failed(
                    run_id,
                    context_json={},
                    error_text=f"Cron dispatch failed: {error}",
                )
                outcomes.append(
                    {
                        "sequenceId": sequence.sequence_id,
                        "runId": run_id,
                        "status": "failed_dispatch",
                        "error": str(error),
                        "scheduledFor": trigger_meta["scheduledFor"],
                    }
                )

        return outcomes

    async def run_until_stopped(self, stop_event: asyncio.Event) -> None:
        while True:
            await self.tick()
            if stop_event.is_set():
                return
            try:
                await asyncio.wait_for(
                    stop_event.wait(),
                    timeout=self._poll_interval_seconds,
                )
            except asyncio.TimeoutError:
                continue

    def _current_minute(self) -> datetime:
        return self._now().astimezone(UTC).replace(second=0, microsecond=0)
