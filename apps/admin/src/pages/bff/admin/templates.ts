import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";

import {
  buildFlashRedirect,
  requestPrefersHtmlNavigation
} from "../../../lib/server/browser-flow";
import {
  buildExpiredAdminSessionCookie,
  resolveAdminSession
} from "../../../lib/server/auth";
import { getPool } from "../../../lib/server/db";
import { readRequestPayload } from "../../../lib/server/request";

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  const browserRequest = requestPrefersHtmlNavigation(request);
  const session = await resolveAdminSession(request);
  if (!session || !session.roles.includes("admin")) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "auth",
        status: "error",
        message: "Please sign in as an admin to continue.",
        setCookie: buildExpiredAdminSessionCookie()
      });
    }
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const payload = await readRequestPayload(request);
    const kind = String(payload.kind ?? "llm");
    const pool = getPool();

    if (kind === "interest") {
      const templateId = randomUUID();
      await pool.query(
        `
          insert into interest_templates (
            interest_template_id,
            name,
            description,
            positive_texts,
            negative_texts
          )
          values ($1, $2, $3, $4::jsonb, $5::jsonb)
          on conflict (name) do update
          set
            description = excluded.description,
            positive_texts = excluded.positive_texts,
            negative_texts = excluded.negative_texts,
            updated_at = now()
        `,
        [
          templateId,
          String(payload.name ?? "").trim(),
          String(payload.description ?? ""),
          JSON.stringify(String(payload.positive_texts ?? "").split("\n").map((value) => value.trim()).filter(Boolean)),
          JSON.stringify(String(payload.negative_texts ?? "").split("\n").map((value) => value.trim()).filter(Boolean))
        ]
      );
      if (browserRequest) {
        return buildFlashRedirect(request, {
          section: "templates",
          status: "success",
          message: "Template saved"
        });
      }
      return Response.json({ ok: true });
    }

    const promptTemplateId = randomUUID();
    await pool.query(
      `
        insert into llm_prompt_templates (
          prompt_template_id,
          name,
          scope,
          template_text,
          is_active,
          version
        )
        values ($1, $2, $3, $4, true, 1)
        on conflict do nothing
      `,
      [
        promptTemplateId,
        String(payload.name ?? "").trim(),
        String(payload.scope ?? "interests"),
        String(payload.templateText ?? "")
      ]
    );
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "templates",
        status: "success",
        message: "Template saved"
      });
    }
    return Response.json({ ok: true });
  } catch (error) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "templates",
        status: "error",
        message: "Unable to save the template right now."
      });
    }
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to save template."
      },
      {
        status: 500
      }
    );
  }
};
