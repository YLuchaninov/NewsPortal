import {
  classifyWebsiteMatrixDiagnostic,
  PRODUCT_TOTAL_LIVE_STATUSES,
} from "./product-total-live-audit-proof.mjs";

export const PRODUCT_LOCAL_STATUSES = {
  passed: "passed",
  failed: "failed",
  weak: "weak_with_classified_residual",
};

export function isStrictLiveInternet(env = process.env) {
  return ["1", "true", "yes", "on"].includes(
    String(env.SIGNALOPS_STRICT_LIVE_INTERNET ?? "").trim().toLowerCase()
  );
}

export function evaluateLocalProductCommandResult(commandResult, options = {}) {
  const strictLiveInternet = Boolean(options.strictLiveInternet);
  const rawStatus = commandResult?.status === "passed" ? PRODUCT_LOCAL_STATUSES.passed : PRODUCT_LOCAL_STATUSES.failed;

  if (commandResult?.key === "website-matrix-compose" && commandResult?.weakAllowed) {
    const diagnosticSummary = classifyWebsiteMatrixDiagnostic(commandResult);
    if (diagnosticSummary.status === PRODUCT_TOTAL_LIVE_STATUSES.weak && !strictLiveInternet) {
      return {
        ...commandResult,
        diagnostic: true,
        diagnosticSummary,
        acceptanceStatus: PRODUCT_LOCAL_STATUSES.weak,
        acceptanceReason: diagnosticSummary.reason,
      };
    }
    if (diagnosticSummary.status === PRODUCT_TOTAL_LIVE_STATUSES.passed) {
      return {
        ...commandResult,
        diagnostic: true,
        diagnosticSummary,
        acceptanceStatus: PRODUCT_LOCAL_STATUSES.passed,
        acceptanceReason: null,
      };
    }
    return {
      ...commandResult,
      diagnostic: true,
      diagnosticSummary,
      acceptanceStatus: PRODUCT_LOCAL_STATUSES.failed,
      acceptanceReason:
        strictLiveInternet && diagnosticSummary.status === PRODUCT_TOTAL_LIVE_STATUSES.weak
          ? "strict_live_internet_requires_passing_website_matrix"
          : diagnosticSummary.reason,
    };
  }

  return {
    ...commandResult,
    diagnostic: Boolean(commandResult?.weakAllowed),
    diagnosticSummary: null,
    acceptanceStatus: rawStatus,
    acceptanceReason: rawStatus === PRODUCT_LOCAL_STATUSES.passed ? null : `${commandResult?.key ?? "unknown"} failed`,
  };
}

export function determineLocalProductStatus(input = {}) {
  const envStatus = input.envStatus === "failed" ? "failed" : "passed";
  if (envStatus === "failed") {
    return PRODUCT_LOCAL_STATUSES.failed;
  }
  if (input.preflightOnly) {
    return "preflight-passed";
  }

  const commandResults = Array.isArray(input.commandResults) ? input.commandResults : [];
  if (commandResults.some((item) => item.acceptanceStatus === PRODUCT_LOCAL_STATUSES.failed)) {
    return PRODUCT_LOCAL_STATUSES.failed;
  }
  if (commandResults.some((item) => item.acceptanceStatus === PRODUCT_LOCAL_STATUSES.weak)) {
    return PRODUCT_LOCAL_STATUSES.weak;
  }
  return PRODUCT_LOCAL_STATUSES.passed;
}
