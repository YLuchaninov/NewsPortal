import { MCP_TEMPLATE_ARGUMENT_SCHEMAS } from "@signalops/contracts";
import {
  bindSystemInterestToFunnel,
  bindTemplateToFunnel,
  deleteTemplateWithAudit,
  saveTemplateFromPayload,
  setTemplateActiveStateWithAudit,
} from "@signalops/control-plane";

import {
  createReadTool,
  createWriteTool,
  mcpFunnelWriteContextPayload,
  pagingSchema,
  readBooleanFlag,
  readMcpFunnelWriteContext,
  readPageArgs,
  requireDestructiveConfirmation,
  shouldAuditMcpFunnelWriteContext,
  withMcpFunnelWriteContext,
  writeMcpMutationAudit,
  type McpToolDefinition
} from "./shared";
import {
  groupAuditItems,
  inferInterestAuditFamily,
  inferLlmAuditFamily,
  llmTemplateDetailSchema,
  normalizeAuditList,
  normalizeAuditName,
  readLlmTemplateId,
  readLlmTemplatePayload,
  readLlmTemplateUuidId,
  readSystemInterestId,
  readSystemInterestPayload,
  readSystemInterestUuidId,
  summarizeCompileStatusRows,
  systemInterestCompileStatusSchema,
  systemInterestDetailSchema,
  templateDuplicateAuditSchema,
  withTemplateReadBack,
  type TemplateAuditRow,
} from "./templates-tool-helpers";

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
            purpose,
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
        purpose: row.purpose ?? "selection_review",
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
      const funnelContext = await readMcpFunnelWriteContext(pool, token, args, {
        toolName: "system_interests.create",
        riskKind: "selection",
        selectionImpacting: true,
      });
      const payload = {
        ...readSystemInterestPayload(args),
        kind: "interest",
      };
      const result = await saveTemplateFromPayload(pool, token.issuedByUserId, payload);
      const entityId = result.entityId;
      const funnelBinding = funnelContext.funnelId
        ? await bindSystemInterestToFunnel(pool, token.issuedByUserId, {
            funnelId: funnelContext.funnelId,
            laneId: funnelContext.laneId,
            interestTemplateId: entityId,
            bindingRole: funnelContext.changeMode ?? "manual_tuning",
          })
        : null;
      if (shouldAuditMcpFunnelWriteContext(funnelContext)) {
        await writeMcpMutationAudit(pool, token, {
          actionType: "mcp_funnel_write_context_recorded",
          entityType: "interest_template",
          entityId,
          payloadJson: mcpFunnelWriteContextPayload(funnelContext),
        });
      }
      const response = await withTemplateReadBack(
        pool,
        result as unknown as Record<string, unknown>,
        "system_interests.read",
        "interestTemplateId",
        payload
      );
      return withMcpFunnelWriteContext(
        { ...response, ...(funnelBinding ? { funnelBinding } : {}) },
        funnelContext
      );
    }
  ),
  createWriteTool(
    "system_interests.update",
    "Update a system interest through the shared control-plane service. List-like fields such as positive_texts, negative_texts, allowed_content_kinds, languages_allowed, and must_not terms accept newline-separated strings or string arrays.",
    "write.templates",
    MCP_TEMPLATE_ARGUMENT_SCHEMAS.systemInterestUpdate,
    async ({ pool, token }, args) => {
      const funnelContext = await readMcpFunnelWriteContext(pool, token, args, {
        toolName: "system_interests.update",
        riskKind: "selection",
        selectionImpacting: true,
      });
      const payload = {
        ...readSystemInterestPayload(args),
        kind: "interest",
      };
      const result = await saveTemplateFromPayload(pool, token.issuedByUserId, payload);
      const entityId = result.entityId;
      const funnelBinding = funnelContext.funnelId
        ? await bindSystemInterestToFunnel(pool, token.issuedByUserId, {
            funnelId: funnelContext.funnelId,
            laneId: funnelContext.laneId,
            interestTemplateId: entityId,
            bindingRole: funnelContext.changeMode ?? "manual_tuning",
          })
        : null;
      if (shouldAuditMcpFunnelWriteContext(funnelContext)) {
        await writeMcpMutationAudit(pool, token, {
          actionType: "mcp_funnel_write_context_recorded",
          entityType: "interest_template",
          entityId,
          payloadJson: mcpFunnelWriteContextPayload(funnelContext),
        });
      }
      const response = await withTemplateReadBack(
        pool,
        result as unknown as Record<string, unknown>,
        "system_interests.read",
        "interestTemplateId",
        payload
      );
      return withMcpFunnelWriteContext(
        { ...response, ...(funnelBinding ? { funnelBinding } : {}) },
        funnelContext
      );
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
      const funnelContext = await readMcpFunnelWriteContext(pool, token, args, {
        toolName: "llm_templates.create",
        riskKind: "llm_review",
        selectionImpacting: true,
      });
      const payload = {
        ...readLlmTemplatePayload(args),
        kind: "llm",
      };
      const result = await saveTemplateFromPayload(pool, token.issuedByUserId, payload);
      const entityId = result.entityId;
      const funnelBinding = funnelContext.funnelId
        ? await bindTemplateToFunnel(pool, token.issuedByUserId, {
            funnelId: funnelContext.funnelId,
            laneId: funnelContext.laneId,
            promptTemplateId: entityId,
            bindingRole: funnelContext.changeMode ?? "manual_tuning",
          })
        : null;
      if (shouldAuditMcpFunnelWriteContext(funnelContext)) {
        await writeMcpMutationAudit(pool, token, {
          actionType: "mcp_funnel_write_context_recorded",
          entityType: "llm_template",
          entityId,
          payloadJson: mcpFunnelWriteContextPayload(funnelContext),
        });
      }
      const response = await withTemplateReadBack(
        pool,
        result as unknown as Record<string, unknown>,
        "llm_templates.read",
        "promptTemplateId"
      );
      return withMcpFunnelWriteContext(
        { ...response, ...(funnelBinding ? { funnelBinding } : {}) },
        funnelContext
      );
    }
  ),
  createWriteTool(
    "llm_templates.update",
    "Update an LLM template through the shared control-plane service.",
    "write.templates",
    MCP_TEMPLATE_ARGUMENT_SCHEMAS.llmTemplateUpdate,
    async ({ pool, token }, args) => {
      const funnelContext = await readMcpFunnelWriteContext(pool, token, args, {
        toolName: "llm_templates.update",
        riskKind: "llm_review",
        selectionImpacting: true,
      });
      const payload = {
        ...readLlmTemplatePayload(args),
        kind: "llm",
      };
      const result = await saveTemplateFromPayload(pool, token.issuedByUserId, payload);
      const entityId = result.entityId;
      const funnelBinding = funnelContext.funnelId
        ? await bindTemplateToFunnel(pool, token.issuedByUserId, {
            funnelId: funnelContext.funnelId,
            laneId: funnelContext.laneId,
            promptTemplateId: entityId,
            bindingRole: funnelContext.changeMode ?? "manual_tuning",
          })
        : null;
      if (shouldAuditMcpFunnelWriteContext(funnelContext)) {
        await writeMcpMutationAudit(pool, token, {
          actionType: "mcp_funnel_write_context_recorded",
          entityType: "llm_template",
          entityId,
          payloadJson: mcpFunnelWriteContextPayload(funnelContext),
        });
      }
      const response = await withTemplateReadBack(
        pool,
        result as unknown as Record<string, unknown>,
        "llm_templates.read",
        "promptTemplateId"
      );
      return withMcpFunnelWriteContext(
        { ...response, ...(funnelBinding ? { funnelBinding } : {}) },
        funnelContext
      );
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
