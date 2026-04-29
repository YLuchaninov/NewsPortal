import unittest
from unittest.mock import patch

from fastapi import HTTPException

from tests.unit.python.support.stubs import install_psycopg_stub

install_psycopg_stub()

from services.api.app import main as api_main


def _mark_resolved(row: dict[str, object]) -> dict[str, object]:
    resolved = dict(row)
    resolved["adapter_resolved"] = True
    return resolved


class ApiChannelsTests(unittest.TestCase):
    def test_list_channels_filters_provider_type_and_paginates(self) -> None:
        rows = [{"channel_id": "channel-1", "provider_type": "rss"}]
        with (
            patch.object(api_main, "query_count", return_value=4) as query_count,
            patch.object(api_main, "query_all", return_value=rows) as query_all,
            patch.object(
                api_main,
                "with_resolved_channel_adapter_fields",
                side_effect=_mark_resolved,
            ),
        ):
            result = api_main.list_channels("rss", page=2, page_size=3)

        self.assertEqual(result["total"], 4)
        self.assertEqual(result["page"], 2)
        self.assertEqual(result["pageSize"], 3)
        self.assertEqual(
            result["items"],
            [{"channel_id": "channel-1", "provider_type": "rss", "adapter_resolved": True}],
        )

        count_sql, count_params = query_count.call_args.args
        self.assertIn("from source_channels sc", count_sql)
        self.assertIn("where sc.provider_type = %s", count_sql)
        self.assertEqual(count_params, ("rss",))

        items_sql, items_params = query_all.call_args.args
        self.assertIn("left join source_channel_runtime_state scrs", items_sql)
        self.assertIn("left join lateral", items_sql)
        self.assertIn("where sc.provider_type = %s", items_sql)
        self.assertIn("limit %s", items_sql)
        self.assertIn("offset %s", items_sql)
        self.assertEqual(items_params, ("rss", 3, 3))

    def test_list_channels_without_page_returns_resolved_rows(self) -> None:
        rows = [{"channel_id": "channel-2", "provider_type": "website"}]
        with (
            patch.object(api_main, "query_all", return_value=rows) as query_all,
            patch.object(
                api_main,
                "with_resolved_channel_adapter_fields",
                side_effect=_mark_resolved,
            ),
        ):
            result = api_main.list_channels(None, page=None, page_size=None)

        self.assertEqual(
            result,
            [
                {
                    "channel_id": "channel-2",
                    "provider_type": "website",
                    "adapter_resolved": True,
                }
            ],
        )
        sql, params = query_all.call_args.args
        self.assertNotIn("limit %s", sql)
        self.assertEqual(params, ())

    def test_get_channel_404_compatibility(self) -> None:
        with patch.object(api_main, "query_one", return_value=None):
            with self.assertRaises(HTTPException) as raised:
                api_main.get_channel("missing-channel")

        self.assertEqual(raised.exception.status_code, 404)
        self.assertEqual(raised.exception.detail, "Channel not found.")

    def test_get_channel_applies_adapter_projection(self) -> None:
        with (
            patch.object(
                api_main,
                "query_one",
                return_value={"channel_id": "channel-3", "provider_type": "rss"},
            ) as query_one,
            patch.object(
                api_main,
                "with_resolved_channel_adapter_fields",
                side_effect=_mark_resolved,
            ),
        ):
            result = api_main.get_channel("channel-3")

        self.assertEqual(
            result,
            {"channel_id": "channel-3", "provider_type": "rss", "adapter_resolved": True},
        )
        sql, params = query_one.call_args.args
        self.assertIn("from source_channels sc", sql)
        self.assertIn("where sc.channel_id = %s", sql)
        self.assertEqual(params, ("channel-3",))


if __name__ == "__main__":
    unittest.main()
