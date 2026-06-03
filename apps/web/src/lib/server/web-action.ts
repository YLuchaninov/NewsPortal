import type { AuthSession } from "@newsportal/contracts";
import {
  assertJsonSchema,
  type JsonSchema,
} from "@newsportal/contracts";
import { createHmac, timingSafeEqual } from "node:crypto";

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
  actionToken?: WebActionTokenRequirement;
  resolveSession?: (request: Request) => Promise<WebActionSession | null>;
  payloadReader?: (request: Request) => Promise<object>;
}

export type PrepareWebActionResult =
  | { ok: true; context: WebActionContext }
  | { ok: false; response: Response };

export interface WebActionTokenRequirement {
  scope: string;
}

export interface WebActionTokenTarget {
  scope: string;
  targetPath: string;
  routePrefix?: boolean;
  routePrefixOnly?: boolean;
}

export interface BuildWebActionTokenSetOptions {
  request: Request;
  session: Pick<WebActionSession, "userId">;
  actions?: readonly WebActionTokenTarget[];
  nowMs?: number;
  ttlMs?: number;
}

export interface BuildWebActionTokenOptions {
  request: Request;
  session: Pick<WebActionSession, "userId">;
  targetPath: string;
  scope: string;
  nowMs?: number;
  ttlMs?: number;
}

interface WebActionTokenPayload {
  v: 1;
  kind: "web";
  uid: string;
  path: string;
  scope: string;
  exp: number;
}

const SAFE_FETCH_SITES = new Set(["same-origin", "same-site", "none"]);
const INVALID_WEB_ACTION_TOKEN_MESSAGE = "Invalid or expired web action token.";
const DEFAULT_WEB_ACTION_TOKEN_TTL_MS = 15 * 60 * 1000;

export const WEB_ACTION_TOKEN_TARGETS: readonly WebActionTokenTarget[] = [
  { scope: "content-state", targetPath: "/bff/content-state" },
  { scope: "digest-settings", targetPath: "/bff/digest-settings" },
  { scope: "feedback", targetPath: "/bff/feedback" },
  { scope: "interests", targetPath: "/bff/interests" },
  { scope: "interests.update", targetPath: "/bff/interests", routePrefix: true, routePrefixOnly: true },
  { scope: "notification-channels", targetPath: "/bff/notification-channels" },
  { scope: "preferences", targetPath: "/bff/preferences" },
  { scope: "reactions", targetPath: "/bff/reactions" },
  { scope: "saved-digest", targetPath: "/bff/saved-digest" },
  { scope: "story-follow", targetPath: "/bff/story-follow" },
];

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

function readWebActionSecret(): string {
  const secret = String(process.env.APP_SECRET ?? "").trim();
  if (!secret) {
    throw new Error("APP_SECRET is required for web action tokens.");
  }
  return secret;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function signWebActionPayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", `web-action:${secret}`).update(encodedPayload).digest("base64url");
}

function signatureMatches(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeWebActionPath(value: string): string {
  const trimmed = String(value ?? "").trim() || "/";
  let pathname: string;
  try {
    pathname = new URL(trimmed, "http://newsportal.local").pathname;
  } catch {
    pathname = trimmed.split("?")[0]?.split("#")[0] ?? "/";
  }
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const bffIndex = normalized.indexOf("/bff/");
  return bffIndex >= 0 ? normalized.slice(bffIndex) : normalized;
}

function normalizeWebActionScopeKey(scope: string): string {
  return scope.replace(/[^a-zA-Z0-9]/g, "_");
}

function readScopedPayloadToken(value: unknown, scope: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  return String((value as Record<string, unknown>)[scope] ?? "").trim();
}

function isWebActionTokenPayloadKey(key: string): boolean {
  return (
    key === "webActionToken" ||
    key === "_webActionToken" ||
    key === "webActionTokens" ||
    key.startsWith("webActionToken:") ||
    key.startsWith("webActionToken_")
  );
}

function stripWebActionTokenPayloadFields(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !isWebActionTokenPayloadKey(key)),
  );
}

