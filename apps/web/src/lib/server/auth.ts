import type { AuthIdentity, AuthSession } from "@newsportal/contracts";

import { queryOne, queryRows } from "./db";

const WEB_SESSION_COOKIE = "np_web_session";

interface FirebaseLookupUser {
  localId: string;
  email?: string;
  providerUserInfo?: Array<{ providerId?: string }>;
}

function readFirebaseApiKey(): string {
  return process.env.FIREBASE_WEB_API_KEY ?? "";
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

function normalizeIdentity(lookupUser: FirebaseLookupUser, fallbackAnonymous = false): AuthIdentity {
  const providerIds = lookupUser.providerUserInfo?.map((item) => item.providerId ?? "") ?? [];
  const providerId = providerIds[0] ?? "";
  const isAnonymous = fallbackAnonymous || providerIds.length === 0;

  return {
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
  };
}

export async function bootstrapAnonymousFirebaseSession(): Promise<{
  idToken: string;
  refreshToken: string;
  identity: AuthIdentity;
}> {
  const response = await firebaseRequest("accounts:signUp", {
    returnSecureToken: true
  });

  return {
    idToken: String(response.idToken),
    refreshToken: String(response.refreshToken),
    identity: {
      subject: String(response.localId),
      provider: "firebase_anonymous",
      email: response.email ? String(response.email) : null,
      isAnonymous: true
    }
  };
}

async function verifyFirebaseIdToken(idToken: string): Promise<AuthIdentity | null> {
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
    const identity = await verifyFirebaseIdToken(idToken);
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

export function buildSessionCookie(value: string): string {
  return `${WEB_SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`;
}

export function buildExpiredSessionCookie(): string {
  return `${WEB_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
