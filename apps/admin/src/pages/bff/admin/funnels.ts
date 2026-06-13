import type { APIRoute } from "astro";

import {
  archiveOperatorFunnel,
  buildOperatorFunnelAutoplan,
  createOperatorFunnel,
  FUNNEL_LANE_TYPES,
  FUNNEL_ROUTING_MODES,
  stageOperatorFunnelPlan,
  updateOperatorFunnel,
  updateOperatorFunnelLane,
  type FunnelLaneType,
  type FunnelRoutingMode,
  type FunnelStatus,
} from "@signalops/control-plane";

import {
  adminActionError,
  adminActionSuccess,
  prepareAdminAction,
} from "../../../lib/server/admin-action";
import {
  resolveAdminAppPath,
  resolveAdminRedirectPath,
} from "../../../lib/server/browser-flow";
import { getPool } from "../../../lib/server/db";

export const prerender = false;

type FunnelIntent = "create" | "update" | "archive" | "stage_plan_from_goal" | "update_lane";

function readIntent(payload: Record<string, unknown>): FunnelIntent {
  const intent = String(payload.intent ?? "create").trim();
  if (
    intent === "update" ||
    intent === "archive" ||
    intent === "stage_plan_from_goal" ||
    intent === "update_lane"
  ) {
    return intent;
  }
  return "create";
}

function readText(value: unknown): string {
  return String(value ?? "").trim();
}

function readStatus(value: unknown): FunnelStatus | undefined {
  const normalized = readText(value);
  if (normalized === "draft" || normalized === "active" || normalized === "paused" || normalized === "archived") {
    return normalized;
  }
  return undefined;
}

function readConfirm(value: unknown): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function readLaneType(value: unknown): FunnelLaneType | undefined {
  const normalized = readText(value);
  return FUNNEL_LANE_TYPES.includes(normalized as FunnelLaneType)
    ? (normalized as FunnelLaneType)
    : undefined;
}

function readRoutingMode(value: unknown): FunnelRoutingMode | undefined {
  const normalized = readText(value);
  return FUNNEL_ROUTING_MODES.includes(normalized as FunnelRoutingMode)
    ? (normalized as FunnelRoutingMode)
    : undefined;
}

function readOptionalJsonObject(value: unknown, fieldName: string): Record<string, unknown> | undefined {
  const text = readText(value);
  if (!text) {
    return undefined;
  }
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${fieldName} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

export const POST: APIRoute = async ({ request }) => {
  const action = await prepareAdminAction(request, {
    fallbackRedirectPath: "/funnels",
    actionToken: { scope: "funnels" },
  });
  if (!action.ok) {
    return action.response;
  }

  const { payload, session } = action.context;
  const pool = getPool();
  const redirectTo = resolveAdminRedirectPath(
    request,
    readText(payload.redirectTo),
    resolveAdminAppPath(request, "/funnels")
  );

  try {
    const intent = readIntent(payload);
    if (intent === "create") {
      const name = readText(payload.name);
      if (!name) {
        throw new Error("Funnel name is required.");
      }
      const result = await createOperatorFunnel(pool, session.userId, {
        name,
        goal: readText(payload.goal),
        status: readStatus(payload.status) ?? "draft",
        createdFromIdeaJson: {
          source: "admin",
          idea: readText(payload.idea),
        },
        defaultPolicyJson: {
          manualTuningAllowed: true,
          autopilotVersion: "2.0",
        },
      });
      return adminActionSuccess(action.context, {
        section: "funnels",
        message: "Funnel created",
        redirectTo: resolveAdminAppPath(request, `/funnels/${result.funnelId}`),
      });
    }

    const funnelId = readText(payload.funnelId);
    if (!funnelId) {
      throw new Error("Funnel ID is required.");
    }
    if (intent === "archive") {
      if (!readConfirm(payload.confirm)) {
        throw new Error("confirm=true is required to archive a funnel.");
      }
      await archiveOperatorFunnel(pool, session.userId, funnelId);
      return adminActionSuccess(action.context, {
        section: "funnels",
        message: "Funnel archived",
        redirectTo,
      });
    }

    if (intent === "stage_plan_from_goal") {
      const idea = readText(payload.idea);
      if (!idea) {
        throw new Error("Funnel goal is required to stage an autopilot plan.");
      }
      const plan = await buildOperatorFunnelAutoplan(pool, {
        idea,
        funnelId,
        operatorExperience: "novice",
      });
      const staged = await stageOperatorFunnelPlan(pool, session.userId, {
        funnelId,
        plan: plan as unknown as Record<string, unknown>,
        expectedLiveStateHash: plan.liveStateHash,
      });
      if (staged.status !== "staged") {
        throw new Error("Autopilot plan was blocked. Review the plan validation before staging.");
      }
      return adminActionSuccess(action.context, {
        section: "funnels",
        message: `Plan staged with ${staged.lanes?.length ?? 0} lane${staged.lanes?.length === 1 ? "" : "s"}`,
        redirectTo,
      });
    }

    if (intent === "update_lane") {
      const laneId = readText(payload.laneId);
      if (!laneId) {
        throw new Error("Lane ID is required.");
      }
      const name = readText(payload.name);
      const laneType = readLaneType(payload.laneType);
      const routingMode = readRoutingMode(payload.routingMode);
      if (!laneType) {
        throw new Error("Lane type is required.");
      }
      if (!routingMode) {
        throw new Error("Routing mode is required.");
      }
      const result = await updateOperatorFunnelLane(pool, session.userId, {
        funnelId,
        laneId,
        name: name || undefined,
        laneType,
        routingMode,
        policyJson: readOptionalJsonObject(payload.policyJson, "Policy"),
        evidenceContractJson: readOptionalJsonObject(payload.evidenceContractJson, "Evidence contract"),
      });
      if (!result.updated) {
        throw new Error("Lane was not found in this funnel.");
      }
      return adminActionSuccess(action.context, {
        section: "funnels",
        message: "Lane updated",
        redirectTo,
      });
    }

    await updateOperatorFunnel(pool, session.userId, {
      funnelId,
      name: readText(payload.name) || undefined,
      goal: readText(payload.goal) || undefined,
      status: readStatus(payload.status),
    });
    return adminActionSuccess(action.context, {
      section: "funnels",
      message: "Funnel updated",
      redirectTo,
    });
  } catch (error) {
    return adminActionError(action.context, {
      message: error instanceof Error ? error.message : "Unable to save the funnel.",
      section: "funnels",
      redirectTo,
    });
  }
};
