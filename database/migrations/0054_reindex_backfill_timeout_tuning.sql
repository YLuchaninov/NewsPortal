-- Full retained-DB selection replay can exceed the original 30 minute reindex
-- task budget once discovery/product-test sources have accumulated thousands of
-- articles and gray-zone reviews. Keep the maintenance sequence bounded, but
-- large enough for a complete backfill to finish instead of leaving partial
-- selection evidence.

update sequences
set
  task_graph = (
    select jsonb_agg(
      case
        when task ->> 'module' = 'maintenance.reindex'
          then (task - 'timeoutMs' - 'timeout_ms') || jsonb_build_object('timeoutMs', 7200000)
        else task
      end
      order by ordinality
    )
    from jsonb_array_elements(task_graph) with ordinality as expanded(task, ordinality)
  ),
  updated_at = now()
where trigger_event = 'reindex.requested'
  and task_graph @> '[{"module":"maintenance.reindex"}]'::jsonb
  and exists (
    select 1
    from jsonb_array_elements(task_graph) as expanded(task)
    where task ->> 'module' = 'maintenance.reindex'
      and coalesce(
        nullif(task ->> 'timeoutMs', '')::int,
        nullif(task ->> 'timeout_ms', '')::int,
        60000
      ) < 7200000
  );
