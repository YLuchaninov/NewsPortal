import type { APIRoute } from "astro";

import {
  deleteTemplateWithAudit,
  saveTemplateFromPayload,
  setTemplateActiveStateWithAudit,
  type TemplateKind,
} from "@signalops/control-plane";
import { MCP_TEMPLATE_PAYLOAD_SCHEMAS, type JsonSchema } from "@signalops/contracts";

import {
  adminActionError,
  adminActionSuccess,
  prepareAdminAction,
} from "../../../lib/server/admin-action";
import {
  assertAdminPayloadHasNoNestedEnvelope,
  assertAdminPayloadMatchesSchema,
  stripAdminMetaFields,
} from "../../../lib/server/admin-payload-validation";
import {
  resolveAdminAppPath,
  resolveAdminRedirectPath,
} from "../../../lib/server/browser-flow";
import { getPool } from "../../../lib/server/db";

export const prerender = false;

type TemplateIntent = "save" | "archive" | "activate" | "delete";

function resolveTemplateKind(payload: Record<string, unknown>): TemplateKind {
  return String(payload.kind ?? "llm").trim() === "interest" ? "interest" : "llm";
}

function resolveTemplateIntent(payload: Record<string, unknown>): TemplateIntent {
  const intent = String(payload.intent ?? "save").trim();
  if (intent === "archive" || intent === "activate" || intent === "delete") {
    return intent;
  }
  return "save";
}

function resolveTemplateListPath(request: Request, kind: TemplateKind): string {
  return resolveAdminAppPath(
    request,
    kind === "interest" ? "/templates/interests" : "/templates/llm"
  );
}

function resolveTemplateEditPath(
  request: Request,
  kind: TemplateKind,
  templateId: string
): string {
  return resolveAdminAppPath(
    request,
    kind === "interest"
      ? `/templates/interests/${templateId}/edit`
      : `/templates/llm/${templateId}/edit`
  );
}

function normalizeTemplateValidationPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const validationPayload = stripAdminMetaFields(payload, ["kind"]);
  const isActive = validationPayload.isActive;
  if (typeof isActive === "string") {
    const normalized = isActive.trim().toLowerCase();
    if (normalized === "true") {
      validationPayload.isActive = true;
    } else if (normalized === "false") {
      validationPayload.isActive = false;
    }
  }
  return validationPayload;
}

function resolveTemplateValidationSchema(
  kind: TemplateKind,
  payload: Record<string, unknown>
): JsonSchema {
  if (kind === "interest") {
    return String(payload.interestTemplateId ?? "").trim()
      ? MCP_TEMPLATE_PAYLOAD_SCHEMAS.systemInterestUpdate
      : MCP_TEMPLATE_PAYLOAD_SCHEMAS.systemInterestCreate;
  }
  return String(payload.promptTemplateId ?? "").trim()
    ? MCP_TEMPLATE_PAYLOAD_SCHEMAS.llmTemplateUpdate
    : MCP_TEMPLATE_PAYLOAD_SCHEMAS.llmTemplateCreate;
}

export function formatTemplateBrowserErrorMessage(
  error: unknown,
  kind: TemplateKind
): string {
  if (!(error instanceof Error)) {
    return "Unable to save the template right now.";
  }

  const message = error.message;
  if (
    /column .* does not exist/i.test(message) ||
    /is of type .* but expression is of type/i.test(message) ||
    /relation .*selection_profiles.* does not exist/i.test(message) ||
    /null value in column .*time_window_hours.*violates not-null constraint/i.test(message) ||
    /violates check constraint .*time_window_hours/i.test(message)
  ) {
    return kind === "interest"
      ? "System interest save failed because the interest form and database schema are out of sync. Apply the latest migrations or write-path fix, then retry."
      : "Template save failed because the template form and database schema are out of sync. Apply the latest migrations, then retry.";
  }

  return message;
}

export const POST: APIRoute = async ({ request }) => {
  const action = await prepareAdminAction(request, {
    fallbackRedirectPath: "/templates/llm",
    actionToken: { scope: "templates" },
  });
  if (!action.ok) {
    return action.response;
  }

  const { payload, session } = action.context;
  const kind = resolveTemplateKind(payload);
  const listPath = resolveTemplateListPath(request, kind);
  const redirectTo = resolveAdminRedirectPath(
    request,
    String(payload.redirectTo ?? request.headers.get("referer") ?? ""),
    listPath
  );

  try {
    const pool = getPool();
    const intent = resolveTemplateIntent(payload);
    assertAdminPayloadHasNoNestedEnvelope(payload, "Template action");

    if (intent === "save") {
      const validationPayload = normalizeTemplateValidationPayload(payload);
      assertAdminPayloadMatchesSchema(
        validationPayload,
        resolveTemplateValidationSchema(kind, validationPayload),
        kind === "interest" ? "System interest payload" : "LLM template payload",
      );
      const result = await saveTemplateFromPayload(pool, session.userId, payload);
      const entityPath = resolveTemplateEditPath(request, result.kind, result.entityId);

      return adminActionSuccess(action.context, {
        section: "templates",
        message:
          kind === "interest"
            ? result.created
              ? "System interest created"
              : "System interest updated"
            : result.created
              ? "LLM template created"
              : "LLM template updated",
        redirectTo: entityPath,
        status: result.created ? 201 : 200,
        json:
          kind === "interest"
            ? {
                interestTemplateId: result.entityId,
                created: result.created,
              }
            : {
                promptTemplateId: result.entityId,
                created: result.created,
              },
      });
    }

    const templateId = String(
      kind === "interest" ? payload.interestTemplateId ?? "" : payload.promptTemplateId ?? ""
    ).trim();
    if (!templateId) {
      throw new Error(
        kind === "interest"
          ? "Interest template ID is required for this action."
          : "LLM template ID is required for this action."
      );
    }

    if (intent === "archive" || intent === "activate") {
      await setTemplateActiveStateWithAudit(
        pool,
        session.userId,
        kind,
        templateId,
        intent === "activate"
      );
      return adminActionSuccess(action.context, {
        section: "templates",
        message:
          kind === "interest"
            ? intent === "activate"
              ? "System interest reactivated"
              : "System interest archived"
            : intent === "activate"
              ? "LLM template reactivated"
              : "LLM template archived",
        redirectTo,
        json: { ok: true },
      });
    }

    await deleteTemplateWithAudit(pool, session.userId, kind, templateId);
    return adminActionSuccess(action.context, {
      section: "templates",
      message: kind === "interest" ? "System interest deleted" : "LLM template deleted",
      redirectTo: listPath,
      json: { ok: true },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "";
    const isValidationError =
      errorMessage.includes("failed validation") ||
      errorMessage.includes("Nested \"payload\" envelopes");
    return adminActionError(action.context, {
      section: "templates",
      message: formatTemplateBrowserErrorMessage(error, kind),
      status: isValidationError ? 400 : 500,
      redirectTo,
      json: {
        error: error instanceof Error ? error.message : "Failed to save template.",
      },
    });
  }
};
