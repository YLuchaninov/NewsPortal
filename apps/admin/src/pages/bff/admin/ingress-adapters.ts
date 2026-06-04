import type { APIRoute } from "astro";

import { readRuntimeConfig } from "@signalops/config";

import {
  adminActionError,
  adminActionSuccess,
  insertAdminAuditLog,
  prepareAdminAction,
} from "../../../lib/server/admin-action";
import { assertAdminPayloadHasNoNestedEnvelope } from "../../../lib/server/admin-payload-validation";
import { resolveAdminAppPath } from "../../../lib/server/browser-flow";
import { getPool } from "../../../lib/server/db";

export const prerender = false;

type JsonRecord = Record<string, unknown>;

function readText(value: unknown, fallback = ""): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function readJsonField(value: unknown, fieldName: string, fallback: unknown): unknown {
  const text = readText(value);
  if (!text) {
    return fallback;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${fieldName} must be valid JSON.`);
  }
}

function buildAdapterPayload(payload: JsonRecord): JsonRecord {
  return {
    adapterKey: readText(payload.adapterKey),
    title: readText(payload.title),
    description: readText(payload.description),
    providerType: readText(payload.providerType, "api"),
    outputMode: readText(payload.outputMode, "signal_candidates"),
    status: readText(payload.status, "draft"),
    priority: Number(readText(payload.priority, "100")),
    matchRules: readJsonField(payload.matchRulesJson, "matchRulesJson", {}),
    configSchema: readJsonField(payload.configSchemaJson, "configSchemaJson", {}),
    recipe: readJsonField(payload.recipeJson, "recipeJson", null),
    moduleName: readText(payload.moduleName, "declarative.api.custom"),
    metadata: readJsonField(payload.metadataJson, "metadataJson", {}),
  };
}

async function callIngressApi<T>(path: string, init: RequestInit): Promise<T> {
  const runtimeConfig = readRuntimeConfig(process.env, {
    defaultAppBaseUrl: "http://127.0.0.1:4322/",
  });
  const response = await fetch(`${runtimeConfig.apiBaseUrl}${path}`, init);
  const payload = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    const detail = payload.detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : `Ingress adapter request failed with ${response.status}.`
    );
  }
  return payload as T;
}

async function audit(
  actorUserId: string,
  actionType: string,
  entityId: string | null,
  payloadJson: JsonRecord
): Promise<void> {
  await insertAdminAuditLog(getPool(), {
    actorUserId,
    actionType,
    entityType: "ingress_adapter",
    entityId,
    payloadJson,
  });
}

export const POST: APIRoute = async ({ request }) => {
  const action = await prepareAdminAction(request, {
    fallbackRedirectPath: "/ingress-adapters",
    actionToken: { scope: "ingress-adapters" },
  });
  if (!action.ok) {
    return action.response;
  }

  const { payload, session } = action.context;

  try {
    assertAdminPayloadHasNoNestedEnvelope(payload, "Ingress adapter action");
    const intent = readText(payload.intent, "create");

    if (intent === "dry-run") {
      const adapterKey = readText(payload.adapterKey);
      const dryRunPayload = {
        adapterKey,
        providerType: readText(payload.providerType, "api"),
        fetchUrl: readText(payload.fetchUrl),
        limit: Number(readText(payload.limit, "5")),
        config: readJsonField(payload.configJson, "configJson", {}),
      };
      const result = await callIngressApi<JsonRecord>(
        `/maintenance/ingress-adapters/${encodeURIComponent(adapterKey)}/dry-run`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(dryRunPayload),
        }
      );
      return adminActionSuccess(action.context, {
        section: "ingress-adapters",
        message: "Dry-run completed",
        json: result,
      });
    }

    if (intent === "update") {
      const adapterKey = readText(payload.adapterKey);
      const result = await callIngressApi<JsonRecord>(
        `/maintenance/ingress-adapters/${encodeURIComponent(adapterKey)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildAdapterPayload(payload)),
        }
      );
      await audit(session.userId, "ingress_adapter_updated", adapterKey, { adapterKey });
      return adminActionSuccess(action.context, {
        section: "ingress-adapters",
        message: "Ingress adapter updated",
        redirectTo: resolveAdminAppPath(
          request,
          `/ingress-adapters/${encodeURIComponent(adapterKey)}`
        ),
        json: result,
      });
    }

    if (intent === "set-binding") {
      const channelId = readText(payload.channelId);
      const adapterKey = readText(payload.adapterKey);
      const result = await callIngressApi<JsonRecord>(
        `/maintenance/channels/${encodeURIComponent(channelId)}/adapter-binding`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            adapterKey,
            config: readJsonField(payload.configJson, "configJson", {}),
            selectionMode: readText(payload.selectionMode, "manual"),
            enabled: readText(payload.enabled, "true") !== "false",
            selectedBy: session.userId,
            selectionReason: readText(payload.selectionReason, "admin binding update"),
          }),
        }
      );
      await audit(session.userId, "ingress_adapter_binding_set", adapterKey, {
        channelId,
        adapterKey,
      });
      return adminActionSuccess(action.context, {
        section: "ingress-adapters",
        message: "Channel adapter binding updated",
        json: result,
      });
    }

    if (intent === "delete-binding") {
      const channelId = readText(payload.channelId);
      const result = await callIngressApi<JsonRecord>(
        `/maintenance/channels/${encodeURIComponent(channelId)}/adapter-binding`,
        { method: "DELETE" }
      );
      await audit(session.userId, "ingress_adapter_binding_deleted", channelId, { channelId });
      return adminActionSuccess(action.context, {
        section: "ingress-adapters",
        message: "Channel adapter binding deleted",
        json: result,
      });
    }

    const result = await callIngressApi<JsonRecord>("/maintenance/ingress-adapters", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildAdapterPayload(payload)),
    });
    const adapterKey = readText(result.adapterKey ?? payload.adapterKey);
    await audit(session.userId, "ingress_adapter_created", adapterKey, { adapterKey });
    return adminActionSuccess(action.context, {
      section: "ingress-adapters",
      message: "Ingress adapter created",
      redirectTo: resolveAdminAppPath(
        request,
        `/ingress-adapters/${encodeURIComponent(adapterKey)}`
      ),
      status: 201,
      json: result,
    });
  } catch (error) {
    return adminActionError(action.context, {
      section: "ingress-adapters",
      message: error instanceof Error ? error.message : "Ingress adapter action failed.",
      status: 400,
    });
  }
};
