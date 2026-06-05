import type { AuthIdentity, AuthSession } from "@signalops/contracts";
import { shouldMarkCookieSecure } from "@signalops/config";
import { createHmac, timingSafeEqual } from "node:crypto";

import { queryOne, queryRows } from "./db";

const WEB_SESSION_COOKIE = "np_web_session";
const WEB_REFRESH_COOKIE = "np_web_refresh";

interface AuthCookieOptions {
  request?: Request | null;
}

interface FirebaseLookupUser {
  localId: string;
  email?: string;
  emailVerified?: boolean;
  providerUserInfo?: Array<{ providerId?: string }>;
}

interface VerifiedFirebaseIdentity {
  identity: AuthIdentity;
  emailVerified: boolean;
}

interface TestWebSessionPayload {
  v: 1;
  kind: "web-test-google";
  sub: string;
  email: string;
  exp: number;
}

function readFirebaseApiKey(): string {
  return process.env.FIREBASE_WEB_API_KEY ?? "";
}

function readGoogleAllowedDomain(env: Record<string, string | undefined> = process.env): string | null {
  const normalized = String(env.SIGNALOPS_WEB_GOOGLE_ALLOWED_DOMAIN ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
  return normalized || null;
}

function readTestAuthEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const normalized = String(env.SIGNALOPS_WEB_TEST_AUTH_ENABLED ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function readWebAuthSecret(): string {
  const secret = String(process.env.APP_SECRET ?? "").trim();
  if (!secret) {
    throw new Error("APP_SECRET is required for web test auth tokens.");
  }
  return secret;
}

function emailMatchesAllowedDomain(
  email: string | null | undefined,
  allowedDomain = readGoogleAllowedDomain()
): boolean {
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  if (!normalizedEmail || !allowedDomain) {
    return Boolean(normalizedEmail);
  }
  const atIndex = normalizedEmail.lastIndexOf("@");
  return atIndex > 0 && normalizedEmail.slice(atIndex + 1) === allowedDomain;
}

export function isAuthorizedGoogleIdentity(identity: AuthIdentity): boolean {
  return (
    identity.provider === "firebase_google" &&
    !identity.isAnonymous &&
    emailMatchesAllowedDomain(identity.email)
  );
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const index = chunk.indexOf("=");
        if (index < 0) {
          return [chunk, ""];
        }
        return [chunk.slice(0, index), decodeURIComponent(chunk.slice(index + 1))];
      })
  );
}

async function firebaseRequest(path: string, payload: Record<string, unknown>): Promise<any> {
  const apiKey = readFirebaseApiKey();
  if (!apiKey) {
    throw new Error("FIREBASE_WEB_API_KEY is not configured.");
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/${path}?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message ?? `Firebase request failed for ${path}.`);
  }

  return data;
}

async function firebaseTokenRequest(payload: URLSearchParams): Promise<any> {
  const apiKey = readFirebaseApiKey();
  if (!apiKey) {
    throw new Error("FIREBASE_WEB_API_KEY is not configured.");
  }

  const response = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: payload.toString()
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message ?? "Firebase token refresh failed.");
  }

  return data;
}

function normalizeIdentity(lookupUser: FirebaseLookupUser, fallbackAnonymous = false): VerifiedFirebaseIdentity {
  const providerIds = lookupUser.providerUserInfo?.map((item) => item.providerId ?? "") ?? [];
  const providerId = providerIds[0] ?? "";
  const isAnonymous = fallbackAnonymous || providerIds.length === 0;

  return {
    identity: {
      subject: lookupUser.localId,
      provider: isAnonymous
        ? "firebase_anonymous"
        : providerId.includes("google")
          ? "firebase_google"
          : providerId.includes("password")
            ? "firebase_email_link"
            : "firebase_other",
      email: lookupUser.email ?? null,
      isAnonymous
    },
    emailVerified: lookupUser.emailVerified === true
  };
}

