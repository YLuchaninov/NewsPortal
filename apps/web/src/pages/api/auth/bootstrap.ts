import type { APIRoute } from "astro";

import {
  bootstrapAnonymousFirebaseSession,
  buildSessionCookie,
  syncLocalUser
} from "../../../lib/server/auth";

export const prerender = false;
export const POST: APIRoute = async () => {
  try {
    const session = await bootstrapAnonymousFirebaseSession();
    const localUser = await syncLocalUser(session.identity);
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
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Anonymous bootstrap failed."
      },
      {
        status: 500
      }
    );
  }
};
