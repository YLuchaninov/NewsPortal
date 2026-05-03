export const PRODUCT_TOTAL_LIVE_STATUSES = {
  passed: "passed",
  failed: "failed",
  weak: "weak_with_classified_residual",
  notApplicable: "not_applicable_with_reason",
};

export const PRODUCT_TOTAL_LIVE_REQUIRED_COMMANDS = [
  command("product-mega-flow-compose", "strict-live-product", ["test:product:mega-flow:compose", "--skip-stack-build"], {
    proves: ["a-b-c-live-selected-product-flow"],
    requiredArtifactKind: "newsportal-product-mega-flow-proof",
  }),
  command("providers-compose", "provider-fixtures", ["test:providers:compose"], {
    proves: ["api-fixture-ingestion", "email-imap-fixture-ingestion"],
  }),
  command("channel-auth-compose", "provider-fixtures", ["test:channel-auth:compose"], {
    proves: ["rss-channel-auth", "website-channel-auth", "api-channel-auth", "email-imap-channel-auth"],
    maxAttempts: 2,
  }),
  command("website-admin-compose", "operator-core", ["test:website:admin:compose"], {
    proves: ["website-resource-admin-flow"],
  }),
  command("automation-admin-compose", "operator-core", ["test:automation:admin:compose"], {
    proves: ["automation-admin-flow"],
  }),
  command("mcp-compose", "operator-core", ["test:mcp:compose"], {
    proves: ["mcp-deterministic-read-write-surface"],
    requiredArtifactKind: "deterministic-mcp-http-proof",
  }),
  command("web-viewports", "browser-ui", ["test:web:viewports"], {
    proves: ["web-responsive-selected-item-display"],
    maxAttempts: 2,
  }),
  command("web-ui-audit", "browser-ui", ["test:web:ui-audit"], {
    proves: ["expanded-web-admin-button-route-audit"],
    maxAttempts: 2,
  }),
  command("relay-compose", "runtime-routing", ["test:relay:compose"], {
    proves: ["relay-routing"],
  }),
  command("relay-phase3-compose", "runtime-routing", ["test:relay:phase3:compose"], {
    proves: ["relay-phase3-routing"],
  }),
  command("relay-phase45-compose", "runtime-routing", ["test:relay:phase45:compose"], {
    proves: ["relay-phase45-routing"],
  }),
  command("ingest-compose", "worker-runtime", ["test:ingest:compose"], {
    proves: ["rss-ingest-runtime"],
  }),
  command("normalize-dedup-compose", "worker-runtime", ["test:normalize-dedup:compose"], {
    proves: ["normalize-dedup-worker"],
  }),
  command("interest-compile-compose", "worker-runtime", ["test:interest-compile:compose"], {
    proves: ["interest-compile-worker"],
  }),
  command("criterion-compile-compose", "worker-runtime", ["test:criterion-compile:compose"], {
    proves: ["criterion-compile-worker"],
  }),
  command("cluster-match-notify-compose", "worker-runtime", ["test:cluster-match-notify:compose"], {
    proves: ["cluster-match-notify-worker"],
  }),
  command("embed-compose", "worker-runtime", ["test:embed:compose"], {
    proves: ["embedding-worker"],
  }),
  command("reindex-backfill-compose", "worker-runtime", ["test:reindex-backfill:compose"], {
    proves: ["reindex-backfill-worker"],
  }),
  command("llm-budget-stop-compose", "worker-runtime", ["test:llm-budget-stop:compose"], {
    proves: ["llm-budget-stop-worker"],
  }),
];

export const PRODUCT_TOTAL_LIVE_DIAGNOSTIC_COMMANDS = [
  command("discovery-mega-compose", "live-diagnostic", ["test:discovery:mega:compose"], {
    proves: ["nine-domain-discovery-yield-diagnostic"],
    weakAllowed: true,
  }),
  command("website-matrix-compose", "live-diagnostic", ["test:website:matrix:compose"], {
    proves: ["live-website-matrix-diagnostic"],
    weakAllowed: true,
  }),
  command("hard-sites-compose", "live-diagnostic", ["test:hard-sites:compose"], {
    proves: ["hard-site-browser-assisted-boundary"],
  }),
  command("mcp-http-live", "live-diagnostic", ["test:mcp:http:live"], {
    proves: ["mcp-live-http-diagnostic"],
    weakAllowed: true,
  }),
];

