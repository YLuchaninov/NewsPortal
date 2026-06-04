import unittest

from services.api.app import channel_adapters
from services.api.app import ingress_adapter_read_model as model


class IngressAdapterReadModelTest(unittest.TestCase):
    def test_list_ingress_adapters_shapes_catalog_rows(self):
        rows = [
            {
                "adapter_key": "rss.generic",
                "title": "Generic RSS",
                "description": "Feeds",
                "runtime_kind": "builtin",
                "provider_type": "rss",
                "output_mode": "signal_candidates",
                "status": "active",
                "priority": 10,
                "match_rules_json": {"allowAutoSelect": True},
                "config_schema_json": {},
                "recipe_json": None,
                "module_name": "builtin.rss.generic",
                "metadata_json": {},
                "is_system": True,
                "editable": False,
                "created_by": "migration",
                "created_at": "2026-05-15T00:00:00Z",
                "updated_at": "2026-05-15T00:00:00Z",
                "active_binding_count": 3,
            }
        ]

        result = model.list_ingress_adapters(query_all_func=lambda _sql, _params: rows)

        self.assertEqual(result[0]["adapterKey"], "rss.generic")
        self.assertEqual(result[0]["runtimeKind"], "builtin")
        self.assertEqual(result[0]["activeBindingCount"], 3)

    def test_channel_adapter_fields_include_binding_payload(self):
        channel = channel_adapters.with_resolved_channel_adapter_fields(
            {
                "fetch_url": "https://news.google.com/rss/search?q=ai",
                "config_json": {},
                "adapter_binding_key": "rss.google_news_rss",
                "adapter_binding_config_json": {},
                "adapter_binding_selection_mode": "migration",
                "adapter_binding_enabled": True,
                "adapter_binding_title": "Google News RSS",
                "adapter_binding_runtime_kind": "builtin",
                "adapter_binding_output_mode": "signal_candidates",
                "adapter_binding_status": "active",
            }
        )

        self.assertEqual(channel["adapter_binding"]["adapterKey"], "rss.google_news_rss")
        self.assertEqual(channel["resolved_adapter_strategy"], "google_news_rss")
        self.assertEqual(channel["adapter_resolution_source"], "binding")

    def test_channel_adapter_fields_reports_legacy_config_as_ignored_diagnostic(self):
        channel = channel_adapters.with_resolved_channel_adapter_fields(
            {
                "provider_type": "api",
                "fetch_url": "https://example.com/items.json",
                "config_json": {"adapterKey": "hn_algolia_search"},
                "adapter_binding_key": None,
            }
        )

        self.assertEqual(channel["adapter_resolution_source"], "provider_default")
        self.assertIn("provider default", channel["adapter_resolution_warning"])
        self.assertTrue(channel["legacy_adapter_diagnostics"]["hasLegacyApiAdapterHint"])
        self.assertTrue(channel["legacy_adapter_diagnostics"]["ignoredForRuntimeSelection"])

    def test_declarative_create_rejects_non_api_provider(self):
        with self.assertRaisesRegex(
            model.IngressAdapterMutationError,
            "providerType api only",
        ):
            model.create_declarative_ingress_adapter(
                {
                    "adapterKey": "rss.custom",
                    "providerType": "rss",
                    "title": "Custom RSS",
                }
            )

    def test_declarative_create_rejects_secret_metadata(self):
        with self.assertRaisesRegex(
            model.IngressAdapterMutationError,
            "must not contain secrets",
        ):
            model.create_declarative_ingress_adapter(
                {
                    "adapterKey": "api.secret_test",
                    "providerType": "api",
                    "metadata": {"api_key": "secret"},
                }
            )

    def test_declarative_create_rejects_unsafe_recipe_shape(self):
        with self.assertRaisesRegex(
            model.IngressAdapterMutationError,
            "recipe.request.method must be GET or POST",
        ):
            model.create_declarative_ingress_adapter(
                {
                    "adapterKey": "api.unsafe_recipe",
                    "providerType": "api",
                    "recipe": {"request": {"method": "DELETE"}},
                }
            )

    def test_legacy_fallback_report_shapes_counts(self):
        rows = [
            {
                "channel_id": "api-1",
                "name": "API One",
                "provider_type": "api",
                "fetch_url": "https://example.com/items.json",
                "binding_enabled": None,
                "binding_adapter_key": None,
                "binding_adapter_status": None,
                "binding_provider_type": None,
                "binding_runtime_kind": None,
                "has_valid_binding": False,
                "has_legacy_rss_adapter_hint": False,
                "legacy_api_adapter_key": "hn_algolia_search",
                "last_run_adapter_key": None,
                "last_run_adapter_runtime_kind": None,
                "last_run_adapter_selection_mode": None,
                "last_run_adapter_resolution_source": "provider_default",
            },
            {
                "channel_id": "rss-1",
                "name": "RSS One",
                "provider_type": "rss",
                "fetch_url": "https://example.com/feed.xml",
                "binding_enabled": True,
                "binding_adapter_key": "rss.generic",
                "binding_adapter_status": "active",
                "binding_provider_type": "rss",
                "binding_runtime_kind": "builtin",
                "has_valid_binding": True,
                "has_legacy_rss_adapter_hint": False,
                "legacy_api_adapter_key": None,
                "last_run_adapter_key": "rss.generic",
                "last_run_adapter_runtime_kind": "builtin",
                "last_run_adapter_selection_mode": "migration",
                "last_run_adapter_resolution_source": "binding",
            },
        ]
        report = model.read_legacy_fallback_report(query_all_func=lambda _sql: rows)

        self.assertEqual(report["status"], "needs_backfill_or_rebind")
        self.assertFalse(report["removalAllowed"])
        self.assertEqual(report["totals"]["legacyConfigResolutionCount"], 0)
        self.assertEqual(report["totals"]["legacyConfigFieldCount"], 1)
        self.assertEqual(report["totals"]["activeChannelCount"], 2)
        self.assertEqual(report["channels"][0]["computedResolverSource"], "provider_default")
        self.assertTrue(report["channels"][0]["legacyFieldsIgnoredForRuntimeSelection"])

    def test_binding_set_rejects_secret_config_before_db(self):
        with self.assertRaisesRegex(
            model.IngressAdapterMutationError,
            "must not contain secrets",
        ):
            model.upsert_channel_adapter_binding(
                "channel-1",
                {
                    "adapterKey": "api.generic_json_mapping",
                    "config": {"password": "secret"},
                },
            )


if __name__ == "__main__":
    unittest.main()
