import type { APIRoute } from "astro";

import { readRuntimeConfig } from "@newsportal/config";
import { MCP_CONTENT_ANALYSIS_PAYLOAD_SCHEMAS } from "@newsportal/contracts";
import { createNewsPortalSdk } from "@newsportal/sdk";

import {
  adminActionError,
  adminActionSuccess,
  insertAdminAuditLog,
  prepareAdminAction,
} from "../../../lib/server/admin-action";
import {
  assertAdminPayloadHasNoNestedEnvelope,
  assertAdminPayloadMatchesSchema,
} from "../../../lib/server/admin-payload-validation";
import { getPool } from "../../../lib/server/db";

export const prerender = false;

function readBooleanField(value: unknown): boolean {
  if (typeof value !== "string") {
    return value === true;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "on" || normalized === "true" || normalized === "1" || normalized === "yes";
}

function parsePolicyJson(value: unknown): Record<string, unknown> {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return {};
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Policy JSON must be an object.");
  }
  return parsed as Record<string, unknown>;
}

export const POST: APIRoute = async ({ request }) => {
  const action = await prepareAdminAction(request, {
    fallbackRedirectPath: "/filter-policies",
    actionToken: { scope: "content-filter-policies" },
  });
  if (!action.ok) {
    return action.response;
  }

  const { payload, session } = action.context;
  const intent = String(payload.intent ?? "create").trim();
  const mode = String(payload.mode ?? "dry_run").trim();
  if (mode === "enforce" && !readBooleanField(payload.confirmEnforce)) {
    const message = "Confirm enforce mode before saving this policy.";
    return adminActionError(action.context, {
      section: "filter-policies",
      message,
      status: 400,
    });
  }

  try {
    assertAdminPayloadHasNoNestedEnvelope(payload, "Content filter policy action");
    const policyJson = parsePolicyJson(payload.policyJson);
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
      mode,
      combiner: String(payload.combiner ?? "all").trim() || "all",
      policyJson,
      isActive: readBooleanField(payload.isActive),
      priority: Number.parseInt(String(payload.priority ?? "100"), 10) || 100,
    };
    const saved = await (
      intent === "update"
        ? (() => {
            assertAdminPayloadMatchesSchema(
              requestPayload,
              MCP_CONTENT_ANALYSIS_PAYLOAD_SCHEMAS.filterPolicyUpdate,
              "Content filter policy update payload",
            );
            return sdk.updateContentFilterPolicy<Record<string, unknown>>(
              String(payload.filterPolicyId ?? ""),
              requestPayload,
            );
          })()
        : (() => {
            const createPayload = {
              ...requestPayload,
              policyKey: String(payload.policyKey ?? "").trim(),
              scopeType: "global",
              version: 1,
            };
            assertAdminPayloadMatchesSchema(
              createPayload,
              MCP_CONTENT_ANALYSIS_PAYLOAD_SCHEMAS.filterPolicyCreate,
              "Content filter policy create payload",
            );
            return sdk.createContentFilterPolicy<Record<string, unknown>>(createPayload);
          })()
    );
    await insertAdminAuditLog(getPool(), {
      actorUserId: session.userId,
      actionType:
        intent === "update"
          ? "content_filter_policy_updated"
          : "content_filter_policy_created",
      entityType: "content_filter_policy",
      entityId: String(saved.filter_policy_id ?? payload.filterPolicyId ?? ""),
      payloadJson: { intent, payload: requestPayload, saved },
    });
    return adminActionSuccess(action.context, {
      section: "filter-policies",
      message: intent === "update" ? "Policy updated" : "Policy created",
      status: intent === "update" ? 200 : 201,
      json: saved,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save policy.";
    return adminActionError(action.context, {
      section: "filter-policies",
      message,
      status: 400,
    });
  }
};
