import { queryRows } from "./db";

export interface PublicRedactedSignalCard {
  index: number;
  contentKind: string;
  lang: string | null;
  publishedBucket: string | null;
}

export interface PublicRedactedSignalCollection {
  total: number;
  items: PublicRedactedSignalCard[];
}

interface RedactedRow extends Record<string, unknown> {
  content_kind: string | null;
  lang: string | null;
  published_at: string | null;
  updated_at: string | null;
  total_count: string | number | null;
}

function formatPublishedBucket(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

export function buildPublicRedactedSignalCard(
  row: Partial<RedactedRow>,
  index: number
): PublicRedactedSignalCard {
  return {
    index,
    contentKind: String(row.content_kind ?? "signal"),
    lang: String(row.lang ?? "").trim() || null,
    publishedBucket: formatPublishedBucket(row.published_at ?? row.updated_at ?? null),
  };
}

export async function loadPublicRedactedSignals(limit = 9): Promise<PublicRedactedSignalCollection> {
  const rows = await queryRows<RedactedRow>(
    `
      with selected_editorial as (
        select
          coalesce(sc.content_kind, 'editorial')::text as content_kind,
          sc.lang::text as lang,
          sc.published_at,
          sc.updated_at
        from signal_candidates sc
        left join final_selection_results fsr on fsr.doc_id = sc.doc_id
        left join system_feed_results sfr on sfr.doc_id = sc.doc_id
        where sc.visibility_state = 'visible'
          and (
            coalesce(fsr.is_selected, false) = true
            or (
              fsr.doc_id is null
              and coalesce(sfr.eligible_for_feed, false) = true
            )
          )
      ),
      selected_resources as (
        select
          wr.resource_kind::text as content_kind,
          wr.lang::text as lang,
          wr.published_at,
          wr.updated_at
        from web_resources wr
        join signal_candidates projected on projected.doc_id = wr.projected_signal_candidate_id
        join final_selection_results fsr on fsr.doc_id = projected.doc_id
        where wr.resource_kind <> 'editorial'
          and wr.extraction_state in ('enriched', 'skipped')
          and projected.visibility_state = 'visible'
          and coalesce(fsr.is_selected, false) = true
      ),
      selected_content as (
        select * from selected_editorial
        union all
        select * from selected_resources
      )
      select
        content_kind,
        lang,
        published_at,
        updated_at,
        count(*) over () as total_count
      from selected_content
      order by coalesce(published_at, updated_at) desc nulls last
      limit $1
    `,
    [Math.max(1, Math.min(24, Math.trunc(limit)))]
  );

  return {
    total: Number(rows[0]?.total_count ?? 0),
    items: rows.map((row, index) => buildPublicRedactedSignalCard(row, index + 1)),
  };
}
