import type { APIRoute } from "astro";
import { WEB_BFF_ACTION_PAYLOAD_SCHEMAS } from "@signalops/contracts";

import { buildExpiredRefreshCookie, buildExpiredSessionCookie } from "../../../lib/server/auth";
import { buildFlashRedirect } from "../../../lib/server/browser-flow";
import { prepareWebAction } from "../../../lib/server/web-action";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const action = await prepareWebAction(request, {
    requireSession: false,
    readPayload: false,
    payloadSchema: WEB_BFF_ACTION_PAYLOAD_SCHEMAS["auth.logout"],
    payloadBoundaryName: "auth logout payload",
  });
  if (!action.ok) {
    return action.response;
  }

  if (action.context.browserRequest) {
    const response = buildFlashRedirect(request, {
      section: "auth",
      status: "success",
      message: "Signed out.",
      setCookie: buildExpiredSessionCookie({ request })
    });
    response.headers.append("Set-Cookie", buildExpiredRefreshCookie({ request }));
    return response;
  }

  const headers = new Headers();
  headers.append("Set-Cookie", buildExpiredSessionCookie({ request }));
  headers.append("Set-Cookie", buildExpiredRefreshCookie({ request }));
  return new Response(null, {
    status: 204,
    headers
  });
};
