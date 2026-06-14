import type { Queryable } from "./funnel-model";
import { hashValue } from "./funnel-model";

export async function computeFunnelLiveStateHash(queryable: Queryable): Promise<string> {
  const result = await queryable.query<Record<string, unknown>>(
    `
      select
        (select count(*)::int from operator_funnels) as "funnelCount",
        (select count(*)::int from funnel_lanes) as "laneCount",
        (select count(*)::int from interest_templates) as "interestCount",
        (select count(*)::int from llm_prompt_templates) as "templateCount",
        (select count(*)::int from source_channels) as "channelCount",
        (select count(*)::int from final_selection_results) as "selectionResultCount",
        greatest(
          coalesce((select max(updated_at) from operator_funnels), 'epoch'::timestamptz),
          coalesce((select max(updated_at) from funnel_lanes), 'epoch'::timestamptz),
          coalesce((select max(updated_at) from interest_templates), 'epoch'::timestamptz),
          coalesce((select max(updated_at) from llm_prompt_templates), 'epoch'::timestamptz),
          coalesce((select max(updated_at) from source_channels), 'epoch'::timestamptz)
        ) as "maxUpdatedAt"
    `
  );
  return hashValue(result.rows[0] ?? {});
}
