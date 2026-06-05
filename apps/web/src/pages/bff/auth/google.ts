import type { APIRoute } from "astro";
import { WEB_BFF_ACTION_PAYLOAD_SCHEMAS } from "@signalops/contracts";

import {
  buildWebAuthCookies,
  signInWebWithGoogleCredential,
  syncLocalUser,
} from "../../../lib/server/auth";
import { prepareWebAction } from "../../../lib/server/web-action";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const action = await prepareWebAction(request, {
    requireSession: false,
    readPayload: true,
    payloadSchema: WEB_BFF_ACTION_PAYLOAD_SCHEMAS["auth.google"],
    payloadBoundaryName: "Google auth payload",
  });
  if (!action.ok) {
    return action.response;
  }

  try {
    const session = await signInWebWithGoogleCredential(String(action.context.payload.credential ?? ""));
    const localUser = await syncLocalUser(session.identity);
    const headers = new Headers({
      "Content-Type": "application/json",
    });
    for (const cookie of buildWebAuthCookies(session, { request })) {
      headers.append("Set-Cookie", cookie);
    }

    return new Response(
      JSON.stringify({
        redirectTo: "/",
        session: {
          identity: session.identity,
          roles: localUser.roles,
          userId: localUser.userId,
        },
      }),
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Google sign-in failed.",
      },
      {
        status: 403,
      }
    );
  }
};
