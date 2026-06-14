import type { APIRoute } from "astro";
import { jsonBffSessionResponse } from "@signalops/bff-server";

import { resolveWebSession } from "../../lib/server/auth";

export const prerender = false;
export const GET: APIRoute = async ({ request }) => {
  const session = await resolveWebSession(request);
  return jsonBffSessionResponse(session);
};
