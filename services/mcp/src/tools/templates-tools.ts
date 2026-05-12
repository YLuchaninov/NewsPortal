import { MCP_TEMPLATE_ARGUMENT_SCHEMAS } from "@newsportal/contracts";
import {
  deleteTemplateWithAudit,
  saveTemplateFromPayload,
  setTemplateActiveStateWithAudit,
} from "@newsportal/control-plane";

import {
  createReadTool,
  createWriteTool,
  JsonRpcError,
  pagingSchema,
  readPageArgs,
  readPayload,
  readBooleanFlag,
  readRequiredUuidString,
  requireDestructiveConfirmation,
  type McpToolDefinition
} from "./shared";

const systemInterestDetailSchema = {
  type: "object",
  properties: {
    interestTemplateId: { type: "string" },
    systemInterestId: { type: "string" },
    interestId: { type: "string" },
    entityId: { type: "string" },
  },
  additionalProperties: false,
} as const;

const llmTemplateDetailSchema = {
  type: "object",
  properties: {
    promptTemplateId: { type: "string" },
    llmTemplateId: { type: "string" },
    templateId: { type: "string" },
    entityId: { type: "string" },
  },
  additionalProperties: false,
} as const;

const templateDuplicateAuditSchema = {
  type: "object",
  properties: {
    includeInactive: { type: "boolean" },
    includeSamples: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

const systemInterestCompileStatusSchema = {
  type: "object",
  properties: {
    includeInactive: { type: "boolean" },
    includeSamples: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

type TemplateAuditRow = Record<string, unknown>;

function normalizeAuditName(name: unknown): string {
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

function normalizeAuditList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function inferInterestAuditFamily(row: TemplateAuditRow): string {
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

function inferLlmAuditFamily(row: TemplateAuditRow): string {
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

function summarizeCompileStatusRows(
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

function groupAuditItems<T extends Record<string, unknown>>(
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

function readSystemInterestId(args: Record<string, unknown>): string {
  return readAliasedId(args, "interestTemplateId", [
    "systemInterestId",
    "interestId",
    "entityId",
  ]);
}

function readLlmTemplateId(args: Record<string, unknown>): string {
  return readAliasedId(args, "promptTemplateId", ["llmTemplateId", "templateId", "entityId"]);
}

function readSystemInterestUuidId(args: Record<string, unknown>): string {
  return readRequiredUuidString(readSystemInterestId(args), "interestTemplateId");
}

function readLlmTemplateUuidId(args: Record<string, unknown>): string {
  return readRequiredUuidString(readLlmTemplateId(args), "promptTemplateId");
}

function readSystemInterestPayload(args: Record<string, unknown>): Record<string, unknown> {
  const payload = readPayload(args);
  if (Object.prototype.hasOwnProperty.call(payload, "interestTemplateId")) {
    payload.interestTemplateId = readRequiredUuidString(
      payload.interestTemplateId,
      "payload.interestTemplateId"
    );
  }
  return payload;
}

function readLlmTemplatePayload(args: Record<string, unknown>): Record<string, unknown> {
  const payload = readPayload(args);
  if (Object.prototype.hasOwnProperty.call(payload, "promptTemplateId")) {
    payload.promptTemplateId = readRequiredUuidString(
      payload.promptTemplateId,
      "payload.promptTemplateId"
    );
  }
  return payload;
}

export const TEMPLATE_MCP_TOOLS: readonly McpToolDefinition[] = [
  createReadTool(
    "system_interests.list",
    "List system interests from the public read surface.",
    pagingSchema,
    async ({ sdk }, args) => sdk.listSystemInterestsPage<Record<string, unknown>>(readPageArgs(args))
  ),
  createReadTool(
    "system_interests.read",
    "Read one system interest. Prefer interestTemplateId; entityId, systemInterestId, and interestId are accepted aliases for client read-back.",
    systemInterestDetailSchema,
    async ({ sdk }, args) => sdk.getSystemInterest<Record<string, unknown>>(readSystemInterestId(args))
  ),
  createReadTool(
    "llm_templates.list",
    "List LLM prompt templates.",
    pagingSchema,
    async ({ sdk }, args) => sdk.listLlmTemplatesPage<Record<string, unknown>>(readPageArgs(args))
  ),
  createReadTool(
    "llm_templates.read",
    "Read one LLM prompt template. Prefer promptTemplateId; entityId, templateId, and llmTemplateId are accepted aliases for client read-back.",
    llmTemplateDetailSchema,
    async ({ sdk }, args) => sdk.getLlmTemplate<Record<string, unknown>>(readLlmTemplateId(args))
  ),
  createReadTool(
    "templates.duplicates.audit",
    "Audit system interests and LLM templates for duplicate names, repeated families, proof-only bridge interests, and retained test-run copies. This is read-only and does not archive or delete anything.",
    templateDuplicateAuditSchema,
    async ({ pool }, args) => {
      const includeInactive =
        args.includeInactive === undefined
          ? false
          : readBooleanFlag(args.includeInactive, "includeInactive");
      const includeSamples =
        args.includeSamples === undefined
          ? true
          : readBooleanFlag(args.includeSamples, "includeSamples");
      const interestResult = await pool.query<TemplateAuditRow>(
        `
          select
            interest_template_id::text as id,
            name,
            description,
            positive_texts,
            negative_texts,
            must_have_terms,
            must_not_have_terms,
            places,
            languages_allowed,
            short_tokens_required,
            short_tokens_forbidden,
            priority,
            is_active as "isActive",
            updated_at as "updatedAt"
          from interest_templates
          where $1::boolean = true or is_active = true
          order by updated_at desc, name asc
        `,
        [includeInactive]
      );
      const llmResult = await pool.query<TemplateAuditRow>(
        `
          select
            prompt_template_id::text as id,
            name,
            scope,
            language,
            template_text,
            is_active as "isActive",
            updated_at as "updatedAt"
          from llm_prompt_templates
          where $1::boolean = true or is_active = true
          order by updated_at desc, scope asc, name asc
        `,
        [includeInactive]
      );
      const interests = interestResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        normalizedName: normalizeAuditName(row.name),
        family: inferInterestAuditFamily(row),
        description: row.description,
        isActive: row.isActive,
        positiveCount: normalizeAuditList(row.positive_texts).length,
        mustHaveTerms: normalizeAuditList(row.must_have_terms),
        shortTokensRequired: normalizeAuditList(row.short_tokens_required),
        places: normalizeAuditList(row.places),
        languagesAllowed: normalizeAuditList(row.languages_allowed),
        updatedAt: row.updatedAt,
      }));
      const llmTemplates = llmResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        normalizedName: normalizeAuditName(row.name),
        scope: row.scope,
        reviewerFamily: inferLlmAuditFamily(row),
        isActive: row.isActive,
        language: row.language,
        textLength: String(row.template_text ?? "").length,
        updatedAt: row.updatedAt,
      }));
      const interestFamilyGroups = groupAuditItems(interests, (item) => item.family);
      const interestNameDuplicateGroups = groupAuditItems(
        interests,
        (item) => item.normalizedName
      ).filter((group) => group.count > 1);
      const llmFamilyGroups = groupAuditItems(
        llmTemplates,
        (item) => `${item.scope}:${item.reviewerFamily}`
      );
      const llmNameDuplicateGroups = groupAuditItems(
        llmTemplates,
        (item) => item.normalizedName
      ).filter((group) => group.count > 1);
      const likelyProofOnlyInterests = interests.filter((item) =>
        /bridge|high recall|corpus/iu.test(`${item.name ?? ""} ${item.description ?? ""}`)
      );
      const likelyRetainedRunCopies = interests.filter((item) =>
        /\[[^\]]*(proof|scaleout|flow|test|run)[^\]]*\]/iu.test(String(item.name ?? ""))
      );
      return {
        generatedAt: new Date().toISOString(),
        includeInactive,
        totals: {
          interests: interests.length,
          llmTemplates: llmTemplates.length,
          interestNameDuplicateGroups: interestNameDuplicateGroups.length,
          llmNameDuplicateGroups: llmNameDuplicateGroups.length,
          likelyProofOnlyInterestCount: likelyProofOnlyInterests.length,
          likelyRetainedRunCopyCount: likelyRetainedRunCopies.length,
        },
        interestFamilies: interestFamilyGroups.map((group) => ({
          family: group.key,
          count: group.count,
          items: includeSamples ? group.items : undefined,
        })),
        interestNameDuplicateGroups,
        llmFamilies: llmFamilyGroups.map((group) => ({
          family: group.key,
          count: group.count,
          items: includeSamples ? group.items : undefined,
        })),
        llmNameDuplicateGroups,
        likelyProofOnlyInterests,
        likelyRetainedRunCopies: includeSamples ? likelyRetainedRunCopies : undefined,
        recommendedActions: [
          "Keep one canonical active system interest per family and archive retained run copies when the product-test audit no longer needs them active.",
          "Keep one active criteria-scope gray-zone LLM reviewer per behavior, plus one strict buyer-demand reviewer for precision tuning.",
          "Use system_interests.archive or llm_templates.archive for consolidation; do not delete retained product-test evidence unless explicitly requested.",
        ],
      };
    }
  ),
  createReadTool(
    "system_interests.compile_status.list",
    "List active system interests with their synced criteria, criteria_compiled row, and selection profile status. Use this when reindex reports 0 active centroids or selection replay finds no system matches.",
    systemInterestCompileStatusSchema,
    async ({ pool }, args) => {
      const includeInactive =
        args.includeInactive === undefined
          ? false
          : readBooleanFlag(args.includeInactive, "includeInactive");
      const includeSamples =
        args.includeSamples === undefined
          ? true
          : readBooleanFlag(args.includeSamples, "includeSamples");
      const result = await pool.query<Record<string, unknown>>(
        `
          select
            it.interest_template_id::text as "interestTemplateId",
            it.name,
            it.is_active as "isActive",
            it.updated_at as "interestUpdatedAt",
            c.criterion_id::text as "criterionId",
            c.enabled as "criterionEnabled",
            c.compiled as "criterionCompiled",
            c.compile_status as "criterionCompileStatus",
            c.updated_at as "criterionUpdatedAt",
            cc.compile_status as "compiledRowStatus",
            cc.compiled_at as "compiledAt",
            sp.selection_profile_id::text as "selectionProfileId",
            sp.status as "selectionProfileStatus",
            sp.version as "selectionProfileVersion"
          from interest_templates it
          left join criteria c on c.source_interest_template_id = it.interest_template_id
          left join criteria_compiled cc on cc.criterion_id = c.criterion_id
          left join selection_profiles sp on sp.source_interest_template_id = it.interest_template_id
          where $1::boolean = true or it.is_active = true
          order by it.updated_at desc, it.name asc
        `,
        [includeInactive]
      );
      return {
        generatedAt: new Date().toISOString(),
        includeInactive,
        includeSamples,
        ...summarizeCompileStatusRows(result.rows, includeSamples),
      };
    }
  ),
  createWriteTool(
    "system_interests.create",
    "Create a system interest through the shared control-plane service. List-like fields such as positive_texts, negative_texts, allowed_content_kinds, languages_allowed, and must_not terms accept newline-separated strings or string arrays.",
    "write.templates",
    MCP_TEMPLATE_ARGUMENT_SCHEMAS.systemInterestCreate,
    async ({ pool, token }, args) => {
      const payload = {
        ...readSystemInterestPayload(args),
        kind: "interest",
      };
      return saveTemplateFromPayload(pool, token.issuedByUserId, payload);
    }
  ),
  createWriteTool(
    "system_interests.update",
    "Update a system interest through the shared control-plane service. List-like fields such as positive_texts, negative_texts, allowed_content_kinds, languages_allowed, and must_not terms accept newline-separated strings or string arrays.",
    "write.templates",
    MCP_TEMPLATE_ARGUMENT_SCHEMAS.systemInterestUpdate,
    async ({ pool, token }, args) => {
      const payload = {
        ...readSystemInterestPayload(args),
        kind: "interest",
      };
      return saveTemplateFromPayload(pool, token.issuedByUserId, payload);
    }
  ),
  createWriteTool(
    "system_interests.archive",
    "Archive a system interest.",
    "write.templates",
    {
      type: "object",
      required: ["confirm"],
      properties: {
        ...systemInterestDetailSchema.properties,
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const interestTemplateId = readSystemInterestUuidId(args);
      await setTemplateActiveStateWithAudit(
        pool,
        token.issuedByUserId,
        "interest",
        interestTemplateId,
        false
      );
      return {
        ok: true,
        interestTemplateId,
        status: "archived",
      };
    },
    true
  ),
  createWriteTool(
    "system_interests.delete",
    "Delete a system interest.",
    "write.templates",
    {
      type: "object",
      required: ["confirm"],
      properties: {
        ...systemInterestDetailSchema.properties,
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const interestTemplateId = readSystemInterestUuidId(args);
      await deleteTemplateWithAudit(pool, token.issuedByUserId, "interest", interestTemplateId);
      return {
        ok: true,
        interestTemplateId,
      };
    },
    true
  ),
  createWriteTool(
    "llm_templates.create",
    "Create an LLM template through the shared control-plane service.",
    "write.templates",
    MCP_TEMPLATE_ARGUMENT_SCHEMAS.llmTemplateCreate,
    async ({ pool, token }, args) => {
      const payload = {
        ...readLlmTemplatePayload(args),
        kind: "llm",
      };
      return saveTemplateFromPayload(pool, token.issuedByUserId, payload);
    }
  ),
  createWriteTool(
    "llm_templates.update",
    "Update an LLM template through the shared control-plane service.",
    "write.templates",
    MCP_TEMPLATE_ARGUMENT_SCHEMAS.llmTemplateUpdate,
    async ({ pool, token }, args) => {
      const payload = {
        ...readLlmTemplatePayload(args),
        kind: "llm",
      };
      return saveTemplateFromPayload(pool, token.issuedByUserId, payload);
    }
  ),
  createWriteTool(
    "llm_templates.archive",
    "Archive an LLM template.",
    "write.templates",
    {
      type: "object",
      required: ["confirm"],
      properties: {
        ...llmTemplateDetailSchema.properties,
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const promptTemplateId = readLlmTemplateUuidId(args);
      await setTemplateActiveStateWithAudit(
        pool,
        token.issuedByUserId,
        "llm",
        promptTemplateId,
        false
      );
      return {
        ok: true,
        promptTemplateId,
        status: "archived",
      };
    },
    true
  ),
  createWriteTool(
    "llm_templates.delete",
    "Delete an LLM template.",
    "write.templates",
    {
      type: "object",
      required: ["confirm"],
      properties: {
        ...llmTemplateDetailSchema.properties,
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const promptTemplateId = readLlmTemplateUuidId(args);
      await deleteTemplateWithAudit(pool, token.issuedByUserId, "llm", promptTemplateId);
      return {
        ok: true,
        promptTemplateId,
      };
    },
    true
  ),
] as const;
