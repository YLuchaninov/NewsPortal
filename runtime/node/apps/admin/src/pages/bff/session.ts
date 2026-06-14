import type { APIRoute } from "astro";
import { jsonBffSessionResponse } from "@signalops/bff-server";

import { resolveAdminSession } from "../../lib/server/auth";

export const prerender = false;
export const GET: APIRoute = async ({ request }) => {
  const session = await resolveAdminSession(request);
  return jsonBffSessionResponse(session);
};
