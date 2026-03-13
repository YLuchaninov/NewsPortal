import type { APIRoute } from "astro";

import {
  buildAdminSessionCookie,
  createAdminSession
} from "../../../lib/server/auth";
import { readRequestPayload } from "../../../lib/server/request";

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  const payload = await readRequestPayload(request);
  const email = String(payload.email ?? "").trim();
  const password = String(payload.password ?? "");
  if (!email || !password) {
    return Response.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    const adminSession = await createAdminSession(email, password);
    return new Response(
      JSON.stringify({
        session: adminSession.session
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": buildAdminSessionCookie(adminSession.idToken)
        }
      }
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Admin sign-in failed."
      },
      {
        status: 403
      }
    );
  }
};
