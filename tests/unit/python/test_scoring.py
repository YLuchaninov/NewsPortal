import unittest
from datetime import datetime, timedelta, timezone

from services.workers.app.scoring import (
    compute_cluster_same_event_score,
    compute_criterion_final_score,
    compute_criterion_meta_score,
    compute_interest_final_score,
    compute_interest_meta_score,
    cosine_similarity,
    decide_cluster,
    decide_criterion,
    decide_interest,
    hours_between,
    is_major_update,
    normalize_fts_score,
    overlap_ratio,
    parse_datetime,
    place_match_score,
    semantic_prototype_score,
)


class ScoringTests(unittest.TestCase):
    def test_cosine_similarity_handles_empty_and_matching_vectors(self) -> None:
        self.assertEqual(cosine_similarity([], [1.0]), 0.0)
        self.assertEqual(cosine_similarity([1.0], [1.0, 2.0]), 0.0)
        self.assertAlmostEqual(cosine_similarity([1.0, 0.0], [1.0, 0.0]), 1.0)

    def test_overlap_place_and_semantic_helpers_cover_edge_cases(self) -> None:
        self.assertAlmostEqual(overlap_ratio(["AI", "AI"], ["ai", "ml"]), 0.5)
        self.assertEqual(overlap_ratio(["AI"], []), 0.0)
        self.assertEqual(place_match_score(["Warsaw"], ["Warsaw", "Berlin"]), 1.0)
        self.assertEqual(place_match_score(["Warsaw"], ["Berlin", "Paris"]), 0.0)
        self.assertAlmostEqual(
            semantic_prototype_score(
                title_vector=[1.0, 0.0],
                lead_vector=[0.0, 1.0],
                body_vector=[0.0, 0.0],
                prototypes=[[1.0, 0.0], [0.0, 1.0]],
                title_weight=0.7,
                lead_weight=0.2,
                body_weight=0.1,
            ),
            0.7,
        )

    def test_criterion_meta_score_and_decision_thresholds(self) -> None:
        score, components = compute_criterion_meta_score(
            article_features={
                "short_tokens": ["EU", "AI"],
                "numbers": ["42"],
                "places": ["Warsaw", "Brussels"],
                "entities": ["European Union"],
            },
            target_features={
                "short_tokens": ["AI"],
                "numbers": ["42"],
                "places": ["Warsaw"],
                "entities": ["European Union"],
            },
            place_constraints=[],
            is_within_time_window=True,
        )

        self.assertGreater(score, 0.9)
        self.assertEqual(components["S_place"], 1.0)
        self.assertEqual(decide_criterion(0.72), "relevant")
        self.assertEqual(decide_criterion(0.45), "irrelevant")
        self.assertEqual(decide_criterion(0.6), "gray_zone")
        self.assertGreater(
            compute_criterion_final_score(
                positive_score=0.9,
                negative_score=0.1,
                lexical_score=0.8,
                meta_score=score,
            ),
            0.72,
        )

    def test_interest_scoring_respects_novelty_and_priority(self) -> None:
        score, components = compute_interest_meta_score(
            article_features={
                "short_tokens": ["AI"],
                "places": ["Warsaw"],
                "entities": ["European Union"],
            },
            target_features={
                "short_tokens": ["AI"],
                "places": ["Warsaw", "Brussels"],
                "entities": ["European Union"],
            },
            place_constraints=["Warsaw"],
            language_allowed=True,
        )

        self.assertGreater(score, 0.8)
        self.assertEqual(components["S_lang"], 1.0)
        self.assertEqual(decide_interest(0.78, novelty_score=0.2, priority=0.5), "notify")
        self.assertEqual(decide_interest(0.65, novelty_score=1.0, priority=0.2), "notify")
        self.assertEqual(decide_interest(0.60, novelty_score=0.1, priority=0.9), "notify")
        self.assertEqual(decide_interest(0.65, novelty_score=0.2, priority=0.2), "gray_zone")
        self.assertEqual(decide_interest(0.4, novelty_score=1.0, priority=1.0), "ignore")
        self.assertGreater(
            compute_interest_final_score(
                positive_score=0.9,
                negative_score=0.1,
                meta_score=score,
                novelty_score=1.0,
                priority=0.8,
            ),
            0.78,
        )

    def test_cluster_and_datetime_helpers_are_stable(self) -> None:
        left = datetime(2026, 3, 21, 10, 0, tzinfo=timezone.utc)
        right = left + timedelta(hours=6)

        self.assertAlmostEqual(hours_between(left, right), 6.0)
        self.assertEqual(hours_between(None, right), 9999.0)
        self.assertEqual(parse_datetime("2026-03-21T10:00:00Z"), left)
        self.assertEqual(parse_datetime("not-a-date"), None)
        self.assertEqual(normalize_fts_score(-3.0), 0.0)
        self.assertAlmostEqual(normalize_fts_score(3.0), 0.75)

        cluster_score = compute_cluster_same_event_score(
            semantic_score=0.9,
            entity_score=0.8,
            geo_score=1.0,
            delta_hours=6.0,
        )
        self.assertTrue(decide_cluster(cluster_score))
        self.assertTrue(decide_cluster(0.78))

    def test_major_update_detects_new_entities_places_and_numbers(self) -> None:
        self.assertEqual(
            is_major_update(
                existing_entities=["EU"],
                existing_places=["Warsaw"],
                existing_numbers=["42"],
                incoming_entities=["EU"],
                incoming_places=["Warsaw"],
                incoming_numbers=["42"],
            ),
            False,
        )
        self.assertEqual(
            is_major_update(
                existing_entities=["EU"],
                existing_places=["Warsaw"],
                existing_numbers=["42"],
                incoming_entities=["EU", "NATO"],
                incoming_places=["Warsaw"],
                incoming_numbers=["42"],
            ),
            True,
        )


if __name__ == "__main__":
    unittest.main()
