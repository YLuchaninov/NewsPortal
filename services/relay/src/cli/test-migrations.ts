import { randomUUID } from "node:crypto";

import { loadRelayConfig } from "../config";
import { createPgPool } from "../db";
import { applyPendingMigrations } from "../migrations";

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
            (table_name = 'discovery_missions' and column_name in (
              'seed_topics',
              'interest_graph',
              'latest_portfolio_snapshot_id'
            ))
            or
            (table_name = 'discovery_hypothesis_classes' and column_name in (
              'generation_backend',
              'default_provider_types',
              'max_per_mission'
            ))
            or
            (table_name = 'discovery_hypotheses' and column_name in (
              'class_key',
              'target_provider_type',
              'execution_cost_usd'
            ))
            or
            (table_name = 'discovery_source_profiles' and column_name in (
              'candidate_id',
              'channel_id',
              'canonical_domain',
              'trust_score'
            ))
            or
            (table_name = 'discovery_candidates' and column_name in (
              'source_profile_id',
              'evaluation_json',
              'registered_channel_id'
            ))
            or
            (table_name = 'discovery_source_interest_scores' and column_name in (
              'source_profile_id',
              'mission_id',
              'yield_score',
              'duplication_score',
              'contextual_score'
            ))
            or
            (table_name = 'discovery_portfolio_snapshots' and column_name in (
              'ranked_sources',
              'gaps_json',
              'summary_json'
            ))
            or
            (table_name = 'discovery_feedback_events' and column_name in (
              'source_profile_id',
              'feedback_type'
            ))
            or
            (table_name = 'discovery_strategy_stats' and column_name in (
              'class_key',
              'trials',
              'last_effectiveness'
            ))
            or
            (table_name = 'discovery_cost_log' and column_name in (
              'cost_usd',
              'cost_cents',
              'request_count'
            ))
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
            (table_name = 'discovery_recall_missions' and column_name in (
              'mission_kind',
              'seed_domains',
              'seed_queries',
              'scope_json'
            ))
            or
            (table_name = 'discovery_recall_candidates' and column_name in (
              'source_profile_id',
              'canonical_domain',
              'quality_signal_source',
              'evaluation_json',
              'registered_channel_id'
            ))
            or
            (table_name = 'discovery_source_quality_snapshots' and column_name in (
              'source_profile_id',
              'channel_id',
              'snapshot_reason',
              'recall_score'
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
            'discovery_hypotheses_class_key_fkey',
            'discovery_candidates_source_profile_id_fkey',
            'discovery_source_profiles_candidate_fk',
            'discovery_missions_latest_portfolio_snapshot_fk',
            'discovery_source_interest_scores_source_profile_id_fkey',
            'discovery_source_interest_scores_mission_id_fkey',
            'discovery_feedback_events_source_profile_id_fkey',
            'discovery_strategy_stats_class_key_fkey'
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
      "discovery_missions",
      "discovery_hypothesis_classes",
      "discovery_hypotheses",
      "discovery_source_profiles",
      "discovery_candidates",
      "discovery_source_interest_scores",
      "discovery_portfolio_snapshots",
      "discovery_feedback_events",
      "discovery_strategy_stats",
      "discovery_cost_log",
      "canonical_documents",
      "document_observations",
      "story_clusters",
      "story_cluster_members",
      "verification_results",
      "interest_filter_results",
      "final_selection_results",
      "discovery_recall_missions",
      "discovery_recall_candidates",
      "discovery_source_quality_snapshots",
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
      "discovery_missions_status_idx",
      "discovery_missions_source_ref_idx",
      "discovery_missions_interest_graph_status_idx",
      "discovery_hypothesis_classes_status_idx",
      "discovery_hypotheses_mission_idx",
      "discovery_hypotheses_status_idx",
      "discovery_hypotheses_class_idx",
      "discovery_hypotheses_mission_intent_unique",
      "discovery_source_profiles_domain_unique",
      "discovery_source_profiles_channel_idx",
      "discovery_candidates_hypothesis_idx",
      "discovery_candidates_mission_idx",
      "discovery_candidates_status_idx",
      "discovery_candidates_url_mission_unique",
      "discovery_source_interest_scores_current_unique",
      "discovery_source_interest_scores_contextual_idx",
      "discovery_portfolio_snapshots_mission_idx",
      "discovery_feedback_events_mission_idx",
      "discovery_strategy_stats_unique",
      "discovery_cost_log_mission_idx",
      "discovery_cost_log_hypothesis_idx",
      "discovery_cost_log_created_idx",
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
      "discovery_recall_missions_status_idx",
      "discovery_recall_missions_kind_idx",
      "discovery_recall_candidates_url_mission_unique",
      "discovery_recall_candidates_mission_status_idx",
      "discovery_recall_candidates_canonical_domain_idx",
      "discovery_recall_candidates_source_profile_idx",
      "discovery_recall_candidates_registered_channel_idx",
      "discovery_source_quality_snapshots_source_profile_unique",
      "discovery_source_quality_snapshots_recall_idx",
      "discovery_source_quality_snapshots_channel_idx",
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
      "discovery_missions.seed_topics",
      "discovery_missions.interest_graph",
      "discovery_missions.latest_portfolio_snapshot_id",
      "discovery_hypothesis_classes.generation_backend",
      "discovery_hypothesis_classes.default_provider_types",
      "discovery_hypothesis_classes.max_per_mission",
      "discovery_hypotheses.class_key",
      "discovery_hypotheses.target_provider_type",
      "discovery_hypotheses.execution_cost_usd",
      "discovery_source_profiles.candidate_id",
      "discovery_source_profiles.channel_id",
      "discovery_source_profiles.canonical_domain",
      "discovery_source_profiles.trust_score",
      "discovery_candidates.source_profile_id",
      "discovery_candidates.evaluation_json",
      "discovery_candidates.registered_channel_id",
      "discovery_source_interest_scores.source_profile_id",
      "discovery_source_interest_scores.mission_id",
      "discovery_source_interest_scores.yield_score",
      "discovery_source_interest_scores.duplication_score",
      "discovery_source_interest_scores.contextual_score",
      "discovery_portfolio_snapshots.ranked_sources",
      "discovery_portfolio_snapshots.gaps_json",
      "discovery_portfolio_snapshots.summary_json",
      "discovery_feedback_events.source_profile_id",
      "discovery_feedback_events.feedback_type",
      "discovery_strategy_stats.class_key",
      "discovery_strategy_stats.trials",
      "discovery_strategy_stats.last_effectiveness",
      "discovery_cost_log.cost_usd",
      "discovery_cost_log.cost_cents",
      "discovery_cost_log.request_count",
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
      "discovery_recall_missions.mission_kind",
      "discovery_recall_missions.seed_domains",
      "discovery_recall_missions.seed_queries",
      "discovery_recall_missions.scope_json",
      "discovery_recall_candidates.source_profile_id",
      "discovery_recall_candidates.canonical_domain",
      "discovery_recall_candidates.quality_signal_source",
      "discovery_recall_candidates.evaluation_json",
      "discovery_source_quality_snapshots.source_profile_id",
      "discovery_source_quality_snapshots.channel_id",
      "discovery_source_quality_snapshots.snapshot_reason",
      "discovery_source_quality_snapshots.recall_score",
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
      "discovery_hypotheses_class_key_fkey",
      "discovery_candidates_source_profile_id_fkey",
      "discovery_source_profiles_candidate_fk",
      "discovery_missions_latest_portfolio_snapshot_fk",
      "discovery_source_interest_scores_source_profile_id_fkey",
      "discovery_source_interest_scores_mission_id_fkey",
      "discovery_feedback_events_source_profile_id_fkey",
      "discovery_strategy_stats_class_key_fkey"
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