function command(key, lane, args, metadata = {}) {
  return {
    key,
    lane,
    executable: "pnpm",
    args,
    required: true,
    ...metadata,
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function commandPassed(commandResults, key) {
  return asArray(commandResults).some((item) => item?.key === key && item?.status === "passed");
}

function findCommand(commandResults, key) {
  return asArray(commandResults).find((item) => item?.key === key) ?? null;
}

function parsedArtifacts(commandResult) {
  return asArray(commandResult?.parsedArtifacts).map((item) => asObject(item?.parsed));
}

function findArtifact(commandResult, predicate = () => true) {
  return parsedArtifacts(commandResult).find((artifact) => predicate(artifact)) ?? null;
}

function artifactFinalVerdict(artifact) {
  return normalizeText(artifact?.finalVerdict || artifact?.status || artifact?.runtimeVerdict);
}

function summarizeRequiredCommand(commandResult) {
  if (commandResult?.status === "passed") {
    return {
      status: PRODUCT_TOTAL_LIVE_STATUSES.passed,
      reason: null,
    };
  }
  return {
    status: PRODUCT_TOTAL_LIVE_STATUSES.failed,
    reason: `${commandResult?.key ?? "unknown"} failed with exit ${commandResult?.exitCode ?? "unknown"}`,
  };
}

export function summarizeProviderExternalResiduals(commandResults) {
  const providersPassed = commandPassed(commandResults, "providers-compose");
  const fixtureStatus = providersPassed
    ? PRODUCT_TOTAL_LIVE_STATUSES.passed
    : PRODUCT_TOTAL_LIVE_STATUSES.failed;
  const externalStatus = providersPassed
    ? PRODUCT_TOTAL_LIVE_STATUSES.notApplicable
    : PRODUCT_TOTAL_LIVE_STATUSES.failed;

  return {
    rss: {
      status: commandPassed(commandResults, "channel-auth-compose")
        ? PRODUCT_TOTAL_LIVE_STATUSES.passed
        : PRODUCT_TOTAL_LIVE_STATUSES.failed,
      acceptance: "required_compose_downstream_or_auth_evidence",
      reason: commandPassed(commandResults, "channel-auth-compose") ? null : "channel_auth_compose_failed",
    },
    website: {
      status:
        commandPassed(commandResults, "channel-auth-compose")
        && (commandPassed(commandResults, "product-mega-flow-compose") || commandPassed(commandResults, "website-admin-compose"))
          ? PRODUCT_TOTAL_LIVE_STATUSES.passed
          : PRODUCT_TOTAL_LIVE_STATUSES.failed,
      acceptance: "required_compose_downstream_or_operator_evidence",
      reason:
        commandPassed(commandResults, "channel-auth-compose")
        && (commandPassed(commandResults, "product-mega-flow-compose") || commandPassed(commandResults, "website-admin-compose"))
          ? null
          : "website_compose_or_channel_auth_evidence_missing",
    },
    api: {
      fixture: {
        status: fixtureStatus,
        acceptance: "required_deterministic_provider_fixture",
        reason: providersPassed ? null : "providers_compose_failed",
      },
      externalLive: {
        status: externalStatus,
        acceptance: "not_required_without_real_external_target",
        reason: providersPassed ? "no_real_external_target_available" : "fixture_prerequisite_failed",
      },
    },
    emailImap: {
      fixture: {
        status: fixtureStatus,
        acceptance: "required_deterministic_provider_fixture",
        reason: providersPassed ? null : "providers_compose_failed",
      },
      externalLive: {
        status: externalStatus,
        acceptance: "not_required_without_real_external_target",
        reason: providersPassed ? "no_real_external_target_available" : "fixture_prerequisite_failed",
      },
    },
  };
}

function classifyDiscoveryMega(commandResult) {
  const artifact = findArtifact(commandResult, (item) => item?.kind === "newsportal-live-discovery-domain-matrix");
  if (!artifact) {
    if (commandResult?.status === "passed") {
      return {
        status: PRODUCT_TOTAL_LIVE_STATUSES.passed,
        reason: null,
      };
    }
    return {
      status: PRODUCT_TOTAL_LIVE_STATUSES.failed,
      reason: "missing_discovery_mega_artifact",
    };
  }

  if (artifact.finalVerdict === "pass") {
    return {
      status: PRODUCT_TOTAL_LIVE_STATUSES.passed,
      reason: null,
      artifactFinalVerdict: artifact.finalVerdict,
      runtimeVerdict: artifact.runtimeVerdict,
      yieldVerdict: artifact.yieldVerdict,
    };
  }
  if (
    artifact.runtimeVerdict === "pass"
    && (artifact.finalVerdict === "yield_weak" || artifact.yieldVerdict === "weak")
  ) {
    return {
      status: PRODUCT_TOTAL_LIVE_STATUSES.weak,
      reason: "classified_live_discovery_yield_residual",
      artifactFinalVerdict: artifact.finalVerdict,
      runtimeVerdict: artifact.runtimeVerdict,
      yieldVerdict: artifact.yieldVerdict,
      residualCounts: artifact.matrix?.rootCauseCounts ?? null,
    };
  }
  return {
    status: PRODUCT_TOTAL_LIVE_STATUSES.failed,
    reason: `unclassified_discovery_mega_verdict_${artifact.finalVerdict ?? "unknown"}`,
    artifactFinalVerdict: artifact.finalVerdict,
    runtimeVerdict: artifact.runtimeVerdict,
    yieldVerdict: artifact.yieldVerdict,
  };
}

function classifyWebsiteMatrix(commandResult) {
  const artifact = findArtifact(commandResult, (item) =>
    item?.evidencePath || item?.summary?.verdictCounts || item?.siteResults
  );
  if (!artifact) {
    if (commandResult?.status === "passed") {
      return {
        status: PRODUCT_TOTAL_LIVE_STATUSES.passed,
        reason: null,
      };
    }
    return {
      status: PRODUCT_TOTAL_LIVE_STATUSES.failed,
      reason: "missing_website_matrix_artifact",
    };
  }

  const verdictCounts = asObject(artifact.summary?.verdictCounts);
  const unexpected = Number(verdictCounts.unexpected_failure ?? 0);
  if (unexpected > 0 || commandResult?.status !== "passed") {
    return {
      status: PRODUCT_TOTAL_LIVE_STATUSES.failed,
      reason: "website_matrix_unexpected_failure",
      verdictCounts,
    };
  }
  const blocked = Number(verdictCounts.observed_truthful_unsupported_or_blocked ?? 0);
  if (blocked > 0) {
    return {
      status: PRODUCT_TOTAL_LIVE_STATUSES.weak,
      reason: "classified_live_website_unsupported_or_blocked_residual",
      verdictCounts,
    };
  }
  return {
    status: PRODUCT_TOTAL_LIVE_STATUSES.passed,
    reason: null,
    verdictCounts,
  };
}

function classifyMcpHttpLive(commandResult) {
  const artifact = findArtifact(commandResult, (item) => item?.kind === "newsportal-mcp-http-live-proof");
  if (!artifact) {
    if (commandResult?.status === "passed") {
      return {
        status: PRODUCT_TOTAL_LIVE_STATUSES.passed,
        reason: null,
      };
    }
    return {
      status: PRODUCT_TOTAL_LIVE_STATUSES.failed,
      reason: "missing_mcp_http_live_artifact",
    };
  }

  if (artifact.runtimeVerdict === "implementation-regression" || commandResult?.status !== "passed") {
    return {
      status: PRODUCT_TOTAL_LIVE_STATUSES.failed,
      reason: "mcp_http_live_implementation_regression",
      runtimeVerdict: artifact.runtimeVerdict,
      usefulnessVerdict: artifact.usefulnessVerdict,
    };
  }
  if (
    artifact.runtimeVerdict === "external-runtime-residual"
    || artifact.usefulnessVerdict === "yield-usefulness-weak-but-runtime-healthy"
  ) {
    return {
      status: PRODUCT_TOTAL_LIVE_STATUSES.weak,
      reason: "classified_mcp_live_external_or_yield_residual",
      runtimeVerdict: artifact.runtimeVerdict,
      usefulnessVerdict: artifact.usefulnessVerdict,
    };
  }
  return {
    status: PRODUCT_TOTAL_LIVE_STATUSES.passed,
    reason: null,
    runtimeVerdict: artifact.runtimeVerdict,
    usefulnessVerdict: artifact.usefulnessVerdict,
  };
}

function classifyDiagnosticCommand(commandResult) {
  if (commandResult?.key === "discovery-mega-compose") {
    return classifyDiscoveryMega(commandResult);
  }
  if (commandResult?.key === "website-matrix-compose") {
    return classifyWebsiteMatrix(commandResult);
  }
  if (commandResult?.key === "mcp-http-live") {
    return classifyMcpHttpLive(commandResult);
  }
  return summarizeRequiredCommand(commandResult);
}

function megaFlowEvidence(commandResults) {
  const commandResult = findCommand(commandResults, "product-mega-flow-compose");
  const artifact = findArtifact(commandResult, (item) => item?.kind === "newsportal-product-mega-flow-proof");
  if (!artifact) {
    return {
      status: commandResult?.status === "passed"
        ? PRODUCT_TOTAL_LIVE_STATUSES.passed
        : PRODUCT_TOTAL_LIVE_STATUSES.failed,
      reason: commandResult?.status === "passed" ? null : "product_mega_flow_command_failed",
      finalVerdict: null,
      runtimeVerdict: null,
      yieldVerdict: null,
    };
  }
  const finalVerdict = artifactFinalVerdict(artifact);
  return {
    status: finalVerdict === "pass" ? PRODUCT_TOTAL_LIVE_STATUSES.passed : PRODUCT_TOTAL_LIVE_STATUSES.failed,
    reason: finalVerdict === "pass" ? null : `product_mega_flow_final_verdict_${finalVerdict || "unknown"}`,
    finalVerdict,
    runtimeVerdict: artifact.runtimeVerdict ?? null,
    yieldVerdict: artifact.yieldVerdict ?? null,
    liveSelectedArticleCounts: asArray(artifact.scenarios).map((scenario) => ({
      key: scenario.key,
      selectedFinalRows: scenario.liveSelectedArticleEvidence?.selectedFinalRows ?? 0,
    })),
  };
}

export function determineProductTotalLiveAuditVerdict(input) {
  const commandResults = asArray(input?.commandResults);
  const hasRequiredOverride = Object.prototype.hasOwnProperty.call(asObject(input), "requiredCommands");
  const hasDiagnosticOverride = Object.prototype.hasOwnProperty.call(asObject(input), "diagnosticCommands");
  const requiredKeys = hasRequiredOverride
    ? asArray(input.requiredCommands).map((item) => item.key)
    : PRODUCT_TOTAL_LIVE_REQUIRED_COMMANDS.map((item) => item.key);
  const diagnosticKeys = hasDiagnosticOverride
    ? asArray(input.diagnosticCommands).map((item) => item.key)
    : PRODUCT_TOTAL_LIVE_DIAGNOSTIC_COMMANDS.map((item) => item.key);
  const envStatus = normalizeText(input?.env?.status || "passed");
  const commandSummaries = Object.fromEntries(
    commandResults.map((item) => [item.key, summarizeRequiredCommand(item)])
  );
  const requiredMissing = requiredKeys.filter((key) => !findCommand(commandResults, key));
  const requiredFailures = requiredKeys
    .map((key) => findCommand(commandResults, key))
    .filter((item) => item && item.status !== "passed");
  const diagnosticSummaries = Object.fromEntries(
    diagnosticKeys
      .map((key) => findCommand(commandResults, key))
      .filter(Boolean)
      .map((item) => [item.key, classifyDiagnosticCommand(item)])
  );
  const providerEvidence = summarizeProviderExternalResiduals(commandResults);
  const strictMegaFlow = megaFlowEvidence(commandResults);
  const diagnosticFailures = Object.entries(diagnosticSummaries)
    .filter(([, summary]) => summary.status === PRODUCT_TOTAL_LIVE_STATUSES.failed)
    .map(([key, summary]) => ({ key, reason: summary.reason }));
  const diagnosticWeak = Object.entries(diagnosticSummaries)
    .filter(([, summary]) => summary.status === PRODUCT_TOTAL_LIVE_STATUSES.weak)
    .map(([key, summary]) => ({ key, reason: summary.reason }));
  const providerFailures = [
    providerEvidence.rss,
    providerEvidence.website,
    providerEvidence.api.fixture,
    providerEvidence.emailImap.fixture,
  ].filter((item) => item.status === PRODUCT_TOTAL_LIVE_STATUSES.failed);

  const failReasons = [
    ...(envStatus === "failed" ? asArray(input?.env?.failures) : []),
    ...requiredMissing.map((key) => `${key} did not run`),
    ...requiredFailures.map((item) => `${item.key} failed with exit ${item.exitCode ?? "unknown"}`),
    ...(strictMegaFlow.status === PRODUCT_TOTAL_LIVE_STATUSES.failed ? [strictMegaFlow.reason] : []),
    ...providerFailures.map((item) => item.reason),
    ...diagnosticFailures.map((item) => `${item.key}: ${item.reason}`),
  ].filter(Boolean);
  const runtimeVerdict = failReasons.length === 0 ? "pass" : "fail";
  const finalVerdict =
    runtimeVerdict === "fail"
      ? "fail"
      : diagnosticWeak.length > 0
        ? "weak"
        : "pass";

  return {
    runtimeVerdict,
    finalVerdict,
    strictMegaFlow,
    providerEvidence,
    commandSummaries,
    diagnosticSummaries,
    diagnosticWeak,
    diagnosticFailures,
    requiredMissing,
    requiredFailures: requiredFailures.map((item) => item.key),
    failReasons,
  };
}
