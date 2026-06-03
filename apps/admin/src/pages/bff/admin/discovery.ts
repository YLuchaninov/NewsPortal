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

function readBoolean(value: unknown): boolean {
  if (typeof value !== "string") {
    return value === true;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "on" || normalized === "true" || normalized === "1" || normalized === "yes";
}

function parseObjectJson(value: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return fallback;
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON payload must be an object.");
  }
  return parsed as Record<string, unknown>;
}

function readNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function discoveryPolicyDefinition(payload: Record<string, unknown>): Record<string, unknown> {
  const base = parseObjectJson(payload.definitionJson);
  return {
    ...base,
    maxAutoRisk: readNumber(payload.maxAutoRisk, Number(base.maxAutoRisk ?? 0.35)),
    maxWatchRisk: readNumber(payload.maxWatchRisk, Number(base.maxWatchRisk ?? 0.6)),
    maxProbeCandidatesPerRun: readNumber(payload.maxProbeCandidatesPerRun, Number(base.maxProbeCandidatesPerRun ?? 8)),
    maxProbeCandidatesPerHypothesis: readNumber(
      payload.maxProbeCandidatesPerHypothesis,
      Number(base.maxProbeCandidatesPerHypothesis ?? 2)
    ),
    sampleReviewPercent: readNumber(payload.sampleReviewPercent, Number(base.sampleReviewPercent ?? 0)),
    createCheapWatchChannel: readBoolean(payload.createCheapWatchChannel),
  };
}

export const POST: APIRoute = async ({ request }) => {
  const action = await prepareAdminAction(request, {
    fallbackRedirectPath: "/discovery",
    actionToken: { scope: "discovery" },
  });
  if (!action.ok) {
    return action.response;
  }

  const { payload, session } = action.context;
  const intent = String(payload.intent ?? "").trim();
  const runtimeConfig = readRuntimeConfig(process.env, {
    defaultAppBaseUrl: "http://127.0.0.1:4322/",
  });
  const sdk = createNewsPortalSdk({ baseUrl: runtimeConfig.apiBaseUrl, fetchImpl: fetch });

  try {
    let result: Record<string, unknown>;
    let auditType: string;

    if (intent === "create-run") {
      result = await sdk.createDiscoveryVNextRun<Record<string, unknown>>({
        runKind: String(payload.runKind ?? "full"),
        triggerKind: String(payload.triggerKind ?? "operator"),
        request: {},
        budget: {},
        createdBy: session.userId,
      });
      auditType = "discovery_vnext_run_created";
    } else if (intent === "start-run") {
      result = await sdk.startDiscoveryVNextRun<Record<string, unknown>>({
        runKind: String(payload.runKind ?? "full"),
        triggerKind: String(payload.triggerKind ?? "operator"),
        request: parseObjectJson(payload.requestJson),
        budget: parseObjectJson(payload.budgetJson, { maxRunCostCents: 1 }),
        liveProviderExecution: readBoolean(payload.liveProviderExecution),
        createdBy: session.userId,
      });
      auditType = "discovery_vnext_run_started";
    } else if (intent === "brief-preview") {
      result = await sdk.previewDiscoveryBrief<Record<string, unknown>>({
        name: String(payload.name ?? "").trim() || "System interest",
        description: String(payload.description ?? "").trim(),
        operatorConstraints: parseObjectJson(payload.operatorConstraintsJson),
      });
      auditType = "discovery_vnext_brief_previewed";
    } else if (intent === "llm-gateway") {
      result = await sdk.runDiscoveryLlmGateway<Record<string, unknown>>({
        task: String(payload.task ?? "").trim(),
        payload: parseObjectJson(payload.payloadJson),
        budget: parseObjectJson(payload.budgetJson),
        liveProviderExecution: readBoolean(payload.liveProviderExecution),
        createdBy: session.userId,
      });
      auditType = "discovery_vnext_llm_gateway_ran";
    } else if (intent === "activate-policy") {
      result = await sdk.activateDiscoveryPolicy<Record<string, unknown>>({
        policyName: String(payload.policyName ?? "").trim(),
        policyVersion: String(payload.policyVersion ?? "").trim(),
        policyType: String(payload.policyType ?? "").trim(),
        definition: discoveryPolicyDefinition(payload),
        createdBy: String(payload.createdBy ?? session.userId).trim() || session.userId,
      });
      auditType = "discovery_vnext_policy_activated";
    } else if (intent === "start-replay") {
      result = await sdk.startDiscoveryReplay<Record<string, unknown>>({
        replayKind: String(payload.replayKind ?? "full_non_live"),
        input: parseObjectJson(payload.inputJson),
        policyVersions: {},
        dryRun: readBoolean(payload.dryRun),
        createdBy: session.userId,
      });
      auditType = "discovery_vnext_replay_started";
    } else if (intent === "prepare-rollback") {
      result = await sdk.prepareDiscoveryRollback<Record<string, unknown>>({
        sourceInventoryId: String(payload.sourceInventoryId ?? "").trim(),
        reason: String(payload.reason ?? "").trim(),
        createdBy: session.userId,
      });
      auditType = "discovery_vnext_rollback_prepared";
    } else if (intent === "apply-rollback") {
      if (!readBoolean(payload.confirm)) {
        throw new Error("Confirm destructive rollback before applying it.");
      }
      result = await sdk.applyDiscoveryRollback<Record<string, unknown>>({
        rollbackGroupId: String(payload.rollbackGroupId ?? "").trim(),
        appliedBy: session.userId,
        confirm: true,
      });
      auditType = "discovery_vnext_rollback_applied";
    } else if (intent === "source-inventory-action") {
      result = await sdk.applyDiscoverySourceInventoryAction<Record<string, unknown>>({
        sourceInventoryId: String(payload.sourceInventoryId ?? "").trim(),
        action: String(payload.action ?? "").trim(),
        reason: String(payload.reason ?? "").trim(),
        createdBy: session.userId,
      });
      auditType = "discovery_vnext_source_inventory_action_applied";
    } else {
      throw new Error("Unknown Discovery vNext admin action.");
    }

    await insertAdminAuditLog(getPool(), {
      actorUserId: session.userId,
      actionType: auditType,
      entityType: "discovery_vnext",
      entityId: String(result.vnext_run_id ?? result.policy_id ?? result.rollback_group_id ?? result.replay_run_id ?? ""),
      payloadJson: { intent, payload, result },
    });

    return adminActionSuccess(action.context, {
      section: "discovery",
      message: "Discovery vNext action completed.",
      json: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discovery vNext action failed.";
    return adminActionError(action.context, {
      section: "discovery",
      message,
      status: 400,
    });
  }
};
