import type { APIRoute } from "astro";

import { buildExpiredSessionCookie } from "../../../lib/server/auth";

export const prerender = false;
export const POST: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": buildExpiredSessionCookie()
    }
  });
};
