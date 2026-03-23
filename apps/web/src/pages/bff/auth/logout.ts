import type { APIRoute } from "astro";

import { buildExpiredSessionCookie } from "../../../lib/server/auth";
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
      setCookie: buildExpiredSessionCookie()
    });
  }

  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": buildExpiredSessionCookie()
    }
  });
};
