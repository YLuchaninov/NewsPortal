import asyncio
import sys
import types
import unittest
import uuid
from unittest.mock import AsyncMock, patch

if "psycopg" not in sys.modules:
    psycopg_stub = types.ModuleType("psycopg")

    class _AsyncCursor:
        def __class_getitem__(cls, _item):
            return cls

    psycopg_stub.AsyncCursor = _AsyncCursor
    sys.modules["psycopg"] = psycopg_stub

if "psycopg.types" not in sys.modules:
    sys.modules["psycopg.types"] = types.ModuleType("psycopg.types")

if "psycopg.types.json" not in sys.modules:
    psycopg_types_json_stub = types.ModuleType("psycopg.types.json")
    psycopg_types_json_stub.Json = lambda value: value
    sys.modules["psycopg.types.json"] = psycopg_types_json_stub

from services.workers.app.story_clusters import (
    compute_conflicting_signal_count,
    extract_source_family_key,
    refresh_canonical_document_verification,
    rebuild_story_cluster_state,
    resolve_verification_state,
)


class RecordingAsyncCursor:
    def __init__(self, fetchall_results: list[list[dict[str, object]]]):
        self.executed: list[str] = []
        self._fetchall_results = list(fetchall_results)

    async def execute(self, sql: str, _params=None) -> None:
        self.executed.append(sql)

    async def fetchall(self) -> list[dict[str, object]]:
        if self._fetchall_results:
            return self._fetchall_results.pop(0)
        return []

    async def fetchone(self):
        return None


class StoryClusterLogicTests(unittest.TestCase):
    def test_extract_source_family_key_normalizes_hostnames(self) -> None:
        self.assertEqual(
            extract_source_family_key("https://www.Example.com/path?q=1"),
            "example.com",
        )
        self.assertEqual(
            extract_source_family_key("https://news.example.co.uk/story"),
            "news.example.co.uk",
        )
        self.assertIsNone(extract_source_family_key("not a url"))

    def test_resolve_verification_state_prefers_conflicting_then_strong_medium_weak(self) -> None:
        self.assertEqual(
            resolve_verification_state(
                canonical_document_count=2,
                source_family_count=2,
                corroboration_count=1,
                conflicting_signal_count=1,
            ),
            "conflicting",
        )
        self.assertEqual(
            resolve_verification_state(
                canonical_document_count=2,
                source_family_count=2,
                corroboration_count=1,
                conflicting_signal_count=0,
            ),
            "strong",
        )
        self.assertEqual(
            resolve_verification_state(
                canonical_document_count=1,
                source_family_count=2,
                corroboration_count=1,
                conflicting_signal_count=0,
            ),
            "medium",
        )
        self.assertEqual(
            resolve_verification_state(
                canonical_document_count=1,
                source_family_count=1,
                corroboration_count=0,
                conflicting_signal_count=0,
            ),
            "weak",
        )

    def test_compute_conflicting_signal_count_flags_low_overlap_members(self) -> None:
        conflicts = compute_conflicting_signal_count(
            primary_title="EU AI policy response reaches Brussels and Warsaw",
            primary_entities=["European Union", "Warsaw"],
            primary_places=["Brussels", "Warsaw"],
            member_rows=[
                {
                    "title": "Completely unrelated celebrity interview in Los Angeles",
                    "entities": ["Celebrity"],
                    "places": ["Los Angeles"],
                },
                {
                    "title": "EU AI policy response expands in Brussels",
                    "entities": ["European Union"],
                    "places": ["Brussels"],
                },
            ],
        )

        self.assertEqual(conflicts, 1)

    def test_refresh_canonical_document_verification_avoids_reserved_document_observation_alias(self) -> None:
        async def run_test() -> tuple[dict[str, object], RecordingAsyncCursor]:
            cursor = RecordingAsyncCursor(
                [
                    [
                        {
                            "canonical_document_id": "doc-1",
                            "canonical_domain": "example.com",
                            "canonical_url": "https://example.com/story",
                            "observed_url": "https://example.com/story",
                        }
                    ]
                ]
            )
            with patch(
                "services.workers.app.story_clusters.upsert_verification_result",
                new=AsyncMock(),
            ):
                result = await refresh_canonical_document_verification(
                    cursor,
                    canonical_document_id=uuid.uuid4(),
                )
            return result, cursor

        result, cursor = asyncio.run(run_test())
        self.assertEqual(result["verificationState"], "weak")
        self.assertIn("document_observations obs", cursor.executed[0])
        self.assertIn("obs.observed_url", cursor.executed[0])
        self.assertNotIn(" document_observations do ", cursor.executed[0])

    def test_rebuild_story_cluster_state_avoids_reserved_document_observation_alias(self) -> None:
        story_cluster_id = uuid.uuid4()

        async def run_test() -> tuple[dict[str, object], RecordingAsyncCursor]:
            canonical_document_id = uuid.uuid4()
            cursor = RecordingAsyncCursor(
                [
                    [
                        {
                            "canonical_document_id": str(canonical_document_id),
                            "title": "EU AI policy update",
                            "published_at": "2026-04-08T12:00:00+00:00",
                            "canonical_domain": "example.com",
                            "entities": ["EU"],
                            "places": ["Brussels"],
                        }
                    ],
                    [
                        {
                            "observed_url": "https://example.com/story",
                        }
                    ],
                ]
            )
            with (
                patch(
                    "services.workers.app.story_clusters.fetch_canonical_document_vector",
                    new=AsyncMock(return_value=[]),
                ),
                patch(
                    "services.workers.app.story_clusters.upsert_verification_result",
                    new=AsyncMock(),
                ),
            ):
                result = await rebuild_story_cluster_state(
                    cursor,
                    story_cluster_id=story_cluster_id,
                    vector_version=1,
                )
            return result, cursor

        result, cursor = asyncio.run(run_test())
        self.assertEqual(result["storyClusterId"], str(story_cluster_id))
        self.assertIn("join document_observations obs", cursor.executed[1])
        self.assertIn("select obs.observed_url", cursor.executed[1])
        self.assertNotIn(" document_observations do ", cursor.executed[1])


if __name__ == "__main__":
    unittest.main()
