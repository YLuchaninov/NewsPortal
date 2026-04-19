-- Extend adaptive discovery orchestrator task budgets for bounded live DDGS runs.

update sequences
set
  task_graph = (
    select jsonb_agg(
      case
        when task ->> 'key' = 'plan_hypotheses'
          then jsonb_set(task, '{timeout_ms}', to_jsonb(300000), true)
        when task ->> 'key' = 'evaluate_results'
          then jsonb_set(task, '{timeout_ms}', to_jsonb(180000), true)
        when task ->> 'key' = 're_evaluate_sources'
          then jsonb_set(task, '{timeout_ms}', to_jsonb(180000), true)
        else task
      end
      order by ordinality
    )
    from jsonb_array_elements(task_graph) with ordinality as tasks(task, ordinality)
  ),
  updated_at = now()
where sequence_id = '0a8e8ec5-6cab-4d8b-9c28-0a1d6245bf17'
  and exists (
    select 1
    from jsonb_array_elements(task_graph) as tasks(task)
    where task ->> 'key' in ('plan_hypotheses', 'evaluate_results', 're_evaluate_sources')
      and coalesce((task ->> 'timeout_ms')::int, 60000) < case
        when task ->> 'key' = 'plan_hypotheses' then 300000
        else 180000
      end
  );
