import tempfile
import unittest
from pathlib import Path

from services.indexer.app.config import IndexerConfig
from services.indexer.app.store import (
    INTEREST_CENTROIDS_INDEX_NAME,
    INTEREST_CENTROIDS_REBUILD_COMMAND,
    _build_index_consistency_result,
)


def _config(tmp_path: Path) -> IndexerConfig:
    return IndexerConfig(
        database_url="postgresql://unit-test",
        index_root=str(tmp_path / "indices"),
        snapshot_root=str(tmp_path / "snapshots"),
        default_model_key="hash://deterministic/384",
        default_dimensions=384,
        hnsw_m=16,
        hnsw_ef_construction=200,
        hnsw_ef_search=64,
    )


def _diagnostic_codes(result: dict) -> set[str]:
    return {diagnostic["code"] for diagnostic in result["diagnostics"]}


class IndexerConsistencyTests(unittest.TestCase):
    def test_empty_index_without_registry_is_consistent(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            result = _build_index_consistency_result(
                index_name=INTEREST_CENTROIDS_INDEX_NAME,
                active_count=0,
                max_label=0,
                registry_row=None,
                config=_config(Path(temp_dir)),
                rebuild_command=INTEREST_CENTROIDS_REBUILD_COMMAND,
            )

        self.assertTrue(result["isConsistent"])
        self.assertIsNone(result["recommendedRepairCommand"])
        self.assertIn("hnsw_empty_index_without_registry", _diagnostic_codes(result))

    def test_dirty_registry_and_missing_files_are_inconsistent(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            result = _build_index_consistency_result(
                index_name=INTEREST_CENTROIDS_INDEX_NAME,
                active_count=2,
                max_label=2,
                registry_row={
                    "index_name": INTEREST_CENTROIDS_INDEX_NAME,
                    "active_index_path": str(root / "missing.hnsw"),
                    "active_snapshot_path": str(root / "missing-snapshot.hnsw"),
                    "model_key": "hash://deterministic/384",
                    "dimensions": 384,
                    "entry_count": 2,
                    "last_assigned_label": 2,
                    "is_dirty": True,
                    "metadata_json": {},
                },
                config=_config(root),
                rebuild_command=INTEREST_CENTROIDS_REBUILD_COMMAND,
            )

        codes = _diagnostic_codes(result)
        self.assertFalse(result["isConsistent"])
        self.assertEqual(result["recommendedRepairCommand"], INTEREST_CENTROIDS_REBUILD_COMMAND)
        self.assertIn("hnsw_registry_dirty", codes)
        self.assertIn("hnsw_index_file_missing", codes)
        self.assertIn("hnsw_snapshot_file_missing", codes)

    def test_count_and_label_mismatch_are_inconsistent(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            index_file = root / "index.hnsw"
            snapshot_file = root / "snapshot.hnsw"
            index_file.write_text("index", encoding="utf-8")
            snapshot_file.write_text("snapshot", encoding="utf-8")

            result = _build_index_consistency_result(
                index_name=INTEREST_CENTROIDS_INDEX_NAME,
                active_count=3,
                max_label=9,
                registry_row={
                    "index_name": INTEREST_CENTROIDS_INDEX_NAME,
                    "active_index_path": str(index_file),
                    "active_snapshot_path": str(snapshot_file),
                    "model_key": "hash://deterministic/384",
                    "dimensions": 384,
                    "entry_count": 2,
                    "last_assigned_label": 4,
                    "is_dirty": False,
                    "metadata_json": {},
                },
                config=_config(root),
                rebuild_command=INTEREST_CENTROIDS_REBUILD_COMMAND,
            )

        codes = _diagnostic_codes(result)
        self.assertFalse(result["isConsistent"])
        self.assertIn("hnsw_entry_count_mismatch", codes)
        self.assertIn("hnsw_label_coverage_mismatch", codes)

    def test_runtime_model_drift_is_diagnostic_not_consistency_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            index_file = root / "index.hnsw"
            snapshot_file = root / "snapshot.hnsw"
            index_file.write_text("index", encoding="utf-8")
            snapshot_file.write_text("snapshot", encoding="utf-8")

            result = _build_index_consistency_result(
                index_name=INTEREST_CENTROIDS_INDEX_NAME,
                active_count=1,
                max_label=1,
                registry_row={
                    "index_name": INTEREST_CENTROIDS_INDEX_NAME,
                    "active_index_path": str(index_file),
                    "active_snapshot_path": str(snapshot_file),
                    "model_key": "sentence-transformers/all-MiniLM-L6-v2",
                    "dimensions": 768,
                    "entry_count": 1,
                    "last_assigned_label": 1,
                    "is_dirty": False,
                    "metadata_json": {},
                },
                config=_config(root),
                rebuild_command=INTEREST_CENTROIDS_REBUILD_COMMAND,
            )

        codes = _diagnostic_codes(result)
        self.assertTrue(result["isConsistent"])
        self.assertIn("hnsw_model_differs_from_runtime_default", codes)
        self.assertIn("hnsw_dimensions_differ_from_runtime_default", codes)


if __name__ == "__main__":
    unittest.main()
