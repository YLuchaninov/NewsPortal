import unittest
from dataclasses import replace
from itertools import count
from typing import Any
from unittest.mock import patch

from services.workers.app.task_engine import (
    SequenceDefinition,
    SequenceExecutor,
    SequenceRunRecord,
    TaskPluginRegistry,
    register_builtin_plugins,
)
from services.workers.app.task_engine.discovery_plugins import (
    RelevanceScorerPlugin,
    UrlValidatorPlugin,
)


class InMemorySequenceRepository:
    def __init__(
        self,
        *,
        sequences: dict[str, SequenceDefinition],
        runs: dict[str, SequenceRunRecord],
    ) -> None:
        self.sequences = dict(sequences)
        self.runs = dict(runs)
        self.sequence_run_counts = {
            sequence_id: sequence.run_count for sequence_id, sequence in sequences.items()
        }
        self.task_runs: list[dict[str, Any]] = []
        self._task_run_ids = count(1)

    async def get_sequence(self, sequence_id: str) -> SequenceDefinition | None:
        return self.sequences.get(sequence_id)

    async def get_run(self, run_id: str) -> SequenceRunRecord | None:
        return self.runs.get(run_id)

    async def mark_run_running(self, run_id: str) -> None:
        self.runs[run_id] = replace(self.runs[run_id], status="running", error_text=None)

    async def mark_run_completed(self, run_id: str, *, context_json: dict[str, Any]) -> None:
        self.runs[run_id] = replace(
            self.runs[run_id],
            status="completed",
            context_json=dict(context_json),
            error_text=None,
        )

    async def mark_run_failed(
        self,
        run_id: str,
        *,
        context_json: dict[str, Any],
        error_text: str,
    ) -> None:
        self.runs[run_id] = replace(
            self.runs[run_id],
            status="failed",
            context_json=dict(context_json),
            error_text=error_text,
        )

    async def increment_sequence_run_count(self, sequence_id: str) -> None:
        self.sequence_run_counts[sequence_id] = self.sequence_run_counts.get(sequence_id, 0) + 1

    async def create_running_task_run(
        self,
        *,
        run_id: str,
        task_index: int,
        task_key: str,
        module: str,
        options_json: dict[str, Any],
        input_json: dict[str, Any],
    ) -> str:
        task_run_id = f"task-run-{next(self._task_run_ids)}"
        self.task_runs.append(
            {
                "task_run_id": task_run_id,
                "run_id": run_id,
                "task_index": task_index,
                "task_key": task_key,
                "module": module,
                "status": "running",
                "options_json": dict(options_json),
                "input_json": dict(input_json),
                "output_json": None,
                "error_text": None,
                "duration_ms": None,
            }
        )
        return task_run_id

    async def create_skipped_task_run(
        self,
        *,
        run_id: str,
        task_index: int,
        task_key: str,
        module: str,
        options_json: dict[str, Any],
        input_json: dict[str, Any],
        output_json: dict[str, Any],
    ) -> str:
        task_run_id = f"task-run-{next(self._task_run_ids)}"
        self.task_runs.append(
            {
                "task_run_id": task_run_id,
                "run_id": run_id,
                "task_index": task_index,
                "task_key": task_key,
                "module": module,
                "status": "skipped",
                "options_json": dict(options_json),
                "input_json": dict(input_json),
                "output_json": dict(output_json),
                "error_text": None,
                "duration_ms": 0,
            }
        )
        return task_run_id

    async def mark_task_run_completed(
        self,
        task_run_id: str,
        *,
        output_json: dict[str, Any],
        duration_ms: int,
    ) -> None:
        task_run = self._find_task_run(task_run_id)
        task_run["status"] = "completed"
        task_run["output_json"] = dict(output_json)
        task_run["duration_ms"] = duration_ms
        task_run["error_text"] = None

    async def mark_task_run_failed(
        self,
        task_run_id: str,
        *,
        error_text: str,
        duration_ms: int,
    ) -> None:
        task_run = self._find_task_run(task_run_id)
        task_run["status"] = "failed"
        task_run["error_text"] = error_text
        task_run["duration_ms"] = duration_ms

    def _find_task_run(self, task_run_id: str) -> dict[str, Any]:
        for task_run in self.task_runs:
            if task_run["task_run_id"] == task_run_id:
                return task_run
        raise KeyError(task_run_id)


