import { readOptionalString } from "../protocol";
import {
  EVIDENCE_LANE_TYPE_VALUES,
  HARD_GATE_POLICY_VALUES,
  OPERATING_DOMAIN_VALUES,
  OPERATOR_CHANGE_INTENT_VALUES,
  OPERATOR_CLEANUP_INTENT_VALUES,
  OPERATOR_FLOW_MODE_VALUES,
  OPERATOR_FLOW_SYMPTOM_VALUES,
  OPERATOR_TUNING_LAYER_VALUES,
  OPERATOR_UPDATE_RISK_VALUES,
  SIGNAL_VISIBILITY_VALUES,
  type EvidenceLaneType,
  type HardGatePolicy,
  type OperatingDomain,
  type OperatorChangeIntent,
  type OperatorCleanupIntent,
  type OperatorFlowMode,
  type OperatorFlowSymptom,
  type OperatorTuningLayer,
  type OperatorUpdateRisk,
  type SignalVisibility,
} from "./model";

export function compactStringList(value: unknown): string[] {
  return readStringArray(value).map((entry) => entry.trim()).filter(Boolean);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => readOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

export function readAffectedScope(value: unknown): string[] {
  return readStringArray(value).map((entry) => entry.trim()).filter(Boolean);
}

export function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

export function normalizeOperatorFlowMode(value: unknown): OperatorFlowMode | null {
  const normalized = normalizeText(value).replace(/[-\s]+/gu, "_");
  return (OPERATOR_FLOW_MODE_VALUES as readonly string[]).includes(normalized)
    ? (normalized as OperatorFlowMode)
    : null;
}

export function normalizeOperatingDomain(value: unknown): OperatingDomain | null {
  const normalized = normalizeText(value).replace(/[-\s]+/gu, "_");
  return (OPERATING_DOMAIN_VALUES as readonly string[]).includes(normalized)
    ? (normalized as OperatingDomain)
    : null;
}

export function normalizeOperatorFlowSymptom(value: unknown): OperatorFlowSymptom | null {
  const normalized = normalizeText(value).replace(/[-\s]+/gu, "_");
  return (OPERATOR_FLOW_SYMPTOM_VALUES as readonly string[]).includes(normalized)
    ? (normalized as OperatorFlowSymptom)
    : null;
}

export function readOperatorFlowSymptoms(value: unknown): OperatorFlowSymptom[] {
  return readStringArray(value)
    .map((entry) => normalizeOperatorFlowSymptom(entry))
    .filter((entry): entry is OperatorFlowSymptom => entry != null);
}

export function normalizeOperatorChangeIntent(value: unknown): OperatorChangeIntent | null {
  const normalized = normalizeText(value).replace(/[-\s]+/gu, "_");
  return (OPERATOR_CHANGE_INTENT_VALUES as readonly string[]).includes(normalized)
    ? (normalized as OperatorChangeIntent)
    : null;
}

export function normalizeOperatorCleanupIntent(value: unknown): OperatorCleanupIntent | null {
  const normalized = normalizeText(value).replace(/[-\s]+/gu, "_");
  return (OPERATOR_CLEANUP_INTENT_VALUES as readonly string[]).includes(normalized)
    ? (normalized as OperatorCleanupIntent)
    : null;
}

export function normalizeOperatorTuningLayer(value: unknown): OperatorTuningLayer | null {
  const normalized = normalizeText(value).replace(/[-\s]+/gu, "_");
  return (OPERATOR_TUNING_LAYER_VALUES as readonly string[]).includes(normalized)
    ? (normalized as OperatorTuningLayer)
    : null;
}

export function normalizeOperatorUpdateRisk(value: unknown): OperatorUpdateRisk | null {
  const normalized = normalizeText(value).replace(/[-\s]+/gu, "_");
  return (OPERATOR_UPDATE_RISK_VALUES as readonly string[]).includes(normalized)
    ? (normalized as OperatorUpdateRisk)
    : null;
}

export function normalizeSignalVisibility(value: unknown): SignalVisibility | null {
  const normalized = normalizeText(value).replace(/[-\s]+/gu, "_");
  return (SIGNAL_VISIBILITY_VALUES as readonly string[]).includes(normalized)
    ? (normalized as SignalVisibility)
    : null;
}

export function normalizeEvidenceLaneType(value: unknown): EvidenceLaneType | null {
  const normalized = normalizeText(value).replace(/[-\s]+/gu, "_");
  return (EVIDENCE_LANE_TYPE_VALUES as readonly string[]).includes(normalized)
    ? (normalized as EvidenceLaneType)
    : null;
}

export function normalizeHardGatePolicy(value: unknown): HardGatePolicy | null {
  const normalized = normalizeText(value).replace(/[-\s]+/gu, "_");
  return (HARD_GATE_POLICY_VALUES as readonly string[]).includes(normalized)
    ? (normalized as HardGatePolicy)
    : null;
}
