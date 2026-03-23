import type { APIRoute } from "astro";

import {
  bootstrapAnonymousFirebaseSession,
  buildSessionCookie,
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
    const session = await bootstrapAnonymousFirebaseSession();
    const localUser = await syncLocalUser(session.identity);
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "auth",
        status: "success",
        message: "Session started.",
        setCookie: buildSessionCookie(session.idToken)
      });
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
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": buildSessionCookie(session.idToken)
        }
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
