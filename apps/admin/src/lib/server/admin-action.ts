import type { AuthSession } from "@newsportal/contracts";
import { createHmac, timingSafeEqual } from "node:crypto";

import {
  buildAdminSignInPath,
  buildFlashRedirect,
  requestPrefersHtmlNavigation,
  resolveAdminRedirectPath,
} from "./browser-flow";
import {
  buildExpiredAdminSessionCookie,
  resolveAdminSession,
} from "./auth";
import { readRequestPayload } from "./request";

export interface AdminActionSession extends AuthSession {
  userId: string;
}

export interface AdminActionContext {
  request: Request;
  browserRequest: boolean;
  redirectTo: string;
  payload: Record<string, unknown>;
  session: AdminActionSession;
}

export interface PrepareAdminActionOptions {
  fallbackRedirectPath: string;
  authFlashSection?: string;
  authMessage?: string;
  authJson?:
    | Record<string, unknown>
    | ((request: Request, redirectTo: string) => Record<string, unknown>);
  actionToken?: AdminActionTokenRequirement;
  resolveSession?: (request: Request) => Promise<AdminActionSession | null>;
  payloadReader?: (request: Request) => Promise<object>;
}

export type PrepareAdminActionResult =
  | { ok: true; context: AdminActionContext }
  | { ok: false; response: Response };

export interface AdminActionMessageOptions {
  section: string;
  message: string;
  status?: number;
  json?: unknown;
  redirectTo?: string;
}

export interface AdminAuditLogInput {
  actorUserId: string;
  actionType: string;
  entityType: string;
  entityId: string | null;
  payloadJson?: Record<string, unknown>;
}

export interface AdminActionTokenRequirement {
  scope: string;
}

export interface AdminActionTokenTarget {
  scope: string;
  targetPath: string;
}

export interface BuildAdminActionTokenSetOptions {
  request: Request;
  session: Pick<AdminActionSession, "userId">;
  actions?: readonly AdminActionTokenTarget[];
  nowMs?: number;
  ttlMs?: number;
}

export interface BuildAdminActionTokenOptions {
  request: Request;
  session: Pick<AdminActionSession, "userId">;
  targetPath: string;
  scope: string;
  nowMs?: number;
  ttlMs?: number;
}

interface AdminActionTokenPayload {
  v: 1;
  uid: string;
  path: string;
  scope: string;
  exp: number;
}

