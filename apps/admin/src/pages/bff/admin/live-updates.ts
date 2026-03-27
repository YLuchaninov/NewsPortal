import type { APIRoute } from "astro";

import type { AdminLiveUpdateSurface } from "../../../lib/live-updates";
import { serializeAdminLiveUpdatesResponse } from "../../../lib/live-updates";
import { resolveAdminSession } from "../../../lib/server/auth";
import { loadAdminLiveUpdatesSnapshot } from "../../../lib/server/live-updates";

export const prerender = false;

function parseSurface(value: string | null): AdminLiveUpdateSurface | null {
  if (
    value === "dashboard" ||
    value === "reindex" ||
    value === "observability" ||
    value === "user-interests"
  ) {
    return value;
  }
  return null;
}

function parsePositiveInt(value: string | null): number | undefined {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export const GET: APIRoute = async ({ request }) => {
  const session = await resolveAdminSession(request);
  if (!session) {
    return Response.json(serializeAdminLiveUpdatesResponse(null), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
  if (!session.roles.includes("admin")) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const url = new URL(request.url);
  const surface = parseSurface(url.searchParams.get("surface"));
  if (!surface) {
    return Response.json(
      { error: "A valid live-update surface is required." },
      { status: 400 }
    );
  }

  try {
    const snapshot = await loadAdminLiveUpdatesSnapshot({
      surface,
      page: parsePositiveInt(url.searchParams.get("page")),
      pageSize: parsePositiveInt(url.searchParams.get("pageSize")),
      userId: url.searchParams.get("userId") ?? undefined,
    });

    return Response.json(serializeAdminLiveUpdatesResponse(snapshot), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load live updates.";
    const status = message === "User not found." ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
};
