import type { APIRoute } from "astro";
import { readRuntimeConfig } from "@newsportal/config";
import { createNewsPortalSdk } from "@newsportal/sdk";
import { resolveAdminSession } from "../../../../../lib/server/auth";

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await resolveAdminSession(request);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const form = await request.formData();
  const prompt = String(form.get("prompt") ?? "").trim();
  const autopilotProfile = String(form.get("autopilotProfile") ?? "balanced").trim() || "balanced";
  if (!prompt) {
    return redirect("/discovery");
  }
  const runtimeConfig = readRuntimeConfig(process.env, {
    defaultAppBaseUrl: "http://127.0.0.1:4322/",
  });
  const sdk = createNewsPortalSdk({ baseUrl: runtimeConfig.apiBaseUrl, fetchImpl: fetch });
  await sdk.createSimpleDiscoveryTarget({
    prompt,
    autopilotProfile,
    createdBy: session.userId,
  });
  return redirect("/discovery");
};
