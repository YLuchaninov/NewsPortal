import { validateShortTokensRequired } from "@signalops/control-plane";

import { JsonRpcError, readPayload, readRequiredUuidString } from "./shared";

export const systemInterestDetailSchema = {
  type: "object",
  properties: {
    interestTemplateId: { type: "string" },
    systemInterestId: { type: "string" },
    interestId: { type: "string" },
    entityId: { type: "string" },
  },
  additionalProperties: false,
} as const;

export const llmTemplateDetailSchema = {
  type: "object",
  properties: {
    promptTemplateId: { type: "string" },
    llmTemplateId: { type: "string" },
    templateId: { type: "string" },
    entityId: { type: "string" },
  },
  additionalProperties: false,
} as const;

export const templateDuplicateAuditSchema = {
  type: "object",
  properties: {
    includeInactive: { type: "boolean" },
    includeSamples: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

export const systemInterestCompileStatusSchema = {
  type: "object",
  properties: {
    includeInactive: { type: "boolean" },
    includeSamples: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

export type TemplateAuditRow = Record<string, unknown>;

export function normalizeAuditName(name: unknown): string {
  return String(name ?? "")
    .replace(/\[[^\]]+\]/gu, "")
    .replace(
      /\s+\[(precision tuned|buyer-intent tightened|funding buyer-intent tightened)\]/giu,
      ""
    )
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

export function normalizeAuditList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

export function inferInterestAuditFamily(row: TemplateAuditRow): string {
  const text = `${row.name ?? ""} ${row.description ?? ""} ${normalizeAuditList(row.positive_texts).join(" ")}`.toLowerCase();
  if (/funded|funding|scaleup|scale-up|startup/u.test(text)) return "funded-scaleup";
  if (/procurement|rfp|tender|contract|grant/u.test(text)) return "procurement";
  if (/compliance|security|nis2|dora|fedramp|gdpr|cyber/u.test(text)) {
    return "compliance-security";
  }
  if (/failed|replacement|migration|vendor|implementation pain/u.test(text)) {
    return "vendor-replacement";
  }
  if (/hiring|capacity|contractor|staff/u.test(text)) return "capacity-shortage";
  if (/sme|regional|voucher|program/u.test(text)) return "sme-program";
  if (/ai|data|cloud/u.test(text)) return "ai-data-cloud";
  if (/bridge|high recall|corpus/u.test(text)) return "bridge-proof";
  return "other";
}

export function inferLlmAuditFamily(row: TemplateAuditRow): string {
  const text = `${row.name ?? ""} ${row.template_text ?? ""}`.toLowerCase();
  if (/strict buyer-demand|buyer-side budget|client-demand/u.test(text)) {
    return "strict-buyer-demand-reviewer";
  }
  if (/gray-zone|demand review/u.test(text)) return "gray-zone-reviewer";
  return "other";
}

function readCompileStatus(value: unknown): string {
  return String(value ?? "").trim() || "missing";
}

export function summarizeCompileStatusRows(
  rows: Array<Record<string, unknown>>,
  includeSamples: boolean
): Record<string, unknown> {
  const activeRows = rows.filter((row) => row.isActive !== false);
  const rowsWithCriterion = rows.filter((row) => Boolean(row.criterionId));
  const activeRowsWithCriterion = activeRows.filter((row) => Boolean(row.criterionId));
  const compiledActiveCriteria = activeRowsWithCriterion.filter(
    (row) =>
      row.criterionEnabled !== false &&
      row.criterionCompiled === true &&
      readCompileStatus(row.criterionCompileStatus) === "compiled" &&
      readCompileStatus(row.compiledRowStatus) === "compiled"
  );
  const profileActiveRows = activeRows.filter(
    (row) => readCompileStatus(row.selectionProfileStatus) === "active"
  );
  const byCriterionCompileStatus = groupAuditItems(rowsWithCriterion, (row) =>
    readCompileStatus(row.criterionCompileStatus)
  ).map((group) => ({ status: group.key, count: group.count }));
  const byCompiledRowStatus = groupAuditItems(rowsWithCriterion, (row) =>
    readCompileStatus(row.compiledRowStatus)
  ).map((group) => ({ status: group.key, count: group.count }));
  const blockers = activeRows
    .filter((row) => {
      if (!row.criterionId) return true;
      if (row.criterionEnabled === false) return true;
      if (row.criterionCompiled !== true) return true;
      if (readCompileStatus(row.criterionCompileStatus) !== "compiled") return true;
      if (readCompileStatus(row.compiledRowStatus) !== "compiled") return true;
      if (readCompileStatus(row.selectionProfileStatus) !== "active") return true;
      return false;
    })
    .map((row) => ({
      interestTemplateId: row.interestTemplateId,
      name: row.name,
      isActive: row.isActive,
      criterionId: row.criterionId,
      criterionEnabled: row.criterionEnabled,
      criterionCompiled: row.criterionCompiled,
      criterionCompileStatus: row.criterionCompileStatus,
      compiledRowStatus: row.compiledRowStatus,
      selectionProfileId: row.selectionProfileId,
      selectionProfileStatus: row.selectionProfileStatus,
      likelyBlockers: [
        !row.criterionId ? "missing_synced_criterion" : "",
        row.criterionEnabled === false ? "criterion_disabled" : "",
        row.criterionCompiled !== true ? "criterion_not_compiled" : "",
        row.criterionId && readCompileStatus(row.criterionCompileStatus) !== "compiled"
          ? "criterion_compile_status_not_compiled"
          : "",
        row.criterionId && readCompileStatus(row.compiledRowStatus) !== "compiled"
          ? "missing_or_uncompiled_criteria_compiled_row"
          : "",
        readCompileStatus(row.selectionProfileStatus) !== "active"
          ? "selection_profile_not_active"
          : "",
      ].filter(Boolean),
    }));

  return {
    totals: {
      interests: rows.length,
      activeInterests: activeRows.length,
      interestsWithCriterion: rowsWithCriterion.length,
      activeInterestsWithCriterion: activeRowsWithCriterion.length,
      compiledActiveCriteria: compiledActiveCriteria.length,
      activeSelectionProfiles: profileActiveRows.length,
      blockerCount: blockers.length,
    },
    byCriterionCompileStatus,
    byCompiledRowStatus,
    blockers: includeSamples ? blockers : blockers.slice(0, 10),
    rows: includeSamples ? rows : undefined,
    recommendedActions: [
      "If active interests have missing or uncompiled criteria, update the interest through system_interests.update or request the existing compile event processor before trusting selection replay.",
      "If compiledActiveCriteria is 0, maintenance.reindex.request can complete but the centroid/index path has no active compiled criteria to replay against.",
      "After any repair, queue maintenance.reindex.request with jobKind=backfill and verify operator.report.verify reportKind=selection.",
    ],
  };
}

export async function withTemplateReadBack(
  pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  result: Record<string, unknown>,
  readTool: string,
  idField: string,
  requestedPayload?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const entityId = String(result.entityId ?? "").trim();
  if (!entityId) {
    return result;
  }
  const readBackVerification =
    result.kind === "interest"
      ? await buildSystemInterestReadBackVerification(pool, entityId, requestedPayload ?? {})
      : undefined;
  return {
    ...result,
    ...(readBackVerification ? { readBackVerification } : {}),
    nextReadBack: [
      {
        tool: readTool,
        arguments: { [idField]: entityId },
      },
      ...(result.kind === "interest"
        ? [
            {
              tool: "system_interests.compile_status.list",
              arguments: { includeInactive: true, includeSamples: true },
            },
          ]
        : []),
    ],
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];
}

function normalizeRequestedList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : String(value ?? "").split(/\r?\n|,/u);
  return values.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
}

function countRequestedCandidateSignalGroups(value: unknown): number {
  if (Array.isArray(value)) {
    return value.filter((entry) => String(entry ?? "").trim()).length;
  }
  const values = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(/\r?\n/u)
        .map((entry) => entry.trim())
        .filter(Boolean);
  return values.filter((entry) => String(entry ?? "").trim()).length;
}

function readCandidateSignalGroupCount(definitionJson: unknown, key: string): number {
  const definition = asRecord(definitionJson);
  const candidateSignals = asRecord(definition.candidateSignals);
  const groups = candidateSignals[key];
  return Array.isArray(groups) ? groups.length : 0;
}

function isLabelLikeCandidateCue(value: unknown): boolean {
  const cue = String(value ?? "").trim();
  return Boolean(cue) && /^[a-z0-9]+(?:[_-][a-z0-9]+)+$/iu.test(cue);
}

function readCandidateSignalGroupsForWarnings(definitionJson: unknown) {
  const definition = asRecord(definitionJson);
  const candidateSignals = asRecord(definition.candidateSignals);
  const readGroups = (key: "positiveGroups" | "negativeGroups") => {
    const rawGroups = candidateSignals[key];
    const groups = Array.isArray(rawGroups) ? rawGroups : [];
    return groups.map((group, index) => {
      if (typeof group === "string") {
        return { name: group, cues: [group], index };
      }
      const record = asRecord(group);
      return {
        name: String(record.name ?? record.groupName ?? `group_${index + 1}`),
        cues: [
          ...asStringList(record.cues),
          ...asStringList(record.fragments),
          ...asStringList(record.values),
        ],
        index,
      };
    });
  };
  return {
    positiveGroups: readGroups("positiveGroups"),
    negativeGroups: readGroups("negativeGroups"),
  };
}

function buildCandidateSignalsQualityWarnings(definitionJson: unknown): string[] {
  const groups = readCandidateSignalGroupsForWarnings(definitionJson);
  const warnings: string[] = [];
  for (const [polarity, entries] of [
    ["positive", groups.positiveGroups],
    ["negative", groups.negativeGroups],
  ] as const) {
    for (const group of entries) {
      if (group.cues.length === 0) {
        warnings.push(
          `candidateSignals ${polarity} group "${group.name}" has no literal cue fragments.`
        );
      }
      if (group.cues.length === 1) {
        warnings.push(
          `candidateSignals ${polarity} group "${group.name}" has one cue; verify evidence diversity with bounded replay.`
        );
      }
      for (const cue of group.cues) {
        if (isLabelLikeCandidateCue(cue)) {
          warnings.push(
            `candidateSignals cue "${cue}" looks like an id/concept label; cues should be literal observable text fragments, while group.name carries the conceptual label.`
          );
        }
      }
    }
  }
  return warnings;
}

async function buildSystemInterestReadBackVerification(
  pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  interestTemplateId: string,
  requestedPayload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const result = await pool.query(
    `
      select
        it.interest_template_id::text as "interestTemplateId",
        it.allowed_content_kinds as "allowedContentKinds",
        it.must_have_terms as "mustHaveTerms",
        it.short_tokens_required as "shortTokensRequired",
        c.criterion_id::text as "criterionId",
        c.compiled as "criterionCompiled",
        c.compile_status as "criterionCompileStatus",
        cc.compile_status as "compiledRowStatus",
        sp.selection_profile_id::text as "selectionProfileId",
        sp.status as "selectionProfileStatus",
        sp.version as "selectionProfileVersion",
        sp.policy_json as "policyJson",
        sp.definition_json as "definitionJson"
      from interest_templates it
      left join criteria c on c.source_interest_template_id = it.interest_template_id
      left join criteria_compiled cc on cc.criterion_id = c.criterion_id
      left join selection_profiles sp on sp.source_interest_template_id = it.interest_template_id
      where it.interest_template_id = $1
      limit 1
    `,
    [interestTemplateId]
  );
  const row = result.rows[0];
  if (!row) {
    return {
      status: "missing",
      warnings: ["system_interests.write returned an id but MCP read-back could not find the interest."],
    };
  }

  const policy = asRecord(row.policyJson);
  const allowedContentKinds = asStringList(row.allowedContentKinds);
  const mustHaveTerms = asStringList(row.mustHaveTerms);
  const shortTokensRequired = asStringList(row.shortTokensRequired);
  const actual = {
    status: "verified",
    interestTemplateId: row.interestTemplateId,
    allowedContentKinds,
    mustHaveTerms,
    shortTokensRequired,
    criterionId: row.criterionId,
    criterionCompiled: row.criterionCompiled,
    criterionCompileStatus: row.criterionCompileStatus,
    compiledRowStatus: row.compiledRowStatus,
    selectionProfileId: row.selectionProfileId,
    selectionProfileStatus: row.selectionProfileStatus,
    selectionProfileVersion: row.selectionProfileVersion,
    selectionProfileStrictness: policy.strictness,
    selectionProfileUnresolvedDecision: policy.unresolvedDecision,
    selectionProfileLlmReviewMode: policy.llmReviewMode,
    selectionProfileAutoSelectMode: policy.autoSelectMode ?? "disabled",
    selectionProfileSignalVisibility: policy.signalVisibility ?? "unknown",
    selectionProfileAutoSelectMinPositiveGroups:
      policy.autoSelectMinPositiveGroups ?? 3,
    selectionProfileAutoSelectMinCueHits: policy.autoSelectMinCueHits ?? 4,
    selectionProfileAutoSelectRequiresNoNoise:
      policy.autoSelectRequiresNoNoise ?? true,
    selectionProfileAutoSelectRequiresNoTechnicalVeto:
      policy.autoSelectRequiresNoTechnicalVeto ?? true,
    candidatePositiveSignalGroupCount: readCandidateSignalGroupCount(
      row.definitionJson,
      "positiveGroups"
    ),
    candidateNegativeSignalGroupCount: readCandidateSignalGroupCount(
      row.definitionJson,
      "negativeGroups"
    ),
  };
  const warnings: string[] = [];
  if (
    Object.prototype.hasOwnProperty.call(requestedPayload, "selection_profile_llm_review_mode") &&
    String(requestedPayload.selection_profile_llm_review_mode) !==
      String(actual.selectionProfileLlmReviewMode ?? "")
  ) {
    warnings.push(
      "Requested selection_profile_llm_review_mode does not match persisted selectionProfileLlmReviewMode."
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(requestedPayload, "selection_profile_auto_select_mode") &&
    String(requestedPayload.selection_profile_auto_select_mode) !==
      String(actual.selectionProfileAutoSelectMode ?? "")
  ) {
    warnings.push(
      "Requested selection_profile_auto_select_mode does not match persisted selectionProfileAutoSelectMode."
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(requestedPayload, "selection_profile_signal_visibility") &&
    String(requestedPayload.selection_profile_signal_visibility) !==
      String(actual.selectionProfileSignalVisibility ?? "")
  ) {
    warnings.push(
      "Requested selection_profile_signal_visibility does not match persisted selectionProfileSignalVisibility."
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(requestedPayload, "allowed_content_kinds") &&
    !sameStringSet(normalizeRequestedList(requestedPayload.allowed_content_kinds), allowedContentKinds)
  ) {
    warnings.push("Requested allowed_content_kinds do not match persisted allowedContentKinds.");
  }
  if (
    Object.prototype.hasOwnProperty.call(requestedPayload, "candidate_positive_signals") &&
    countRequestedCandidateSignalGroups(requestedPayload.candidate_positive_signals) !==
      actual.candidatePositiveSignalGroupCount
  ) {
    warnings.push(
      "Requested candidate_positive_signals count does not match persisted candidate positive signal groups."
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(requestedPayload, "candidate_positive_signal_groups") &&
    countRequestedCandidateSignalGroups(requestedPayload.candidate_positive_signal_groups) !==
      actual.candidatePositiveSignalGroupCount
  ) {
    warnings.push(
      "Requested candidate_positive_signal_groups count does not match persisted candidate positive signal groups."
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(requestedPayload, "candidate_negative_signal_groups") &&
    countRequestedCandidateSignalGroups(requestedPayload.candidate_negative_signal_groups) !==
      actual.candidateNegativeSignalGroupCount
  ) {
    warnings.push(
      "Requested candidate_negative_signal_groups count does not match persisted candidate negative signal groups."
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(requestedPayload, "candidate_negative_signals") &&
    countRequestedCandidateSignalGroups(requestedPayload.candidate_negative_signals) !==
      actual.candidateNegativeSignalGroupCount
  ) {
    warnings.push(
      "Requested candidate_negative_signals count does not match persisted candidate negative signal groups."
    );
  }
  const candidateSignalsQualityWarnings = buildCandidateSignalsQualityWarnings(row.definitionJson);
  warnings.push(...candidateSignalsQualityWarnings);
  if (mustHaveTerms.length > 0) {
    warnings.push(
      "must_have_terms is any-of but still a hard pre-semantic gate; for hidden/unknown signals keep it empty unless mandatory marker proof exists."
    );
  }
  if (shortTokensRequired.length > 0) {
    warnings.push(
      "short_tokens_required is an extracted-token requirement, not a broad OR keyword replacement; hidden-signal baseline is empty unless token proof exists."
    );
  }
  return {
    ...actual,
    candidateSignalsQualityWarnings,
    hardGateSafetyWarnings: warnings.filter((warning) =>
      /must_have_terms|short_tokens_required|hard pre-semantic|hidden-signal/iu.test(warning)
    ),
    warnings,
    nextReadBack: [
      {
        tool: "system_interests.read",
        arguments: { interestTemplateId },
      },
      {
        tool: "system_interests.compile_status.list",
        arguments: { includeInactive: true, includeSamples: true },
      },
    ],
  };
}

export function groupAuditItems<T extends Record<string, unknown>>(
  items: T[],
  keyFn: (item: T) => string
): Array<{ key: string; count: number; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .map(([key, groupedItems]) => ({ key, count: groupedItems.length, items: groupedItems }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function readAliasedId(
  args: Record<string, unknown>,
  canonicalField: string,
  aliases: readonly string[]
): string {
  for (const fieldName of [canonicalField, ...aliases]) {
    const value = String(args[fieldName] ?? "").trim();
    if (value) {
      return value;
    }
  }
  throw new JsonRpcError(
    -32602,
    `${canonicalField} is required. Accepted aliases: ${aliases.join(", ")}.`,
    {
      statusCode: 400,
      data: {
        path: canonicalField,
        acceptedAliases: [canonicalField, ...aliases],
      },
    }
  );
}

export function readSystemInterestId(args: Record<string, unknown>): string {
  return readAliasedId(args, "interestTemplateId", [
    "systemInterestId",
    "interestId",
    "entityId",
  ]);
}

export function readLlmTemplateId(args: Record<string, unknown>): string {
  return readAliasedId(args, "promptTemplateId", ["llmTemplateId", "templateId", "entityId"]);
}

export function readSystemInterestUuidId(args: Record<string, unknown>): string {
  return readRequiredUuidString(readSystemInterestId(args), "interestTemplateId");
}

export function readLlmTemplateUuidId(args: Record<string, unknown>): string {
  return readRequiredUuidString(readLlmTemplateId(args), "promptTemplateId");
}

export function readSystemInterestPayload(args: Record<string, unknown>): Record<string, unknown> {
  const payload = readPayload(args);
  if (Object.prototype.hasOwnProperty.call(payload, "interestTemplateId")) {
    payload.interestTemplateId = readRequiredUuidString(
      payload.interestTemplateId,
      "payload.interestTemplateId"
    );
  }
  validateUnsupportedSystemInterestFields(payload);
  validateSystemInterestShortTokensRequired(payload);
  return payload;
}

const UNSUPPORTED_SYSTEM_INTEREST_FIELD_HINTS: Readonly<Record<string, {
  canonical: string;
  expectedShape: string;
}>> = {
  candidateSignals: {
    canonical:
      "candidate_positive_signals/candidate_negative_signals or candidate_positive_signal_groups/candidate_negative_signal_groups",
    expectedShape:
      "Use flat candidate_positive_signals / candidate_negative_signals for simple single-cue groups, or structured candidate_positive_signal_groups / candidate_negative_signal_groups with { name, tier, cues } for quality auto-select.",
  },
  selectionProfile: {
    canonical:
      "selection_profile_strictness, selection_profile_unresolved_decision, selection_profile_llm_review_mode, selection_profile_auto_select_mode, selection_profile_signal_visibility",
    expectedShape:
      "Use flat selection_profile_* fields, not a nested selectionProfile object.",
  },
  allowedContentKinds: {
    canonical: "allowed_content_kinds",
    expectedShape: "Use allowed_content_kinds as a string array or comma/newline-separated string.",
  },
  llmReviewMode: {
    canonical: "selection_profile_llm_review_mode",
    expectedShape:
      "Use selection_profile_llm_review_mode with disabled, optional_high_value_only, or always.",
  },
};

function validateUnsupportedSystemInterestFields(payload: Record<string, unknown>): void {
  for (const [fieldName, hint] of Object.entries(UNSUPPORTED_SYSTEM_INTEREST_FIELD_HINTS)) {
    if (!Object.prototype.hasOwnProperty.call(payload, fieldName)) {
      continue;
    }
    throw new JsonRpcError(
      -32602,
      `payload.${fieldName} is not a supported system_interests write field. Use ${hint.canonical}.`,
      {
        statusCode: 400,
        data: {
          path: `payload.${fieldName}`,
          code: "unsupported_field_alias",
          canonicalField: hint.canonical,
          expectedShape: hint.expectedShape,
          hint:
            "Read system_interests.read and system_interests.compile_status.list after every write; do not report intended profile/candidateSignals settings until read-back confirms them.",
        },
      }
    );
  }
}

function validateSystemInterestShortTokensRequired(payload: Record<string, unknown>): void {
  if (!Object.prototype.hasOwnProperty.call(payload, "short_tokens_required")) {
    return;
  }
  const rawValue = payload.short_tokens_required;
  const values = Array.isArray(rawValue)
    ? rawValue.map((value) => String(value ?? "").trim()).filter(Boolean)
    : String(rawValue ?? "")
        .split(/\r?\n|,/u)
        .map((value) => value.trim())
        .filter(Boolean);
  const invalidIndex = values.findIndex((value) => /\s/u.test(value));
  if (invalidIndex < 0) {
    validateShortTokensRequired(values, "payload.short_tokens_required");
    return;
  }
  throw new JsonRpcError(
    -32602,
    `payload.short_tokens_required[${invalidIndex}] must be a single extracted token, not a phrase.`,
    {
      statusCode: 400,
      data: {
        path: `payload.short_tokens_required[${invalidIndex}]`,
        expectedShape:
          "Array of token-like strings with no internal whitespace, e.g. RFP, RFQ, AI, US-, devops.",
        hint:
          "Phrase lexical gates belong in must_have_terms only when truly mandatory; hidden-signal recovery should use candidateSignals, representative evidence, near-miss negatives, bounded replay, and read-back proof.",
      },
    }
  );
}

export function readLlmTemplatePayload(args: Record<string, unknown>): Record<string, unknown> {
  const payload = readPayload(args);
  if (Object.prototype.hasOwnProperty.call(payload, "promptTemplateId")) {
    payload.promptTemplateId = readRequiredUuidString(
      payload.promptTemplateId,
      "payload.promptTemplateId"
    );
  }
  return payload;
}

