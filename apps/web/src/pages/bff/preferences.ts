import type { APIRoute } from "astro";

import {
  buildFlashRedirect,
  requestPrefersHtmlNavigation
} from "../../lib/server/browser-flow";
import { getPool } from "../../lib/server/db";
import { readRequestPayload } from "../../lib/server/request";
import {
  buildExpiredSessionCookie,
  resolveWebSession
} from "../../lib/server/auth";

export const prerender = false;
export const GET: APIRoute = async ({ request }) => {
  const session = await resolveWebSession(request);
  if (!session) {
    return Response.json({ preferences: null }, { status: 200 });
  }

  const pool = getPool();
  const result = await pool.query<{
    theme_preference: string;
    notification_preferences: Record<string, boolean>;
  }>(
    `
      select theme_preference, notification_preferences
      from user_profiles
      where user_id = $1
      limit 1
    `,
    [session.userId]
  );

  return Response.json({
    preferences: result.rows[0] ?? null
  });
};

function readOptionalBoolean(value: unknown): boolean | null {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  return null;
}

export const POST: APIRoute = async ({ request }) => {
  const browserRequest = requestPrefersHtmlNavigation(request);
  const session = await resolveWebSession(request);
  if (!session) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "auth",
        status: "error",
        message: "Please start a session to continue.",
        setCookie: buildExpiredSessionCookie()
      });
    }
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = await readRequestPayload(request);
  const themePreference = String(payload.themePreference ?? "system");
  if (!["light", "dark", "system"].includes(themePreference)) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "preferences",
        status: "error",
        message: "Invalid theme preference."
      });
    }
    return Response.json({ error: "Invalid theme preference." }, { status: 400 });
  }

  const pool = getPool();
  const currentProfile = await pool.query<{ notification_preferences: Record<string, boolean> }>(
    `
      select notification_preferences
      from user_profiles
      where user_id = $1
      limit 1
    `,
    [session.userId]
  );
  const currentNotificationPreferences =
    currentProfile.rows[0]?.notification_preferences ?? {
      web_push: true,
      telegram: true,
      weekly_email_digest: true
    };
  const notificationPreferences = {
    ...currentNotificationPreferences,
    ...(readOptionalBoolean(payload.webPushEnabled) != null
      ? { web_push: readOptionalBoolean(payload.webPushEnabled) }
      : {}),
    ...(readOptionalBoolean(payload.telegramEnabled) != null
      ? { telegram: readOptionalBoolean(payload.telegramEnabled) }
      : {}),
    ...(readOptionalBoolean(payload.weeklyEmailDigestEnabled) != null
      ? { weekly_email_digest: readOptionalBoolean(payload.weeklyEmailDigestEnabled) }
      : {})
  };
  await pool.query(
    `
      update user_profiles
      set
        theme_preference = $2,
        notification_preferences = $3::jsonb,
        updated_at = now()
      where user_id = $1
    `,
    [session.userId, themePreference, JSON.stringify(notificationPreferences)]
  );

  if (browserRequest) {
    return buildFlashRedirect(request, {
      section: "preferences",
      status: "success",
      message: "Preferences saved"
    });
  }

  return Response.json({ updated: true, notificationPreferences });
};
