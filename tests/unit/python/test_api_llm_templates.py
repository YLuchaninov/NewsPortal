import unittest
from unittest.mock import patch

from fastapi import HTTPException

from tests.unit.python.support.stubs import install_psycopg_stub

install_psycopg_stub()

from signalops.api import main as api_main


class ApiLlmTemplateTests(unittest.TestCase):
    def test_list_llm_templates_page_uses_prompt_template_table(self) -> None:
        items = [{"prompt_template_id": "template-1", "is_active": True}]
        with (
            patch.object(api_main, "query_count", return_value=3) as query_count,
            patch.object(api_main, "query_all", return_value=items) as query_all,
        ):
            result = api_main.list_llm_templates(page=2, page_size=2)

        self.assertEqual(result["total"], 3)
        self.assertEqual(result["page"], 2)
        self.assertEqual(result["pageSize"], 2)
        self.assertEqual(result["items"], items)

        count_sql = query_count.call_args.args[0]
        self.assertIn("from llm_prompt_templates", count_sql)
        items_sql, items_params = query_all.call_args.args
        self.assertIn("from llm_prompt_templates", items_sql)
        self.assertIn("order by is_active desc, updated_at desc", items_sql)
        self.assertEqual(items_params, (2, 2))

    def test_get_llm_template_not_found_preserves_http_404(self) -> None:
        with patch.object(api_main, "query_one", return_value=None):
            with self.assertRaises(HTTPException) as raised:
                api_main.get_llm_template("missing-template")

        self.assertEqual(raised.exception.status_code, 404)
        self.assertEqual(raised.exception.detail, "LLM template not found.")


if __name__ == "__main__":
    unittest.main()
