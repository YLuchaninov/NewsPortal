from __future__ import annotations


def discovery_mission_select_sql() -> str:
    return """
        select
          m.mission_id::text as mission_id,
          m.title,
          m.description,
          m.source_kind,
          m.source_ref_id::text as source_ref_id,
          m.seed_topics,
          m.seed_languages,
          m.seed_regions,
          m.target_provider_types,
          m.interest_graph,
          m.interest_graph_status,
          m.interest_graph_version,
          m.interest_graph_compiled_at,
          m.interest_graph_error_text,
          m.max_hypotheses,
          m.max_sources,
          m.budget_cents,
          m.spent_cents,
          m.status,
          m.priority,
          m.run_count,
          m.last_run_at,
          m.profile_id::text as profile_id,
          m.applied_profile_version,
          m.applied_policy_json,
          p.profile_key,
          p.display_name as profile_display_name,
          p.status as profile_status,
          p.version as profile_current_version,
          m.latest_portfolio_snapshot_id::text as latest_portfolio_snapshot_id,
          (
            select summary_json
            from discovery_portfolio_snapshots dps
            where dps.snapshot_id = m.latest_portfolio_snapshot_id
          ) as latest_portfolio_summary,
          m.created_by,
          m.created_at,
          m.updated_at
        from discovery_missions m
        left join discovery_policy_profiles p on p.profile_id = m.profile_id
    """


def discovery_recall_mission_select_sql() -> str:
    return """
        select
          rm.recall_mission_id::text as recall_mission_id,
          rm.title,
          rm.description,
          rm.mission_kind,
          rm.seed_domains,
          rm.seed_urls,
          rm.seed_queries,
          rm.target_provider_types,
          rm.scope_json,
          rm.status,
          rm.max_candidates,
          rm.profile_id::text as profile_id,
          rm.applied_profile_version,
          rm.applied_policy_json,
          p.profile_key,
          p.display_name as profile_display_name,
          p.status as profile_status,
          p.version as profile_current_version,
          rm.created_by,
          rm.created_at,
          rm.updated_at
        from discovery_recall_missions rm
        left join discovery_policy_profiles p on p.profile_id = rm.profile_id
    """


def discovery_policy_profile_select_sql() -> str:
    return """
        select
          p.profile_id::text as profile_id,
          p.profile_key,
          p.display_name,
          p.description,
          p.status,
          p.graph_policy_json,
          p.recall_policy_json,
          p.yield_benchmark_json,
          p.version,
          p.created_by,
          p.created_at,
          p.updated_at,
          (
            select count(*)::int
            from discovery_missions m
            where m.profile_id = p.profile_id
          ) as mission_count,
          (
            select count(*)::int
            from discovery_recall_missions rm
            where rm.profile_id = p.profile_id
          ) as recall_mission_count
        from discovery_policy_profiles p
    """


def discovery_class_select_sql() -> str:
    return """
        select
          class_key,
          display_name,
          description,
          status,
          generation_backend,
          default_provider_types,
          prompt_instructions,
          seed_rules_json,
          max_per_mission,
          sort_order,
          config_json,
          created_at,
          updated_at
        from discovery_hypothesis_classes
    """


def discovery_candidate_select_sql() -> str:
    return """
        select
          c.candidate_id::text as candidate_id,
          c.hypothesis_id::text as hypothesis_id,
          c.mission_id::text as mission_id,
          c.source_profile_id::text as source_profile_id,
          c.url,
          c.final_url,
          c.title,
          c.description,
          c.provider_type,
          c.is_valid,
          c.relevance_score,
          c.evaluation_json,
          c.llm_assessment,
          c.sample_data,
          c.status,
          c.rejection_reason,
          c.registered_channel_id::text as registered_channel_id,
          c.reviewed_by,
          c.reviewed_at,
          c.created_at,
          m.title as mission_title,
          m.profile_id::text as profile_id,
          m.applied_profile_version,
          m.applied_policy_json,
          p.profile_key,
          p.display_name as profile_display_name,
          h.class_key,
          h.tactic_key,
          h.search_query,
          sp.canonical_domain,
          sp.source_type,
          sp.trust_score
        from discovery_candidates c
        join discovery_missions m on m.mission_id = c.mission_id
        join discovery_hypotheses h on h.hypothesis_id = c.hypothesis_id
        left join discovery_policy_profiles p on p.profile_id = m.profile_id
        left join discovery_source_profiles sp on sp.source_profile_id = c.source_profile_id
    """


def discovery_recall_candidate_select_sql() -> str:
    return """
        select
          rc.recall_candidate_id::text as recall_candidate_id,
          rc.recall_mission_id::text as recall_mission_id,
          rc.source_profile_id::text as source_profile_id,
          rc.canonical_domain,
          rc.url,
          rc.final_url,
          rc.title,
          rc.description,
          rc.provider_type,
          rc.status,
          rc.quality_signal_source,
          rc.evaluation_json,
          rc.rejection_reason,
          rc.registered_channel_id::text as registered_channel_id,
          rc.created_by,
          rc.reviewed_by,
          rc.reviewed_at,
          rc.created_at,
          rc.updated_at,
          rm.title as recall_mission_title,
          rm.mission_kind,
          rm.profile_id::text as profile_id,
          rm.applied_profile_version,
          rm.applied_policy_json,
          p.profile_key,
          p.display_name as profile_display_name,
          coalesce(sp.channel_id, rc.registered_channel_id)::text as channel_id,
          sp.source_type,
          sp.trust_score,
          sqs.snapshot_id::text as source_quality_snapshot_id,
          sqs.snapshot_reason as source_quality_snapshot_reason,
          sqs.recall_score as source_quality_recall_score,
          sqs.scoring_breakdown as source_quality_scoring_breakdown,
          sqs.scored_at as source_quality_scored_at
        from discovery_recall_candidates rc
        join discovery_recall_missions rm on rm.recall_mission_id = rc.recall_mission_id
        left join discovery_policy_profiles p on p.profile_id = rm.profile_id
        left join discovery_source_profiles sp on sp.source_profile_id = rc.source_profile_id
        left join lateral (
          select
            snapshot_id,
            snapshot_reason,
            recall_score,
            scoring_breakdown,
            scored_at
          from discovery_source_quality_snapshots sqs
          where sqs.source_profile_id = rc.source_profile_id
          order by sqs.scored_at desc, sqs.updated_at desc, sqs.created_at desc
          limit 1
        ) sqs on true
    """


