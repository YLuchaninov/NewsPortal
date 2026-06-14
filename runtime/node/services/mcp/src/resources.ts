import { buildDisplayTitle, buildResourceAnnotations } from "./context";
import { JsonRpcError, readRequiredString } from "./protocol";
import { generatedGuideResources } from "./resources/generated-guides";
import { operationalStatusResources, operatorDataResources } from "./resources/ops";
import { operatorFlowPlaybookResources, operatorPlaybookResources } from "./resources/playbooks";
import { referenceResources } from "./resources/reference";
import { scenarioResources } from "./resources/scenarios";
import { operatingModelGuideResources, serverGuideResources } from "./resources/server-guides";
import type { McpResourceDefinition } from "./resources/types";

export type { McpResourceDefinition } from "./resources/types";

// Parity anchor for the public resource facade after group extraction:
// PostgreSQL is business truth/source of truth; Redis, BullMQ and queues are derived transport state.
// Sequence-managed events route only through q.sequence and the sequence runtime.
// MCP resources are operator truth for MCP control-plane sessions; product docs are developer/operator documentation truth; .aidp is agent-runtime truth.
export const MCP_RESOURCES: readonly McpResourceDefinition[] = [
  ...operatingModelGuideResources,
  ...operatorFlowPlaybookResources,
  ...generatedGuideResources,
  ...operationalStatusResources,
  ...serverGuideResources,
  ...referenceResources,
  ...operatorPlaybookResources,
  ...scenarioResources,
  ...operatorDataResources,
];

export function listMcpResources() {
  return MCP_RESOURCES.map((resource) => ({
    uri: resource.uri,
    name: resource.name,
    title: resource.title ?? buildDisplayTitle(resource.name),
    description: resource.description,
    mimeType: resource.mimeType,
    annotations: resource.annotations ?? buildResourceAnnotations(resource.uri),
  }));
}

export function resolveMcpResource(uri: string): McpResourceDefinition {
  const normalized = readRequiredString(uri, "uri");
  const resource = MCP_RESOURCES.find((entry) => entry.uri === normalized);
  if (!resource) {
    throw new JsonRpcError(-32602, `Unknown MCP resource "${normalized}".`, {
      statusCode: 404,
    });
  }
  return resource;
}