export function readWebActionTokenForScope(
  payload: Record<string, unknown>,
  request: Request,
  scope: string,
): string {
  const scopedPayloadToken =
    readScopedPayloadToken(payload.webActionTokens, scope) ||
    String(payload[`webActionToken:${scope}`] ?? "").trim() ||
    String(payload[`webActionToken_${normalizeWebActionScopeKey(scope)}`] ?? "").trim();
  if (scopedPayloadToken) {
    return scopedPayloadToken;
  }
  const payloadToken = payload.webActionToken ?? payload._webActionToken;
  const headerToken =
    request.headers.get(`x-web-action-token-${normalizeWebActionScopeKey(scope)}`) ??
    request.headers.get("x-web-action-token");
  return String(payloadToken ?? headerToken ?? "").trim();
}

function parseWebActionToken(token: string): WebActionTokenPayload | null {
  const [encodedPayload, signature, ...extra] = token.split(".");
  if (!encodedPayload || !signature || extra.length > 0) {
    return null;
  }
  const expectedSignature = signWebActionPayload(encodedPayload, readWebActionSecret());
  if (!signatureMatches(signature, expectedSignature)) {
    return null;
  }

  const decoded = decodeBase64Url(encodedPayload);
  if (!decoded) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const payload = parsed as Partial<WebActionTokenPayload>;
  if (
    payload.v !== 1 ||
    payload.kind !== "web" ||
    typeof payload.uid !== "string" ||
    typeof payload.path !== "string" ||
    typeof payload.scope !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  return payload as WebActionTokenPayload;
}

export function buildWebActionToken(options: BuildWebActionTokenOptions): string {
  const nowMs = options.nowMs ?? Date.now();
  const payload: WebActionTokenPayload = {
    v: 1,
    kind: "web",
    uid: options.session.userId,
    path: normalizeWebActionPath(options.targetPath),
    scope: options.scope,
    exp: nowMs + (options.ttlMs ?? DEFAULT_WEB_ACTION_TOKEN_TTL_MS),
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  return `${encodedPayload}.${signWebActionPayload(encodedPayload, readWebActionSecret())}`;
}

export function buildWebActionTokenSet(options: BuildWebActionTokenSetOptions): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const action of options.actions ?? WEB_ACTION_TOKEN_TARGETS) {
    tokens[action.scope] = buildWebActionToken({
      request: options.request,
      session: options.session,
      targetPath: action.targetPath,
      scope: action.scope,
      nowMs: options.nowMs,
      ttlMs: options.ttlMs,
    });
  }
  return tokens;
}

export function validateWebActionToken(
  token: string,
  request: Request,
  session: WebActionSession,
  requirement: WebActionTokenRequirement,
  nowMs = Date.now(),
): boolean {
  const payload = parseWebActionToken(token);
  if (!payload) {
    return false;
  }
  const requestPath = normalizeWebActionPath(request.url);
  const target = WEB_ACTION_TOKEN_TARGETS.find((action) => action.scope === requirement.scope);
  const pathMatches =
    (!target?.routePrefixOnly && payload.path === requestPath) ||
    Boolean(
      target?.routePrefix &&
        payload.path === normalizeWebActionPath(target.targetPath) &&
        requestPath.startsWith(`${payload.path}/`),
    );
  return (
    payload.uid === session.userId &&
    payload.scope === requirement.scope &&
    pathMatches &&
    payload.exp > nowMs
  );
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

function buildActionTokenDeniedResponse(request: Request, browserRequest: boolean): Response {
  if (browserRequest) {
    return buildFlashRedirect(request, {
      section: "auth",
      status: "error",
      message: INVALID_WEB_ACTION_TOKEN_MESSAGE,
    });
  }
  return Response.json({ error: INVALID_WEB_ACTION_TOKEN_MESSAGE }, { status: 403 });
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

  const rawPayload =
    options.readPayload === false
      ? {}
      : ((await (options.payloadReader ?? readRequestPayload)(request)) as Record<string, unknown>);
  if (
    options.actionToken &&
    session &&
    !validateWebActionToken(
      readWebActionTokenForScope(rawPayload, request, options.actionToken.scope),
      request,
      session,
      options.actionToken,
    )
  ) {
    return {
      ok: false,
      response: buildActionTokenDeniedResponse(request, browserRequest),
    };
  }
  const payload = stripWebActionTokenPayloadFields(rawPayload);
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
