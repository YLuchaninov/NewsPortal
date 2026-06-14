import { formatAdminChannelProviderLabel } from "./channel-providers";
import type {
  BulkImportExecutionBreakdown,
  BulkImportExecutionResult,
  BulkImportProviderBreakdown,
} from "./channel-bulk-onboarding-model";
export {
  buildProviderShapeValidation,
  classifyChannelProviderShape
} from "./channel-provider-shape";
export type {
  ChannelProviderShapeAlternative,
  ChannelProviderShapeClassification,
  ChannelProviderShapeValidation
} from "./channel-provider-shape";
export type {
  BulkImportChannel,
  BulkImportExecutionBreakdown,
  BulkImportExecutionResult,
  BulkImportPlan,
  BulkImportPlanItem,
  BulkImportProviderBreakdown,
  BulkOnboardingApplyOptions,
  BulkOnboardingApplyResult,
  BulkOnboardingItemStatus,
  BulkOnboardingMode,
  BulkOnboardingPlan,
  BulkOnboardingPlanItem,
  BulkOnboardingPlanOptions,
  BulkOnboardingSummary,
  BulkOnboardingVerifyResult,
  ParsedBulkImportChannel,
} from "./channel-bulk-onboarding-model";

function formatBulkImportProviderSummary(
  providerBreakdown: Array<
    BulkImportProviderBreakdown | BulkImportExecutionBreakdown
  >
): string {
  return providerBreakdown
    .map((item) => {
      const total =
        "total" in item
          ? item.total
          : item.createdCount + item.updatedCount;
      return `${formatAdminChannelProviderLabel(item.providerType)} ${total}`;
    })
    .join(", ");
}

export function formatBulkImportSuccessMessage(
  result: BulkImportExecutionResult
): string {
  const createdCount = result.createdChannelIds.length;
  const updatedCount = result.updatedChannelIds.length;
  const providerSummary = formatBulkImportProviderSummary(result.providerBreakdown);

  if (updatedCount > 0) {
    return `Imported ${createdCount} new channel${createdCount === 1 ? "" : "s"} and updated ${updatedCount} existing channel${updatedCount === 1 ? "" : "s"}${providerSummary ? ` (${providerSummary})` : ""}`;
  }

  return `Imported ${createdCount} channel${createdCount === 1 ? "" : "s"}${providerSummary ? ` (${providerSummary})` : ""}`;
}
