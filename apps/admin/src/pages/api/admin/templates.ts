import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";

import { resolveAdminSession } from "../../../lib/server/auth";
import { getPool } from "../../../lib/server/db";
import { readRequestPayload } from "../../../lib/server/request";

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  const session = await resolveAdminSession(request);
  if (!session || !session.roles.includes("admin")) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

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
  return Response.json({ ok: true });
};
