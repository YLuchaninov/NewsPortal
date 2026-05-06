import {
  validateAdminChannelPayload,
  validateJsonSchema,
  type JsonSchema,
} from "@newsportal/contracts";

const ADMIN_META_FIELDS = new Set(["intent", "redirectTo"]);

function stripKeys(
  payload: Record<string, unknown>,
  keys: ReadonlySet<string>,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !keys.has(key)));
}

function formatIssue(label: string, issue: ReturnType<typeof validateJsonSchema>[number]): string {
  return `${label} failed validation at ${issue.path}: ${issue.message}`;
}

function toJsonComparableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => toJsonComparableValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, toJsonComparableValue(entry)]),
    );
  }
  return value;
}

export function assertAdminPayloadHasNoNestedEnvelope(
  payload: Record<string, unknown>,
  label: string,
): void {
  if (Object.prototype.hasOwnProperty.call(payload, "payload")) {
    throw new Error(
      `${label} must pass fields directly. Nested "payload" envelopes are not accepted by the admin control plane.`,
    );
  }
}

export function stripAdminMetaFields(
  payload: Record<string, unknown>,
  extraFields: readonly string[] = [],
): Record<string, unknown> {
  return stripKeys(payload, new Set([...ADMIN_META_FIELDS, ...extraFields]));
}

export function assertAdminPayloadMatchesSchema(
  payload: Record<string, unknown>,
  schema: JsonSchema,
  label: string,
): void {
  const issues = validateJsonSchema(toJsonComparableValue(payload), schema);
  if (issues.length > 0) {
    throw new Error(formatIssue(label, issues[0]));
  }
}

export function assertAdminChannelPayloadMatchesSchema(
  payload: Record<string, unknown>,
  label: string,
): void {
  const issues = validateAdminChannelPayload(payload);
  if (issues.length > 0) {
    throw new Error(formatIssue(label, issues[0]));
  }
}

export function assertNoUnexpectedAdminFields(
  payload: Record<string, unknown>,
  allowedFields: readonly string[],
  label: string,
): void {
  const allowed = new Set([...ADMIN_META_FIELDS, ...allowedFields]);
  const unexpected = Object.keys(payload).find((key) => !allowed.has(key));
  if (unexpected) {
    throw new Error(`${label} contains unsupported field "${unexpected}".`);
  }
}
