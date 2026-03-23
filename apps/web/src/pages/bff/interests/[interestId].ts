import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";

import { INTEREST_COMPILE_REQUESTED_EVENT } from "@newsportal/contracts";

import {
  buildFlashRedirect,
  requestPrefersHtmlNavigation
} from "../../../lib/server/browser-flow";
import { getPool } from "../../../lib/server/db";
import { insertOutboxEvent } from "../../../lib/server/outbox";
import { readRequestPayload } from "../../../lib/server/request";
import {
  buildExpiredSessionCookie,
  resolveWebSession
} from "../../../lib/server/auth";

export const prerender = false;
export const POST: APIRoute = async ({ request, params }) => {
  const browserRequest = requestPrefersHtmlNavigation(request);
  const session = await resolveWebSession(request);
  if (!session) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "auth",
        status: "error",
        message: "Please start a session to continue.",
        setCookie: buildExpiredSessionCookie()
      });
    }
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const interestId = params.interestId;
  if (!interestId) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "interests",
        status: "error",
        message: "Interest id is required."
      });
    }
    return Response.json({ error: "Interest id is required." }, { status: 400 });
  }

  const payload = await readRequestPayload(request);
  const action = String(payload._action ?? "update");
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    if (action === "delete") {
      await client.query(
        `
          delete from user_interests
          where interest_id = $1 and user_id = $2
        `,
        [interestId, session.userId]
      );
      await client.query("commit");
      if (browserRequest) {
        return buildFlashRedirect(request, {
          section: "interests",
          status: "success",
          message: "Interest deleted"
        });
      }
      return Response.json({ deleted: true });
    }

    const currentRow = await client.query<{
      version: number;
      description: string;
      positive_texts: string[];
      negative_texts: string[];
      places: string[];
      languages_allowed: string[];
      must_have_terms: string[];
      must_not_have_terms: string[];
      short_tokens_required: string[];
      short_tokens_forbidden: string[];
      priority: number;
      enabled: boolean;
    }>(
      `
        select
          version,
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
          enabled
        from user_interests
        where interest_id = $1 and user_id = $2
      `,
      [interestId, session.userId]
    );
    if (!currentRow.rows[0]) {
      throw new Error("Interest not found.");
    }

    const currentInterest = currentRow.rows[0];
    if (action === "clone") {
      const clonedInterestId = randomUUID();
      const clonedDescription = String(payload.description ?? "").trim() || `Copy of ${currentInterest.description}`;
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
          clonedInterestId,
          session.userId,
          clonedDescription,
          JSON.stringify(currentInterest.positive_texts ?? []),
          JSON.stringify(currentInterest.negative_texts ?? []),
          JSON.stringify(currentInterest.places ?? []),
          JSON.stringify(currentInterest.languages_allowed ?? []),
          JSON.stringify(currentInterest.must_have_terms ?? []),
          JSON.stringify(currentInterest.must_not_have_terms ?? []),
          JSON.stringify(currentInterest.short_tokens_required ?? []),
          JSON.stringify(currentInterest.short_tokens_forbidden ?? []),
          Number(currentInterest.priority ?? 1)
        ]
      );
      await insertOutboxEvent(client, {
        eventType: INTEREST_COMPILE_REQUESTED_EVENT,
        aggregateType: "interest",
        aggregateId: clonedInterestId,
        payload: {
          interestId: clonedInterestId,
          version: 1
        }
      });
      await client.query("commit");
      if (browserRequest) {
        return buildFlashRedirect(request, {
          section: "interests",
          status: "success",
          message: "Interest cloned"
        });
      }
      return Response.json({ cloned: true, interestId: clonedInterestId }, { status: 201 });
    }

    const nextVersion = currentRow.rows[0].version + 1;
    await client.query(
      `
        update user_interests
        set
          description = coalesce($3, description),
          positive_texts = coalesce($4::jsonb, positive_texts),
          negative_texts = coalesce($5::jsonb, negative_texts),
          places = coalesce($6::jsonb, places),
          languages_allowed = coalesce($7::jsonb, languages_allowed),
          must_have_terms = coalesce($8::jsonb, must_have_terms),
          must_not_have_terms = coalesce($9::jsonb, must_not_have_terms),
          short_tokens_required = coalesce($10::jsonb, short_tokens_required),
          short_tokens_forbidden = coalesce($11::jsonb, short_tokens_forbidden),
          priority = coalesce($12, priority),
          enabled = coalesce($13, enabled),
          compiled = false,
          compile_status = 'queued',
          version = $14,
          updated_at = now()
        where interest_id = $1 and user_id = $2
      `,
      [
        interestId,
        session.userId,
        payload.description ? String(payload.description) : null,
        payload.positive_texts
          ? JSON.stringify(String(payload.positive_texts).split("\n").map((value) => value.trim()).filter(Boolean))
          : null,
        payload.negative_texts
          ? JSON.stringify(String(payload.negative_texts).split("\n").map((value) => value.trim()).filter(Boolean))
          : null,
        payload.places != null
          ? JSON.stringify(String(payload.places).split(",").map((value) => value.trim()).filter(Boolean))
          : null,
        payload.languages_allowed != null
          ? JSON.stringify(String(payload.languages_allowed).split(",").map((value) => value.trim()).filter(Boolean))
          : null,
        payload.must_have_terms != null
          ? JSON.stringify(String(payload.must_have_terms).split(",").map((value) => value.trim()).filter(Boolean))
          : null,
        payload.must_not_have_terms != null
          ? JSON.stringify(String(payload.must_not_have_terms).split(",").map((value) => value.trim()).filter(Boolean))
          : null,
        payload.short_tokens_required != null
          ? JSON.stringify(String(payload.short_tokens_required).split(",").map((value) => value.trim()).filter(Boolean))
          : null,
        payload.short_tokens_forbidden != null
          ? JSON.stringify(String(payload.short_tokens_forbidden).split(",").map((value) => value.trim()).filter(Boolean))
          : null,
        payload.priority != null
          ? Math.max(0.1, Math.min(Number(payload.priority), 1))
          : null,
        payload.enabled != null ? String(payload.enabled) === "true" : null,
        nextVersion
      ]
    );
    await insertOutboxEvent(client, {
      eventType: INTEREST_COMPILE_REQUESTED_EVENT,
      aggregateType: "interest",
      aggregateId: interestId,
      payload: {
        interestId,
        version: nextVersion
      }
    });
    await client.query("commit");
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "interests",
        status: "success",
        message: "Interest updated"
      });
    }
    return Response.json({ updated: true, version: nextVersion });
  } catch (error) {
    await client.query("rollback");
    const errorMessage = error instanceof Error ? error.message : "Failed to update interest.";
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "interests",
        status: "error",
        message: errorMessage === "Interest not found." ? errorMessage : "Unable to update interest right now."
      });
    }
    return Response.json(
      {
        error: errorMessage
      },
      {
        status: 500
      }
    );
  } finally {
    client.release();
  }
};
