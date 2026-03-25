import { readRuntimeConfig, resolveAppHref } from "@newsportal/config";

export type FlashStatus = "success" | "error";

const DEFAULT_APP_BASE_URL = "http://127.0.0.1:4322/";

interface FlashRedirectOptions {
  section: string;
  status: FlashStatus;
  message: string;
  setCookie?: string;
  redirectTo?: string | null;
}

function normalizeSection(section: string): string {
  return String(section).trim().replace(/^#/, "") || "auth";
}

function normalizeForwardedPrefix(value: string | null): string {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "/") {
    return "";
  }
  return `/${normalized.replace(/^\/+|\/+$/g, "")}`;
}

function resolveAdminBasePrefix(request: Request): string {
  const forwardedPrefix = normalizeForwardedPrefix(
    request.headers.get("x-forwarded-prefix")
  );
  if (forwardedPrefix) {
    return forwardedPrefix;
  }

  try {
    const requestUrl = new URL(request.url);
    if (requestUrl.pathname === "/admin" || requestUrl.pathname.startsWith("/admin/")) {
      return "/admin";
    }
  } catch {
    return "";
  }

  return "";
}

export function resolveAdminAppPath(request: Request, target = "/"): string {
  const basePrefix = resolveAdminBasePrefix(request);
  const normalizedTarget = target.startsWith("/") ? target : `/${target}`;
  if (
    basePrefix &&
    (normalizedTarget === basePrefix || normalizedTarget.startsWith(`${basePrefix}/`))
  ) {
    return normalizedTarget;
  }
  const appBaseUrl = `http://app${basePrefix ? `${basePrefix}/` : "/"}`;
  return resolveAppHref(appBaseUrl, normalizedTarget);
}

function stripAdminPrefix(pathname: string, forwardedPrefix = ""): string {
  if (forwardedPrefix && (pathname === forwardedPrefix || pathname.startsWith(`${forwardedPrefix}/`))) {
    const stripped = pathname.slice(forwardedPrefix.length);
    return stripped || "/";
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const stripped = pathname.slice("/admin".length);
    return stripped || "/";
  }

  return pathname || "/";
}

function inferAppHomePath(pathname: string, forwardedPrefix = ""): string {
  if (forwardedPrefix) {
    return `${forwardedPrefix}/`;
  }
  const markerIndex = pathname.indexOf("/bff/");
  if (markerIndex >= 0) {
    const prefix = pathname.slice(0, markerIndex);
    return prefix ? `${prefix}/` : "/";
  }
  return pathname.startsWith("/admin/") || pathname === "/admin" ? "/admin/" : "/";
}

function resolveRedirectBaseUrl(request: Request): URL {
  const runtimeConfig = readRuntimeConfig(process.env, {
    defaultAppBaseUrl: DEFAULT_APP_BASE_URL
  });
  const fallbackUrl = new URL(runtimeConfig.appBaseUrl);

  try {
    const requestUrl = new URL(request.url);
    if (requestUrl.hostname === "localhost" && requestUrl.port === "" && fallbackUrl.hostname !== "localhost") {
      requestUrl.protocol = fallbackUrl.protocol;
      requestUrl.hostname = fallbackUrl.hostname;
      requestUrl.port = fallbackUrl.port;
    }
    return requestUrl;
  } catch {
    return fallbackUrl;
  }
}

export function requestPrefersHtmlNavigation(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  const secFetchMode = request.headers.get("sec-fetch-mode") ?? "";
  return accept.includes("text/html") || secFetchMode === "navigate";
}

export function resolveAdminCurrentPath(request: Request): string {
  const requestUrl = resolveRedirectBaseUrl(request);
  const forwardedPrefix = normalizeForwardedPrefix(
    request.headers.get("x-forwarded-prefix")
  );
  const normalizedPath = stripAdminPrefix(requestUrl.pathname, forwardedPrefix);
  return resolveAdminAppPath(
    request,
    `${normalizedPath}${requestUrl.search}${requestUrl.hash}`
  );
}

export function resolveAdminRedirectPath(
  request: Request,
  candidate: string | null | undefined,
  fallback = "/"
): string {
  const fallbackPath = resolveAdminAppPath(request, fallback);
  const rawCandidate = String(candidate ?? "").trim();
  if (!rawCandidate) {
    return fallbackPath;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawCandidate, "http://app");
  } catch {
    return fallbackPath;
  }

  if (!parsed.pathname.startsWith("/")) {
    return fallbackPath;
  }

  const forwardedPrefix = normalizeForwardedPrefix(
    request.headers.get("x-forwarded-prefix")
  );
  const normalizedPath = stripAdminPrefix(parsed.pathname, forwardedPrefix);

  return resolveAdminAppPath(
    request,
    `${normalizedPath}${parsed.search}${parsed.hash}`
  );
}

export function buildAdminSignInPath(
  request: Request,
  nextPath: string | null | undefined = null
): string {
  const signInLocation = new URL(
    resolveAdminAppPath(request, "/sign-in"),
    "http://app"
  );
  const resolvedNextPath = resolveAdminRedirectPath(request, nextPath, "/");
  const resolvedSignInPath = resolveAdminAppPath(request, "/sign-in");

  if (resolvedNextPath !== resolvedSignInPath) {
    signInLocation.searchParams.set("next", resolvedNextPath);
  }

  return `${signInLocation.pathname}${signInLocation.search}${signInLocation.hash}`;
}

export function buildFlashRedirect(
  request: Request,
  options: FlashRedirectOptions
): Response {
  const requestUrl = resolveRedirectBaseUrl(request);
  const location = new URL(
    resolveAdminRedirectPath(
      request,
      options.redirectTo,
      inferAppHomePath(
        requestUrl.pathname,
        normalizeForwardedPrefix(request.headers.get("x-forwarded-prefix"))
      )
    ),
    requestUrl
  );
  location.searchParams.set("flash_status", options.status);
  location.searchParams.set("flash_message", options.message);
  location.hash = normalizeSection(options.section);

  const headers = new Headers({
    Location: location.toString()
  });
  if (options.setCookie) {
    headers.set("Set-Cookie", options.setCookie);
  }

  return new Response(null, {
    status: 303,
    headers
  });
}

export function readFlash(url: URL): { status: FlashStatus; message: string } | null {
  const status = url.searchParams.get("flash_status");
  const message = url.searchParams.get("flash_message")?.trim() ?? "";
  if ((status === "success" || status === "error") && message) {
    return {
      status,
      message
    };
  }

  return null;
}
