export const NEWSPORTAL_ERROR_DOMAINS = [
  "acquisition_url",
  "provider_fetch",
  "feed_parse",
  "website_discovery",
  "api_provider",
  "imap_provider",
  "content_analysis",
  "task_plugin",
  "delivery",
  "control_plane",
  "unknown",
] as const;

export type NewsPortalErrorDomain = (typeof NEWSPORTAL_ERROR_DOMAINS)[number];

export const NEWSPORTAL_ERROR_SEVERITIES = ["info", "warning", "error"] as const;

export type NewsPortalErrorSeverity = (typeof NEWSPORTAL_ERROR_SEVERITIES)[number];

export const NEWSPORTAL_RETRY_HINTS = [
  "none",
  "retry",
  "after_operator_fix",
  "after_budget_reset",
] as const;

export type NewsPortalRetryHint = (typeof NEWSPORTAL_RETRY_HINTS)[number];

export interface NewsPortalErrorDiagnostic {
  code: string;
  domain: NewsPortalErrorDomain;
  severity: NewsPortalErrorSeverity;
  retry_hint: NewsPortalRetryHint;
  message?: string;
}

export const NEWSPORTAL_ERROR_CODES = {
  acquisitionUrlBlocked: "acquisition_url.blocked",
  acquisitionUrlFinalBlocked: "acquisition_url.final_blocked",
  providerFetchFailed: "provider_fetch.failed",
  providerFetchTooLarge: "provider_fetch.body_too_large",
  feedProbeNoValidFeed: "feed_parse.no_valid_feed",
  feedProbeFailed: "feed_parse.probe_failed",
  taskPluginOutputTooManyKeys: "task_plugin.output_too_many_keys",
  taskPluginOutputTooLarge: "task_plugin.output_too_large",
  taskPluginOutputNotSerializable: "task_plugin.output_not_serializable",
  taskPluginFailed: "task_plugin.failed",
} as const;

export type NewsPortalKnownErrorCode =
  (typeof NEWSPORTAL_ERROR_CODES)[keyof typeof NEWSPORTAL_ERROR_CODES];

const ERROR_CODE_DEFAULTS: Record<
  NewsPortalKnownErrorCode,
  Omit<NewsPortalErrorDiagnostic, "code" | "message">
> = {
  [NEWSPORTAL_ERROR_CODES.acquisitionUrlBlocked]: {
    domain: "acquisition_url",
    severity: "warning",
    retry_hint: "after_operator_fix",
  },
  [NEWSPORTAL_ERROR_CODES.acquisitionUrlFinalBlocked]: {
    domain: "acquisition_url",
    severity: "warning",
    retry_hint: "after_operator_fix",
  },
  [NEWSPORTAL_ERROR_CODES.providerFetchFailed]: {
    domain: "provider_fetch",
    severity: "warning",
    retry_hint: "retry",
  },
  [NEWSPORTAL_ERROR_CODES.providerFetchTooLarge]: {
    domain: "provider_fetch",
    severity: "warning",
    retry_hint: "after_operator_fix",
  },
  [NEWSPORTAL_ERROR_CODES.feedProbeNoValidFeed]: {
    domain: "feed_parse",
    severity: "warning",
    retry_hint: "none",
  },
  [NEWSPORTAL_ERROR_CODES.feedProbeFailed]: {
    domain: "feed_parse",
    severity: "warning",
    retry_hint: "retry",
  },
  [NEWSPORTAL_ERROR_CODES.taskPluginOutputTooManyKeys]: {
    domain: "task_plugin",
    severity: "error",
    retry_hint: "after_operator_fix",
  },
  [NEWSPORTAL_ERROR_CODES.taskPluginOutputTooLarge]: {
    domain: "task_plugin",
    severity: "error",
    retry_hint: "after_operator_fix",
  },
  [NEWSPORTAL_ERROR_CODES.taskPluginOutputNotSerializable]: {
    domain: "task_plugin",
    severity: "error",
    retry_hint: "after_operator_fix",
  },
  [NEWSPORTAL_ERROR_CODES.taskPluginFailed]: {
    domain: "task_plugin",
    severity: "error",
    retry_hint: "retry",
  },
};

export function classifyNewsPortalErrorCode(
  code: string,
): Omit<NewsPortalErrorDiagnostic, "code" | "message"> {
  return (
    ERROR_CODE_DEFAULTS[code as NewsPortalKnownErrorCode] ?? {
      domain: "unknown",
      severity: "error",
      retry_hint: "none",
    }
  );
}

export function createNewsPortalErrorDiagnostic(input: {
  code: string;
  message?: string | null;
  domain?: NewsPortalErrorDomain;
  severity?: NewsPortalErrorSeverity;
  retry_hint?: NewsPortalRetryHint;
}): NewsPortalErrorDiagnostic {
  const defaults = classifyNewsPortalErrorCode(input.code);
  return {
    code: input.code,
    domain: input.domain ?? defaults.domain,
    severity: input.severity ?? defaults.severity,
    retry_hint: input.retry_hint ?? defaults.retry_hint,
    ...(input.message ? { message: input.message } : {}),
  };
}
