import type { APIRoute } from "astro";

import {
  deleteTemplateWithAudit,
  saveTemplateFromPayload,
  setTemplateActiveStateWithAudit,
  type TemplateKind,
} from "@newsportal/control-plane";

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

    if (intent === "save") {
      const result = await saveTemplateFromPayload(pool, session.userId, payload);
      const entityPath = resolveTemplateEditPath(request, result.kind, result.entityId);

      if (browserRequest) {
        return buildFlashRedirect(request, {
          section: "templates",
          status: "success",
          message:
            kind === "interest"
              ? result.created
                ? "System interest created"
                : "System interest updated"
              : result.created
                ? "LLM template created"
                : "LLM template updated",
          redirectTo: entityPath,
        });
      }

      return Response.json(
        kind === "interest"
          ? {
              interestTemplateId: result.entityId,
              created: result.created,
            }
          : {
              promptTemplateId: result.entityId,
              created: result.created,
            },
        { status: result.created ? 201 : 200 }
      );
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
      if (browserRequest) {
        return buildFlashRedirect(request, {
          section: "templates",
          status: "success",
          message:
            kind === "interest"
              ? intent === "activate"
                ? "System interest reactivated"
                : "System interest archived"
              : intent === "activate"
                ? "LLM template reactivated"
                : "LLM template archived",
          redirectTo,
        });
      }
      return Response.json({ ok: true });
    }

    await deleteTemplateWithAudit(pool, session.userId, kind, templateId);
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "templates",
        status: "success",
        message: kind === "interest" ? "System interest deleted" : "LLM template deleted",
        redirectTo: listPath,
      });
    }
    return Response.json({ ok: true });
  } catch (error) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "templates",
        status: "error",
        message: formatTemplateBrowserErrorMessage(error, kind),
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
