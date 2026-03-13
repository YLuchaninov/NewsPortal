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
  productName: "NewsPortal",
  tagline: "Internal local MVP for clustered news alerts",
  accentColor: "#c45c2f",
  surfaceColor: "#f8f1e8",
  backgroundGradient:
    "radial-gradient(circle at top left, rgba(196,92,47,0.18), transparent 35%), linear-gradient(180deg, #fffaf3 0%, #f3ede4 100%)"
};

export interface RuntimeConfig {
  apiBaseUrl: string;
  publicApiBaseUrl: string;
  firebaseProjectId: string;
  firebaseWebApiKey: string;
}

export function readRuntimeConfig(env: Record<string, string | undefined>): RuntimeConfig {
  const apiBaseUrl = env.NEWSPORTAL_API_BASE_URL ?? "http://127.0.0.1:8000";
  return {
    apiBaseUrl,
    publicApiBaseUrl: env.NEWSPORTAL_PUBLIC_API_BASE_URL ?? apiBaseUrl,
    firebaseProjectId: env.FIREBASE_PROJECT_ID ?? "",
    firebaseWebApiKey: env.FIREBASE_WEB_API_KEY ?? ""
  };
}
