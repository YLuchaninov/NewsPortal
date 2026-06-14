import { createHash } from "node:crypto";

import type { Pool, PoolClient } from "pg";

export type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export const FUNNEL_LANE_TYPES = [
  "explicit_marker",
  "hidden_intent",
  "mixed_split",
  "context_only",
  "unknown",
] as const;

export const FUNNEL_ROUTING_MODES = [
  "direct_select",
  "evidence_led_review",
  "llm_approved",
  "hold_for_calibration",
  "acquisition_only",
] as const;

export const FUNNEL_STATUSES = ["draft", "active", "paused", "archived"] as const;

export type FunnelLaneType = (typeof FUNNEL_LANE_TYPES)[number];
export type FunnelRoutingMode = (typeof FUNNEL_ROUTING_MODES)[number];
export type FunnelStatus = (typeof FUNNEL_STATUSES)[number];
export type FunnelPlanValidationStatus = "ready" | "blocked" | "requires_operator_choice";

export interface OperatorFunnelRecord {
  funnelId: string;
  name: string;
  goal: string;
  status: FunnelStatus;
  ownerUserId: string | null;
  createdFromIdeaJson: Record<string, unknown>;
  defaultPolicyJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  laneCount: number;
  interestCount: number;
  sourceCount: number;
  templateCount: number;
  selectedCount: number;
  grayCount: number;
  rejectedCount: number;
}

export interface FunnelLaneDraft {
  name: string;
  laneType: FunnelLaneType;
  routingMode: FunnelRoutingMode;
  policy: Record<string, unknown>;
  evidenceContract: Record<string, unknown>;
}

export interface UpdateOperatorFunnelLaneInput {
  funnelId: string;
  laneId: string;
  name?: string;
  laneType?: FunnelLaneType;
  routingMode?: FunnelRoutingMode;
  policyJson?: Record<string, unknown>;
  evidenceContractJson?: Record<string, unknown>;
}

export interface FunnelPlanIssue {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  path?: string;
  guidance?: string;
}

export interface FunnelPlanValidationResult {
  status: FunnelPlanValidationStatus;
  liveStateHash: string;
  blockers: FunnelPlanIssue[];
  warnings: FunnelPlanIssue[];
  infos: FunnelPlanIssue[];
  nextActions: string[];
}

export interface FunnelAutoplanResult {
  readOnly: true;
  generatedAt: string;
  planFingerprint: string;
  liveStateHash: string;
  operatorExperience: "novice" | "expert";
  funnelId: string | null;
  funnelDraft: {
    name: string;
    goal: string;
    status: FunnelStatus;
  } | null;
  suggestedAction: "create_new" | "attach_existing" | "split_or_choose" | "calibrate";
  lanes: FunnelLaneDraft[];
  systemInterestDrafts: Array<Record<string, unknown>>;
  llmTemplateDrafts: Array<Record<string, unknown>>;
  sourcePlan: Record<string, unknown>;
  replayPlan: Record<string, unknown>;
  verificationPlan: Record<string, unknown>;
  doNotDoYet: string[];
  blockedUntil: string[];
  manualTuningPath: Record<string, unknown>;
}

export interface StageFunnelPlanResult {
  status: "staged" | "blocked";
  planId: string | null;
  planFingerprint: string;
  liveStateHash: string;
  validation: FunnelPlanValidationResult;
  lanes?: Array<{
    laneId: string;
    name: string;
    laneType: FunnelLaneType;
    routingMode: FunnelRoutingMode;
  }>;
  nextReadBack: Array<{ toolName: string; argumentsTemplate: Record<string, unknown> }>;
}