class FakeWebSearchAdapter:
    def search(
        self,
        *,
        query: str,
        count: int,
        result_type: str,
        time_range: str | None,
    ) -> list[dict[str, Any]]:
        return [
            {
                "url": "https://feeds.example.com/ukraine-tech.xml",
                "title": f"{query} feed",
                "snippet": "Ukraine technology updates",
            },
            {
                "url": "https://social.example.net/profile",
                "title": "Profile page",
                "snippet": "Not a feed",
            },
        ][:count]


class FakeUrlValidatorAdapter:
    def validate_urls(self, *, urls: list[str]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for url in urls:
            rows.append(
                {
                    "url": url,
                    "status": 200,
                    "content_type": "application/rss+xml" if url.endswith(".xml") else "text/html",
                }
            )
        return rows


class FakeRssProbeAdapter:
    def probe_feeds(self, *, urls: list[str], sample_count: int) -> list[dict[str, Any]]:
        return [
            {
                "url": url,
                "is_valid_rss": True,
                "feed_title": "Ukraine Tech Daily",
                "sample_entries": [
                    {"title": "Ukraine startup funding", "snippet": "Tech investment"},
                    {"title": "AI chips in Europe", "snippet": "Semiconductor update"},
                ][:sample_count],
            }
            for url in urls
        ]


class FakeContentSamplerAdapter:
    def sample_content(
        self,
        *,
        source_urls: list[str],
        article_count: int,
        max_chars: int,
    ) -> list[dict[str, Any]]:
        return [
            {
                "source_url": url,
                "articles": [
                    {
                        "title": "Ukraine tech market expands",
                        "content": "Ukraine technology startups grow across Europe."[:max_chars],
                    },
                    {
                        "title": "Developers build AI tools",
                        "content": "Tech teams ship AI products for newsrooms."[:max_chars],
                    },
                ][:article_count],
            }
            for url in source_urls
        ]


class FakeLlmAnalyzerAdapter:
    def analyze(
        self,
        *,
        prompt: str | None,
        task: str | None,
        payload: Any,
        model: str | None,
        temperature: float,
        output_schema: dict[str, Any] | None,
    ) -> dict[str, Any]:
        if task == "summarize_sources":
            sources = payload if isinstance(payload, list) else []
            return {
                "summary": f"{len(sources)} source(s) look relevant.",
                "model": model or "fake-llm",
            }
        if task == "extract_topics":
            articles = payload if isinstance(payload, list) else []
            return {
                article["doc_id"]: {"topics": ["tech", "ukraine"]}
                for article in articles
                if isinstance(article, dict) and "doc_id" in article
            }
        return {"prompt": prompt, "task": task, "temperature": temperature}


class FakeSourceRegistrarAdapter:
    def register_sources(
        self,
        *,
        sources: list[dict[str, Any]],
        enabled: bool,
        dry_run: bool,
        created_by: str | None,
        tags: list[str],
    ) -> list[dict[str, Any]]:
        return [
            {
                "channel_id": f"channel-{index + 1}",
                "url": source["source_url"],
                "enabled": enabled,
                "dry_run": dry_run,
                "created_by": created_by,
                "tags": tags,
            }
            for index, source in enumerate(sources)
        ]


class FakeDbStoreAdapter:
    def store(
        self,
        *,
        record_key: str,
        payload: Any,
        namespace: str | None,
    ) -> dict[str, Any]:
        size = len(payload) if isinstance(payload, list) else 1
        return {"record_key": record_key, "namespace": namespace, "size": size}


class FakeArticleLoaderAdapter:
    def load_articles(
        self,
        *,
        filters: dict[str, Any],
        limit: int,
        include_blocked: bool,
    ) -> list[dict[str, Any]]:
        return [
            {"doc_id": "doc-1", "title": "Ukraine tech story", "body": "Story body"},
            {"doc_id": "doc-2", "title": "EU AI policy", "body": "Policy body"},
        ][:limit]


class FakeArticleEnricherAdapter:
    def enrich_articles(
        self,
        *,
        articles: list[dict[str, Any]],
        enrichment: Any,
        mode: str,
        target_field: str | None,
    ) -> dict[str, Any]:
        field_name = target_field or "enrichment"
        enriched_articles = []
        annotations = enrichment if isinstance(enrichment, dict) else {}
        for article in articles:
            article_copy = dict(article)
            article_copy[field_name] = annotations.get(article["doc_id"], {})
            enriched_articles.append(article_copy)
        return {
            "articles": enriched_articles,
            "enriched_count": len(enriched_articles),
            "mode": mode,
        }


class FakeDiscoveryRuntime:
    def __init__(self) -> None:
        self.web_search = FakeWebSearchAdapter()
        self.url_validator = FakeUrlValidatorAdapter()
        self.rss_probe = FakeRssProbeAdapter()
        self.content_sampler = FakeContentSamplerAdapter()
        self.llm_analyzer = FakeLlmAnalyzerAdapter()
        self.source_registrar = FakeSourceRegistrarAdapter()
        self.db_store = FakeDbStoreAdapter()
        self.article_loader = FakeArticleLoaderAdapter()
        self.article_enricher = FakeArticleEnricherAdapter()


class DiscoveryPluginBehaviorTests(unittest.IsolatedAsyncioTestCase):
    async def test_url_validator_filters_candidates_and_marks_rss_urls(self) -> None:
        plugin = UrlValidatorPlugin()
        runtime = FakeDiscoveryRuntime()

        with patch(
            "services.workers.app.task_engine.discovery_plugins.get_discovery_runtime",
            return_value=runtime,
        ):
            result = await plugin.execute(
                options={
                    "allow_patterns": [r"feeds\.example\.com"],
                    "deny_patterns": [r"profile"],
                    "require_https": True,
                },
                context={
                    "search_results": [
                        {"url": "https://feeds.example.com/ukraine-tech.xml"},
                        {"url": "https://social.example.net/profile"},
                        {"url": "http://feeds.example.com/insecure.xml"},
                    ]
                },
            )

        self.assertEqual(len(result["validated_urls"]), 1)
        self.assertEqual(
            result["validated_urls"][0]["url"],
            "https://feeds.example.com/ukraine-tech.xml",
        )
        self.assertTrue(result["validated_urls"][0]["is_rss_candidate"])

    async def test_relevance_scorer_scores_sampled_content_deterministically(self) -> None:
        plugin = RelevanceScorerPlugin()

        result = await plugin.execute(
            options={
                "target_topics": ["ukraine", "tech"],
                "threshold": 0.5,
            },
            context={
                "sampled_content": [
                    {
                        "source_url": "https://feeds.example.com/ukraine-tech.xml",
                        "articles": [
                            {"title": "Ukraine tech market expands", "content": "Tech startups win"},
                        ],
                    },
                    {
                        "source_url": "https://feeds.example.com/sports.xml",
                        "articles": [
                            {"title": "Sports update", "content": "Football and tennis"},
                        ],
                    },
                ]
            },
        )

        self.assertEqual(len(result["scored_sources"]), 2)
        self.assertTrue(result["scored_sources"][0]["passes_threshold"])
        self.assertFalse(result["scored_sources"][1]["passes_threshold"])
        self.assertEqual(result["scored_sources"][0]["matched_terms"], ["tech", "ukraine"])


class DiscoveryPluginSequenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_executor_runs_source_discovery_sequence_end_to_end(self) -> None:
        executor, repository = self._build_executor(
            task_graph=[
                {
                    "key": "search",
                    "module": "discovery.web_search",
                    "options": {"query": "ukraine tech rss", "count": 2},
                },
                {
                    "key": "validate",
                    "module": "discovery.url_validator",
                    "options": {"allow_patterns": [r"feeds\.example\.com"]},
                },
                {
                    "key": "probe",
                    "module": "discovery.rss_probe",
                    "options": {"sample_count": 2},
                },
                {
                    "key": "sample",
                    "module": "discovery.content_sampler",
                    "options": {"article_count": 2},
                },
                {
                    "key": "score",
                    "module": "discovery.relevance_scorer",
                    "options": {"target_topics": ["ukraine", "tech"], "threshold": 0.5},
                },
                {
                    "key": "analyze",
                    "module": "discovery.llm_analyzer",
                    "options": {
                        "task": "summarize_sources",
                        "payload_field": "scored_sources",
                        "output_field": "source_hypothesis",
                    },
                },
                {
                    "key": "register",
                    "module": "discovery.source_registrar",
                    "options": {"dry_run": True, "tags": ["discovery", "tech"]},
                },
                {
                    "key": "store",
                    "module": "utility.db_store",
                    "options": {
                        "payload_field": "registered_channels",
                        "namespace": "discovery-results",
                    },
                },
            ],
            initial_context={"seed_query": "ukraine tech rss"},
        )

        with patch(
            "services.workers.app.task_engine.discovery_plugins.get_discovery_runtime",
            return_value=FakeDiscoveryRuntime(),
        ):
            result = await executor.execute_run("run-1")

        self.assertEqual(result["status"], "completed")
        self.assertFalse(result["stoppedEarly"])
        self.assertEqual(repository.runs["run-1"].status, "completed")
        self.assertEqual(repository.sequence_run_counts["sequence-1"], 1)
        self.assertEqual(repository.task_runs[-1]["status"], "completed")
        self.assertIn("registered_channels", repository.runs["run-1"].context_json)
        self.assertTrue(repository.runs["run-1"].context_json["stored"])
        self.assertEqual(
            repository.runs["run-1"].context_json["source_hypothesis"]["summary"],
            "1 source(s) look relevant.",
        )

    async def test_executor_runs_enrichment_sequence_end_to_end(self) -> None:
        executor, repository = self._build_executor(
            task_graph=[
                {
                    "key": "load",
                    "module": "enrichment.article_loader",
                    "options": {"filters": {"lang": "en"}, "limit": 2},
                },
                {
                    "key": "annotate",
                    "module": "discovery.llm_analyzer",
                    "options": {
                        "task": "extract_topics",
                        "payload_field": "articles",
                        "output_field": "topic_annotations",
                    },
                },
                {
                    "key": "enrich",
                    "module": "enrichment.article_enricher",
                    "options": {
                        "enrichment_field": "topic_annotations",
                        "target_field": "topics",
                        "mode": "merge",
                    },
                },
            ],
            initial_context={},
        )

        with patch(
            "services.workers.app.task_engine.discovery_plugins.get_discovery_runtime",
            return_value=FakeDiscoveryRuntime(),
        ):
            result = await executor.execute_run("run-1")

        self.assertEqual(result["status"], "completed")
        self.assertEqual(repository.runs["run-1"].context_json["enriched_count"], 2)
        enriched_articles = repository.runs["run-1"].context_json["articles"]
        self.assertEqual(enriched_articles[0]["topics"]["topics"], ["tech", "ukraine"])
        self.assertEqual(repository.task_runs[-1]["status"], "completed")

    def _build_executor(
        self,
        *,
        task_graph: list[dict[str, Any]],
        initial_context: dict[str, Any],
    ) -> tuple[SequenceExecutor, InMemorySequenceRepository]:
        registry = TaskPluginRegistry()
        register_builtin_plugins(registry)

        sequence = SequenceDefinition.from_record(
            {
                "sequence_id": "sequence-1",
                "title": "Sequence 1",
                "task_graph": task_graph,
                "status": "draft",
                "run_count": 0,
            }
        )
        run = SequenceRunRecord(
            run_id="run-1",
            sequence_id="sequence-1",
            status="pending",
            context_json=dict(initial_context),
            trigger_type="manual",
            trigger_meta={"source": "unit-test"},
        )
        repository = InMemorySequenceRepository(
            sequences={"sequence-1": sequence},
            runs={"run-1": run},
        )
        return SequenceExecutor(repository=repository, registry=registry), repository


if __name__ == "__main__":
    unittest.main()
