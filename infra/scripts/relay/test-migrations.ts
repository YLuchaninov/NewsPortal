import { randomUUID } from "node:crypto";

import { loadRelayConfig } from "../../../services/relay/src/config";
import { createPgPool } from "../../../services/relay/src/db";
import { applyPendingMigrations } from "../../../services/relay/src/migrations";

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll("\"", "\"\"")}"`;
}

async function main(): Promise<void> {
  const config = loadRelayConfig();
  const pool = createPgPool(config);
  const schemaName = `migration_smoke_${randomUUID().replaceAll("-", "")}`;
  const schemaSequencesTable = `${quoteIdentifier(schemaName)}.sequences`;

  try {
    const appliedMigrations = await applyPendingMigrations(pool, {
      schema: schemaName
    });

    const tablesResult = await pool.query<{ table_name: string }>(
      `
        select table_name
        from information_schema.tables
        where table_schema = $1
      `,
      [schemaName]
    );
    const indexResult = await pool.query<{ indexname: string }>(
      `
        select indexname
        from pg_indexes
        where schemaname = $1
      `,
      [schemaName]
    );
    const columnResult = await pool.query<{ table_name: string; column_name: string }>(
      `
        select table_name, column_name
        from information_schema.columns
        where table_schema = $1
          and (
            (table_name = 'signal_candidates' and column_name in (
              'enrichment_state',
              'enriched_at',
              'full_content_html',
              'extracted_description',
              'extracted_author',
              'extracted_ttr_seconds',
              'extracted_image_url',
              'extracted_favicon_url',
              'extracted_published_at',
              'extracted_source_name'
            ))
            or
            table_name like 'discovery_%'
            or
            (table_name = 'canonical_documents' and column_name in (
              'canonical_domain',
              'canonical_url',
              'observation_count',
              'last_observed_at'
            ))
            or
            (table_name = 'document_observations' and column_name in (
              'canonical_document_id',
              'duplicate_kind',
              'observation_state'
            ))
            or
            (table_name = 'story_clusters' and column_name in (
              'canonical_document_count',
              'source_family_count',
              'verification_state'
            ))
            or
            (table_name = 'story_cluster_members' and column_name in (
              'story_cluster_id',
              'canonical_document_id'
            ))
            or
            (table_name = 'verification_results' and column_name in (
              'target_type',
              'verification_state',
              'source_family_count'
            ))
            or
            (table_name = 'interest_filter_results' and column_name in (
              'filter_scope',
              'canonical_document_id',
              'story_cluster_id',
              'technical_filter_state',
              'semantic_decision',
              'verification_state'
            ))
            or
            (table_name = 'final_selection_results' and column_name in (
              'canonical_document_id',
              'story_cluster_id',
              'verification_state',
              'final_decision',
              'is_selected',
              'compat_system_feed_decision'
            ))
            or
            (table_name = 'source_channels' and column_name in (
              'auth_config_json',
              'enrichment_enabled',
              'enrichment_min_body_length'
            ))
            or
            (table_name = 'crawl_policy_cache' and column_name in (
              'sitemap_urls',
              'feed_urls',
              'expires_at',
              'request_validators_json',
              'response_cache_json'
            ))
            or
            (table_name = 'channel_fetch_runs' and column_name in (
              'provider_metrics_json'
            ))
            or
            (table_name = 'web_resources' and column_name in (
              'resource_kind',
              'classification_json',
              'extraction_state',
              'projected_signal_candidate_id'
            ))
            or
            (table_name in (
              'source_inventory',
              'source_monitoring_state',
              'source_observations',
              'adapter_backlog'
            ))
          )
      `,
      [schemaName]
    );
    const constraintResult = await pool.query<{
      table_name: string;
      conname: string;
      definition: string;
    }>(
      `
        select
          t.relname as table_name,
          c.conname,
          pg_get_constraintdef(c.oid) as definition
        from pg_constraint c
        join pg_namespace n on n.oid = c.connamespace
        join pg_class t on t.oid = c.conrelid
        where n.nspname = $1
          and c.conname in (
            'fetch_cursors_cursor_type_check',
            'discovery_artifacts_type_check',
            'discovery_artifacts_status_check',
            'discovery_artifacts_memory_mode_check',
            'discovery_candidates_status_check',
            'discovery_candidates_rediscovery_check',
            'source_inventory_state_check',
            'source_inventory_provider_check',
            'source_monitoring_mode_check',
            'source_monitoring_failures_check',
            'source_observations_kind_check',
            'discovery_policies_type_check',
            'discovery_policies_status_check',
            'adapter_backlog_need_check',
            'adapter_backlog_priority_check',
            'adapter_backlog_status_check',
            'discovery_feedback_target_type_check',
            'discovery_feedback_type_check',
            'discovery_vnext_runs_kind_check',
            'discovery_vnext_runs_trigger_check',
            'discovery_vnext_runs_status_check',
            'discovery_replay_runs_kind_check',
            'discovery_replay_runs_status_check',
            'discovery_rollback_groups_status_check',
            'discovery_rollback_actions_type_check',
            'discovery_rollback_actions_target_check',
            'discovery_rollback_actions_status_check',
            'discovery_vnext_eval_runs_status_check'
          )
      `,
      [schemaName]
    );
    const sequenceResult = await pool.query<{
      sequence_id: string;
      trigger_event: string;
      task_graph: Array<{ module?: string }>;
      active_trigger_count: string;
    }>(
      `
        select
          sequence_id::text as sequence_id,
          trigger_event,
          task_graph,
          (
            select count(*)::text
            from ${schemaSequencesTable}
            where trigger_event = s.trigger_event
              and status = 'active'
          ) as active_trigger_count
        from ${schemaSequencesTable} as s
        where sequence_id in (
          '5cc77217-7a2f-4318-9fef-c6734e0f22f1',
          '0f8e3894-86ef-4a29-b5dc-1a7ea708ba2d'
        )
      `
    );

    const actualTables = new Set(tablesResult.rows.map((row) => row.table_name));
    const actualIndexes = new Set(indexResult.rows.map((row) => row.indexname));
    const actualColumns = new Set(
      columnResult.rows.map((row) => `${row.table_name}.${row.column_name}`)
    );

    const expectedTables = [
      "source_channels",
      "fetch_cursors",
      "crawl_policy_cache",
      "signal_candidates",
      "discovery_artifacts",
      "discovery_candidates",
      "source_inventory",
      "source_monitoring_state",
      "source_observations",
      "discovery_policies",
      "adapter_backlog",
      "discovery_feedback_events",
      "discovery_vnext_runs",
      "discovery_replay_runs",
      "discovery_rollback_groups",
      "discovery_rollback_actions",
      "discovery_vnext_eval_runs",
      "canonical_documents",
      "document_observations",
      "story_clusters",
      "story_cluster_members",
      "verification_results",
      "interest_filter_results",
      "final_selection_results",
      "web_resources",
      "signal_candidate_external_refs",
      "outbox_events",
      "inbox_processed_events"
    ];
    const expectedIndexes = [
      "source_channels_provider_external_id_unique",
      "fetch_cursors_channel_cursor_type_unique",
      "crawl_policy_cache_expires_idx",
      "signal_candidates_channel_source_signal_candidate_id_unique",
      "signal_candidates_processing_state_idx",
      "discovery_artifacts_run_idx",
      "discovery_artifacts_interest_idx",
      "discovery_artifacts_candidate_idx",
      "discovery_artifacts_type_status_idx",
      "discovery_artifacts_vnext_run_idx",
      "discovery_candidates_domain_idx",
      "discovery_candidates_interest_idx",
      "discovery_candidates_run_url_idx",
      "discovery_candidates_vnext_run_idx",
      "discovery_candidates_vnext_run_url_idx",
      "source_inventory_identity_idx",
      "source_inventory_state_idx",
      "source_monitoring_due_idx",
      "source_observations_source_time_idx",
      "discovery_policies_name_version_idx",
      "discovery_policies_active_idx",
      "adapter_backlog_status_idx",
      "discovery_feedback_target_idx",
      "discovery_vnext_runs_status_idx",
      "discovery_replay_runs_status_idx",
      "discovery_rollback_groups_status_idx",
      "discovery_rollback_actions_group_idx",
      "discovery_vnext_eval_runs_status_idx",
      "canonical_documents_canonical_domain_idx",
      "canonical_documents_published_at_idx",
      "canonical_documents_last_observed_at_idx",
      "document_observations_channel_id_idx",
      "document_observations_canonical_document_id_idx",
      "document_observations_observation_state_idx",
      "story_clusters_max_published_at_idx",
      "story_clusters_verification_state_idx",
      "story_cluster_members_story_cluster_id_idx",
      "verification_results_target_type_state_idx",
      "interest_filter_results_doc_filter_key_unique",
      "interest_filter_results_scope_semantic_decision_idx",
      "interest_filter_results_canonical_document_id_idx",
      "interest_filter_results_story_cluster_id_idx",
      "final_selection_results_selected_idx",
      "final_selection_results_final_decision_idx",
      "final_selection_results_canonical_document_id_idx",
      "final_selection_results_story_cluster_id_idx",
      "web_resources_channel_external_resource_id_unique",
      "web_resources_channel_normalized_url_unique",
      "web_resources_channel_id_idx",
      "web_resources_resource_kind_idx",
      "web_resources_extraction_state_idx",
      "web_resources_projected_signal_candidate_id_idx",
      "outbox_events_status_created_at_idx"
    ];
    const expectedColumns = [
      "signal_candidates.enrichment_state",
      "signal_candidates.enriched_at",
      "signal_candidates.full_content_html",
      "signal_candidates.extracted_description",
      "signal_candidates.extracted_author",
      "signal_candidates.extracted_ttr_seconds",
      "signal_candidates.extracted_image_url",
      "signal_candidates.extracted_favicon_url",
      "signal_candidates.extracted_published_at",
      "signal_candidates.extracted_source_name",
      "discovery_artifacts.artifact_id",
      "discovery_artifacts.artifact_type",
      "discovery_artifacts.payload_json",
      "discovery_artifacts.validation_json",
      "discovery_artifacts.vnext_run_id",
      "discovery_candidates.candidate_id",
      "discovery_candidates.canonical_url",
      "discovery_candidates.vnext_run_id",
      "source_inventory.source_inventory_id",
      "source_inventory.current_state",
      "source_inventory.latest_source_understanding_artifact_id",
      "source_inventory.latest_routing_decision_artifact_id",
      "source_monitoring_state.monitoring_mode",
      "source_observations.observation_kind",
      "discovery_policies.policy_type",
      "discovery_policies.policy_version",
      "adapter_backlog.adapter_need",
      "discovery_feedback_events.feedback_type",
      "discovery_vnext_runs.run_kind",
      "discovery_replay_runs.replay_kind",
      "discovery_rollback_groups.status",
      "discovery_rollback_actions.action_type",
      "discovery_vnext_eval_runs.suite_name",
      "canonical_documents.canonical_domain",
      "canonical_documents.canonical_url",
      "canonical_documents.observation_count",
      "canonical_documents.last_observed_at",
      "document_observations.canonical_document_id",
      "document_observations.duplicate_kind",
      "document_observations.observation_state",
      "story_clusters.canonical_document_count",
      "story_clusters.source_family_count",
      "story_clusters.verification_state",
      "story_cluster_members.story_cluster_id",
      "story_cluster_members.canonical_document_id",
      "verification_results.target_type",
      "verification_results.verification_state",
      "verification_results.source_family_count",
      "interest_filter_results.filter_scope",
      "interest_filter_results.canonical_document_id",
      "interest_filter_results.story_cluster_id",
      "interest_filter_results.technical_filter_state",
      "interest_filter_results.semantic_decision",
      "interest_filter_results.verification_state",
      "final_selection_results.canonical_document_id",
      "final_selection_results.story_cluster_id",
      "final_selection_results.verification_state",
      "final_selection_results.final_decision",
      "final_selection_results.is_selected",
      "final_selection_results.compat_system_feed_decision",
      "source_channels.auth_config_json",
      "source_channels.enrichment_enabled",
      "source_channels.enrichment_min_body_length",
      "crawl_policy_cache.sitemap_urls",
      "crawl_policy_cache.feed_urls",
      "crawl_policy_cache.expires_at",
      "crawl_policy_cache.request_validators_json",
      "crawl_policy_cache.response_cache_json",
      "channel_fetch_runs.provider_metrics_json",
      "web_resources.resource_kind",
      "web_resources.classification_json",
      "web_resources.extraction_state",
      "web_resources.projected_signal_candidate_id",
    ];

    for (const tableName of expectedTables) {
      if (!actualTables.has(tableName)) {
        throw new Error(`Migration smoke expected table ${tableName} in schema ${schemaName}.`);
      }
    }

    const forbiddenLegacyDiscoveryTables = [
      "legacy_archive_batches",
      "targets",
      "runs",
      "provider_capabilities",
      "provider_health",
      "coverage_snapshots",
      "hypotheses",
      "debates",
      "provider_queries",
      "evidence_items",
      "negative_evidence",
      "signal_clusters",
      "claims",
      "claim_evidence",
      "domain_inventory",
      "source_identities",
      "source_endpoints",
      "source_contracts",
      "source_edges",
      "actions",
      "repairs",
      "eval_suites",
      "eval_cases",
      "eval_runs",
      "llm_decisions",
      "llm_task_templates"
    ];
    for (const tableSuffix of forbiddenLegacyDiscoveryTables) {
      const tableName = `discovery_${tableSuffix}`;
      if (actualTables.has(tableName)) {
        throw new Error(`Migration smoke expected legacy discovery table ${tableName} to be absent in schema ${schemaName}.`);
      }
    }

    for (const indexName of expectedIndexes) {
      if (!actualIndexes.has(indexName)) {
        throw new Error(`Migration smoke expected index ${indexName} in schema ${schemaName}.`);
      }
    }

    for (const columnName of expectedColumns) {
      if (!actualColumns.has(columnName)) {
        throw new Error(`Migration smoke expected column ${columnName} in schema ${schemaName}.`);
      }
    }

    const constraintByName = new Map(
      constraintResult.rows.map((row) => [row.conname, row])
    );
    const cursorConstraint = constraintByName.get("fetch_cursors_cursor_type_check");
    if (!cursorConstraint) {
      throw new Error(
        `Migration smoke expected fetch_cursors_cursor_type_check in schema ${schemaName}.`
      );
    }
    for (const requiredCursorType of ["lastmod", "set_diff", "content_hash"]) {
      if (!cursorConstraint.definition.includes(requiredCursorType)) {
        throw new Error(
          `Migration smoke expected fetch_cursors_cursor_type_check to include ${requiredCursorType}, got ${cursorConstraint.definition}.`
        );
      }
    }

    const requiredDiscoveryConstraints = [
      "discovery_artifacts_type_check",
      "discovery_artifacts_status_check",
      "discovery_artifacts_memory_mode_check",
      "discovery_candidates_status_check",
      "discovery_candidates_rediscovery_check",
      "source_inventory_state_check",
      "source_inventory_provider_check",
      "source_monitoring_mode_check",
      "source_monitoring_failures_check",
      "source_observations_kind_check",
      "discovery_policies_type_check",
      "discovery_policies_status_check",
      "adapter_backlog_need_check",
      "adapter_backlog_priority_check",
      "adapter_backlog_status_check",
      "discovery_feedback_target_type_check",
      "discovery_feedback_type_check",
      "discovery_vnext_runs_kind_check",
      "discovery_vnext_runs_trigger_check",
      "discovery_vnext_runs_status_check",
      "discovery_replay_runs_kind_check",
      "discovery_replay_runs_status_check",
      "discovery_rollback_groups_status_check",
      "discovery_rollback_actions_type_check",
      "discovery_rollback_actions_target_check",
      "discovery_rollback_actions_status_check",
      "discovery_vnext_eval_runs_status_check"
    ];
    for (const constraintName of requiredDiscoveryConstraints) {
      if (!constraintByName.has(constraintName)) {
        throw new Error(
          `Migration smoke expected discovery constraint ${constraintName} in schema ${schemaName}.`
        );
      }
    }

    const sequencesById = new Map(sequenceResult.rows.map((row) => [row.sequence_id, row]));
    const signalCandidateSequence = sequencesById.get("5cc77217-7a2f-4318-9fef-c6734e0f22f1");
    if (!signalCandidateSequence) {
      throw new Error(
        `Migration smoke expected active signal_candidate sequence 5cc77217-7a2f-4318-9fef-c6734e0f22f1 in schema ${schemaName}.`
      );
    }
    if (signalCandidateSequence.active_trigger_count !== "1") {
      throw new Error(
        `Migration smoke expected exactly one active signal_candidate.ingest.requested sequence, got ${signalCandidateSequence.active_trigger_count}.`
      );
    }
    const firstTaskModule = signalCandidateSequence.task_graph?.[0]?.module ?? null;
    if (firstTaskModule !== "enrichment.signal_candidate_extract") {
      throw new Error(
        `Migration smoke expected enrichment.signal_candidate_extract as the first task in the active signal_candidate sequence, got ${String(firstTaskModule)}.`
      );
    }
    const resourceSequence = sequencesById.get("0f8e3894-86ef-4a29-b5dc-1a7ea708ba2d");
    if (!resourceSequence) {
      throw new Error(
        `Migration smoke expected active resource sequence 0f8e3894-86ef-4a29-b5dc-1a7ea708ba2d in schema ${schemaName}.`
      );
    }
    if (resourceSequence.active_trigger_count !== "1") {
      throw new Error(
        `Migration smoke expected exactly one active resource.ingest.requested sequence, got ${resourceSequence.active_trigger_count}.`
      );
    }
    const firstResourceTaskModule = resourceSequence.task_graph?.[0]?.module ?? null;
    if (firstResourceTaskModule !== "enrichment.resource_extract") {
      throw new Error(
        `Migration smoke expected enrichment.resource_extract as the first task in the active resource sequence, got ${String(firstResourceTaskModule)}.`
      );
    }

    console.log(
      `Migration smoke passed in schema ${schemaName}: applied ${appliedMigrations.length} migrations and verified ${expectedTables.length} tables, ${expectedIndexes.length} indexes, ${expectedColumns.length} tracked columns, the cursor plus discovery constraints, and active signal_candidate/resource sequence graphs.`
    );
  } finally {
    await pool.query(`drop schema if exists ${quoteIdentifier(schemaName)} cascade`);
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