def discovery_hypothesis_select_sql() -> str:
    return """
        select
          h.hypothesis_id::text as hypothesis_id,
          h.mission_id::text as mission_id,
          h.class_key,
          h.tactic_key,
          h.search_query,
          h.target_urls,
          h.target_provider_type,
          h.generation_context,
          h.expected_value,
          h.status,
          h.sequence_run_id::text as sequence_run_id,
          h.sources_found,
          h.sources_approved,
          h.effectiveness,
          h.execution_cost_cents,
          h.execution_cost_usd,
          h.error_text,
          h.started_at,
          h.finished_at,
          h.created_at,
          m.title as mission_title
        from discovery_hypotheses h
        join discovery_missions m on m.mission_id = h.mission_id
    """


def discovery_source_profile_select_sql() -> str:
    return """
        select
          sp.source_profile_id::text as source_profile_id,
          sp.candidate_id::text as candidate_id,
          sp.channel_id::text as channel_id,
          sp.canonical_domain,
          sp.source_type,
          sp.org_name,
          sp.country,
          sp.languages,
          sp.ownership_transparency,
          sp.author_accountability,
          sp.source_linking_quality,
          sp.historical_stability,
          sp.technical_quality,
          sp.spam_signals,
          sp.trust_score,
          sp.extraction_data,
          sqs.snapshot_id::text as latest_source_quality_snapshot_id,
          sqs.snapshot_reason as latest_source_quality_snapshot_reason,
          sqs.recall_score as latest_source_quality_recall_score,
          sqs.yield_score as latest_source_quality_yield_score,
          sqs.lead_time_score as latest_source_quality_lead_time_score,
          sqs.duplication_score as latest_source_quality_duplication_score,
          sqs.scoring_breakdown as latest_source_quality_scoring_breakdown,
          sqs.scored_at as latest_source_quality_scored_at,
          sp.created_at,
          sp.updated_at
        from discovery_source_profiles sp
        left join lateral (
          select
            snapshot_id,
            snapshot_reason,
            recall_score,
            yield_score,
            lead_time_score,
            duplication_score,
            scoring_breakdown,
            scored_at
          from discovery_source_quality_snapshots sqs
          where sqs.source_profile_id = sp.source_profile_id
          order by sqs.scored_at desc, sqs.updated_at desc, sqs.created_at desc
          limit 1
        ) sqs on true
    """


def discovery_source_quality_snapshot_select_sql() -> str:
    return """
        select
          sqs.snapshot_id::text as snapshot_id,
          sqs.source_profile_id::text as source_profile_id,
          sqs.channel_id::text as channel_id,
          sqs.snapshot_reason,
          sqs.trust_score,
          sqs.extraction_quality_score,
          sqs.stability_score,
          sqs.independence_score,
          sqs.freshness_score,
          sqs.lead_time_score,
          sqs.yield_score,
          sqs.duplication_score,
          sqs.recall_score,
          sqs.scoring_breakdown,
          sqs.scoring_period_days,
          sqs.scored_at,
          sqs.created_at,
          sqs.updated_at,
          sp.canonical_domain,
          sp.source_type
        from discovery_source_quality_snapshots sqs
        join discovery_source_profiles sp on sp.source_profile_id = sqs.source_profile_id
    """


def discovery_source_interest_score_select_sql() -> str:
    return """
        select
          sis.score_id::text as score_id,
          sis.source_profile_id::text as source_profile_id,
          sis.channel_id::text as channel_id,
          sis.mission_id::text as mission_id,
          sis.topic_coverage,
          sis.specificity,
          sis.audience_fit,
          sis.evidence_depth,
          sis.signal_to_noise,
          sis.fit_score,
          sis.novelty_score,
          sis.lead_time_score,
          sis.yield_score,
          sis.duplication_score,
          sis.contextual_score,
          sis.role_labels,
          sis.scoring_breakdown,
          sis.scoring_period_days,
          sis.scored_at,
          sis.created_at,
          sis.updated_at,
          m.title as mission_title,
          sp.canonical_domain,
          sp.trust_score
        from discovery_source_interest_scores sis
        join discovery_missions m on m.mission_id = sis.mission_id
        join discovery_source_profiles sp on sp.source_profile_id = sis.source_profile_id
    """


def discovery_feedback_select_sql() -> str:
    return """
        select
          dfe.feedback_event_id::text as feedback_event_id,
          dfe.mission_id::text as mission_id,
          dfe.candidate_id::text as candidate_id,
          dfe.source_profile_id::text as source_profile_id,
          dfe.feedback_type,
          dfe.feedback_value,
          dfe.notes,
          dfe.created_by,
          dfe.created_at
        from discovery_feedback_events dfe
    """
