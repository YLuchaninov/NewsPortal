export {
  DETERMINISTIC_SCENARIO_GROUPS,
  DETERMINISTIC_SCENARIO_ORDER,
} from "./mcp-http-scenario-catalog.mjs";
import {
  formatDeterministicReportMarkdown as formatDeterministicReportMarkdownFromRunner,
  resolveDeterministicScenarioKeys,
  runDeterministicScenarioFromMap,
} from "./mcp-http-scenario-runner.mjs";
export {
  readSourceInventoryScopeStatus,
  buildMcpScenarioApiUrl,
} from "./mcp-http-scenarios/shared.mjs";
import {
  scenarioAuthAndTokenLifecycle,
  scenarioNegativeScopeAndDestructivePolicy,
} from "./mcp-http-scenarios/auth.mjs";
import {
  scenarioProtocolDiscovery,
  scenarioReadOnlyOperatorNeeds,
  scenarioRequestLogAndAuditEvidence,
  scenarioDocParityMatrix,
} from "./mcp-http-scenarios/reads.mjs";
import {
  scenarioTemplateInterestChannelFlows,
  scenarioSequenceOperatorFlows,
} from "./mcp-http-scenarios/writes.mjs";
import {
  scenarioDiscoveryOperatorFlows,
  scenarioDiscoveryVnextFullFlow,
} from "./mcp-http-scenarios/discovery.mjs";
import { scenarioContentAnalysisOperatorFlows } from "./mcp-http-scenarios/content-analysis.mjs";
import { scenarioFunnelAutopilotFlows } from "./mcp-http-scenarios/funnels.mjs";
import { scenarioIngressAdapterOperatorFlows } from "./mcp-http-scenarios/ingress-adapters.mjs";

export const DETERMINISTIC_SCENARIOS = {
  "auth-and-token-lifecycle": scenarioAuthAndTokenLifecycle,
  "protocol-discovery": scenarioProtocolDiscovery,
  "template-interest-channel-flows": scenarioTemplateInterestChannelFlows,
  "sequence-operator-flows": scenarioSequenceOperatorFlows,
  "discovery-operator-flows": scenarioDiscoveryOperatorFlows,
  "discovery-vnext-full-flow": scenarioDiscoveryVnextFullFlow,
  "content-analysis-operator-flows": scenarioContentAnalysisOperatorFlows,
  "funnel-autopilot-flows": scenarioFunnelAutopilotFlows,
  "read-only-operator-needs": scenarioReadOnlyOperatorNeeds,
  "negative-scope-and-destructive-policy": scenarioNegativeScopeAndDestructivePolicy,
  "ingress-adapter-operator-flows": scenarioIngressAdapterOperatorFlows,
  "request-log-and-audit-evidence": scenarioRequestLogAndAuditEvidence,
  "doc-parity-matrix": scenarioDocParityMatrix,
};

export function resolveDeterministicScenarios({ scenarios = [], group } = {}) {
  return resolveDeterministicScenarioKeys({ scenarios, group });
}

export async function runDeterministicScenario(harness, scenarioKey) {
  return runDeterministicScenarioFromMap(harness, scenarioKey, DETERMINISTIC_SCENARIOS);
}

export function formatDeterministicReportMarkdown(report) {
  return formatDeterministicReportMarkdownFromRunner(report);
}
