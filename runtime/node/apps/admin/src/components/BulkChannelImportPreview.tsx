import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@signalops/ui";

import {
  formatAdminChannelProviderLabel,
  type AdminChannelProviderType,
} from "../lib/channel-providers";

export interface BulkImportPreflightItem {
  index: number;
  providerType: AdminChannelProviderType | string | null;
  name: string | null;
  fetchUrl: string | null;
  status?: string;
  action: "create" | "update" | "skip" | null;
  matchType: "create" | "channelId" | "fetchUrl" | "duplicate" | null;
  channelId: string | null;
  existingName: string | null;
  existingFetchUrl: string | null;
  warnings?: string[];
  errors?: string[];
}

export interface BulkImportProviderBreakdown {
  providerType: AdminChannelProviderType;
  total: number;
  wouldCreate: number;
  wouldUpdate: number;
}

export interface BulkImportPreflightResult {
  ok: boolean;
  wouldCreate: number;
  wouldUpdate: number;
  matchedByChannelId: number;
  matchedByFetchUrl: number;
  items: BulkImportPreflightItem[];
  providerBreakdown: BulkImportProviderBreakdown[];
  blocked?: BulkImportPreflightItem[];
  warnings?: string[];
  planFingerprint?: string;
}

export interface BulkImportViewModel {
  title: string;
  description: string;
  helpText: string;
  exampleJson: string;
  requiredFields: readonly string[];
  fieldSchema: Record<string, { type: string; description: string }>;
}

export function formatProviderBreakdown(
  providerBreakdown: BulkImportProviderBreakdown[]
): string {
  return providerBreakdown
    .map((item) => {
      const providerLabel = formatAdminChannelProviderLabel(item.providerType);
      return `${providerLabel} ${item.total}`;
    })
    .join(", ");
}

function formatProviderLabel(providerType: AdminChannelProviderType | string | null): string {
  return providerType === "rss" ||
    providerType === "website" ||
    providerType === "api" ||
    providerType === "email_imap"
    ? formatAdminChannelProviderLabel(providerType)
    : String(providerType ?? "unknown");
}

export function BulkImportPreflightSummary({
  preflightResult,
  blockedItems,
}: {
  preflightResult: BulkImportPreflightResult;
  blockedItems: BulkImportPreflightItem[];
}) {
  return (
    <div className={`rounded-md border p-2.5 ${
      blockedItems.length > 0
        ? "border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20"
        : "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20"
    }`}>
      <p className={`text-xs font-medium ${
        blockedItems.length > 0
          ? "text-amber-700 dark:text-amber-300"
          : "text-emerald-700 dark:text-emerald-300"
      }`}>
        {blockedItems.length > 0 ? "Preflight blocked" : "Preflight ready"}
      </p>
      <p className={`mt-1 text-[11px] ${
        blockedItems.length > 0
          ? "text-amber-700/90 dark:text-amber-300/90"
          : "text-emerald-700/90 dark:text-emerald-300/90"
      }`}>
        {preflightResult.wouldCreate} create
        {preflightResult.wouldCreate === 1 ? "" : "s"} and{" "}
        {preflightResult.wouldUpdate} update
        {preflightResult.wouldUpdate === 1 ? "" : "s"}.
        {preflightResult.providerBreakdown.length > 0 && (
          <> {formatProviderBreakdown(preflightResult.providerBreakdown)}.</>
        )}
        {preflightResult.matchedByChannelId > 0 && (
          <> {preflightResult.matchedByChannelId} matched by channel ID.</>
        )}
        {preflightResult.matchedByFetchUrl > 0 && (
          <> {preflightResult.matchedByFetchUrl} matched by fetch URL.</>
        )}
      </p>
      {blockedItems.length > 0 && (
        <ul className="mt-2 space-y-1 text-[11px] text-amber-700/90 dark:text-amber-300/90">
          {blockedItems.slice(0, 5).map((item) => (
            <li key={`${item.index}-${item.providerType}-${item.fetchUrl}`}>
              Row {item.index + 1}: status={item.status ?? "blocked"}
              {item.warnings?.[0] ? `, ${item.warnings[0]}` : ""}
              {item.errors?.[0] ? `, ${item.errors[0]}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BulkImportValidationErrors({
  validationErrors,
}: {
  validationErrors: string[];
}) {
  if (validationErrors.length === 0) {
    return null;
  }
  return (
    <div className="rounded-md border border-red-200 bg-red-50/50 p-2.5 dark:border-red-900/40 dark:bg-red-950/20">
      <p className="mb-1 text-xs font-medium text-red-600 dark:text-red-400">
        Validation errors:
      </p>
      <ul className="list-inside list-disc space-y-0.5">
        {validationErrors.map((message, index) => (
          <li key={index} className="text-[11px] text-red-600 dark:text-red-400">
            {message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BulkImportPendingOverwriteReview({
  updateItems,
}: {
  updateItems: BulkImportPreflightItem[];
}) {
  if (updateItems.length === 0) {
    return null;
  }
  return (
    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
      <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
        Pending overwrite review
      </p>
      <ul className="mt-2 space-y-1 text-[11px] text-amber-700/90 dark:text-amber-300/90">
        {updateItems.slice(0, 5).map((item) => (
          <li key={`${item.index}-${item.providerType}-${item.fetchUrl}`}>
            Row {item.index + 1}: {formatProviderLabel(item.providerType)}{" "}
            {item.name} via{" "}
            {item.matchType === "fetchUrl" ? "fetchUrl match" : "channelId"} to{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-900/40">
              {item.channelId ?? "unknown"}
            </code>
            {item.existingName ? ` (${item.existingName})` : ""}
          </li>
        ))}
      </ul>
      {updateItems.length > 5 && (
        <p className="mt-2 text-[11px] text-amber-700/90 dark:text-amber-300/90">
          And {updateItems.length - 5} more update target
          {updateItems.length - 5 === 1 ? "" : "s"} in this payload.
        </p>
      )}
    </div>
  );
}

export function BulkImportFieldReference({
  viewModel,
}: {
  viewModel: BulkImportViewModel;
}) {
  return (
    <div className="mt-3">
      <Collapsible>
        <CollapsibleTrigger className="text-[11px] text-primary hover:underline">
          Field reference
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 rounded-md border border-border bg-muted/30 p-3">
          <table className="admin-table w-full text-[11px]">
            <thead>
              <tr className="border-b border-border">
                <th className="py-1 text-left font-medium">Field</th>
                <th className="py-1 text-left font-medium">Type</th>
                <th className="py-1 text-left font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(viewModel.fieldSchema).map(([field, info]) => (
                <tr key={field} className="border-b border-border last:border-0">
                  <td className="py-1 align-top font-mono">
                    {field}
                    {viewModel.requiredFields.includes(field) && (
                      <span className="ml-0.5 text-red-500">*</span>
                    )}
                  </td>
                  <td className="py-1 align-top text-muted-foreground">{info.type}</td>
                  <td className="py-1 align-top text-muted-foreground">{info.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
