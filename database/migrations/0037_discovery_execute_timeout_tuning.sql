-- Increase the adaptive discovery execute_hypotheses task timeout for live DDGS runs.
-- The default 60s task budget is too short for bounded real-web search + child-sequence
-- execution on the local compose baseline, which causes orchestrator runs to fail before
-- candidates can be materialized.

update sequences
set task_graph = (
  select jsonb_agg(
    case
      when task ->> 'key' = 'execute_hypotheses'
      then jsonb_set(task, '{timeout_ms}', to_jsonb(180000), true)
      else task
    end
    order by ordinality
  )
  from jsonb_array_elements(task_graph) with ordinality as items(task, ordinality)
)
where sequence_id = '0a8e8ec5-6cab-4d8b-9c28-0a1d6245bf17'::uuid;
