import type { APIRoute } from "astro";

import { readRuntimeConfig } from "@newsportal/config";
import { createNewsPortalSdk } from "@newsportal/sdk";

import {
  buildAdminSignInPath,
  buildFlashRedirect,
  requestPrefersHtmlNavigation,
  resolveAdminRedirectPath,
} from "../../../lib/server/browser-flow";
import {
  buildExpiredAdminSessionCookie,
  resolveAdminSession,
} from "../../../lib/server/auth";
import { getPool } from "../../../lib/server/db";
import { readRequestPayload } from "../../../lib/server/request";

export const prerender = false;

function readBooleanField(value: unknown): boolean {
  if (typeof value !== "string") {
    return value === true;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "on" || normalized === "true" || normalized === "1" || normalized === "yes";
}

function parseConfigJson(value: unknown): Record<string, unknown> {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return {};
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Config JSON must be an object.");
  }
  return parsed as Record<string, unknown>;
}

export const POST: APIRoute = async ({ request }) => {
  const browserRequest = requestPrefersHtmlNavigation(request);
  const redirectTo = resolveAdminRedirectPath(
    request,
    request.headers.get("referer"),
    "/analysis-policies"
  );
  const session = await resolveAdminSession(request);
  if (!session || !session.roles.includes("admin")) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "auth",
        status: "error",
        message: "Please sign in as an admin to continue.",
        setCookie: buildExpiredAdminSessionCookie(),
        redirectTo: buildAdminSignInPath(request, redirectTo),
      });
    }
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const payload = await readRequestPayload(request);
  const intent = String(payload.intent ?? "create").trim();
  const mode = String(payload.mode ?? "observe").trim();
  if (mode === "enforce" && !readBooleanField(payload.confirmEnforce)) {
    const message = "Confirm enforce mode before saving this analysis policy.";
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "analysis-policies",
        status: "error",
        message,
        redirectTo,
      });
    }
    return Response.json({ error: message }, { status: 400 });
  }

  try {
    const configJson = parseConfigJson(payload.configJson);
    const runtimeConfig = readRuntimeConfig(process.env, {
      defaultAppBaseUrl: "http://127.0.0.1:4322/",
    });
    const sdk = createNewsPortalSdk({
      baseUrl: runtimeConfig.apiBaseUrl,
      fetchImpl: fetch,
    });
    const requestPayload = {
      title: String(payload.title ?? "").trim(),
      description: String(payload.description ?? "").trim() || null,
      module: String(payload.module ?? "ner").trim(),
      enabled: readBooleanField(payload.enabled),
      mode,
      provider: String(payload.provider ?? "").trim() || null,
      modelKey: String(payload.modelKey ?? "").trim() || null,
      modelVersion: String(payload.modelVersion ?? "").trim() || null,
      configJson,
      failurePolicy: String(payload.failurePolicy ?? "skip").trim() || "skip",
      isActive: readBooleanField(payload.isActive),
      priority: Number.parseInt(String(payload.priority ?? "100"), 10) || 100,
    };
    const saved =
      intent === "update"
        ? await sdk.updateContentAnalysisPolicy<Record<string, unknown>>(
            String(payload.policyId ?? ""),
            requestPayload
          )
        : await sdk.createContentAnalysisPolicy<Record<string, unknown>>({
            ...requestPayload,
            policyKey: String(payload.policyKey ?? "").trim(),
            scopeType: "global",
            version: 1,
          });
    await getPool().query(
      `
        insert into audit_log (
          actor_user_id,
          action_type,
          entity_type,
          entity_id,
          payload_json
        )
        values ($1, $2, 'content_analysis_policy', $3, $4::jsonb)
      `,
      [
        session.userId,
        intent === "update"
          ? "content_analysis_policy_updated"
          : "content_analysis_policy_created",
        String(saved.policy_id ?? payload.policyId ?? ""),
        JSON.stringify({ intent, payload: requestPayload, saved }),
      ]
    );
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "analysis-policies",
        status: "success",
        message: intent === "update" ? "Analysis policy updated" : "Analysis policy created",
        redirectTo,
      });
    }
    return Response.json(saved, { status: intent === "update" ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save analysis policy.";
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "analysis-policies",
        status: "error",
        message,
        redirectTo,
      });
    }
    return Response.json({ error: message }, { status: 400 });
  }
};
