import type { AuthSession } from "@newsportal/contracts";
import {
  assertJsonSchema,
  type JsonSchema,
} from "@newsportal/contracts";

import {
  buildFlashRedirect,
  requestPrefersHtmlNavigation,
} from "./browser-flow";
import {
  buildExpiredSessionCookie,
  resolveWebSession,
} from "./auth";
import { readRequestPayload } from "./request";

export interface WebActionSession extends AuthSession {
  userId: string;
}

export interface WebActionContext {
  request: Request;
  browserRequest: boolean;
  payload: Record<string, unknown>;
  session: WebActionSession | null;
}

export interface PrepareWebActionOptions {
  authFlashSection?: string;
  authMessage?: string;
  authJson?: Record<string, unknown> | ((request: Request) => Record<string, unknown>);
  authStatus?: number;
  authSetCookie?: boolean;
  requireSession?: boolean;
  readPayload?: boolean;
  payloadSchema?: JsonSchema;
  payloadBoundaryName?: string;
  resolveSession?: (request: Request) => Promise<WebActionSession | null>;
  payloadReader?: (request: Request) => Promise<object>;
}

export type PrepareWebActionResult =
  | { ok: true; context: WebActionContext }
  | { ok: false; response: Response };

const SAFE_FETCH_SITES = new Set(["same-origin", "same-site", "none"]);

function normalizeOrigin(value: string | null): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  try {
    return new URL(normalized).origin;
  } catch {
    return null;
  }
}

function addForwardedRequestOrigin(request: Request, allowedOrigins: Set<string>): void {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (!forwardedHost) {
    return;
  }
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  try {
    allowedOrigins.add(new URL(`${forwardedProto}://${forwardedHost}`).origin);
  } catch {
    // Ignore malformed proxy metadata and rely on the request URL origin.
  }
}

function resolveAllowedRequestOrigins(request: Request): Set<string> {
  const allowedOrigins = new Set<string>();
  try {
    allowedOrigins.add(new URL(request.url).origin);
  } catch {
    // A Request should always carry a valid URL, but keep the guard defensive.
  }
  addForwardedRequestOrigin(request, allowedOrigins);
  return allowedOrigins;
}

function headerOriginIsAllowed(
  value: string | null,
  allowedOrigins: Set<string>,
  options: { allowRelative: boolean },
): boolean {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return true;
  }
  if (options.allowRelative && normalized.startsWith("/")) {
    return true;
  }
  const origin = normalizeOrigin(normalized);
  return Boolean(origin && allowedOrigins.has(origin));
}

export function validateWebActionCsrfMetadata(request: Request): boolean {
  const secFetchSite = String(request.headers.get("sec-fetch-site") ?? "").trim().toLowerCase();
  if (secFetchSite && !SAFE_FETCH_SITES.has(secFetchSite)) {
    return false;
  }

  const allowedOrigins = resolveAllowedRequestOrigins(request);
  if (!headerOriginIsAllowed(request.headers.get("origin"), allowedOrigins, { allowRelative: false })) {
    return false;
  }
  return headerOriginIsAllowed(request.headers.get("referer"), allowedOrigins, { allowRelative: true });
}

function buildForbiddenResponse(request: Request, browserRequest: boolean): Response {
  if (browserRequest) {
    return buildFlashRedirect(request, {
      section: "auth",
      status: "error",
      message: "Forbidden.",
    });
  }
  return Response.json({ error: "Forbidden." }, { status: 403 });
}

function buildUnauthorizedResponse(
  request: Request,
  browserRequest: boolean,
  options: PrepareWebActionOptions,
): Response {
  if (browserRequest) {
    return buildFlashRedirect(request, {
      section: options.authFlashSection ?? "auth",
      status: "error",
      message: options.authMessage ?? "Please start a session to continue.",
      setCookie: buildExpiredSessionCookie({ request }),
    });
  }

  const authJson =
    typeof options.authJson === "function"
      ? options.authJson(request)
      : options.authJson;
  const headers = new Headers();
  if (options.authSetCookie ?? false) {
    headers.set("Set-Cookie", buildExpiredSessionCookie({ request }));
  }
  return Response.json(authJson ?? { error: "Unauthorized." }, {
    status: options.authStatus ?? 401,
    headers,
  });
}

export async function prepareWebAction(
  request: Request,
  options: PrepareWebActionOptions = {},
): Promise<PrepareWebActionResult> {
  const browserRequest = requestPrefersHtmlNavigation(request);
  if (!validateWebActionCsrfMetadata(request)) {
    return {
      ok: false,
      response: buildForbiddenResponse(request, browserRequest),
    };
  }

  const requiresSession = options.requireSession ?? true;
  const sessionResolver = options.resolveSession ?? resolveWebSession;
  const session = requiresSession ? await sessionResolver(request) : null;
  if (requiresSession && !session) {
    return {
      ok: false,
      response: buildUnauthorizedResponse(request, browserRequest, options),
    };
  }

  const payload =
    options.readPayload === false
      ? {}
      : ((await (options.payloadReader ?? readRequestPayload)(request)) as Record<string, unknown>);
  if (options.payloadSchema) {
    try {
      assertJsonSchema(payload, options.payloadSchema, {
        boundaryName: options.payloadBoundaryName ?? "web BFF action payload",
      });
    } catch (error) {
      return {
        ok: false,
        response: Response.json(
          {
            error: error instanceof Error ? error.message : "Invalid action payload.",
          },
          { status: 400 },
        ),
      };
    }
  }

  return {
    ok: true,
    context: {
      request,
      browserRequest,
      payload,
      session,
    },
  };
}
