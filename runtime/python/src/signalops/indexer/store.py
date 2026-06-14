from __future__ import annotations

import json
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

import psycopg
from psycopg.rows import dict_row

from signalops.ml.interfaces import HnswIndexStore, HnswSnapshotStore

from .config import IndexerConfig, resolve_runtime_path

LOGGER = logging.getLogger("signalops.indexer")
INTEREST_CENTROIDS_INDEX_NAME = "interest_centroids"
EVENT_CLUSTER_CENTROIDS_INDEX_NAME = "event_cluster_centroids"
INTEREST_CENTROIDS_REBUILD_COMMAND = "pnpm index:rebuild:interest-centroids"
EVENT_CLUSTER_CENTROIDS_REBUILD_COMMAND = "pnpm index:rebuild:event-cluster-centroids"


def _diagnostic(
    code: str,
    *,
    severity: str,
    message: str,
    repair_command: str | None = None,
) -> dict[str, str]:
    result = {
        "code": code,
        "severity": severity,
        "message": message,
    }
    if repair_command:
        result["repairCommand"] = repair_command
    return result


def _build_index_consistency_result(
    *,
    index_name: str,
    active_count: int,
    max_label: int,
    registry_row: Mapping[str, Any] | None,
    config: IndexerConfig,
    rebuild_command: str,
) -> dict[str, Any]:
    registry = dict(registry_row) if registry_row is not None else None
    registry_exists = registry is not None
    registry_entry_count = int(registry.get("entry_count") or 0) if registry else None
    registry_last_label = int(registry.get("last_assigned_label") or 0) if registry else None
    registry_is_dirty = bool(registry.get("is_dirty")) if registry else False
    index_path = Path(str(registry["active_index_path"])) if registry and registry.get("active_index_path") else None
    snapshot_path = (
        Path(str(registry["active_snapshot_path"]))
        if registry and registry.get("active_snapshot_path")
        else None
    )
    index_path_exists = bool(index_path and resolve_runtime_path(index_path).exists())
    snapshot_path_exists = bool(snapshot_path and resolve_runtime_path(snapshot_path).exists())
    empty_without_registry = active_count == 0 and not registry_exists
    entry_count_matches = bool(
        empty_without_registry
        or (registry_exists and registry_entry_count == active_count)
    )
    label_coverage_ok = bool(
        empty_without_registry
        or (registry_exists and registry_last_label is not None and registry_last_label >= max_label)
    )
    files_ok = bool(
        empty_without_registry
        or (registry_exists and index_path_exists and snapshot_path_exists)
    )
    registry_ok = bool(registry_exists or active_count == 0)
    model_key_matches_runtime_default = (
        None
        if not registry
        else str(registry.get("model_key")) == config.default_model_key
    )
    dimensions_match_runtime_default = (
        None
        if not registry
        else int(registry.get("dimensions") or 0) == config.default_dimensions
    )
    checks = {
        "registryExists": registry_exists,
        "entryCountMatches": entry_count_matches,
        "labelCoverageOk": label_coverage_ok,
        "indexPathExists": index_path_exists,
        "snapshotPathExists": snapshot_path_exists,
        "registryDirty": registry_is_dirty,
        "modelKeyMatchesRuntimeDefault": model_key_matches_runtime_default,
        "dimensionsMatchRuntimeDefault": dimensions_match_runtime_default,
    }
    diagnostics: list[dict[str, str]] = []
    if empty_without_registry:
        diagnostics.append(
            _diagnostic(
                "hnsw_empty_index_without_registry",
                severity="info",
                message="No active vectors exist, so a missing HNSW registry row is acceptable.",
            )
        )
    elif not registry_exists:
        diagnostics.append(
            _diagnostic(
                "hnsw_registry_missing",
                severity="error",
                message="Active vectors exist but no HNSW registry row was found.",
                repair_command=rebuild_command,
            )
        )
    if registry_exists and not entry_count_matches:
        diagnostics.append(
            _diagnostic(
                "hnsw_entry_count_mismatch",
                severity="error",
                message="HNSW registry entry_count does not match active vector rows.",
                repair_command=rebuild_command,
            )
        )
    if registry_exists and not label_coverage_ok:
        diagnostics.append(
            _diagnostic(
                "hnsw_label_coverage_mismatch",
                severity="error",
                message="HNSW registry last_assigned_label is below active vector labels.",
                repair_command=rebuild_command,
            )
        )
    if registry_exists and not index_path_exists:
        diagnostics.append(
            _diagnostic(
                "hnsw_index_file_missing",
                severity="error",
                message="HNSW registry points at an index file that is absent.",
                repair_command=rebuild_command,
            )
        )
    if registry_exists and not snapshot_path_exists:
        diagnostics.append(
            _diagnostic(
                "hnsw_snapshot_file_missing",
                severity="error",
                message="HNSW registry points at a snapshot file that is absent.",
                repair_command=rebuild_command,
            )
        )
    if registry_is_dirty:
        diagnostics.append(
            _diagnostic(
                "hnsw_registry_dirty",
                severity="error",
                message="HNSW registry is marked dirty and needs an explicit rebuild.",
                repair_command=rebuild_command,
            )
        )
    if model_key_matches_runtime_default is False:
        diagnostics.append(
            _diagnostic(
                "hnsw_model_differs_from_runtime_default",
                severity="info",
                message="HNSW registry model_key differs from the current runtime embedding default.",
            )
        )
    if dimensions_match_runtime_default is False:
        diagnostics.append(
            _diagnostic(
                "hnsw_dimensions_differ_from_runtime_default",
                severity="warning",
                message="HNSW registry dimensions differ from the current runtime embedding default.",
            )
        )
    is_consistent = bool(
        registry_ok
        and entry_count_matches
        and label_coverage_ok
        and files_ok
        and not registry_is_dirty
    )
    return {
        "indexName": index_name,
        "activeCount": active_count,
        "maxLabel": max_label,
        "registry": registry,
        "expectedRuntime": {
            "modelKey": config.default_model_key,
            "dimensions": config.default_dimensions,
        },
        "checks": checks,
        "diagnostics": diagnostics,
        "recommendedRepairCommand": rebuild_command if not is_consistent else None,
        "isConsistent": is_consistent,
    }


