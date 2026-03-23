from __future__ import annotations

from collections.abc import Mapping
from typing import Any


def normalize_notification_preferences(
    preferences: Mapping[str, Any] | None,
) -> dict[str, bool]:
    raw_preferences = preferences if isinstance(preferences, Mapping) else {}
    return {
        "web_push": raw_preferences.get("web_push") is not False,
        "telegram": raw_preferences.get("telegram") is not False,
        "weekly_email_digest": raw_preferences.get("weekly_email_digest") is not False,
    }


def is_channel_enabled_by_preferences(
    channel_type: str,
    notification_preferences: Mapping[str, bool],
) -> bool:
    if channel_type == "email_digest":
        return bool(notification_preferences.get("weekly_email_digest", True))
    return bool(notification_preferences.get(channel_type, True))
