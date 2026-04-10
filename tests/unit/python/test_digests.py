from __future__ import annotations

import unittest
from datetime import datetime, timezone

from services.workers.app.digests import (
    DigestItem,
    build_digest_subject,
    compute_next_digest_run_at,
    render_digest_html,
    render_digest_text,
)


class DigestScheduleTests(unittest.TestCase):
    def test_initial_next_run_uses_next_upcoming_local_slot(self) -> None:
        next_run = compute_next_digest_run_at(
            now=datetime(2026, 4, 4, 10, 30, tzinfo=timezone.utc),
            cadence="daily",
            timezone_name="UTC",
            send_hour=9,
            send_minute=0,
        )

        self.assertEqual(next_run.isoformat(), "2026-04-05T09:00:00+00:00")

    def test_every_three_days_reschedules_from_previous_run(self) -> None:
        next_run = compute_next_digest_run_at(
            now=datetime(2026, 4, 4, 10, 30, tzinfo=timezone.utc),
            cadence="every_3_days",
            timezone_name="UTC",
            send_hour=9,
            send_minute=0,
            base_run_at=datetime(2026, 4, 4, 9, 0, tzinfo=timezone.utc),
        )

        self.assertEqual(next_run.isoformat(), "2026-04-07T09:00:00+00:00")

    def test_monthly_reschedule_preserves_wall_clock_time(self) -> None:
        next_run = compute_next_digest_run_at(
            now=datetime(2026, 1, 31, 12, 0, tzinfo=timezone.utc),
            cadence="monthly",
            timezone_name="UTC",
            send_hour=8,
            send_minute=15,
            base_run_at=datetime(2026, 1, 31, 8, 15, tzinfo=timezone.utc),
        )

        self.assertEqual(next_run.isoformat(), "2026-02-28T08:15:00+00:00")

    def test_dst_transition_keeps_local_send_time(self) -> None:
        next_run = compute_next_digest_run_at(
            now=datetime(2026, 3, 28, 8, 0, tzinfo=timezone.utc),
            cadence="daily",
            timezone_name="Europe/Warsaw",
            send_hour=9,
            send_minute=0,
            base_run_at=datetime(2026, 3, 28, 8, 0, tzinfo=timezone.utc),
        )

        self.assertEqual(next_run.isoformat(), "2026-03-29T07:00:00+00:00")


class DigestRenderingTests(unittest.TestCase):
    def test_digest_renderers_include_titles_and_links(self) -> None:
        items = [
            DigestItem(
                content_item_id="editorial:1",
                title="Policy update",
                url="https://example.test/policy-update",
                summary="Summary",
                source_name="Example",
                published_at="2026-04-04T09:00:00Z",
            )
        ]

        text_body = render_digest_text(
            heading="Daily digest",
            intro="Fresh matches",
            items=items,
        )
        html_body = render_digest_html(
            heading="Daily digest",
            intro="Fresh matches",
            items=items,
        )

        self.assertIn("Policy update", text_body)
        self.assertIn("https://example.test/policy-update", text_body)
        self.assertIn("Daily digest", html_body)
        self.assertIn("Policy update", html_body)
        self.assertIn("https://example.test/policy-update", html_body)

    def test_subject_builder_distinguishes_manual_and_scheduled(self) -> None:
        self.assertEqual(
            build_digest_subject(digest_kind="manual_saved", item_count=2),
            "Saved digest (2 items)",
        )
        self.assertEqual(
            build_digest_subject(
                digest_kind="scheduled_matches",
                item_count=1,
                cadence="every_3_days",
            ),
            "Your every 3 days digest (1 item)",
        )


if __name__ == "__main__":
    unittest.main()
