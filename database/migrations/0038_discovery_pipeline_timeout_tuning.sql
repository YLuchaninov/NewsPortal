-- Tune adaptive discovery child-pipeline timeouts for bounded live DDGS runs.

update sequences
set task_graph = (
  select jsonb_agg(
    case
      when sequence_id = '0a8e8ec5-6cab-4d8b-9c28-0a1d6245bf17'::uuid
        and task ->> 'key' = 'execute_hypotheses'
      then jsonb_set(task, '{timeout_ms}', to_jsonb(600000), true)
      when sequence_id in (
        '1cb1bfec-d42b-4607-a8f0-8e3f671f0978'::uuid,
        'c7e0a3a2-8f0c-4a76-bf35-fd7d1f44774d'::uuid
      )
        and task ->> 'key' = 'probe'
      then jsonb_set(task, '{timeout_ms}', to_jsonb(180000), true)
      when sequence_id in (
        '1cb1bfec-d42b-4607-a8f0-8e3f671f0978'::uuid,
        'c7e0a3a2-8f0c-4a76-bf35-fd7d1f44774d'::uuid
      )
        and task ->> 'key' = 'sample'
      then jsonb_set(task, '{timeout_ms}', to_jsonb(120000), true)
      else task
    end
  )
  from jsonb_array_elements(task_graph) as task
)
where sequence_id in (
  '0a8e8ec5-6cab-4d8b-9c28-0a1d6245bf17'::uuid,
  '1cb1bfec-d42b-4607-a8f0-8e3f671f0978'::uuid,
  'c7e0a3a2-8f0c-4a76-bf35-fd7d1f44774d'::uuid
);
