import {
  OPERATING_DOMAIN_VALUES,
  getDiagnosticsGuide,
  getTuningGuide,
} from "../operating-intelligence";
import type { McpResourceDefinition } from "./types";

export const generatedGuideResources = OPERATING_DOMAIN_VALUES.flatMap((domain) => [
    {
      uri: `signalops://guide/diagnostics/${domain}`,
      name: `guide.diagnostics.${domain}`,
      title: `Diagnostics ${domain}`,
      description: `Operational diagnostics guide for ${domain}.`,
      mimeType: "application/json",
      read: async () => getDiagnosticsGuide(domain),
    },
    {
      uri: `signalops://guide/tuning/${domain}`,
      name: `guide.tuning.${domain}`,
      title: `Tuning ${domain}`,
      description: `Fine-tuning guide for ${domain}.`,
      mimeType: "application/json",
      read: async () => getTuningGuide(domain),
    },
] satisfies McpResourceDefinition[]);
