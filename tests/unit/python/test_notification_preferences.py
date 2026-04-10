import unittest

from services.workers.app.notification_preferences import (
    is_channel_enabled_by_preferences,
    normalize_notification_preferences,
)


class NotificationPreferencesTests(unittest.TestCase):
    def test_normalize_notification_preferences_applies_truthful_defaults(self) -> None:
        self.assertEqual(
            normalize_notification_preferences(
                {
                    "web_push": False,
                    "telegram": True,
                }
            ),
            {
                "web_push": False,
                "telegram": True,
            },
        )

    def test_channel_filter_uses_immediate_channel_preferences_only(self) -> None:
        preferences = {
            "web_push": True,
            "telegram": False,
        }

        self.assertTrue(is_channel_enabled_by_preferences("web_push", preferences))
        self.assertFalse(is_channel_enabled_by_preferences("telegram", preferences))
        self.assertTrue(is_channel_enabled_by_preferences("email_digest", preferences))


if __name__ == "__main__":
    unittest.main()
