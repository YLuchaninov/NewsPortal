import type { Queryable } from "./funnel-model";

export interface FunnelContentScopeInput {
  funnelId?: string | null;
  laneId?: string | null;
  allowedFunnelIds?: readonly string[] | null;
}

export interface ListFunnelContentInput extends FunnelContentScopeInput {
  page?: number | null;
  pageSize?: number | null;
  q?: string | null;
  channelId?: string | null;
  selectedOnly?: boolean;
  sort?: "latest" | "oldest" | "title_asc" | "title_desc" | null;
}

export interface ReadFunnelContentAttributionInput extends FunnelContentScopeInput {
  docId: string;
}

function readFunnelContentPageWindow(input: Pick<ListFunnelContentInput, "page" | "pageSize">) {
  const page = Math.max(1, Number(input.page ?? 1));
  const pageSize = Math.min(Math.max(1, Number(input.pageSize ?? 25)), 100);
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

function buildFunnelContentScopeWhere(
  input: FunnelContentScopeInput,
  params: unknown[],
  tableAlias = "f"
): string[] {
  const whereParts: string[] = [];
  const funnelId = String(input.funnelId ?? "").trim();
  if (funnelId) {
    whereParts.push(`${tableAlias}.funnel_id = $${params.push(funnelId)}::uuid`);
  } else {
    const allowedFunnelIds = Array.isArray(input.allowedFunnelIds)
      ? input.allowedFunnelIds.filter((entry) => String(entry ?? "").trim())
      : [];
    if (allowedFunnelIds.length > 0) {
      whereParts.push(`${tableAlias}.funnel_id = any($${params.push(allowedFunnelIds)}::uuid[])`);
    }
  }
  const laneId = String(input.laneId ?? "").trim();
  if (laneId) {
    whereParts.push(`l.lane_id = $${params.push(laneId)}::uuid`);
  }
  return whereParts;
}

function funnelContentBaseCte(whereSql: string): string {
  return `
    with scoped as (
      select distinct on (a.doc_id, f.funnel_id, l.lane_id)
        a.doc_id::text as "docId",
        a.doc_id::text as "contentItemId",
        a.title,
        a.lead,
        a.url,
        a.content_kind as "contentKind",
        a.content_format as "contentFormat",
        a.published_at as "publishedAt",
        a.ingested_at as "ingestedAt",
        a.channel_id::text as "channelId",
        sc.name as "channelName",
        f.funnel_id::text as "funnelId",
        f.name as "funnelName",
        l.lane_id::text as "laneId",
        l.name as "laneName",
        l.lane_type as "laneType",
        l.routing_mode as "routingMode",
        fsb.source_role as "sourceRole",
        sib.interest_template_id::text as "interestTemplateId",
        sib.binding_role as "interestBindingRole",
        fsr.final_decision as "finalDecision",
        fsr.is_selected as "isSelected",
        fsr.verification_state as "verificationState",
        coalesce(fsr.explain_json ->> 'selectionReason', '') as "selectionReason",
        coalesce(fsr.explain_json ->> 'selectionBlockerReason', '') as "selectionBlockerReason",
        coalesce(fsr.explain_json ->> 'holdReason', '') as "holdReason",
        coalesce(
          fsr.explain_json ->> 'candidateSignalTier',
          fsr.explain_json #>> '{semanticSignalSummary,candidateSignalTier}',
          'unknown'
        ) as "candidateSignalTier",
        fsr.updated_at as "selectionUpdatedAt"
      from operator_funnels f
      join funnel_system_interest_bindings sib on sib.funnel_id = f.funnel_id
      left join funnel_lanes l on l.lane_id = sib.lane_id
      join criteria c on c.source_interest_template_id = sib.interest_template_id
      join interest_filter_results ifr
        on ifr.criterion_id = c.criterion_id
        and ifr.filter_scope = 'system_criterion'
      join final_selection_results fsr on fsr.doc_id = ifr.doc_id
      join signal_candidates a on a.doc_id = fsr.doc_id
      left join source_channels sc on sc.channel_id = a.channel_id
      left join funnel_source_bindings fsb
        on fsb.funnel_id = f.funnel_id
        and fsb.channel_id = a.channel_id
      ${whereSql}
      order by a.doc_id, f.funnel_id, l.lane_id, fsr.updated_at desc
    )
  `;
}

function readFunnelContentOrderBy(sort: ListFunnelContentInput["sort"]): string {
  if (sort === "oldest") {
    return `"publishedAt" asc nulls last, "selectionUpdatedAt" asc nulls last`;
  }
  if (sort === "title_asc") {
    return `lower(title) asc, "publishedAt" desc nulls last`;
  }
  if (sort === "title_desc") {
    return `lower(title) desc, "publishedAt" desc nulls last`;
  }
  return `"publishedAt" desc nulls last, "selectionUpdatedAt" desc nulls last`;
}

export async function listFunnelContentItems(
  queryable: Queryable,
  input: ListFunnelContentInput = {}
): Promise<Record<string, unknown>> {
  const { page, pageSize, offset } = readFunnelContentPageWindow(input);
  const params: unknown[] = [];
  const whereParts = buildFunnelContentScopeWhere(input, params);
  if (input.selectedOnly === true) {
    whereParts.push(`fsr.final_decision = 'selected'`);
  }
  const channelId = String(input.channelId ?? "").trim();
  if (channelId) {
    whereParts.push(`a.channel_id = $${params.push(channelId)}::uuid`);
  }
  const q = String(input.q ?? "").trim();
  if (q) {
    whereParts.push(
      `(a.title ilike $${params.push(`%${q}%`)} or a.lead ilike $${params.length} or a.url ilike $${params.length})`
    );
  }
  const whereSql = whereParts.length > 0 ? `where ${whereParts.join(" and ")}` : "";
  const cte = funnelContentBaseCte(whereSql);
  const total = await queryable.query<{ total: number }>(
    `${cte} select count(*)::int as total from scoped`,
    params
  );
  const items = await queryable.query<Record<string, unknown>>(
    `
      ${cte}
      select *
      from scoped
      order by ${readFunnelContentOrderBy(input.sort)}
      limit $${params.length + 1} offset $${params.length + 2}
    `,
    [...params, pageSize, offset]
  );
  return {
    page,
    pageSize,
    total: Number(total.rows[0]?.total ?? 0),
    scope: {
      funnelId: input.funnelId ?? null,
      laneId: input.laneId ?? null,
      selectedOnly: input.selectedOnly === true,
    },
    items: items.rows,
  };
}

export async function readFunnelContentAttribution(
  queryable: Queryable,
  input: ReadFunnelContentAttributionInput
): Promise<Array<Record<string, unknown>>> {
  const params: unknown[] = [input.docId];
  const whereParts = [`a.doc_id = $1::uuid`, ...buildFunnelContentScopeWhere(input, params)];
  const cte = funnelContentBaseCte(`where ${whereParts.join(" and ")}`);
  const result = await queryable.query<Record<string, unknown>>(
    `
      ${cte}
      select *
      from scoped
      order by "selectionUpdatedAt" desc nulls last
      limit 25
    `,
    params
  );
  return result.rows;
}
