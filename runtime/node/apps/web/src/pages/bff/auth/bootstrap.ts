import type { APIRoute } from "astro";
import { WEB_BFF_ACTION_PAYLOAD_SCHEMAS } from "@signalops/contracts";

import {
  bootstrapWebFirebaseSession,
  buildWebAuthCookies,
  syncLocalUser
} from "../../../lib/server/auth";
import {
  buildFlashRedirect,
} from "../../../lib/server/browser-flow";
import { prepareWebAction } from "../../../lib/server/web-action";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const action = await prepareWebAction(request, {
    requireSession: false,
    readPayload: false,
    payloadSchema: WEB_BFF_ACTION_PAYLOAD_SCHEMAS["auth.bootstrap"],
    payloadBoundaryName: "auth bootstrap payload",
  });
  if (!action.ok) {
    return action.response;
  }
  const { browserRequest } = action.context;

  try {
    const session = await bootstrapWebFirebaseSession(request);
    const localUser = await syncLocalUser(session.identity);
    const authCookies = buildWebAuthCookies(session, { request });
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
      error instanceof Error ? error.message : "Web test session bootstrap failed.";
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "auth",
        status: "error",
        message: "Google sign-in is required."
      });
    }

    return Response.json(
      {
        error: errorMessage
      },
      {
        status: 403
      }
    );
  }
};
