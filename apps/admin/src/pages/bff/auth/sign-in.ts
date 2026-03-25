import type { APIRoute } from "astro";

import {
  buildAdminSessionCookie,
  buildExpiredAdminSessionCookie,
  createAdminSession
} from "../../../lib/server/auth";
import {
  buildAdminSignInPath,
  buildFlashRedirect,
  resolveAdminRedirectPath,
  requestPrefersHtmlNavigation
} from "../../../lib/server/browser-flow";
import { readRequestPayload } from "../../../lib/server/request";

export const prerender = false;

function toBrowserSignInErrorMessage(message: string): string {
  if (message.includes("Local admin role is not assigned")) {
    return "This account is not authorized for admin access.";
  }

  return "Unable to sign in with those credentials.";
}

export const POST: APIRoute = async ({ request }) => {
  const browserRequest = requestPrefersHtmlNavigation(request);
  const payload = await readRequestPayload(request);
  const email = String(payload.email ?? "").trim();
  const password = String(payload.password ?? "");
  const nextPath = resolveAdminRedirectPath(
    request,
    String(payload.next ?? payload.redirectTo ?? ""),
    "/"
  );
  if (!email || !password) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "auth",
        status: "error",
        message: "Email and password are required.",
        setCookie: buildExpiredAdminSessionCookie(),
        redirectTo: buildAdminSignInPath(request, nextPath)
      });
    }
    return Response.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    const adminSession = await createAdminSession(email, password);
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "auth",
        status: "success",
        message: "Signed in.",
        setCookie: buildAdminSessionCookie(adminSession.idToken),
        redirectTo: nextPath
      });
    }

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
    const errorMessage =
      error instanceof Error ? error.message : "Admin sign-in failed.";
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "auth",
        status: "error",
        message: toBrowserSignInErrorMessage(errorMessage),
        setCookie: buildExpiredAdminSessionCookie(),
        redirectTo: buildAdminSignInPath(request, nextPath)
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
