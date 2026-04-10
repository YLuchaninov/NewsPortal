import math
import unittest

from services.ml.app.compiler import CriterionBaselineCompiler, InterestBaselineCompiler
from services.ml.app.embedding import (
    HashEmbeddingProvider,
    mean_vectors,
    normalize_vector,
    truncate_text_for_embedding,
)


class FakeEmbeddingProvider:
    model_key = "fake://unit-test"
    dimensions = 2

    def __init__(self) -> None:
        self._vectors = {
            "EU AI policy": [1.0, 0.0],
            "Brussels AI rules": [0.0, 1.0],
            "Crisis watch": [1.0, 1.0],
            "Crisis update": [1.0, 1.0],
            "sports": [-1.0, 0.0],
            "gossip": [0.0, -1.0],
            "ignore me": [-1.0, -1.0],
        }

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return [self._vectors[text] for text in texts]


class EmbeddingAndCompilerTests(unittest.TestCase):
    def test_normalize_vector_returns_unit_length(self) -> None:
        normalized = normalize_vector([3.0, 4.0])

        self.assertAlmostEqual(normalized[0], 0.6)
        self.assertAlmostEqual(normalized[1], 0.8)
        self.assertEqual(normalize_vector([0.0, 0.0]), [0.0, 0.0])

    def test_mean_vectors_and_truncation_are_deterministic(self) -> None:
        self.assertEqual(mean_vectors([[1.0, 3.0], [3.0, 5.0]]), [2.0, 4.0])
        self.assertEqual(
            truncate_text_for_embedding(
                "one two three four five",
                token_limit=3,
                tail_token_limit=1,
            ),
            "one two three ... five",
        )

    def test_hash_embedding_provider_is_deterministic(self) -> None:
        provider = HashEmbeddingProvider(dimensions=8)

        first = provider.embed_texts(["same input"])[0]
        second = provider.embed_texts(["same input"])[0]

        self.assertEqual(len(first), 8)
        self.assertEqual(first, second)
        self.assertAlmostEqual(math.sqrt(sum(value * value for value in first)), 1.0)

    def test_interest_compiler_normalizes_lists_and_constraints(self) -> None:
        compiler = InterestBaselineCompiler()
        compiled = compiler.compile(
            {
                "description": "EU AI policy",
                "positive_texts": '["EU AI policy", "Brussels AI rules", "eu ai policy"]',
                "negative_texts": ["sports", "sports", "gossip"],
                "places": ("Brussels", "Warsaw"),
                "languages_allowed": '["en"]',
                "time_window_hours": "24",
                "priority": "0.8",
            },
            FakeEmbeddingProvider(),
        )

        self.assertEqual(compiled.positive_prototypes, ["EU AI policy", "Brussels AI rules"])
        self.assertEqual(compiled.negative_prototypes, ["sports", "gossip"])
        self.assertEqual(compiled.lexical_query, "policy brussels rules")
        self.assertEqual(compiled.hard_constraints["places"], ["Brussels", "Warsaw"])
        self.assertEqual(compiled.hard_constraints["languages_allowed"], ["en"])
        self.assertEqual(compiled.hard_constraints["time_window_hours"], 24)
        self.assertEqual(compiled.hard_constraints["priority"], 0.8)
        self.assertEqual(compiled.model_key, "fake://unit-test")
        self.assertEqual(compiled.dimensions, 2)
        self.assertEqual(compiled.source_snapshot["positive_texts"], ["EU AI policy", "Brussels AI rules", "eu ai policy"])
        self.assertEqual(compiled.source_snapshot["negative_texts"], ["sports", "sports", "gossip"])
        self.assertAlmostEqual(compiled.centroid_embedding[0], math.sqrt(0.5))
        self.assertAlmostEqual(compiled.centroid_embedding[1], math.sqrt(0.5))

    def test_criterion_compiler_requires_description(self) -> None:
        compiler = CriterionBaselineCompiler()

        with self.assertRaisesRegex(ValueError, "non-empty description"):
            compiler.compile(
                {
                    "description": "",
                    "negative_texts": ["sports"],
                },
                FakeEmbeddingProvider(),
            )

    def test_criterion_compiler_requires_negative_prototypes(self) -> None:
        compiler = CriterionBaselineCompiler()

        with self.assertRaisesRegex(ValueError, "negative prototype"):
            compiler.compile(
                {
                    "description": "Crisis watch",
                    "positive_texts": "Crisis update",
                    "negative_texts": "",
                },
                FakeEmbeddingProvider(),
            )

    def test_compiler_applies_defaults_and_string_coercion(self) -> None:
        compiler = CriterionBaselineCompiler()
        compiled = compiler.compile(
            {
                "description": "Crisis watch",
                "positive_texts": "Crisis update",
                "negative_texts": '["ignore me"]',
                "must_have_terms": "alert",
            },
            FakeEmbeddingProvider(),
        )

        self.assertEqual(compiled.positive_prototypes, ["Crisis watch", "Crisis update"])
        self.assertEqual(compiled.negative_prototypes, ["ignore me"])
        self.assertEqual(compiled.hard_constraints["must_have_terms"], ["alert"])
        self.assertIsNone(compiled.hard_constraints["time_window_hours"])
        self.assertEqual(compiled.hard_constraints["priority"], 1.0)
        self.assertEqual(compiled.hard_constraints["enabled"], True)

    def test_compiler_keeps_blank_time_window_as_no_limit(self) -> None:
        compiler = InterestBaselineCompiler()
        compiled = compiler.compile(
            {
                "description": "Crisis watch",
                "positive_texts": "Crisis update",
                "negative_texts": '["ignore me"]',
                "time_window_hours": "",
            },
            FakeEmbeddingProvider(),
        )

        self.assertIsNone(compiled.hard_constraints["time_window_hours"])


if __name__ == "__main__":
    unittest.main()
