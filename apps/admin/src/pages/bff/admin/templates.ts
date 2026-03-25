import type { APIRoute } from "astro";

import {
  deleteInterestTemplate,
  deleteLlmTemplate,
  parseInterestTemplateInput,
  parseLlmTemplateInput,
  saveInterestTemplate,
  saveLlmTemplate,
  setInterestTemplateActiveState,
  setLlmTemplateActiveState,
} from "../../../lib/server/admin-templates";
import {
  buildAdminSignInPath,
  buildFlashRedirect,
  requestPrefersHtmlNavigation,
  resolveAdminAppPath,
  resolveAdminRedirectPath,
} from "../../../lib/server/browser-flow";
import {
  buildExpiredAdminSessionCookie,
  resolveAdminSession,
} from "../../../lib/server/auth";
import { getPool } from "../../../lib/server/db";
import { readRequestPayload } from "../../../lib/server/request";

export const prerender = false;

type TemplateKind = "interest" | "llm";
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

async function writeAuditLog(
  actorUserId: string,
  actionType: string,
  entityType: string,
  entityId: string,
  payloadJson: Record<string, unknown>
): Promise<void> {
  await getPool().query(
    `
      insert into audit_log (
        actor_user_id,
        action_type,
        entity_type,
        entity_id,
        payload_json
      )
      values ($1, $2, $3, $4, $5::jsonb)
    `,
    [actorUserId, actionType, entityType, entityId, JSON.stringify(payloadJson)]
  );
}

export const POST: APIRoute = async ({ request }) => {
  const browserRequest = requestPrefersHtmlNavigation(request);
  const payload = await readRequestPayload(request);
  const kind = resolveTemplateKind(payload);
  const listPath = resolveTemplateListPath(request, kind);
  const redirectTo = resolveAdminRedirectPath(
    request,
    String(payload.redirectTo ?? request.headers.get("referer") ?? ""),
    listPath
  );
  const session = await resolveAdminSession(request);

  if (!session || !session.roles.includes("admin")) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "auth",
        status: "error",
        message: "Please sign in as an admin to continue.",
        setCookie: buildExpiredAdminSessionCookie(),
        redirectTo: buildAdminSignInPath(request, redirectTo),
      });
    }
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const pool = getPool();
    const intent = resolveTemplateIntent(payload);

    if (kind === "interest") {
      if (intent === "save") {
        const template = parseInterestTemplateInput(payload);
        const result = await saveInterestTemplate(pool, template);
        const entityPath = resolveTemplateEditPath(
          request,
          "interest",
          result.interestTemplateId
        );
        await writeAuditLog(
          session.userId,
          result.created ? "interest_template_created" : "interest_template_updated",
          "interest_template",
          result.interestTemplateId,
          {
            name: template.name,
            isActive: template.isActive,
            created: result.created,
          }
        );

        if (browserRequest) {
          return buildFlashRedirect(request, {
            section: "templates",
            status: "success",
            message: result.created ? "Interest template created" : "Interest template updated",
            redirectTo: entityPath,
          });
        }

        return Response.json(
          {
            interestTemplateId: result.interestTemplateId,
            created: result.created,
          },
          { status: result.created ? 201 : 200 }
        );
      }

      const interestTemplateId = String(payload.interestTemplateId ?? "").trim();
      if (!interestTemplateId) {
        throw new Error("Interest template ID is required for this action.");
      }

      if (intent === "archive") {
        await setInterestTemplateActiveState(pool, interestTemplateId, false);
        await writeAuditLog(
          session.userId,
          "interest_template_archived",
          "interest_template",
          interestTemplateId,
          {}
        );
        if (browserRequest) {
          return buildFlashRedirect(request, {
            section: "templates",
            status: "success",
            message: "Interest template archived",
            redirectTo,
          });
        }
        return Response.json({ ok: true });
      }

      if (intent === "activate") {
        await setInterestTemplateActiveState(pool, interestTemplateId, true);
        await writeAuditLog(
          session.userId,
          "interest_template_activated",
          "interest_template",
          interestTemplateId,
          {}
        );
        if (browserRequest) {
          return buildFlashRedirect(request, {
            section: "templates",
            status: "success",
            message: "Interest template reactivated",
            redirectTo,
          });
        }
        return Response.json({ ok: true });
      }

      await deleteInterestTemplate(pool, interestTemplateId);
      await writeAuditLog(
        session.userId,
        "interest_template_deleted",
        "interest_template",
        interestTemplateId,
        {}
      );
      if (browserRequest) {
        return buildFlashRedirect(request, {
          section: "templates",
          status: "success",
          message: "Interest template deleted",
          redirectTo: listPath,
        });
      }
      return Response.json({ ok: true });
    }

    if (intent === "save") {
      const template = parseLlmTemplateInput(payload);
      const result = await saveLlmTemplate(pool, template);
      const entityPath = resolveTemplateEditPath(request, "llm", result.promptTemplateId);
      await writeAuditLog(
        session.userId,
        result.created ? "llm_template_created" : "llm_template_updated",
        "llm_template",
        result.promptTemplateId,
        {
          name: template.name,
          scope: template.scope,
          isActive: template.isActive,
          created: result.created,
        }
      );

      if (browserRequest) {
        return buildFlashRedirect(request, {
          section: "templates",
          status: "success",
          message: result.created ? "LLM template created" : "LLM template updated",
          redirectTo: entityPath,
        });
      }

      return Response.json(
        {
          promptTemplateId: result.promptTemplateId,
          created: result.created,
        },
        { status: result.created ? 201 : 200 }
      );
    }

    const promptTemplateId = String(payload.promptTemplateId ?? "").trim();
    if (!promptTemplateId) {
      throw new Error("LLM template ID is required for this action.");
    }

    if (intent === "archive") {
      await setLlmTemplateActiveState(pool, promptTemplateId, false);
      await writeAuditLog(
        session.userId,
        "llm_template_archived",
        "llm_template",
        promptTemplateId,
        {}
      );
      if (browserRequest) {
        return buildFlashRedirect(request, {
          section: "templates",
          status: "success",
          message: "LLM template archived",
          redirectTo,
        });
      }
      return Response.json({ ok: true });
    }

    if (intent === "activate") {
      await setLlmTemplateActiveState(pool, promptTemplateId, true);
      await writeAuditLog(
        session.userId,
        "llm_template_activated",
        "llm_template",
        promptTemplateId,
        {}
      );
      if (browserRequest) {
        return buildFlashRedirect(request, {
          section: "templates",
          status: "success",
          message: "LLM template reactivated",
          redirectTo,
        });
      }
      return Response.json({ ok: true });
    }

    await deleteLlmTemplate(pool, promptTemplateId);
    await writeAuditLog(
      session.userId,
      "llm_template_deleted",
      "llm_template",
      promptTemplateId,
      {}
    );
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "templates",
        status: "success",
        message: "LLM template deleted",
        redirectTo: listPath,
      });
    }
    return Response.json({ ok: true });
  } catch (error) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "templates",
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to save the template right now.",
        redirectTo,
      });
    }
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to save template.",
      },
      {
        status: 500,
      }
    );
  }
};
