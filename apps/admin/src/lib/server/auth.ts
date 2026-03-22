import type { AuthIdentity, AuthSession } from "@newsportal/contracts";

import { queryRows, getPool } from "./db";

const ADMIN_SESSION_COOKIE = "np_admin_session";

interface FirebaseLookupUser {
  localId: string;
  email?: string;
  providerUserInfo?: Array<{ providerId?: string }>;
}

function normalizeEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

function splitEmailParts(email: string): { local: string; domain: string } | null {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === normalized.length - 1) {
    return null;
  }

  return {
    local: normalized.slice(0, atIndex),
    domain: normalized.slice(atIndex + 1)
  };
}

function isPlusAliasOf(baseEmail: string, candidateEmail: string): boolean {
  const base = splitEmailParts(baseEmail);
  const candidate = splitEmailParts(candidateEmail);
  if (!base || !candidate) {
    return false;
  }

  return (
    base.domain === candidate.domain &&
    candidate.local.startsWith(`${base.local}+`)
  );
}

function readAdminAllowlist(): string[] {
  return String(process.env.ADMIN_ALLOWLIST_EMAILS ?? "")
    .split(",")
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);
}

function isEmailAllowlisted(email: string | null | undefined): boolean {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return false;
  }

  return readAdminAllowlist().some((entry) => {
    if (entry.startsWith("@")) {
      return normalizedEmail.endsWith(entry);
    }

    return normalizedEmail === entry || isPlusAliasOf(entry, normalizedEmail);
  });
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
  const apiKey = process.env.FIREBASE_WEB_API_KEY ?? "";
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

function normalizeIdentity(lookupUser: FirebaseLookupUser): AuthIdentity {
  const providerIds = lookupUser.providerUserInfo?.map((item) => item.providerId ?? "") ?? [];
  const providerId = providerIds[0] ?? "";

  return {
    subject: lookupUser.localId,
    provider: providerId.includes("google")
      ? "firebase_google"
      : providerId.includes("password")
        ? "firebase_email_link"
        : "firebase_other",
    email: lookupUser.email ?? null,
    isAnonymous: false
  };
}

async function signInAdminWithPassword(email: string, password: string): Promise<{
  idToken: string;
  identity: AuthIdentity;
}> {
  const response = await firebaseRequest("accounts:signInWithPassword", {
    email,
    password,
    returnSecureToken: true
  });

  const identity = normalizeIdentity({
    localId: String(response.localId),
    email: String(response.email ?? email),
    providerUserInfo: [{ providerId: "password" }]
  });

  return {
    idToken: String(response.idToken),
    identity
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

async function syncLocalAdminUser(identity: AuthIdentity): Promise<{ userId: string; roles: string[] }> {
  const pool = getPool();
  const result = await pool.query<{ user_id: string }>(
    `
      insert into users (
        auth_subject,
        auth_provider,
        email,
        is_anonymous,
        status
      )
      values ($1, $2, $3, false, 'active')
      on conflict (auth_provider, auth_subject) do update
      set
        email = excluded.email,
        is_anonymous = false,
        updated_at = now()
      returning user_id
    `,
    [identity.subject, identity.provider, identity.email]
  );
  const userId = result.rows[0]?.user_id;
  if (!userId) {
    throw new Error("Failed to sync admin user.");
  }

  await pool.query(
    `
      insert into user_profiles (user_id)
      values ($1)
      on conflict (user_id) do nothing
    `,
    [userId]
  );

  if (isEmailAllowlisted(identity.email)) {
    await pool.query(
      `
        insert into user_roles (user_id, role_id)
        select $1, role_id
        from roles
        where role_name = 'admin'
        on conflict (user_id, role_id) do nothing
      `,
      [userId]
    );
  }

  const roles = await queryRows<{ role_name: string }>(
    `
      select r.role_name
      from user_roles ur
      join roles r on r.role_id = ur.role_id
      where ur.user_id = $1
    `,
    [userId]
  );
  const roleNames = roles.map((row) => row.role_name);
  if (!roleNames.includes("admin")) {
    throw new Error(
      "Local admin role is not assigned for this Firebase identity. Add the email to ADMIN_ALLOWLIST_EMAILS for first-run bootstrap or assign the role explicitly."
    );
  }

  return {
    userId,
    roles: roleNames
  };
}

export async function resolveAdminSession(request: Request): Promise<(AuthSession & { userId: string }) | null> {
  const cookies = parseCookies(request.headers.get("cookie"));
  const idToken = cookies[ADMIN_SESSION_COOKIE];
  if (!idToken) {
    return null;
  }

  try {
    const identity = await verifyFirebaseIdToken(idToken);
    if (!identity || identity.isAnonymous) {
      return null;
    }
    const user = await syncLocalAdminUser(identity);
    return {
      identity,
      roles: user.roles,
      userId: user.userId
    };
  } catch {
    return null;
  }
}

export async function createAdminSession(
  email: string,
  password: string
): Promise<{ idToken: string; session: AuthSession & { userId: string } }> {
  const firebaseSession = await signInAdminWithPassword(email, password);
  const user = await syncLocalAdminUser(firebaseSession.identity);
  return {
    idToken: firebaseSession.idToken,
    session: {
      identity: firebaseSession.identity,
      roles: user.roles,
      userId: user.userId
    }
  };
}

export function buildAdminSessionCookie(value: string): string {
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`;
}

export function buildExpiredAdminSessionCookie(): string {
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}
