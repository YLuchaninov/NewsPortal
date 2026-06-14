import type { SourceProviderType } from "./model";
import providerCapabilityRegistry from "./provider-capabilities.json";

export type ProviderCapabilityStatus =
  | "beta_runtime"
  | "delivery_only"
  | "future_hidden";

export type SignalOpsProviderLane = SourceProviderType | "telegram";

export interface ProviderCapability {
  providerType: SignalOpsProviderLane;
  label: string;
  status: ProviderCapabilityStatus;
  ingestRuntime: boolean;
  adminCreateVisible: boolean;
  bulkImportVisible: boolean;
  betaRequired: boolean;
  diagnosticOnly: boolean;
}

export const PROVIDER_CAPABILITY_STATUSES = [
  "beta_runtime",
  "delivery_only",
  "future_hidden",
] as const satisfies readonly ProviderCapabilityStatus[];

export const SIGNALOPS_PROVIDER_CAPABILITIES = validateProviderCapabilityRegistry(
  providerCapabilityRegistry as readonly ProviderCapability[]
);

export type BetaIngestProviderType = Extract<
  SignalOpsProviderLane,
  "rss" | "website" | "api" | "email_imap"
>;

export const BETA_INGEST_PROVIDER_TYPES = SIGNALOPS_PROVIDER_CAPABILITIES
  .filter((item) => item.status === "beta_runtime" && item.ingestRuntime)
  .map((item) => item.providerType) as BetaIngestProviderType[];

export const ADMIN_CREATE_PROVIDER_TYPES = SIGNALOPS_PROVIDER_CAPABILITIES
  .filter((item) => item.adminCreateVisible)
  .map((item) => item.providerType) as BetaIngestProviderType[];

export const BULK_IMPORT_PROVIDER_TYPES = SIGNALOPS_PROVIDER_CAPABILITIES
  .filter((item) => item.bulkImportVisible)
  .map((item) => item.providerType) as BetaIngestProviderType[];

function validateProviderCapabilityRegistry(
  registry: readonly ProviderCapability[]
): readonly ProviderCapability[] {
  const seen = new Set<string>();
  for (const item of registry) {
    if (seen.has(item.providerType)) {
      throw new Error(`Duplicate provider capability: ${item.providerType}`);
    }
    seen.add(item.providerType);
    if (!PROVIDER_CAPABILITY_STATUSES.includes(item.status)) {
      throw new Error(`Unknown provider capability status: ${item.status}`);
    }
  }
  return registry;
}

export function getProviderCapability(providerType: SignalOpsProviderLane): ProviderCapability {
  const capability = SIGNALOPS_PROVIDER_CAPABILITIES.find(
    (item) => item.providerType === providerType
  );
  if (!capability) {
    throw new Error(`Unknown provider capability: ${providerType}`);
  }
  return capability;
}

export function isBetaIngestProviderType(value: string): value is BetaIngestProviderType {
  return (BETA_INGEST_PROVIDER_TYPES as readonly string[]).includes(value);
}

export function formatProviderCapabilityLabel(providerType: SignalOpsProviderLane): string {
  return getProviderCapability(providerType).label;
}
