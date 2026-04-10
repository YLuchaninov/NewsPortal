import sys
import types
import unittest
import uuid

if "psycopg" not in sys.modules:
    psycopg_stub = types.ModuleType("psycopg")

    class _AsyncCursor:
        def __class_getitem__(cls, _item):
            return cls

    psycopg_stub.AsyncCursor = _AsyncCursor
    sys.modules["psycopg"] = psycopg_stub

from services.workers.app.canonical_documents import (
    resolve_observation_duplicate_kind,
    resolve_observation_state,
)


class CanonicalDocumentTests(unittest.TestCase):
    def test_observation_state_is_pending_without_canonical_document(self) -> None:
        self.assertEqual(
            resolve_observation_state(canonical_document_id=None),
            "pending_canonicalization",
        )

    def test_observation_state_is_canonicalized_with_canonical_document(self) -> None:
        self.assertEqual(
            resolve_observation_state(canonical_document_id=uuid.uuid4()),
            "canonicalized",
        )

    def test_duplicate_kind_prefers_exact_and_near_duplicate_flags(self) -> None:
        article_doc_id = uuid.uuid4()
        canonical_document_id = uuid.uuid4()

        self.assertEqual(
            resolve_observation_duplicate_kind(
                article_doc_id=article_doc_id,
                canonical_document_id=canonical_document_id,
                is_exact_duplicate=True,
                is_near_duplicate=False,
            ),
            "exact_duplicate",
        )
        self.assertEqual(
            resolve_observation_duplicate_kind(
                article_doc_id=article_doc_id,
                canonical_document_id=canonical_document_id,
                is_exact_duplicate=False,
                is_near_duplicate=True,
            ),
            "near_duplicate",
        )

    def test_duplicate_kind_marks_canonical_owner_when_ids_match(self) -> None:
        article_doc_id = uuid.uuid4()

        self.assertEqual(
            resolve_observation_duplicate_kind(
                article_doc_id=article_doc_id,
                canonical_document_id=article_doc_id,
                is_exact_duplicate=False,
                is_near_duplicate=False,
            ),
            "canonical",
        )

    def test_duplicate_kind_stays_pending_without_canonical_document(self) -> None:
        self.assertEqual(
            resolve_observation_duplicate_kind(
                article_doc_id=uuid.uuid4(),
                canonical_document_id=None,
                is_exact_duplicate=False,
                is_near_duplicate=False,
            ),
            "pending",
        )


if __name__ == "__main__":
    unittest.main()
