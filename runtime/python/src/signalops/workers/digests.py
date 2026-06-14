from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import html
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


DIGEST_CADENCES = {"daily", "every_3_days", "weekly", "monthly"}
DEFAULT_DIGEST_CADENCE = "weekly"
DEFAULT_DIGEST_SEND_HOUR = 9
DEFAULT_DIGEST_SEND_MINUTE = 0


@dataclass(frozen=True)
class DigestItem:
    content_item_id: str
    title: str
    url: str | None
    summary: str | None
    source_name: str | None
    published_at: str | None


def coerce_digest_cadence(value: Any, default: str = DEFAULT_DIGEST_CADENCE) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in DIGEST_CADENCES:
        return normalized
    return default


def coerce_digest_send_hour(value: Any, default: int = DEFAULT_DIGEST_SEND_HOUR) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if 0 <= parsed <= 23 else default


def coerce_digest_send_minute(value: Any, default: int = DEFAULT_DIGEST_SEND_MINUTE) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if 0 <= parsed <= 59 else default


def normalize_timezone_name(value: Any) -> str | None:
    normalized = str(value or "").strip()
    return normalized or None


def validate_timezone_name(value: str | None) -> str:
    normalized = normalize_timezone_name(value)
    if not normalized:
        raise ValueError("A timezone is required.")
    try:
        ZoneInfo(normalized)
    except ZoneInfoNotFoundError as error:
        raise ValueError(f'Unsupported timezone "{normalized}".') from error
    return normalized


def _add_months(local_dt: datetime, months: int) -> datetime:
    year = local_dt.year + ((local_dt.month - 1 + months) // 12)
    month = ((local_dt.month - 1 + months) % 12) + 1
    day = min(local_dt.day, _days_in_month(year, month))
    return local_dt.replace(year=year, month=month, day=day)


def _days_in_month(year: int, month: int) -> int:
    if month == 2:
        is_leap = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
        return 29 if is_leap else 28
    if month in {4, 6, 9, 11}:
        return 30
    return 31


def compute_next_digest_run_at(
    *,
    now: datetime | None,
    cadence: str,
    timezone_name: str,
    send_hour: int,
    send_minute: int,
    base_run_at: datetime | None = None,
) -> datetime:
    tz = ZoneInfo(validate_timezone_name(timezone_name))
    normalized_now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    local_now = normalized_now.astimezone(tz)
    local_base = base_run_at.astimezone(tz) if base_run_at is not None else None
    candidate = (local_base or local_now).replace(
        hour=send_hour,
        minute=send_minute,
        second=0,
        microsecond=0,
    )

    normalized_cadence = coerce_digest_cadence(cadence)
    if local_base is None:
        if candidate <= local_now:
            candidate = candidate + timedelta(days=1)
        return candidate.astimezone(timezone.utc)

    if normalized_cadence == "daily":
        candidate = candidate + timedelta(days=1)
    elif normalized_cadence == "every_3_days":
        candidate = candidate + timedelta(days=3)
    elif normalized_cadence == "weekly":
        candidate = candidate + timedelta(days=7)
    else:
        candidate = _add_months(candidate, 1)
    return candidate.astimezone(timezone.utc)


def build_digest_subject(*, digest_kind: str, item_count: int, cadence: str | None = None) -> str:
    if digest_kind == "manual_saved":
        return f"Saved digest ({item_count} item{'s' if item_count != 1 else ''})"
    if cadence:
        cadence_label = cadence.replace("_", " ")
        return f"Your {cadence_label} digest ({item_count} item{'s' if item_count != 1 else ''})"
    return f"Your digest ({item_count} item{'s' if item_count != 1 else ''})"


def render_digest_text(
    *,
    heading: str,
    intro: str,
    items: list[DigestItem],
) -> str:
    lines = [heading, "", intro, ""]
    for index, item in enumerate(items, start=1):
        lines.append(f"{index}. {item.title}")
        if item.source_name:
            lines.append(f"   Source: {item.source_name}")
        if item.published_at:
            lines.append(f"   Published: {item.published_at}")
        if item.summary:
            lines.append(f"   {item.summary}")
        if item.url:
            lines.append(f"   {item.url}")
        lines.append("")
    return "\n".join(lines).strip()


def render_digest_html(
    *,
    heading: str,
    intro: str,
    items: list[DigestItem],
) -> str:
    rendered_items = []
    for item in items:
        source_parts = []
        if item.source_name:
            source_parts.append(html.escape(item.source_name))
        if item.published_at:
            source_parts.append(html.escape(item.published_at))
        source_line = " · ".join(source_parts)
        title_html = html.escape(item.title)
        summary_html = html.escape(item.summary or "")
        url_html = html.escape(item.url or "")
        rendered_items.append(
            """
            <article class="digest-item">
              <h2>{title}</h2>
              {meta}
              {summary}
              {link}
            </article>
            """.format(
                title=(f'<a href="{url_html}">{title_html}</a>' if url_html else title_html),
                meta=(f'<p class="meta">{source_line}</p>' if source_line else ""),
                summary=(f"<p>{summary_html}</p>" if summary_html else ""),
                link=(
                    f'<p><a href="{url_html}" target="_blank" rel="noopener noreferrer">{url_html}</a></p>'
                    if url_html
                    else ""
                ),
            ).strip()
        )

    return (
        """
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>{heading}</title>
            <style>
              :root {{
                color-scheme: light;
                --bg: #f3efe5;
                --card: #fffdf7;
                --text: #1d1f19;
                --muted: #6b6f66;
                --accent: #1f5c47;
                --border: #d9d3c4;
              }}
              body {{
                margin: 0;
                font-family: Georgia, "Times New Roman", serif;
                background: var(--bg);
                color: var(--text);
              }}
              main {{
                max-width: 860px;
                margin: 0 auto;
                padding: 32px 20px 56px;
              }}
              header {{
                margin-bottom: 24px;
              }}
              h1 {{
                margin: 0 0 12px;
                font-size: 2rem;
                line-height: 1.1;
              }}
              .intro {{
                margin: 0;
                color: var(--muted);
                line-height: 1.6;
              }}
              .digest-item {{
                margin-top: 18px;
                padding: 18px 20px;
                background: var(--card);
                border: 1px solid var(--border);
                border-radius: 18px;
              }}
              .digest-item h2 {{
                margin: 0 0 8px;
                font-size: 1.2rem;
                line-height: 1.35;
              }}
              .digest-item p {{
                margin: 8px 0 0;
                line-height: 1.6;
              }}
              .meta {{
                color: var(--muted);
                font-size: 0.95rem;
              }}
              a {{
                color: var(--accent);
              }}
            </style>
          </head>
          <body>
            <main>
              <header>
                <h1>{heading_html}</h1>
                <p class="intro">{intro_html}</p>
              </header>
              {items_html}
            </main>
          </body>
        </html>
        """
    ).format(
        heading=html.escape(heading),
        heading_html=html.escape(heading),
        intro_html=html.escape(intro),
        items_html="\n".join(rendered_items),
    )
