import type { APIRoute } from "astro";

import { buildExpiredAdminSessionCookie } from "../../../lib/server/auth";

export const prerender = false;
export const POST: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": buildExpiredAdminSessionCookie()
    }
  });
};
