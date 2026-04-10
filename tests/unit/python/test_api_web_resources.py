import sys
import types
import unittest
from unittest.mock import patch

if "psycopg" not in sys.modules:
    psycopg_stub = types.ModuleType("psycopg")
    psycopg_stub.connect = lambda *args, **kwargs: None
    sys.modules["psycopg"] = psycopg_stub

if "psycopg.rows" not in sys.modules:
    psycopg_rows_stub = types.ModuleType("psycopg.rows")
    psycopg_rows_stub.dict_row = object()
    sys.modules["psycopg.rows"] = psycopg_rows_stub

if "psycopg.types" not in sys.modules:
    sys.modules["psycopg.types"] = types.ModuleType("psycopg.types")

if "psycopg.types.json" not in sys.modules:
    psycopg_types_json_stub = types.ModuleType("psycopg.types.json")
    psycopg_types_json_stub.Json = lambda value: value
    sys.modules["psycopg.types.json"] = psycopg_types_json_stub

from services.api.app import main as api_main


class ApiWebResourcesTests(unittest.TestCase):
    def test_web_resource_routes_are_registered(self) -> None:
        paths = {route.path for route in api_main.app.routes}

        self.assertIn("/maintenance/web-resources", paths)
        self.assertIn("/maintenance/web-resources/{resource_id}", paths)

    def test_list_web_resources_page_uses_filters_and_projection_truth(self) -> None:
        items = [{"resource_id": "resource-1", "resource_kind": "entity"}]
        with (
            patch.object(api_main, "query_count", return_value=7) as query_count,
            patch.object(api_main, "query_all", return_value=items) as query_all,
        ):
            result = api_main.list_web_resources_page(
                limit=25,
                page=2,
                page_size=3,
                channel_id="channel-1",
                extraction_state="skipped",
                projection="resource_only",
                resource_kind="entity",
            )

        self.assertEqual(result["total"], 7)
        self.assertEqual(result["page"], 2)
        self.assertEqual(result["pageSize"], 3)
        self.assertEqual(result["items"], items)

        count_sql, count_params = query_count.call_args.args
        self.assertIn("from web_resources wr", count_sql)
        self.assertIn("join source_channels sc on sc.channel_id = wr.channel_id", count_sql)
        self.assertIn("sc.provider_type = 'website'", count_sql)
        self.assertIn("wr.channel_id = %s", count_sql)
        self.assertIn("wr.extraction_state = %s", count_sql)
        self.assertIn("wr.projected_article_id is null", count_sql)
        self.assertIn("wr.resource_kind = %s", count_sql)
        self.assertEqual(count_params, ("channel-1", "skipped", "entity"))

        items_sql, items_params = query_all.call_args.args
        self.assertIn("left join articles pa on pa.doc_id = wr.projected_article_id", items_sql)
        self.assertIn("then 'resource:' || wr.resource_id::text", items_sql)
        self.assertIn("wr.resource_kind <> 'editorial'", items_sql)
        self.assertIn("from interest_templates it", items_sql)
        self.assertIn(
            "order by coalesce(wr.published_at, wr.discovered_at) desc nulls last, wr.updated_at desc, wr.resource_id",
            items_sql,
        )
        self.assertEqual(items_params, ("channel-1", "skipped", "entity", 3, 3))

    def test_list_web_resources_route_validates_filters(self) -> None:
        with self.assertRaises(api_main.HTTPException) as bad_state:
            api_main.list_web_resources(limit=20, page=1, page_size=10, extraction_state="bogus")
        self.assertEqual(bad_state.exception.status_code, 422)

        with self.assertRaises(api_main.HTTPException) as bad_projection:
            api_main.list_web_resources(limit=20, page=1, page_size=10, projection="retro")
        self.assertEqual(bad_projection.exception.status_code, 422)

        with self.assertRaises(api_main.HTTPException) as bad_kind:
            api_main.list_web_resources(limit=20, page=1, page_size=10, resource_kind="feed")
        self.assertEqual(bad_kind.exception.status_code, 422)

    def test_get_web_resource_raises_404_when_row_is_missing(self) -> None:
        with patch.object(api_main, "query_one", return_value=None):
            with self.assertRaises(api_main.HTTPException) as error:
                api_main.get_web_resource("resource-404")

        self.assertEqual(error.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
