import type { APIRoute } from "astro";

import { prepareAdminAction } from "../../../lib/server/admin-action";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const action = await prepareAdminAction(request, {
    fallbackRedirectPath: "/discovery",
    actionToken: { scope: "discovery" },
  });
  if (!action.ok) {
    return action.response;
  }
  return new Response(
    JSON.stringify({
      ok: false,
      detail:
        "Legacy discovery admin BFF actions are retired. Use resilient discovery v3 API, MCP tools, and admin workspace.",
    }),
    {
      status: 410,
      headers: { "content-type": "application/json" },
    }
  );
};
