import type { PoolClient } from "pg";

export async function upsertSignalCandidateObservation(
  client: PoolClient,
  docId: string,
): Promise<void> {
  await client.query(
    `
      insert into document_observations (
        origin_type,
        origin_id,
        channel_id,
        source_record_id,
        observed_url,
        published_at,
        ingested_at,
        canonical_document_id,
        duplicate_kind,
        observation_state
      )
      select
        'signal_candidate',
        a.doc_id,
        a.channel_id,
        a.source_signal_candidate_id,
        a.url,
        a.published_at,
        a.ingested_at,
        null,
        'pending',
        'pending_canonicalization'
      from signal_candidates a
      where a.doc_id = $1::uuid
      on conflict (origin_type, origin_id) do update
      set
        channel_id = excluded.channel_id,
        source_record_id = excluded.source_record_id,
        observed_url = excluded.observed_url,
        published_at = excluded.published_at,
        ingested_at = excluded.ingested_at,
        updated_at = now()
    `,
    [docId],
  );
}
