import type { APIRoute } from "astro";

import { buildExpiredAdminSessionCookie } from "../../../lib/server/auth";
import {
  buildFlashRedirect,
  requestPrefersHtmlNavigation
} from "../../../lib/server/browser-flow";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (requestPrefersHtmlNavigation(request)) {
    return buildFlashRedirect(request, {
      section: "auth",
      status: "success",
      message: "Signed out.",
      setCookie: buildExpiredAdminSessionCookie()
    });
  }

  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": buildExpiredAdminSessionCookie()
    }
  });
};
