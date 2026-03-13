import type { APIRoute } from "astro";

import { getPool } from "../../lib/server/db";
import { readRequestPayload } from "../../lib/server/request";
import { resolveWebSession } from "../../lib/server/auth";

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  const session = await resolveWebSession(request);
  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = await readRequestPayload(request);
  const themePreference = String(payload.themePreference ?? "system");
  if (!["light", "dark", "system"].includes(themePreference)) {
    return Response.json({ error: "Invalid theme preference." }, { status: 400 });
  }

  const pool = getPool();
  await pool.query(
    `
      update user_profiles
      set
        theme_preference = $2,
        updated_at = now()
      where user_id = $1
    `,
    [session.userId, themePreference]
  );

  return Response.json({ updated: true });
};