function assertAuthorizedGoogleSession(verified: VerifiedFirebaseIdentity): AuthIdentity {
  if (!verified.emailVerified) {
    throw new Error("Google email must be verified.");
  }
  if (!isAuthorizedGoogleIdentity(verified.identity)) {
    throw new Error("Only authorized Google accounts can sign in.");
  }
  return verified.identity;
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

function signTestWebPayload(encodedPayload: string): string {
  return createHmac("sha256", `web-test-auth:${readWebAuthSecret()}`)
    .update(encodedPayload)
    .digest("base64url");
}

function signatureMatches(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function buildTestWebToken(email: string, nowMs = Date.now()): string {
  const normalizedEmail = String(email).trim().toLowerCase();
  const payload: TestWebSessionPayload = {
    v: 1,
    kind: "web-test-google",
    sub: `test-google:${normalizedEmail}`,
    email: normalizedEmail,
    exp: nowMs + 60 * 60 * 1000
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  return `test-google.${encodedPayload}.${signTestWebPayload(encodedPayload)}`;
}

function verifyTestWebToken(token: string, nowMs = Date.now()): AuthIdentity | null {
  if (!readTestAuthEnabled() || !token.startsWith("test-google.")) {
    return null;
  }
  const [, encodedPayload, signature, ...extra] = token.split(".");
  if (!encodedPayload || !signature || extra.length > 0) {
    return null;
  }
  const expected = signTestWebPayload(encodedPayload);
  if (!signatureMatches(signature, expected)) {
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
  const payload = parsed as Partial<TestWebSessionPayload>;
  if (
    payload.v !== 1 ||
    payload.kind !== "web-test-google" ||
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.exp !== "number" ||
    payload.exp < nowMs
  ) {
    return null;
  }
  const identity: AuthIdentity = {
    subject: payload.sub,
    provider: "firebase_google",
    email: payload.email,
    isAnonymous: false
  };
  return isAuthorizedGoogleIdentity(identity) ? identity : null;
}

export async function bootstrapWebTestGoogleSession(): Promise<{
  idToken: string;
  refreshToken: string;
  identity: AuthIdentity;
}> {
  if (!readTestAuthEnabled()) {
    throw new Error("Web test auth is disabled.");
  }
  const email = String(process.env.SIGNALOPS_WEB_TEST_AUTH_EMAIL ?? "web-user@signalops.local").trim();
  const identity: AuthIdentity = {
    subject: `test-google:${email.toLowerCase()}`,
    provider: "firebase_google",
    email,
    isAnonymous: false
  };
  if (!isAuthorizedGoogleIdentity(identity)) {
    throw new Error("Configured web test auth email is not allowed.");
  }
  const token = buildTestWebToken(email);

  return {
    idToken: token,
    refreshToken: token,
    identity
  };
}

async function restoreFirebaseSession(
  refreshToken: string
): Promise<{
  idToken: string;
  refreshToken: string;
  identity: AuthIdentity;
} | null> {
  const normalizedRefreshToken = String(refreshToken).trim();
  if (!normalizedRefreshToken) {
    return null;
  }

  const response = await firebaseTokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: normalizedRefreshToken
    })
  );
  const idToken = String(response.id_token ?? "").trim();
  if (!idToken) {
    return null;
  }

  const identity = await verifyAuthorizedWebIdToken(idToken);
  if (!identity) {
    return null;
  }

  return {
    idToken,
    refreshToken: String(response.refresh_token ?? normalizedRefreshToken).trim(),
    identity
  };
}

function readCookie(cookies: Record<string, string>, key: string): string | null {
  const value = cookies[key];
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

export async function bootstrapWebFirebaseSession(request: Request): Promise<{
  idToken: string;
  refreshToken: string;
  identity: AuthIdentity;
  reusedExisting: boolean;
}> {
  if (readTestAuthEnabled()) {
    const session = await bootstrapWebTestGoogleSession();
    return {
      ...session,
      reusedExisting: false
    };
  }

  const cookies = parseCookies(request.headers.get("cookie"));
  const refreshToken = readCookie(cookies, WEB_REFRESH_COOKIE);
  if (refreshToken) {
    try {
      const restored = await restoreFirebaseSession(refreshToken);
      if (restored) {
        return {
          ...restored,
          reusedExisting: true
        };
      }
    } catch {
      // Fall through to the explicit error below when the stored refresh token is stale.
    }
  }

  throw new Error("Google sign-in is required.");
}

async function lookupFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseIdentity | null> {
  if (!idToken) {
    return null;
  }

  const response = await firebaseRequest("accounts:lookup", {
    idToken
  });
  const user = (response.users?.[0] ?? null) as FirebaseLookupUser | null;
  if (!user) {
    return null;
  }

  return normalizeIdentity(user);
}

async function verifyAuthorizedWebIdToken(idToken: string): Promise<AuthIdentity | null> {
  const testIdentity = verifyTestWebToken(idToken);
  if (testIdentity) {
    return testIdentity;
  }
  const verified = await lookupFirebaseIdToken(idToken);
  if (!verified) {
    return null;
  }
  try {
    return assertAuthorizedGoogleSession(verified);
  } catch {
    return null;
  }
}

export async function signInWebWithGoogleCredential(credential: string): Promise<{
  idToken: string;
  refreshToken: string;
  identity: AuthIdentity;
}> {
  const normalizedCredential = String(credential ?? "").trim();
  if (!normalizedCredential) {
    throw new Error("Google credential is required.");
  }

  const response = await firebaseRequest("accounts:signInWithIdp", {
    postBody: new URLSearchParams({
      id_token: normalizedCredential,
      providerId: "google.com"
    }).toString(),
    requestUri: "http://localhost",
    returnIdpCredential: true,
    returnSecureToken: true
  });

  const idToken = String(response.idToken ?? "").trim();
  const refreshToken = String(response.refreshToken ?? "").trim();
  if (!idToken || !refreshToken) {
    throw new Error("Firebase did not return a web session.");
  }

  const verified = await lookupFirebaseIdToken(idToken);
  if (!verified) {
    throw new Error("Firebase session lookup failed.");
  }

  return {
    idToken,
    refreshToken,
    identity: assertAuthorizedGoogleSession(verified)
  };
}

export async function syncLocalUser(identity: AuthIdentity): Promise<{ userId: string; roles: string[] }> {
  const user = await queryOne<{ user_id: string }>(
    `
      insert into users (
        auth_subject,
        auth_provider,
        email,
        is_anonymous,
        status
      )
      values ($1, $2, $3, $4, 'active')
      on conflict (auth_provider, auth_subject) do update
      set
        email = excluded.email,
        is_anonymous = excluded.is_anonymous,
        updated_at = now()
      returning user_id
    `,
    [identity.subject, identity.provider, identity.email, identity.isAnonymous]
  );
  if (!user) {
    throw new Error("Failed to create or update local user.");
  }

  await queryOne(
    `
      insert into user_profiles (user_id)
      values ($1)
      on conflict (user_id) do nothing
      returning user_id
    `,
    [user.user_id]
  );

  const roles = await queryRows<{ role_name: string }>(
    `
      select r.role_name
      from user_roles ur
      join roles r on r.role_id = ur.role_id
      where ur.user_id = $1
      order by r.role_name
    `,
    [user.user_id]
  );

  return {
    userId: user.user_id,
    roles: roles.map((row) => row.role_name)
  };
}

export async function resolveWebSession(request: Request): Promise<(AuthSession & { userId: string }) | null> {
  const cookies = parseCookies(request.headers.get("cookie"));
  const idToken = cookies[WEB_SESSION_COOKIE];
  if (!idToken) {
    return null;
  }

  try {
    const identity = await verifyAuthorizedWebIdToken(idToken);
    if (!identity) {
      return null;
    }
    const user = await syncLocalUser(identity);
    return {
      identity,
      roles: user.roles,
      userId: user.userId
    };
  } catch {
    return null;
  }
}

function buildCookieSuffix(options: AuthCookieOptions = {}): string {
  return shouldMarkCookieSecure({
    env: process.env,
    request: options.request ?? null
  })
    ? "; Secure"
    : "";
}

export function buildSessionCookie(value: string, options: AuthCookieOptions = {}): string {
  return `${WEB_SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${buildCookieSuffix(options)}`;
}

export function buildRefreshCookie(value: string, options: AuthCookieOptions = {}): string {
  return `${WEB_REFRESH_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${buildCookieSuffix(options)}`;
}

export function buildWebAuthCookies(tokens: {
  idToken: string;
  refreshToken: string;
}, options: AuthCookieOptions = {}): string[] {
  return [
    buildSessionCookie(tokens.idToken, options),
    buildRefreshCookie(tokens.refreshToken, options)
  ];
}

export function buildExpiredSessionCookie(options: AuthCookieOptions = {}): string {
  return `${WEB_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${buildCookieSuffix(options)}`;
}

export function buildExpiredRefreshCookie(options: AuthCookieOptions = {}): string {
  return `${WEB_REFRESH_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${buildCookieSuffix(options)}`;
}
