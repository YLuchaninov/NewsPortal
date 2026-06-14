import unittest

from tests.unit.python.support.stubs import install_psycopg_stub

install_psycopg_stub()

from signalops.workers.provider_capabilities import (
    BETA_INGEST_PROVIDER_TYPES,
    is_beta_ingest_provider_type,
    load_provider_capabilities,
)
from signalops.workers.task_engine.discovery_registration_plugins import SourceRegistrarPlugin


class ProviderCapabilitiesTests(unittest.TestCase):
    def test_python_loader_matches_beta_ingest_registry(self) -> None:
        capabilities = load_provider_capabilities()

        self.assertEqual(
            BETA_INGEST_PROVIDER_TYPES,
            ("rss", "website", "api", "email_imap"),
        )
        self.assertEqual(
            {str(item["providerType"]): str(item["status"]) for item in capabilities},
            {
                "rss": "beta_runtime",
                "website": "beta_runtime",
                "api": "beta_runtime",
                "email_imap": "beta_runtime",
                "telegram": "delivery_only",
                "youtube": "future_hidden",
            },
        )
        self.assertFalse(is_beta_ingest_provider_type("youtube"))

    def test_source_registrar_plugin_rejects_future_hidden_provider(self) -> None:
        plugin = SourceRegistrarPlugin()

        errors = plugin.validate_options({"provider_type": "youtube"})

        self.assertTrue(errors)
        self.assertIn("provider_type", errors[0])
