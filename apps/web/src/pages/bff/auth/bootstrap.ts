import type { APIRoute } from "astro";

import {
  bootstrapWebFirebaseSession,
  buildWebAuthCookies,
  syncLocalUser
} from "../../../lib/server/auth";
import {
  buildFlashRedirect,
  requestPrefersHtmlNavigation
} from "../../../lib/server/browser-flow";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const browserRequest = requestPrefersHtmlNavigation(request);

  try {
    const session = await bootstrapWebFirebaseSession(request);
    const localUser = await syncLocalUser(session.identity);
    const authCookies = buildWebAuthCookies(session);
    if (browserRequest) {
      const response = buildFlashRedirect(request, {
        section: "auth",
        status: "success",
        message: "Session started.",
        setCookie: authCookies[0]
      });
      response.headers.append("Set-Cookie", authCookies[1]);
      return response;
    }

    const headers = new Headers({
      "Content-Type": "application/json"
    });
    for (const cookie of authCookies) {
      headers.append("Set-Cookie", cookie);
    }

    return new Response(
      JSON.stringify({
        session: {
          identity: session.identity,
          roles: localUser.roles,
          userId: localUser.userId
        }
      }),
      {
        status: 200,
        headers
      }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Anonymous bootstrap failed.";
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "auth",
        status: "error",
        message: "Unable to start a session right now."
      });
    }

    return Response.json(
      {
        error: errorMessage
      },
      {
        status: 500
      }
    );
  }
};
