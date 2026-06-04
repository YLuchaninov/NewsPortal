export type ThemeMode = "light" | "dark" | "system";

export interface BrandConfig {
  productName: string;
  tagline: string;
  accentColor: string;
  surfaceColor: string;
  backgroundGradient: string;
}

export const THEME_MODES: ThemeMode[] = ["light", "dark", "system"];

export const DEFAULT_BRAND_CONFIG: BrandConfig = {
  productName: "SignalOps",
  tagline: "Internal local MVP for clustered signal alerts",
  accentColor: "#c45c2f",
  surfaceColor: "#f8f1e8",
  backgroundGradient:
    "radial-gradient(circle at top left, rgba(196,92,47,0.18), transparent 35%), linear-gradient(180deg, #fffaf3 0%, #f3ede4 100%)"
};

export interface RuntimeConfig {
  appBaseUrl: string;
  apiBaseUrl: string;
  publicApiBaseUrl: string;
  firebaseProjectId: string;
  firebaseWebApiKey: string;
  webPushVapidPublicKey: string;
  discoveryEnabled: boolean;
  discoveryCron: string;
  discoverySearchProvider: string;
  discoveryLlmModel: string;
  discoveryMonthlyBudgetCents: number;
  llmReviewEnabled: boolean;
  llmReviewMonthlyBudgetCents: number;
  llmReviewBudgetExhaustAcceptGrayZone: boolean;
}

export interface RuntimeConfigOptions {
  defaultAppBaseUrl?: string;
  defaultApiBaseUrl?: string;
}

export type CookieSecurePolicy = "auto" | "always" | "never";

export interface CookieSecureOptions {
  env?: Record<string, string | undefined>;
  request?: Request | null;
}

function normalizeBaseUrl(rawValue: string): string {
  const normalized = new URL(rawValue);
  if (!normalized.pathname.endsWith("/")) {
    normalized.pathname = `${normalized.pathname}/`;
  }
  return normalized.toString();
}

function normalizeAppTarget(target: string): string {
  const normalized = String(target).trim();
  if (!normalized || normalized === "/") {
    return "";
  }
  return normalized.replace(/^\/+/, "");
}

export function resolveAppUrl(appBaseUrl: string, target = "/"): URL {
  return new URL(normalizeAppTarget(target), normalizeBaseUrl(appBaseUrl));
}

export function resolveAppHref(appBaseUrl: string, target = "/"): string {
  const resolvedUrl = resolveAppUrl(appBaseUrl, target);
  return `${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}`;
}

function readFirstHeaderValue(request: Request | null | undefined, name: string): string {
  const rawValue = request?.headers.get(name) ?? "";
  return rawValue.split(",")[0]?.trim().toLowerCase() ?? "";
}

export function readCookieSecurePolicy(
  env: Record<string, string | undefined> = {}
): CookieSecurePolicy {
  const normalized = String(env.SIGNALOPS_COOKIE_SECURE_POLICY ?? "auto")
    .trim()
    .toLowerCase();
  if (normalized === "always" || normalized === "never" || normalized === "auto") {
    return normalized;
  }
  return "auto";
}

export function shouldMarkCookieSecure(options: CookieSecureOptions = {}): boolean {
  const policy = readCookieSecurePolicy(options.env);
  if (policy === "always") {
    return true;
  }
  if (policy === "never") {
    return false;
  }

  const forwardedProto = readFirstHeaderValue(options.request, "x-forwarded-proto");
  if (forwardedProto === "https") {
    return true;
  }
  if (forwardedProto === "http") {
    return false;
  }

  try {
    return options.request ? new URL(options.request.url).protocol === "https:" : false;
  } catch {
    return false;
  }
}

export function readRuntimeConfig(
  env: Record<string, string | undefined>,
  options: RuntimeConfigOptions = {}
): RuntimeConfig {
  const appBaseUrl = normalizeBaseUrl(
    env.SIGNALOPS_APP_BASE_URL ?? options.defaultAppBaseUrl ?? "http://127.0.0.1:4321/"
  );
  const apiBaseUrl = env.SIGNALOPS_API_BASE_URL ?? options.defaultApiBaseUrl ?? "http://127.0.0.1:8000";
  return {
    appBaseUrl,
    apiBaseUrl,
    publicApiBaseUrl: env.SIGNALOPS_PUBLIC_API_BASE_URL ?? apiBaseUrl,
    firebaseProjectId: env.FIREBASE_PROJECT_ID ?? "",
    firebaseWebApiKey: env.FIREBASE_WEB_API_KEY ?? "",
    webPushVapidPublicKey: env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "",
    discoveryEnabled:
      String(env.DISCOVERY_ENABLED ?? "0").trim().toLowerCase() === "1" ||
      String(env.DISCOVERY_ENABLED ?? "").trim().toLowerCase() === "true",
    discoveryCron: env.DISCOVERY_CRON ?? "0 */6 * * *",
    discoverySearchProvider: env.DISCOVERY_SEARCH_PROVIDER ?? "ddgs",
    discoveryLlmModel: env.DISCOVERY_GEMINI_MODEL ?? env.GEMINI_MODEL ?? "gemini-2.0-flash",
    discoveryMonthlyBudgetCents: Number.parseInt(
      env.DISCOVERY_MONTHLY_BUDGET_CENTS ?? "0",
      10
    ) || 0,
    llmReviewEnabled:
      String(env.LLM_REVIEW_ENABLED ?? "1").trim().toLowerCase() === "1" ||
      String(env.LLM_REVIEW_ENABLED ?? "").trim().toLowerCase() === "true",
    llmReviewMonthlyBudgetCents: Number.parseInt(
      env.LLM_REVIEW_MONTHLY_BUDGET_CENTS ?? "0",
      10
    ) || 0,
    llmReviewBudgetExhaustAcceptGrayZone:
      String(env.LLM_REVIEW_BUDGET_EXHAUST_ACCEPT_GRAY_ZONE ?? "0").trim().toLowerCase() === "1" ||
      String(env.LLM_REVIEW_BUDGET_EXHAUST_ACCEPT_GRAY_ZONE ?? "").trim().toLowerCase() === "true",
  };
}
