import type { OperatingDomain } from "./model";

export type IssueSeverity = "info" | "warning" | "critical";


export function classifyLlmProviderError(errorText: string): string {
  const normalized = errorText.toLowerCase();
  if (normalized.includes("404") || normalized.includes("not found")) {
    return "provider_endpoint_error";
  }
  if (normalized.includes("401") || normalized.includes("403") || normalized.includes("unauthorized") || normalized.includes("forbidden")) {
    return "provider_credentials_missing";
  }
  if (normalized.includes("model") || normalized.includes("endpoint")) {
    return "provider_endpoint_error";
  }
  return "provider_error";
}

export function issue(
  severity: IssueSeverity,
  domain: OperatingDomain,
  title: string,
  evidence: Record<string, unknown>,
  nextSteps: string[]
) {
  return {
    severity,
    domain,
    title,
    evidence,
    nextSteps,
  };
}
