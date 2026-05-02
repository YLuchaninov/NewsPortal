import type { APIRoute } from "astro";

import { readRuntimeConfig } from "@newsportal/config";
import { createNewsPortalSdk } from "@newsportal/sdk";

import {
  adminActionError,
  adminActionSuccess,
  insertAdminAuditLog,
  prepareAdminAction,
} from "../../../lib/server/admin-action";
import { getPool } from "../../../lib/server/db";

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
  const action = await prepareAdminAction(request, {
    fallbackRedirectPath: "/analysis-policies",
    actionToken: { scope: "content-analysis-policies" },
  });
  if (!action.ok) {
    return action.response;
  }

  const { payload, session } = action.context;
  const intent = String(payload.intent ?? "create").trim();
  const mode = String(payload.mode ?? "observe").trim();
  if (mode === "enforce" && !readBooleanField(payload.confirmEnforce)) {
    const message = "Confirm enforce mode before saving this analysis policy.";
    return adminActionError(action.context, {
      section: "analysis-policies",
      message,
      status: 400,
    });
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
    await insertAdminAuditLog(getPool(), {
      actorUserId: session.userId,
      actionType:
        intent === "update"
          ? "content_analysis_policy_updated"
          : "content_analysis_policy_created",
      entityType: "content_analysis_policy",
      entityId: String(saved.policy_id ?? payload.policyId ?? ""),
      payloadJson: { intent, payload: requestPayload, saved },
    });
    return adminActionSuccess(action.context, {
      section: "analysis-policies",
      message: intent === "update" ? "Analysis policy updated" : "Analysis policy created",
      status: intent === "update" ? 200 : 201,
      json: saved,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save analysis policy.";
    return adminActionError(action.context, {
      section: "analysis-policies",
      message,
      status: 400,
    });
  }
};
