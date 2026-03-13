import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";

import { INTEREST_COMPILE_REQUESTED_EVENT } from "@newsportal/contracts";

import { getPool, queryRows } from "../../lib/server/db";
import { insertOutboxEvent } from "../../lib/server/outbox";
import { readRequestPayload } from "../../lib/server/request";
import { resolveWebSession } from "../../lib/server/auth";

export const prerender = false;
export const GET: APIRoute = async ({ request }) => {
  const session = await resolveWebSession(request);
  if (!session) {
    return Response.json({ interests: [] }, { status: 200 });
  }

  const interests = await queryRows(
    `
      select *
      from user_interests
      where user_id = $1
      order by updated_at desc
    `,
    [session.userId]
  );
  return Response.json({ interests });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await resolveWebSession(request);
  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = await readRequestPayload(request);
  const description = String(payload.description ?? "").trim();
  if (!description) {
    return Response.json({ error: "Description is required." }, { status: 400 });
  }

  const positiveTexts = String(payload.positive_texts ?? description)
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const negativeTexts = String(payload.negative_texts ?? "")
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const interestId = randomUUID();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(
      `
        insert into user_interests (
          interest_id,
          user_id,
          description,
          positive_texts,
          negative_texts,
          places,
          languages_allowed,
          must_have_terms,
          must_not_have_terms,
          short_tokens_required,
          short_tokens_forbidden,
          priority,
          enabled,
          compiled,
          compile_status,
          version
        )
        values (
          $1,
          $2,
          $3,
          $4::jsonb,
          $5::jsonb,
          $6::jsonb,
          $7::jsonb,
          $8::jsonb,
          $9::jsonb,
          $10::jsonb,
          $11::jsonb,
          $12,
          true,
          false,
          'queued',
          1
        )
      `,
      [
        interestId,
        session.userId,
        description,
        JSON.stringify(positiveTexts),
        JSON.stringify(negativeTexts),
        JSON.stringify(String(payload.places ?? "").split(",").map((value) => value.trim()).filter(Boolean)),
        JSON.stringify(String(payload.languages_allowed ?? "en").split(",").map((value) => value.trim()).filter(Boolean)),
        JSON.stringify(String(payload.must_have_terms ?? "").split(",").map((value) => value.trim()).filter(Boolean)),
        JSON.stringify(String(payload.must_not_have_terms ?? "").split(",").map((value) => value.trim()).filter(Boolean)),
        JSON.stringify(String(payload.short_tokens_required ?? "").split(",").map((value) => value.trim()).filter(Boolean)),
        JSON.stringify(String(payload.short_tokens_forbidden ?? "").split(",").map((value) => value.trim()).filter(Boolean)),
        Math.max(0.1, Math.min(Number(payload.priority ?? 1), 1))
      ]
    );
    await insertOutboxEvent(client, {
      eventType: INTEREST_COMPILE_REQUESTED_EVENT,
      aggregateType: "interest",
      aggregateId: interestId,
      payload: {
        interestId,
        version: 1
      }
    });
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to create interest."
      },
      {
        status: 500
      }
    );
  } finally {
    client.release();
  }

  return Response.json({ interestId }, { status: 201 });
};
