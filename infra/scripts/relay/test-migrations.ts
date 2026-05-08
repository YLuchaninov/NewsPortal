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
            (table_name = 'articles' and column_name in (
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
              'projected_article_id'
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
            'discovery_targets_status_check',
            'discovery_runs_kind_check',
            'discovery_provider_health_status_check',
            'discovery_hypotheses_signal_mode_check',
            'discovery_hypotheses_debate_state_check',
            'discovery_negative_evidence_failure_mode_check',
            'discovery_claims_status_check',
            'discovery_source_endpoints_action_check',
            'discovery_source_contracts_status_check',
            'discovery_actions_type_check'
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
      "articles",
      "discovery_legacy_archive_batches",
      "discovery_targets",
      "discovery_runs",
      "discovery_provider_capabilities",
      "discovery_provider_health",
      "discovery_coverage_snapshots",
      "discovery_hypotheses",
      "discovery_debates",
      "discovery_provider_queries",
      "discovery_evidence_items",
      "discovery_negative_evidence",
      "discovery_signal_clusters",
      "discovery_claims",
      "discovery_claim_evidence",
      "discovery_domain_inventory",
      "discovery_source_identities",
      "discovery_source_endpoints",
      "discovery_source_contracts",
      "discovery_source_edges",
      "discovery_actions",
      "discovery_repairs",
      "discovery_eval_suites",
      "discovery_eval_cases",
      "discovery_eval_runs",
      "canonical_documents",
      "document_observations",
      "story_clusters",
      "story_cluster_members",
      "verification_results",
      "interest_filter_results",
      "final_selection_results",
      "web_resources",
      "article_external_refs",
      "outbox_events",
      "inbox_processed_events"
    ];
    const expectedIndexes = [
      "source_channels_provider_external_id_unique",
      "fetch_cursors_channel_cursor_type_unique",
      "crawl_policy_cache_expires_idx",
      "articles_channel_source_article_id_unique",
      "articles_processing_state_idx",
      "discovery_legacy_archive_batches_table_idx",
      "discovery_targets_origin_idx",
      "discovery_targets_origin_unique",
      "discovery_targets_status_idx",
      "discovery_runs_target_idx",
      "discovery_runs_status_idx",
      "discovery_provider_health_status_idx",
      "discovery_coverage_target_idx",
      "discovery_hypotheses_run_idx",
      "discovery_hypotheses_target_idx",
      "discovery_hypotheses_status_idx",
      "discovery_hypotheses_dedupe_idx",
      "discovery_debates_hypothesis_idx",
      "discovery_provider_queries_hypothesis_idx",
      "discovery_evidence_target_idx",
      "discovery_evidence_domain_idx",
      "discovery_negative_evidence_target_idx",
      "discovery_negative_evidence_cooldown_idx",
      "discovery_signal_clusters_target_idx",
      "discovery_claims_target_idx",
      "discovery_domain_inventory_kind_idx",
      "discovery_source_identities_domain_unique",
      "discovery_source_identities_known_domains_idx",
      "discovery_source_endpoints_target_url_unique",
      "discovery_source_endpoints_target_score_idx",
      "discovery_source_endpoints_status_idx",
      "discovery_source_contracts_target_idx",
      "discovery_source_contracts_channel_idx",
      "discovery_actions_status_idx",
      "discovery_eval_runs_suite_idx",
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
      "web_resources_projected_article_id_idx",
      "outbox_events_status_created_at_idx"
    ];
    const expectedColumns = [
      "articles.enrichment_state",
      "articles.enriched_at",
      "articles.full_content_html",
      "articles.extracted_description",
      "articles.extracted_author",
      "articles.extracted_ttr_seconds",
      "articles.extracted_image_url",
      "articles.extracted_favicon_url",
      "articles.extracted_published_at",
      "articles.extracted_source_name",
      "discovery_targets.target_id",
      "discovery_targets.graph_json",
      "discovery_targets.policy_json",
      "discovery_targets.autopilot_json",
      "discovery_runs.run_kind",
      "discovery_runs.max_social_items",
      "discovery_provider_capabilities.provider_card_json",
      "discovery_provider_health.cooldown_until",
      "discovery_coverage_snapshots.coverage_json",
      "discovery_hypotheses.signal_mode",
      "discovery_hypotheses.control_query_text",
      "discovery_hypotheses.debate_state",
      "discovery_evidence_items.evidence_kind",
      "discovery_negative_evidence.failure_mode",
      "discovery_claims.control_signal_rate",
      "discovery_source_endpoints.why_not_promoted_json",
      "discovery_source_contracts.coverage_contribution",
      "discovery_eval_runs.metrics_json",
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
      "web_resources.projected_article_id",
    ];

    for (const tableName of expectedTables) {
      if (!actualTables.has(tableName)) {
        throw new Error(`Migration smoke expected table ${tableName} in schema ${schemaName}.`);
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
      "discovery_targets_status_check",
      "discovery_runs_kind_check",
      "discovery_provider_health_status_check",
      "discovery_hypotheses_signal_mode_check",
      "discovery_hypotheses_debate_state_check",
      "discovery_negative_evidence_failure_mode_check",
      "discovery_claims_status_check",
      "discovery_source_endpoints_action_check",
      "discovery_source_contracts_status_check",
      "discovery_actions_type_check"
    ];
    for (const constraintName of requiredDiscoveryConstraints) {
      if (!constraintByName.has(constraintName)) {
        throw new Error(
          `Migration smoke expected discovery constraint ${constraintName} in schema ${schemaName}.`
        );
      }
    }

    const sequencesById = new Map(sequenceResult.rows.map((row) => [row.sequence_id, row]));
    const articleSequence = sequencesById.get("5cc77217-7a2f-4318-9fef-c6734e0f22f1");
    if (!articleSequence) {
      throw new Error(
        `Migration smoke expected active article sequence 5cc77217-7a2f-4318-9fef-c6734e0f22f1 in schema ${schemaName}.`
      );
    }
    if (articleSequence.active_trigger_count !== "1") {
      throw new Error(
        `Migration smoke expected exactly one active article.ingest.requested sequence, got ${articleSequence.active_trigger_count}.`
      );
    }
    const firstTaskModule = articleSequence.task_graph?.[0]?.module ?? null;
    if (firstTaskModule !== "enrichment.article_extract") {
      throw new Error(
        `Migration smoke expected enrichment.article_extract as the first task in the active article sequence, got ${String(firstTaskModule)}.`
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
      `Migration smoke passed in schema ${schemaName}: applied ${appliedMigrations.length} migrations and verified ${expectedTables.length} tables, ${expectedIndexes.length} indexes, ${expectedColumns.length} tracked columns, the cursor plus discovery constraints, and active article/resource sequence graphs.`
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