class LocalSnapshotStore(HnswSnapshotStore):
    def __init__(self, snapshot_root: str) -> None:
        self.logical_snapshot_root = Path(snapshot_root)
        self.snapshot_root = resolve_runtime_path(snapshot_root)
        self.snapshot_root.mkdir(parents=True, exist_ok=True)

    def create_snapshot(self, source_path: str, snapshot_name: str) -> str:
        source = resolve_runtime_path(source_path)
        destination = self.snapshot_root / snapshot_name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        return str(self.logical_snapshot_root / snapshot_name)


class InterestCentroidIndexer(HnswIndexStore):
    def __init__(self, config: IndexerConfig) -> None:
        self.config = config
        self.snapshot_store = LocalSnapshotStore(config.snapshot_root)
        self.index_root = Path(config.index_root)
        self.physical_index_root = resolve_runtime_path(config.index_root)
        self.physical_index_root.mkdir(parents=True, exist_ok=True)

    async def rebuild_interest_centroids(self) -> dict[str, Any]:
        async with await psycopg.AsyncConnection.connect(
            self.config.database_url,
            row_factory=dict_row,
        ) as connection:
            rows = await self._load_interest_centroids(connection)
            metadata = await self._write_vector_index(
                connection,
                index_name=INTEREST_CENTROIDS_INDEX_NAME,
                rows=rows,
                entity_id_field="interest_id",
                entity_label_key="interestId",
            )
            await connection.commit()
            return metadata

    async def check_interest_centroids(self) -> dict[str, Any]:
        return await self._check_index_consistency(
            index_name=INTEREST_CENTROIDS_INDEX_NAME,
            rebuild_command=INTEREST_CENTROIDS_REBUILD_COMMAND,
            count_query="""
                select
                  count(*)::int as active_count,
                  max(hnsw_label)::int as max_label
                from interest_vector_registry
                where vector_type = 'centroid'
                  and is_active = true
            """,
        )

    async def rebuild_event_cluster_centroids(self) -> dict[str, Any]:
        async with await psycopg.AsyncConnection.connect(
            self.config.database_url,
            row_factory=dict_row,
        ) as connection:
            await self._ensure_event_cluster_labels(connection)
            rows = await self._load_event_cluster_centroids(connection)
            metadata = await self._write_vector_index(
                connection,
                index_name=EVENT_CLUSTER_CENTROIDS_INDEX_NAME,
                rows=rows,
                entity_id_field="cluster_id",
                entity_label_key="clusterId",
            )
            await connection.commit()
            return metadata

    async def check_event_cluster_centroids(self) -> dict[str, Any]:
        return await self._check_index_consistency(
            index_name=EVENT_CLUSTER_CENTROIDS_INDEX_NAME,
            rebuild_command=EVENT_CLUSTER_CENTROIDS_REBUILD_COMMAND,
            count_query="""
                select
                  count(*)::int as active_count,
                  max(hnsw_label)::int as max_label
                from event_vector_registry
                where entity_type = 'event_cluster'
                  and vector_type = 'e_event'
                  and is_active = true
            """,
        )

    async def check_derived_vectors(self) -> dict[str, Any]:
        interest_result = await self.check_interest_centroids()
        event_result = await self.check_event_cluster_centroids()
        results = {
            "interestCentroids": interest_result,
            "eventClusterCentroids": event_result,
        }
        repair_commands = [
            command
            for command in {
                result.get("recommendedRepairCommand")
                for result in results.values()
                if not result.get("isConsistent")
            }
            if command
        ]
        return {
            "isConsistent": all(result["isConsistent"] for result in results.values()),
            "checks": results,
            "repairCommands": sorted(repair_commands),
        }

    async def _check_index_consistency(
        self,
        *,
        index_name: str,
        rebuild_command: str,
        count_query: str,
    ) -> dict[str, Any]:
        async with await psycopg.AsyncConnection.connect(
            self.config.database_url,
            row_factory=dict_row,
        ) as connection:
            async with connection.cursor() as cursor:
                await cursor.execute(count_query)
                active_row = await cursor.fetchone()
                await cursor.execute(
                    """
                    select
                      index_name,
                      active_index_path,
                      active_snapshot_path,
                      model_key,
                      dimensions,
                      entry_count,
                      last_assigned_label,
                      is_dirty,
                      metadata_json
                    from hnsw_registry
                    where index_name = %s
                    """,
                    (index_name,),
                )
                registry_row = await cursor.fetchone()

        active_count = int(active_row["active_count"] or 0) if active_row else 0
        max_label = int(active_row["max_label"] or 0) if active_row else 0
        return _build_index_consistency_result(
            index_name=index_name,
            active_count=active_count,
            max_label=max_label,
            registry_row=registry_row,
            config=self.config,
            rebuild_command=rebuild_command,
        )

    async def _load_interest_centroids(
        self,
        connection: psycopg.AsyncConnection[Any],
    ) -> list[dict[str, Any]]:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select
                  ivr.interest_id::text as interest_id,
                  ivr.hnsw_label,
                  ivr.vector_version,
                  er.model_key,
                  er.dimensions,
                  er.embedding_json
                from interest_vector_registry ivr
                join embedding_registry er on er.embedding_id = ivr.embedding_id
                where ivr.vector_type = 'centroid'
                  and ivr.is_active = true
                  and er.is_active = true
                order by ivr.hnsw_label nulls last, ivr.interest_id
                """
            )
            return list(await cursor.fetchall())

    async def _ensure_event_cluster_labels(
        self,
        connection: psycopg.AsyncConnection[Any],
    ) -> None:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                insert into hnsw_registry (
                  index_name,
                  model_key,
                  dimensions,
                  vector_version,
                  entry_count,
                  last_assigned_label,
                  is_dirty,
                  metadata_json,
                  created_at,
                  updated_at
                )
                values (%s, %s, %s, 1, 0, 0, true, '{}'::jsonb, now(), now())
                on conflict (index_name) do nothing
                """,
                (
                    EVENT_CLUSTER_CENTROIDS_INDEX_NAME,
                    self.config.default_model_key,
                    self.config.default_dimensions,
                ),
            )
            await cursor.execute(
                """
                select last_assigned_label
                from hnsw_registry
                where index_name = %s
                for update
                """,
                (EVENT_CLUSTER_CENTROIDS_INDEX_NAME,),
            )
            registry_row = await cursor.fetchone()
            next_label = int(registry_row["last_assigned_label"] or 0) if registry_row else 0

            await cursor.execute(
                """
                select entity_id::text as cluster_id
                from event_vector_registry
                where entity_type = 'event_cluster'
                  and vector_type = 'e_event'
                  and is_active = true
                  and hnsw_label is null
                order by updated_at, entity_id
                """
            )
            missing_rows = list(await cursor.fetchall())
            for row in missing_rows:
                next_label += 1
                await cursor.execute(
                    """
                    update event_vector_registry
                    set
                      hnsw_index_name = %s,
                      hnsw_label = %s,
                      updated_at = now()
                    where entity_type = 'event_cluster'
                      and entity_id = %s
                      and vector_type = 'e_event'
                      and is_active = true
                    """,
                    (
                        EVENT_CLUSTER_CENTROIDS_INDEX_NAME,
                        next_label,
                        row["cluster_id"],
                    ),
                )

            await cursor.execute(
                """
                update event_vector_registry
                set
                  hnsw_index_name = %s,
                  updated_at = now()
                where entity_type = 'event_cluster'
                  and vector_type = 'e_event'
                  and is_active = true
                  and coalesce(hnsw_index_name, '') <> %s
                """,
                (
                    EVENT_CLUSTER_CENTROIDS_INDEX_NAME,
                    EVENT_CLUSTER_CENTROIDS_INDEX_NAME,
                ),
            )
            await cursor.execute(
                """
                update hnsw_registry
                set
                  last_assigned_label = greatest(coalesce(last_assigned_label, 0), %s),
                  is_dirty = true,
                  updated_at = now()
                where index_name = %s
                """,
                (
                    next_label,
                    EVENT_CLUSTER_CENTROIDS_INDEX_NAME,
                ),
            )

    async def _load_event_cluster_centroids(
        self,
        connection: psycopg.AsyncConnection[Any],
    ) -> list[dict[str, Any]]:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select
                  evr.entity_id::text as cluster_id,
                  evr.hnsw_label,
                  evr.vector_version,
                  er.model_key,
                  er.dimensions,
                  er.embedding_json
                from event_vector_registry evr
                join embedding_registry er on er.embedding_id = evr.embedding_id
                where evr.entity_type = 'event_cluster'
                  and evr.vector_type = 'e_event'
                  and evr.is_active = true
                  and er.is_active = true
                order by evr.hnsw_label nulls last, evr.entity_id
                """
            )
            return list(await cursor.fetchall())

    async def _write_vector_index(
        self,
        connection: psycopg.AsyncConnection[Any],
        *,
        index_name: str,
        rows: list[dict[str, Any]],
        entity_id_field: str,
        entity_label_key: str,
    ) -> dict[str, Any]:
        dimensions = (
            int(rows[0]["dimensions"])
            if rows
            else self.config.default_dimensions
        )
        model_key = str(rows[0]["model_key"]) if rows else self.config.default_model_key
        active_index_path = self.index_root / f"{index_name}.hnsw"
        physical_index_path = resolve_runtime_path(active_index_path)
        engine = self._write_index_file(
            physical_index_path,
            rows,
            dimensions,
            entity_id_field=entity_id_field,
            entity_label_key=entity_label_key,
        )
        snapshot_name = (
            f"{index_name}-"
            f"{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}.hnsw"
        )
        active_snapshot_path = self.snapshot_store.create_snapshot(
            str(active_index_path),
            snapshot_name,
        )
        entry_count = len(rows)
        last_assigned_label = max((int(row["hnsw_label"] or 0) for row in rows), default=0)
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                insert into hnsw_registry (
                  index_name,
                  model_key,
                  dimensions,
                  vector_version,
                  active_index_path,
                  active_snapshot_path,
                  entry_count,
                  last_assigned_label,
                  is_dirty,
                  metadata_json,
                  last_rebuilt_at,
                  updated_at
                )
                values (
                  %s,
                  %s,
                  %s,
                  1,
                  %s,
                  %s,
                  %s,
                  %s,
                  false,
                  %s::jsonb,
                  now(),
                  now()
                )
                on conflict (index_name) do update
                set
                  model_key = excluded.model_key,
                  dimensions = excluded.dimensions,
                  active_index_path = excluded.active_index_path,
                  active_snapshot_path = excluded.active_snapshot_path,
                  entry_count = excluded.entry_count,
                  last_assigned_label = excluded.last_assigned_label,
                  is_dirty = false,
                  metadata_json = excluded.metadata_json,
                  last_rebuilt_at = excluded.last_rebuilt_at,
                  updated_at = now()
                """,
                (
                    index_name,
                    model_key,
                    dimensions,
                    str(active_index_path),
                    active_snapshot_path,
                    entry_count,
                    last_assigned_label,
                    json.dumps(
                        {
                            "engine": engine,
                            "space": "cosine",
                            "entryCount": entry_count,
                        }
                    ),
                ),
            )
        LOGGER.info(
            "Rebuilt %s index with %s active centroids using %s.",
            index_name,
            entry_count,
            engine,
        )
        return {
            "indexName": index_name,
            "entryCount": entry_count,
            "activeIndexPath": str(active_index_path),
            "activeSnapshotPath": active_snapshot_path,
            "dimensions": dimensions,
            "modelKey": model_key,
            "engine": engine,
        }

    def _write_index_file(
        self,
        index_path: Path,
        rows: list[dict[str, Any]],
        dimensions: int,
        *,
        entity_id_field: str,
        entity_label_key: str,
    ) -> str:
        try:
            import hnswlib
            import numpy as np
        except Exception as error:  # pragma: no cover - env dependent fallback
            LOGGER.warning("hnswlib is unavailable, writing JSON fallback index: %s", error)
            payload = {
                "engine": "json-fallback",
                "space": "cosine",
                "dimensions": dimensions,
                "items": [
                    {
                        "label": int(row["hnsw_label"]),
                        entity_label_key: str(row[entity_id_field]),
                        "vector": row["embedding_json"],
                    }
                    for row in rows
                ],
            }
            index_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2))
            return "json-fallback"

        index = hnswlib.Index(space="cosine", dim=dimensions)
        max_elements = max(len(rows), 1)
        index.init_index(
            max_elements=max_elements,
            ef_construction=self.config.hnsw_ef_construction,
            M=self.config.hnsw_m,
        )
        index.set_ef(max(self.config.hnsw_ef_search, 1))
        if rows:
            labels = np.array([int(row["hnsw_label"]) for row in rows], dtype=np.int64)
            vectors = np.array(
                [[float(value) for value in row["embedding_json"]] for row in rows],
                dtype=np.float32,
            )
            index.add_items(vectors, labels)
        index.save_index(str(index_path))
        return "hnswlib"
