export const SIGNALOPS_ERROR_DOMAINS = [
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

export type SignalOpsErrorDomain = (typeof SIGNALOPS_ERROR_DOMAINS)[number];

export const SIGNALOPS_ERROR_SEVERITIES = ["info", "warning", "error"] as const;

export type SignalOpsErrorSeverity = (typeof SIGNALOPS_ERROR_SEVERITIES)[number];

export const SIGNALOPS_RETRY_HINTS = [
  "none",
  "retry",
  "after_operator_fix",
  "after_budget_reset",
] as const;

export type SignalOpsRetryHint = (typeof SIGNALOPS_RETRY_HINTS)[number];

export interface SignalOpsErrorDiagnostic {
  code: string;
  domain: SignalOpsErrorDomain;
  severity: SignalOpsErrorSeverity;
  retry_hint: SignalOpsRetryHint;
  message?: string;
}

export const SIGNALOPS_ERROR_CODES = {
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

export type SignalOpsKnownErrorCode =
  (typeof SIGNALOPS_ERROR_CODES)[keyof typeof SIGNALOPS_ERROR_CODES];

const ERROR_CODE_DEFAULTS: Record<
  SignalOpsKnownErrorCode,
  Omit<SignalOpsErrorDiagnostic, "code" | "message">
> = {
  [SIGNALOPS_ERROR_CODES.acquisitionUrlBlocked]: {
    domain: "acquisition_url",
    severity: "warning",
    retry_hint: "after_operator_fix",
  },
  [SIGNALOPS_ERROR_CODES.acquisitionUrlFinalBlocked]: {
    domain: "acquisition_url",
    severity: "warning",
    retry_hint: "after_operator_fix",
  },
  [SIGNALOPS_ERROR_CODES.providerFetchFailed]: {
    domain: "provider_fetch",
    severity: "warning",
    retry_hint: "retry",
  },
  [SIGNALOPS_ERROR_CODES.providerFetchTooLarge]: {
    domain: "provider_fetch",
    severity: "warning",
    retry_hint: "after_operator_fix",
  },
  [SIGNALOPS_ERROR_CODES.feedProbeNoValidFeed]: {
    domain: "feed_parse",
    severity: "warning",
    retry_hint: "none",
  },
  [SIGNALOPS_ERROR_CODES.feedProbeFailed]: {
    domain: "feed_parse",
    severity: "warning",
    retry_hint: "retry",
  },
  [SIGNALOPS_ERROR_CODES.taskPluginOutputTooManyKeys]: {
    domain: "task_plugin",
    severity: "error",
    retry_hint: "after_operator_fix",
  },
  [SIGNALOPS_ERROR_CODES.taskPluginOutputTooLarge]: {
    domain: "task_plugin",
    severity: "error",
    retry_hint: "after_operator_fix",
  },
  [SIGNALOPS_ERROR_CODES.taskPluginOutputNotSerializable]: {
    domain: "task_plugin",
    severity: "error",
    retry_hint: "after_operator_fix",
  },
  [SIGNALOPS_ERROR_CODES.taskPluginFailed]: {
    domain: "task_plugin",
    severity: "error",
    retry_hint: "retry",
  },
};

export function classifySignalOpsErrorCode(
  code: string,
): Omit<SignalOpsErrorDiagnostic, "code" | "message"> {
  return (
    ERROR_CODE_DEFAULTS[code as SignalOpsKnownErrorCode] ?? {
      domain: "unknown",
      severity: "error",
      retry_hint: "none",
    }
  );
}

export function createSignalOpsErrorDiagnostic(input: {
  code: string;
  message?: string | null;
  domain?: SignalOpsErrorDomain;
  severity?: SignalOpsErrorSeverity;
  retry_hint?: SignalOpsRetryHint;
}): SignalOpsErrorDiagnostic {
  const defaults = classifySignalOpsErrorCode(input.code);
  return {
    code: input.code,
    domain: input.domain ?? defaults.domain,
    severity: input.severity ?? defaults.severity,
    retry_hint: input.retry_hint ?? defaults.retry_hint,
    ...(input.message ? { message: input.message } : {}),
  };
}
