import { readRuntimeConfig } from "@newsportal/config";

export type FlashStatus = "success" | "error";

const DEFAULT_APP_BASE_URL = "http://127.0.0.1:4321/";

interface FlashRedirectOptions {
  section: string;
  status: FlashStatus;
  message: string;
  setCookie?: string;
}

function normalizeSection(section: string): string {
  return String(section).trim().replace(/^#/, "") || "auth";
}

function inferAppHomePath(pathname: string): string {
  const markerIndex = pathname.indexOf("/bff/");
  if (markerIndex >= 0) {
    const prefix = pathname.slice(0, markerIndex);
    return prefix ? `${prefix}/` : "/";
  }
  return "/";
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

export function buildFlashRedirect(
  request: Request,
  options: FlashRedirectOptions
): Response {
  const requestUrl = resolveRedirectBaseUrl(request);
  const location = new URL(inferAppHomePath(requestUrl.pathname), requestUrl);
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
