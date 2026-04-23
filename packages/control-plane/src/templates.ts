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

interface SavedTemplateResult {
  kind: TemplateKind;
  entityId: string;
  created: boolean;
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
      const template = parseInterestTemplateInput(payload);
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

    const template = parseLlmTemplateInput(payload);
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