export function iso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
  }
  return String(value ?? "")
    .split(/\r?\n|,/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function titleFromIdea(idea: string): string {
  const trimmed = idea.trim();
  if (!trimmed) {
    return "Untitled funnel";
  }
  const compact = trimmed.length > 72 ? `${trimmed.slice(0, 69).trim()}...` : trimmed;
  return compact[0]?.toUpperCase() + compact.slice(1);
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashValue(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function isLabelLikeCue(value: unknown): boolean {
  const cue = String(value ?? "").trim();
  return Boolean(cue) && /^[a-z0-9]+(?:[_-][a-z0-9]+)+$/iu.test(cue);
}

export function laneDefaults(laneType: FunnelLaneType): Pick<FunnelLaneDraft, "routingMode" | "policy" | "evidenceContract"> {
  if (laneType === "explicit_marker") {
    return {
      routingMode: "evidence_led_review",
      policy: {
        signalVisibility: "explicit_marker",
        autoSelectMode: "evidence_or_llm",
        autoSelectMinPositiveGroups: 3,
        autoSelectMinCueHits: 4,
        autoSelectRequiresNoNoise: true,
        autoSelectRequiresNoTechnicalVeto: true,
        llmReviewMode: "optional_high_value_only",
      },
      evidenceContract: {
        requiresIndependentEvidenceGroups: true,
        rejectsContextOnlyEvidence: true,
      },
    };
  }
  if (laneType === "hidden_intent") {
    return {
      routingMode: "llm_approved",
      policy: {
        signalVisibility: "hidden_intent",
        autoSelectMode: "llm_approved",
        autoSelectMinPositiveGroups: 2,
        autoSelectMinCueHits: 3,
        autoSelectRequiresNoNoise: true,
        autoSelectRequiresNoTechnicalVeto: true,
        llmReviewMode: "always",
      },
      evidenceContract: {
        deterministicEvidenceCanRecoverToReview: true,
        selectedRequiresLlmApprove: true,
      },
    };
  }
  if (laneType === "context_only") {
    return {
      routingMode: "acquisition_only",
      policy: {
        signalVisibility: "unknown",
        autoSelectMode: "disabled",
        llmReviewMode: "disabled",
      },
      evidenceContract: {
        selectedAlone: false,
        requiresDownstreamLaneMatch: true,
      },
    };
  }
  if (laneType === "mixed_split") {
    return {
      routingMode: "hold_for_calibration",
      policy: {
        signalVisibility: "mixed",
        autoSelectMode: "disabled",
        llmReviewMode: "optional_high_value_only",
      },
      evidenceContract: {
        splitRequired: true,
      },
    };
  }
  return {
    routingMode: "hold_for_calibration",
    policy: {
      signalVisibility: "unknown",
      autoSelectMode: "disabled",
      llmReviewMode: "disabled",
    },
    evidenceContract: {
      calibrationRequired: true,
    },
  };
}

export function buildLaneDraft(laneType: FunnelLaneType): FunnelLaneDraft {
  const defaults = laneDefaults(laneType);
  const label = laneType.replace(/_/gu, " ");
  return {
    name: label[0]?.toUpperCase() + label.slice(1),
    laneType,
    ...defaults,
  };
}

export function isFunnelLaneType(value: string): value is FunnelLaneType {
  return FUNNEL_LANE_TYPES.includes(value as FunnelLaneType);
}

export function isFunnelRoutingMode(value: string): value is FunnelRoutingMode {
  return FUNNEL_ROUTING_MODES.includes(value as FunnelRoutingMode);
}

export function readPlanLaneDrafts(plan: Record<string, unknown>): FunnelLaneDraft[] {
  const lanes = Array.isArray(plan.lanes) ? plan.lanes : [];
  return lanes.flatMap((laneValue): FunnelLaneDraft[] => {
    const lane = asRecord(laneValue);
    const laneTypeValue = String(lane.laneType ?? lane.lane_type ?? "").trim();
    if (!isFunnelLaneType(laneTypeValue)) {
      return [];
    }
    const defaults = laneDefaults(laneTypeValue);
    const routingModeValue = String(lane.routingMode ?? lane.routing_mode ?? defaults.routingMode).trim();
    const routingMode = isFunnelRoutingMode(routingModeValue)
      ? routingModeValue
      : defaults.routingMode;
    const name = String(lane.name ?? buildLaneDraft(laneTypeValue).name).trim();
    return [
      {
        name: name || buildLaneDraft(laneTypeValue).name,
        laneType: laneTypeValue,
        routingMode,
        policy: { ...defaults.policy, ...asRecord(lane.policy) },
        evidenceContract: {
          ...defaults.evidenceContract,
          ...asRecord(lane.evidenceContract ?? lane.evidence_contract),
        },
      },
    ];
  });
}
