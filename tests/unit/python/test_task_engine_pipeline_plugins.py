import http.client
import io
import unittest
from typing import Any
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from services.workers.app.task_engine import TaskPluginRegistry, register_builtin_plugins
from services.workers.app.task_engine.exceptions import TaskExecutionError
from services.workers.app.task_engine.pipeline_plugins import (
    ArticleExtractPlugin,
    EmbedArticlePlugin,
    FeedbackIngestPlugin,
    InterestCompilePlugin,
    LlmReviewPlugin,
    MatchInterestsPlugin,
    ReindexPlugin,
    ResourceExtractPlugin,
)


class _FakeUrlopenResponse:
    def __init__(self, payload: str):
        self._payload = payload.encode("utf-8")

    def __enter__(self) -> "_FakeUrlopenResponse":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        return False

    def read(self) -> bytes:
        return self._payload


class CorePipelinePluginRegistryTests(unittest.TestCase):
    def test_register_builtin_plugins_registers_expected_modules(self) -> None:
        registry = TaskPluginRegistry()

        register_builtin_plugins(registry)

        modules = {item["module"] for item in registry.list_all()}
        self.assertEqual(
            modules,
            {
                "article.cluster",
                "article.dedup",
                "article.embed",
                "article.llm_review",
                "article.match_criteria",
                "article.match_interests",
                "article.normalize",
                "article.notify",
                "enrichment.article_extract",
                "enrichment.resource_extract",
                "discovery.content_sampler",
                "discovery.evaluate_results",
                "discovery.llm_analyzer",
                "discovery.execute_hypotheses",
                "discovery.plan_hypotheses",
                "discovery.re_evaluate_sources",
                "discovery.relevance_scorer",
                "discovery.rss_probe",
                "discovery.source_registrar",
                "discovery.url_validator",
                "discovery.web_search",
                "discovery.website_probe",
                "enrichment.article_enricher",
                "enrichment.article_loader",
                "maintenance.criterion_compile",
                "maintenance.feedback_ingest",
                "maintenance.interest_compile",
                "maintenance.reindex",
                "utility.db_store",
            },
        )


class CorePipelinePluginAdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_embed_plugin_executes_legacy_handler_with_thin_payload(self) -> None:
        captured: dict[str, Any] = {}

        async def fake_handler(job: Any, job_token: str) -> dict[str, Any]:
            captured["job_data"] = dict(job.data)
            captured["job_token"] = job_token
            return {
                "status": "embedded",
                "docId": job.data["docId"],
                "modelKey": "unit-test-model",
                "dimensions": 384,
            }

        plugin = EmbedArticlePlugin()
        with patch(
            "services.workers.app.task_engine.pipeline_plugins.load_legacy_handler",
            return_value=fake_handler,
        ):
            result = await plugin.execute(
                options={},
                context={
                    "doc_id": "doc-1",
                    "event_id": "event-1",
                    "version": 3,
                },
            )

        self.assertEqual(
            captured["job_data"],
            {
                "sequenceRuntime": True,
                "suppressDownstreamOutbox": True,
                "eventId": "event-1",
                "docId": "doc-1",
                "version": 3,
            },
        )
        self.assertEqual(captured["job_token"], "")
        self.assertEqual(result["status"], "embedded")
        self.assertEqual(result["doc_id"], "doc-1")
        self.assertEqual(result["event_id"], "event-1")
        self.assertEqual(result["version"], 3)
        self.assertEqual(result["model_key"], "unit-test-model")
        self.assertEqual(result["dimensions"], 384)
        self.assertEqual(result["legacy_handler"], "process_embed")

    async def test_article_extract_plugin_calls_fetchers_contract_and_normalizes_context(self) -> None:
        captured: dict[str, Any] = {}

        def fake_request(job_data: dict[str, Any]) -> dict[str, Any]:
            captured["job_data"] = dict(job_data)
            return {
                "status": "enriched",
                "doc_id": job_data["docId"],
                "enrichment_state": "enriched",
                "body_replaced": True,
                "media_asset_count": 2,
            }

        plugin = ArticleExtractPlugin()
        with patch.object(plugin, "_request_enrichment", side_effect=fake_request):
            result = await plugin.execute(
                options={"force_enrichment": True},
                context={
                    "doc_id": "doc-9",
                    "event_id": "event-9",
                },
            )

        self.assertEqual(
            captured["job_data"],
            {
                "eventId": "event-9",
                "docId": "doc-9",
                "forceEnrichment": True,
            },
        )
        self.assertEqual(result["status"], "enriched")
        self.assertEqual(result["doc_id"], "doc-9")
        self.assertEqual(result["event_id"], "event-9")
        self.assertEqual(result["enrichment_state"], "enriched")
        self.assertTrue(result["body_replaced"])
        self.assertEqual(result["media_asset_count"], 2)
        self.assertTrue(result["force_enrichment"])

    async def test_resource_extract_plugin_calls_fetchers_contract_and_normalizes_context(self) -> None:
        captured: dict[str, Any] = {}

        def fake_request(job_data: dict[str, Any]) -> dict[str, Any]:
            captured["job_data"] = dict(job_data)
            return {
                "status": "enriched",
                "resource_id": job_data["resourceId"],
                "resource_kind": "editorial",
                "extraction_state": "enriched",
                "projected_doc_id": "doc-123",
                "documents_count": 1,
                "media_count": 2,
            }

        plugin = ResourceExtractPlugin()
        with patch.object(plugin, "_request_enrichment", side_effect=fake_request):
            result = await plugin.execute(
                options={"force": True},
                context={
                    "resource_id": "resource-1",
                    "event_id": "event-1",
                    "version": 2,
                },
            )

        self.assertEqual(
            captured["job_data"],
            {
                "eventId": "event-1",
                "resourceId": "resource-1",
                "forceEnrichment": True,
            },
        )
        self.assertEqual(result["status"], "enriched")
        self.assertEqual(result["resource_id"], "resource-1")
        self.assertEqual(result["resource_kind"], "editorial")
        self.assertEqual(result["extraction_state"], "enriched")
        self.assertEqual(result["projected_doc_id"], "doc-123")
        self.assertTrue(result["force_enrichment"])

    def test_article_extract_request_retries_transient_transport_failure(self) -> None:
        plugin = ArticleExtractPlugin()
        attempts: list[int] = []

        def fake_urlopen(*_args: Any, **_kwargs: Any) -> _FakeUrlopenResponse:
            attempts.append(1)
            if len(attempts) == 1:
                raise URLError(ConnectionRefusedError("Connection refused"))
            return _FakeUrlopenResponse('{"status":"enriched","enrichmentState":"enriched"}')

        with patch(
            "services.workers.app.task_engine.pipeline_plugins.urlopen",
            side_effect=fake_urlopen,
        ), patch(
            "services.workers.app.task_engine.pipeline_plugins._sleep_fetchers_internal_retry"
        ) as sleep_mock:
            result = plugin._request_enrichment(
                {
                    "docId": "doc-retry",
                    "eventId": "event-retry",
                    "forceEnrichment": False,
                }
            )

        self.assertEqual(len(attempts), 2)
        sleep_mock.assert_called_once_with()
        self.assertEqual(result["status"], "enriched")
        self.assertEqual(result["enrichmentState"], "enriched")

    def test_article_extract_request_raises_retryable_error_after_transient_failures_exhaust(self) -> None:
        plugin = ArticleExtractPlugin()

        with patch(
            "services.workers.app.task_engine.pipeline_plugins.urlopen",
            side_effect=URLError(ConnectionRefusedError("Connection refused")),
        ), patch(
            "services.workers.app.task_engine.pipeline_plugins._sleep_fetchers_internal_retry"
        ) as sleep_mock:
            with self.assertRaises(TaskExecutionError) as context:
                plugin._request_enrichment(
                    {
                        "docId": "doc-fail",
                        "eventId": "event-fail",
                        "forceEnrichment": False,
                    }
                )

        self.assertTrue(context.exception.retryable)
        self.assertIn("Connection refused", str(context.exception))
        self.assertEqual(sleep_mock.call_count, 2)

    def test_resource_extract_request_retries_remote_disconnect(self) -> None:
        plugin = ResourceExtractPlugin()
        attempts: list[int] = []

        def fake_urlopen(*_args: Any, **_kwargs: Any) -> _FakeUrlopenResponse:
            attempts.append(1)
            if len(attempts) == 1:
                raise http.client.RemoteDisconnected(
                    "Remote end closed connection without response"
                )
            return _FakeUrlopenResponse('{"status":"enriched","resourceKind":"editorial"}')

        with patch(
            "services.workers.app.task_engine.pipeline_plugins.urlopen",
            side_effect=fake_urlopen,
        ), patch(
            "services.workers.app.task_engine.pipeline_plugins._sleep_fetchers_internal_retry"
        ) as sleep_mock:
            result = plugin._request_enrichment(
                {
                    "resourceId": "resource-retry",
                    "eventId": "event-retry",
                    "forceEnrichment": False,
                }
            )

        self.assertEqual(len(attempts), 2)
        sleep_mock.assert_called_once_with()
        self.assertEqual(result["status"], "enriched")
        self.assertEqual(result["resourceKind"], "editorial")

    def test_article_extract_request_does_not_retry_permanent_http_errors(self) -> None:
        plugin = ArticleExtractPlugin()
        http_error = HTTPError(
            url="http://fetchers/internal/enrichment/articles/doc-permanent",
            code=400,
            msg="Bad Request",
            hdrs=None,
            fp=io.BytesIO(b"bad request"),
        )

        with patch(
            "services.workers.app.task_engine.pipeline_plugins.urlopen",
            side_effect=http_error,
        ), patch(
            "services.workers.app.task_engine.pipeline_plugins._sleep_fetchers_internal_retry"
        ) as sleep_mock:
            with self.assertRaises(RuntimeError) as context:
                plugin._request_enrichment(
                    {
                        "docId": "doc-permanent",
                        "eventId": "event-permanent",
                        "forceEnrichment": False,
                    }
                )

        sleep_mock.assert_not_called()
        self.assertIn("HTTP 400", str(context.exception))

    async def test_match_interests_plugin_prefers_options_and_keeps_scope_fields(self) -> None:
        captured: dict[str, Any] = {}

        async def fake_handler(job: Any, _job_token: str) -> dict[str, Any]:
            captured["job_data"] = dict(job.data)
            return {
                "status": "matched",
                "docId": job.data["docId"],
                "interestCount": 2,
            }

        plugin = MatchInterestsPlugin()
        with patch(
            "services.workers.app.task_engine.pipeline_plugins.load_legacy_handler",
            return_value=fake_handler,
        ):
            result = await plugin.execute(
                options={
                    "historical_backfill": True,
                    "user_id": "user-9",
                    "interest_id": "interest-4",
                },
                context={
                    "doc_id": "doc-2",
                    "event_id": "event-2",
                    "historical_backfill": False,
                },
            )

        self.assertEqual(
            captured["job_data"],
            {
                "sequenceRuntime": True,
                "suppressDownstreamOutbox": True,
                "eventId": "event-2",
                "docId": "doc-2",
                "historicalBackfill": True,
                "userId": "user-9",
                "interestId": "interest-4",
            },
        )
        self.assertEqual(result["interest_count"], 2)
        self.assertTrue(result["historical_backfill"])
        self.assertEqual(result["user_id"], "user-9")
        self.assertEqual(result["interest_id"], "interest-4")

    async def test_llm_review_plugin_normalizes_result_and_requires_scope_context(self) -> None:
        captured: dict[str, Any] = {}

        async def fake_handler(job: Any, _job_token: str) -> dict[str, Any]:
            captured["job_data"] = dict(job.data)
            return {
                "status": "reviewed",
                "docId": job.data["docId"],
                "scope": job.data["scope"],
                "decision": "approve",
                "llmReviewId": "review-7",
            }

        plugin = LlmReviewPlugin()
        with patch(
            "services.workers.app.task_engine.pipeline_plugins.load_legacy_handler",
            return_value=fake_handler,
        ):
            result = await plugin.execute(
                options={"prompt_template_id": "prompt-1"},
                context={
                    "doc_id": "doc-3",
                    "event_id": "event-3",
                    "scope": "criterion",
                    "target_id": "criterion-8",
                    "historical_backfill": True,
                },
            )

        self.assertEqual(
            captured["job_data"],
            {
                "sequenceRuntime": True,
                "suppressDownstreamOutbox": True,
                "eventId": "event-3",
                "docId": "doc-3",
                "scope": "criterion",
                "targetId": "criterion-8",
                "historicalBackfill": True,
                "promptTemplateId": "prompt-1",
            },
        )
        self.assertEqual(result["scope"], "criterion")
        self.assertEqual(result["target_id"], "criterion-8")
        self.assertEqual(result["prompt_template_id"], "prompt-1")
        self.assertEqual(result["llm_review_id"], "review-7")
        self.assertEqual(result["decision"], "approve")

    async def test_llm_review_plugin_raises_when_required_identifiers_are_missing(self) -> None:
        plugin = LlmReviewPlugin()

        with self.assertRaisesRegex(ValueError, "scope"):
            await plugin.execute(
                options={},
                context={"doc_id": "doc-4", "event_id": "event-4", "target_id": "criterion-1"},
            )

    async def test_interest_compile_plugin_maps_auto_repair_controls(self) -> None:
        captured: dict[str, Any] = {}

        async def fake_handler(job: Any, _job_token: str) -> dict[str, Any]:
            captured["job_data"] = dict(job.data)
            return {
                "status": "compiled",
                "interestId": job.data["interestId"],
                "version": job.data["version"],
                "autoRepair": {"status": "skipped", "reason": "skipAutoRepair"},
            }

        plugin = InterestCompilePlugin()
        with patch(
            "services.workers.app.task_engine.pipeline_plugins.load_legacy_handler",
            return_value=fake_handler,
        ):
            result = await plugin.execute(
                options={"skip_auto_repair": True},
                context={
                    "event_id": "event-5",
                    "interest_id": "interest-2",
                    "version": 7,
                },
            )

        self.assertEqual(
            captured["job_data"],
            {
                "sequenceRuntime": True,
                "suppressDownstreamOutbox": True,
                "eventId": "event-5",
                "interestId": "interest-2",
                "version": 7,
                "skipAutoRepair": True,
            },
        )
        self.assertEqual(result["interest_id"], "interest-2")
        self.assertTrue(result["skip_auto_repair"])
        self.assertEqual(result["auto_repair"]["status"], "skipped")

    async def test_feedback_ingest_plugin_maps_notification_identifiers(self) -> None:
        captured: dict[str, Any] = {}

        async def fake_handler(job: Any, _job_token: str) -> dict[str, Any]:
            captured["job_data"] = dict(job.data)
            return {
                "status": "processed",
                "notificationId": job.data["notificationId"],
                "docId": job.data["docId"],
                "userId": job.data["userId"],
            }

        plugin = FeedbackIngestPlugin()
        with patch(
            "services.workers.app.task_engine.pipeline_plugins.load_legacy_handler",
            return_value=fake_handler,
        ):
            result = await plugin.execute(
                options={"notification_id": "notification-3", "user_id": "user-5"},
                context={"event_id": "event-6", "doc_id": "doc-6"},
            )

        self.assertEqual(
            captured["job_data"],
            {
                "eventId": "event-6",
                "notificationId": "notification-3",
                "docId": "doc-6",
                "userId": "user-5",
            },
        )
        self.assertEqual(result["notification_id"], "notification-3")
        self.assertEqual(result["user_id"], "user-5")
        self.assertEqual(result["status"], "processed")

    async def test_reindex_plugin_keeps_optional_index_name(self) -> None:
        captured: dict[str, Any] = {}

        async def fake_handler(job: Any, _job_token: str) -> dict[str, Any]:
            captured["job_data"] = dict(job.data)
            return {
                "status": "completed",
                "reindexJobId": job.data["reindexJobId"],
                "result": {"jobKind": "repair"},
            }

        plugin = ReindexPlugin()
        with patch(
            "services.workers.app.task_engine.pipeline_plugins.load_legacy_handler",
            return_value=fake_handler,
        ):
            result = await plugin.execute(
                options={"index_name": "interest_centroids"},
                context={"event_id": "event-7", "reindex_job_id": "reindex-9"},
            )

        self.assertEqual(
            captured["job_data"],
            {
                "eventId": "event-7",
                "reindexJobId": "reindex-9",
                "indexName": "interest_centroids",
            },
        )
        self.assertEqual(result["reindex_job_id"], "reindex-9")
        self.assertEqual(result["index_name"], "interest_centroids")
        self.assertEqual(result["result"]["jobKind"], "repair")


if __name__ == "__main__":
    unittest.main()