interface AdminAuditQueryable {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

const SAFE_FETCH_SITES = new Set(["same-origin", "same-site", "none"]);
const CROSS_SITE_ADMIN_ACTION_MESSAGE = "Rejected cross-site admin action.";
const INVALID_ADMIN_ACTION_TOKEN_MESSAGE = "Invalid or expired admin action token.";
const DEFAULT_ACTION_TOKEN_TTL_MS = 15 * 60 * 1000;
const ADMIN_ACTION_TOKEN_PREFIX_SCOPES = new Map<string, string>([
  ["user-interests", "/bff/admin/user-interests"],
]);

export const ADMIN_ACTION_TOKEN_TARGETS = [
  { scope: "articles.enrichment-retry", targetPath: "/bff/admin/articles/enrichment-retry" },
  { scope: "automation", targetPath: "/bff/admin/automation" },
  { scope: "channels", targetPath: "/bff/admin/channels" },
  { scope: "channels.bulk", targetPath: "/bff/admin/channels/bulk" },
  { scope: "channels.bulk.preflight", targetPath: "/bff/admin/channels/bulk/preflight" },
  { scope: "channels.schedule", targetPath: "/bff/admin/channels/schedule" },
  { scope: "content-analysis", targetPath: "/bff/admin/content-analysis" },
  { scope: "content-analysis-policies", targetPath: "/bff/admin/content-analysis-policies" },
  { scope: "content-filter-policies", targetPath: "/bff/admin/content-filter-policies" },
  { scope: "discovery", targetPath: "/bff/admin/discovery" },
  { scope: "mcp-tokens", targetPath: "/bff/admin/mcp-tokens" },
  { scope: "moderation", targetPath: "/bff/admin/moderation" },
  { scope: "reindex", targetPath: "/bff/admin/reindex" },
  { scope: "templates", targetPath: "/bff/admin/templates" },
  { scope: "user-interests", targetPath: "/bff/admin/user-interests" },
] as const satisfies readonly AdminActionTokenTarget[];

function isAdminSession(session: AdminActionSession | null): session is AdminActionSession {
  return Boolean(session?.roles?.includes("admin"));
}

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

function readAdminActionSecret(): string {
  const secret = String(process.env.APP_SECRET ?? "").trim();
  if (!secret) {
    throw new Error("APP_SECRET is required for admin action tokens.");
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

function signAdminActionPayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function signatureMatches(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeAdminActionPath(value: string): string {
  const trimmed = String(value ?? "").trim() || "/";
  let pathname: string;
  try {
    pathname = new URL(trimmed, "http://newsportal.local").pathname;
  } catch {
    pathname = trimmed.split("?")[0]?.split("#")[0] ?? "/";
  }
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (normalized === "/admin") {
    return "/";
  }
  if (normalized.startsWith("/admin/bff/")) {
    return normalized.slice("/admin".length);
  }
  if (normalized.startsWith("/admin/")) {
    return normalized.slice("/admin".length) || "/";
  }
  return normalized;
}

function readScopedPayloadToken(value: unknown, scope: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  return String((value as Record<string, unknown>)[scope] ?? "").trim();
}

function normalizeAdminActionScopeKey(scope: string): string {
  return scope.replace(/[^a-zA-Z0-9]/g, "_");
}

function isAdminActionTokenPayloadKey(key: string): boolean {
  return (
    key === "adminActionToken" ||
    key === "_adminActionToken" ||
    key === "adminActionTokens" ||
    key.startsWith("adminActionToken:") ||
    key.startsWith("adminActionToken_")
  );
}

function stripAdminActionTokenPayloadFields(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !isAdminActionTokenPayloadKey(key)),
  );
}

export function readAdminActionTokenForScope(
  payload: Record<string, unknown>,
  request: Request,
  scope: string,
): string {
  const scopedPayloadToken =
    readScopedPayloadToken(payload.adminActionTokens, scope) ||
    String(payload[`adminActionToken:${scope}`] ?? "").trim() ||
    String(payload[`adminActionToken_${normalizeAdminActionScopeKey(scope)}`] ?? "").trim();
  if (scopedPayloadToken) {
    return scopedPayloadToken;
  }
  const payloadToken = payload.adminActionToken ?? payload._adminActionToken;
  const headerToken =
    request.headers.get(`x-admin-action-token-${normalizeAdminActionScopeKey(scope)}`) ??
    request.headers.get("x-admin-action-token");
  return String(payloadToken ?? headerToken ?? "").trim();
}

function parseAdminActionToken(token: string): AdminActionTokenPayload | null {
  const [encodedPayload, signature, ...extra] = token.split(".");
  if (!encodedPayload || !signature || extra.length > 0) {
    return null;
  }
  const expectedSignature = signAdminActionPayload(encodedPayload, readAdminActionSecret());
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
  const payload = parsed as Partial<AdminActionTokenPayload>;
  if (
    payload.v !== 1 ||
    typeof payload.uid !== "string" ||
    typeof payload.path !== "string" ||
    typeof payload.scope !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  return payload as AdminActionTokenPayload;
}

export function buildAdminActionToken(options: BuildAdminActionTokenOptions): string {
  const nowMs = options.nowMs ?? Date.now();
  const payload: AdminActionTokenPayload = {
    v: 1,
    uid: options.session.userId,
    path: normalizeAdminActionPath(options.targetPath),
    scope: options.scope,
    exp: nowMs + (options.ttlMs ?? DEFAULT_ACTION_TOKEN_TTL_MS),
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  return `${encodedPayload}.${signAdminActionPayload(encodedPayload, readAdminActionSecret())}`;
}

export function buildAdminActionTokenSet(
  options: BuildAdminActionTokenSetOptions,
): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const action of options.actions ?? ADMIN_ACTION_TOKEN_TARGETS) {
    tokens[action.scope] = buildAdminActionToken({
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

export function validateAdminActionToken(
  token: string,
  request: Request,
  session: AdminActionSession,
  requirement: AdminActionTokenRequirement,
  nowMs = Date.now(),
): boolean {
  const payload = parseAdminActionToken(token);
  if (!payload) {
    return false;
  }
  const requestPath = normalizeAdminActionPath(request.url);
  const tokenPrefix = ADMIN_ACTION_TOKEN_PREFIX_SCOPES.get(requirement.scope);
  const pathMatches =
    payload.path === requestPath ||
    Boolean(
      tokenPrefix &&
        payload.path === tokenPrefix &&
        requestPath.startsWith(`${tokenPrefix}/`),
    );
  return (
    payload.uid === session.userId &&
    payload.scope === requirement.scope &&
    pathMatches &&
    payload.exp > nowMs
  );
}

export function validateAdminActionCsrfMetadata(request: Request): boolean {
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

function buildCsrfDeniedResponse(
  request: Request,
  browserRequest: boolean,
  fallbackRedirectPath: string,
): Response {
  if (browserRequest) {
    return buildFlashRedirect(request, {
      section: "auth",
      status: "error",
      message: CROSS_SITE_ADMIN_ACTION_MESSAGE,
      redirectTo: fallbackRedirectPath,
    });
  }
  return Response.json({ error: CROSS_SITE_ADMIN_ACTION_MESSAGE }, { status: 403 });
}

function buildActionTokenDeniedResponse(
  request: Request,
  browserRequest: boolean,
  fallbackRedirectPath: string,
): Response {
  if (browserRequest) {
    return buildFlashRedirect(request, {
      section: "auth",
      status: "error",
      message: INVALID_ADMIN_ACTION_TOKEN_MESSAGE,
      redirectTo: fallbackRedirectPath,
    });
  }
  return Response.json({ error: INVALID_ADMIN_ACTION_TOKEN_MESSAGE }, { status: 403 });
}

export async function prepareAdminAction(
  request: Request,
  options: PrepareAdminActionOptions,
): Promise<PrepareAdminActionResult> {
  const browserRequest = requestPrefersHtmlNavigation(request);
  if (!validateAdminActionCsrfMetadata(request)) {
    return {
      ok: false,
      response: buildCsrfDeniedResponse(
        request,
        browserRequest,
        options.fallbackRedirectPath,
      ),
    };
  }

  const initialRedirectTo = resolveAdminRedirectPath(
    request,
    request.headers.get("referer"),
    options.fallbackRedirectPath,
  );
  const sessionResolver = options.resolveSession ?? resolveAdminSession;
  const session = await sessionResolver(request);
  if (!isAdminSession(session)) {
    if (browserRequest) {
      return {
        ok: false,
        response: buildFlashRedirect(request, {
          section: options.authFlashSection ?? "auth",
          status: "error",
          message: options.authMessage ?? "Please sign in as an admin to continue.",
          setCookie: buildExpiredAdminSessionCookie({ request }),
          redirectTo: buildAdminSignInPath(request, initialRedirectTo),
        }),
      };
    }
    const authJson =
      typeof options.authJson === "function"
        ? options.authJson(request, initialRedirectTo)
        : options.authJson;
    return {
      ok: false,
      response: Response.json(authJson ?? { error: "Forbidden." }, { status: 403 }),
    };
  }

  const payloadReader = options.payloadReader ?? readRequestPayload;
  const payload = (await payloadReader(request)) as Record<string, unknown>;
  if (
    options.actionToken &&
    !validateAdminActionToken(
      readAdminActionTokenForScope(payload, request, options.actionToken.scope),
      request,
      session,
      options.actionToken,
    )
  ) {
    return {
      ok: false,
      response: buildActionTokenDeniedResponse(
        request,
        browserRequest,
        options.fallbackRedirectPath,
      ),
    };
  }
  const redirectTo = resolveAdminRedirectPath(
    request,
    String(payload.redirectTo ?? request.headers.get("referer") ?? ""),
    options.fallbackRedirectPath,
  );
  const sanitizedPayload = stripAdminActionTokenPayloadFields(payload);

  return {
    ok: true,
    context: {
      request,
      browserRequest,
      redirectTo,
      payload: sanitizedPayload,
      session,
    },
  };
}

export function adminActionError(
  context: AdminActionContext,
  options: AdminActionMessageOptions,
): Response {
  if (context.browserRequest) {
    return buildFlashRedirect(context.request, {
      section: options.section,
      status: "error",
      message: options.message,
      redirectTo: options.redirectTo ?? context.redirectTo,
    });
  }
  return Response.json(options.json ?? { error: options.message }, {
    status: options.status ?? 400,
  });
}

export function adminActionSuccess(
  context: AdminActionContext,
  options: AdminActionMessageOptions,
): Response {
  if (context.browserRequest) {
    return buildFlashRedirect(context.request, {
      section: options.section,
      status: "success",
      message: options.message,
      redirectTo: options.redirectTo ?? context.redirectTo,
    });
  }
  return Response.json(options.json ?? { ok: true }, {
    status: options.status ?? 200,
  });
}

export function requireAdminIntent<TIntent extends string>(
  payload: Record<string, unknown>,
  allowedIntents: readonly TIntent[],
  defaultIntent: TIntent,
): TIntent {
  const requestedIntent = String(payload.intent ?? defaultIntent).trim();
  if (allowedIntents.includes(requestedIntent as TIntent)) {
    return requestedIntent as TIntent;
  }
  throw new Error("Invalid admin action intent.");
}

export function readRequiredAdminText(
  payload: Record<string, unknown>,
  key: string,
  message = "Invalid admin action payload.",
): string {
  const value = String(payload[key] ?? "").trim();
  if (!value) {
    throw new Error(message);
  }
  return value;
}

export async function insertAdminAuditLog(
  client: AdminAuditQueryable,
  input: AdminAuditLogInput,
): Promise<void> {
  await client.query(
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
    [
      input.actorUserId,
      input.actionType,
      input.entityType,
      input.entityId,
      JSON.stringify(input.payloadJson ?? {}),
    ],
  );
}
