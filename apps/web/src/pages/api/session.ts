import type { APIRoute } from "astro";

import { resolveWebSession } from "../../lib/server/auth";

export const prerender = false;
export const GET: APIRoute = async ({ request }) => {
  const session = await resolveWebSession(request);
  return Response.json({
    session
  });
};
