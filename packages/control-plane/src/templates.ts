import type { Pool, PoolClient } from "pg";

import { CRITERION_COMPILE_REQUESTED_EVENT } from "@newsportal/contracts";

import {
  deleteInterestTemplate,
  deleteLlmTemplate,
  parseInterestTemplateInput,
  parseLlmTemplateInput,
  saveInterestTemplate,
  saveLlmTemplate,
  setInterestTemplateActiveState,
  setLlmTemplateActiveState,
  syncInterestTemplateCriterion,
  syncInterestTemplateSelectionProfile,
} from "../../../apps/admin/src/lib/server/admin-templates";
import { insertOutboxEvent } from "../../../apps/admin/src/lib/server/outbox";
import { writeAuditLog } from "./audit";

export type TemplateKind = "interest" | "llm";
type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

interface SavedTemplateResult {
  kind: TemplateKind;
  entityId: string;
  created: boolean;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function copyMissing(
  payload: Record<string, unknown>,
  key: string,
  value: unknown
): void {
  if (!hasOwn(payload, key)) {
    payload[key] = value;
  }
}

function readPolicyRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readCandidateSignalLines(
  definitionJson: unknown,
  key: "positiveGroups" | "negativeGroups"
): string[] {
  const definition = readPolicyRecord(definitionJson);
  const candidateSignals = readPolicyRecord(definition.candidateSignals);
  const groups = Array.isArray(candidateSignals[key]) ? candidateSignals[key] : [];
  return groups
    .map((group) => {
      const record = readPolicyRecord(group);
      const cues = Array.isArray(record.cues)
        ? record.cues.map((entry) => String(entry ?? "").trim()).filter(Boolean)
        : [];
      if (cues.length === 0) {
        return "";
      }
      const name = String(record.name ?? "").trim();
      return name ? `${name}: ${cues.join(", ")}` : cues.join(", ");
    })
    .filter(Boolean);
}

async function hydrateInterestTemplateUpdatePayload(
  queryable: Queryable,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const interestTemplateId = String(payload.interestTemplateId ?? "").trim();
  if (!interestTemplateId) {
    return payload;
  }

  const result = await queryable.query<{
    name: string;
    description: string;
    positive_texts: unknown;
    negative_texts: unknown;
    must_have_terms: unknown;
    must_not_have_terms: unknown;
    places: unknown;
    languages_allowed: unknown;
    time_window_hours: number | null;
    allowed_content_kinds: unknown;
    short_tokens_required: unknown;
    short_tokens_forbidden: unknown;
    priority: number;
    is_active: boolean;
    definition_json: unknown;
    policy_json: unknown;
  }>(
    `
      select
        it.name,
        it.description,
        it.positive_texts,
        it.negative_texts,
        it.must_have_terms,
        it.must_not_have_terms,
        it.places,
        it.languages_allowed,
        it.time_window_hours,
        it.allowed_content_kinds,
        it.short_tokens_required,
        it.short_tokens_forbidden,
        it.priority,
        it.is_active,
        sp.definition_json,
        sp.policy_json
      from interest_templates it
      left join selection_profiles sp
        on sp.source_interest_template_id = it.interest_template_id
      where it.interest_template_id = $1
      limit 1
    `,
    [interestTemplateId]
  );
  const row = result.rows[0];
  if (!row) {
    return payload;
  }

  const hydrated = { ...payload };
  copyMissing(hydrated, "name", row.name);
  copyMissing(hydrated, "description", row.description);
  copyMissing(hydrated, "positive_texts", row.positive_texts);
  copyMissing(hydrated, "negative_texts", row.negative_texts);
  copyMissing(hydrated, "must_have_terms", row.must_have_terms);
  copyMissing(hydrated, "must_not_have_terms", row.must_not_have_terms);
  copyMissing(hydrated, "places", row.places);
  copyMissing(hydrated, "languages_allowed", row.languages_allowed);
  copyMissing(hydrated, "time_window_hours", row.time_window_hours);
  copyMissing(hydrated, "allowed_content_kinds", row.allowed_content_kinds);
  copyMissing(hydrated, "short_tokens_required", row.short_tokens_required);
  copyMissing(hydrated, "short_tokens_forbidden", row.short_tokens_forbidden);
  copyMissing(hydrated, "priority", row.priority);
  copyMissing(hydrated, "isActive", row.is_active);

  const policy = readPolicyRecord(row.policy_json);
  copyMissing(hydrated, "selection_profile_strictness", policy.strictness);
  copyMissing(hydrated, "selection_profile_unresolved_decision", policy.unresolvedDecision);
  copyMissing(hydrated, "selection_profile_llm_review_mode", policy.llmReviewMode);
  copyMissing(
    hydrated,
    "candidate_positive_signals",
    readCandidateSignalLines(row.definition_json, "positiveGroups")
  );
  copyMissing(
    hydrated,
    "candidate_negative_signals",
    readCandidateSignalLines(row.definition_json, "negativeGroups")
  );
  return hydrated;
}

async function hydrateLlmTemplateUpdatePayload(
  queryable: Queryable,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const promptTemplateId = String(payload.promptTemplateId ?? "").trim();
  if (!promptTemplateId) {
    return payload;
  }

  const result = await queryable.query<{
    name: string;
    scope: string;
    language: string | null;
    template_text: string;
    is_active: boolean;
  }>(
    `
      select name, scope, language, template_text, is_active
      from llm_prompt_templates
      where prompt_template_id = $1
      limit 1
    `,
    [promptTemplateId]
  );
  const row = result.rows[0];
  if (!row) {
    return payload;
  }

  const hydrated = { ...payload };
  copyMissing(hydrated, "name", row.name);
  copyMissing(hydrated, "scope", row.scope);
  copyMissing(hydrated, "language", row.language);
  copyMissing(hydrated, "templateText", row.template_text);
  copyMissing(hydrated, "isActive", row.is_active);
  return hydrated;
}

export async function hydrateTemplateUpdatePayloadForSave(
  queryable: Queryable,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const kind = String(payload.kind ?? "llm").trim() === "interest" ? "interest" : "llm";
  if (kind === "interest") {
    return hydrateInterestTemplateUpdatePayload(queryable, payload);
  }
  return hydrateLlmTemplateUpdatePayload(queryable, payload);
}

export async function saveTemplateFromPayload(
  pool: Pool,
  actorUserId: string,
  payload: Record<string, unknown>
): Promise<SavedTemplateResult> {
  const kind = String(payload.kind ?? "llm").trim() === "interest" ? "interest" : "llm";
  const client = await pool.connect();
  try {
    await client.query("begin");

    if (kind === "interest") {
      const hydratedPayload = await hydrateTemplateUpdatePayloadForSave(client, payload);
      const template = parseInterestTemplateInput(hydratedPayload);
      const result = await saveInterestTemplate(client, template);
      const syncResult = await syncInterestTemplateCriterion(client, result.interestTemplateId);
      const profileSyncResult = await syncInterestTemplateSelectionProfile(
        client,
        result.interestTemplateId,
        template
      );
      if (syncResult.compileRequested) {
        await insertOutboxEvent(client, {
          eventType: CRITERION_COMPILE_REQUESTED_EVENT,
          aggregateType: "criterion",
          aggregateId: syncResult.criterionId,
          payload: {
            criterionId: syncResult.criterionId,
            version: syncResult.version,
          },
        });
      }
      await writeAuditLog(client, {
        actorUserId,
        actionType: result.created
          ? "interest_template_created"
          : "interest_template_updated",
        entityType: "interest_template",
        entityId: result.interestTemplateId,
        payloadJson: {
          name: template.name,
          isActive: template.isActive,
          created: result.created,
          criterionId: syncResult.criterionId,
          criterionVersion: syncResult.version,
          criterionCompileRequested: syncResult.compileRequested,
          selectionProfileId: profileSyncResult.selectionProfileId,
          selectionProfileVersion: profileSyncResult.version,
          selectionProfileStrictness: template.selectionProfileStrictness,
          selectionProfileUnresolvedDecision:
            template.selectionProfileUnresolvedDecision,
          selectionProfileLlmReviewMode: template.selectionProfileLlmReviewMode,
          candidatePositiveSignalGroupCount:
            template.candidatePositiveSignals.length,
          candidateNegativeSignalGroupCount:
            template.candidateNegativeSignals.length,
        },
      });
      await client.query("commit");
      return {
        kind,
        entityId: result.interestTemplateId,
        created: result.created,
      };
    }

    const hydratedPayload = await hydrateTemplateUpdatePayloadForSave(client, payload);
    const template = parseLlmTemplateInput(hydratedPayload);
    const result = await saveLlmTemplate(client, template);
    await writeAuditLog(client, {
      actorUserId,
      actionType: result.created ? "llm_template_created" : "llm_template_updated",
      entityType: "llm_template",
      entityId: result.promptTemplateId,
      payloadJson: {
        name: template.name,
        scope: template.scope,
        isActive: template.isActive,
        created: result.created,
      },
    });
    await client.query("commit");
    return {
      kind,
      entityId: result.promptTemplateId,
      created: result.created,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function setInterestTemplateActiveStateWithAudit(
  client: PoolClient,
  actorUserId: string,
  interestTemplateId: string,
  isActive: boolean
): Promise<void> {
  await setInterestTemplateActiveState(client, interestTemplateId, isActive);
  const syncResult = await syncInterestTemplateCriterion(client, interestTemplateId);
  const profileSyncResult = await syncInterestTemplateSelectionProfile(
    client,
    interestTemplateId
  );
  if (isActive && syncResult.compileRequested) {
    await insertOutboxEvent(client, {
      eventType: CRITERION_COMPILE_REQUESTED_EVENT,
      aggregateType: "criterion",
      aggregateId: syncResult.criterionId,
      payload: {
        criterionId: syncResult.criterionId,
        version: syncResult.version,
      },
    });
  }
  await writeAuditLog(client, {
    actorUserId,
    actionType: isActive
      ? "interest_template_activated"
      : "interest_template_archived",
    entityType: "interest_template",
    entityId: interestTemplateId,
    payloadJson: {
      criterionId: syncResult.criterionId,
      criterionVersion: syncResult.version,
      criterionCompileRequested: syncResult.compileRequested,
      selectionProfileId: profileSyncResult.selectionProfileId,
      selectionProfileVersion: profileSyncResult.version,
    },
  });
}

export async function setTemplateActiveStateWithAudit(
  pool: Pool,
  actorUserId: string,
  kind: TemplateKind,
  templateId: string,
  isActive: boolean
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (kind === "interest") {
      await setInterestTemplateActiveStateWithAudit(
        client,
        actorUserId,
        templateId,
        isActive
      );
    } else {
      await setLlmTemplateActiveState(client, templateId, isActive);
      await writeAuditLog(client, {
        actorUserId,
        actionType: isActive ? "llm_template_activated" : "llm_template_archived",
        entityType: "llm_template",
        entityId: templateId,
        payloadJson: {},
      });
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteTemplateWithAudit(
  pool: Pool,
  actorUserId: string,
  kind: TemplateKind,
  templateId: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (kind === "interest") {
      await deleteInterestTemplate(client, templateId);
      await writeAuditLog(client, {
        actorUserId,
        actionType: "interest_template_deleted",
        entityType: "interest_template",
        entityId: templateId,
        payloadJson: {},
      });
    } else {
      await deleteLlmTemplate(client, templateId);
      await writeAuditLog(client, {
        actorUserId,
        actionType: "llm_template_deleted",
        entityType: "llm_template",
        entityId: templateId,
        payloadJson: {},
      });
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
