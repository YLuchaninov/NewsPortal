import { useRef, useState } from "react";
import type React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  FormField,
  Textarea,
} from "@newsportal/ui";

export type BulkChannelImportProviderType = "rss" | "website";

interface BulkChannelImportProps {
  action: string;
  preflightAction: string;
  redirectTo?: string;
  providerType?: BulkChannelImportProviderType;
}

interface BulkImportPreflightItem {
  index: number;
  name: string;
  fetchUrl: string;
  action: "create" | "update";
  matchType: "create" | "channelId" | "fetchUrl";
  channelId: string | null;
  existingName: string | null;
  existingFetchUrl: string | null;
}

interface BulkImportPreflightResult {
  ok: boolean;
  providerType: BulkChannelImportProviderType;
  wouldCreate: number;
  wouldUpdate: number;
  matchedByChannelId: number;
  matchedByFetchUrl: number;
  items: BulkImportPreflightItem[];
}

interface BulkImportViewModel {
  title: string;
  description: string;
  helpText: string;
  exampleJson: string;
  requiredFields: readonly string[];
  fieldSchema: Record<string, { type: string; description: string }>;
}

const BULK_IMPORT_VIEW_MODELS: Record<
  BulkChannelImportProviderType,
  BulkImportViewModel
> = {
  rss: {
    title: "Bulk Import",
    description:
      "Paste a JSON array of RSS channel objects to import multiple feeds at once.",
    helpText:
      'Required: "name" and "fetchUrl". Include "channelId" only when you want to update an existing RSS channel.',
    exampleJson: JSON.stringify(
      [
        {
          name: "Reuters World News",
          fetchUrl: "https://feeds.reuters.com/reuters/worldNews",
          language: "en",
          pollIntervalSeconds: 300,
          adaptiveEnabled: true,
          maxPollIntervalSeconds: 3600,
          maxItemsPerPoll: 25,
          enrichmentEnabled: true,
          enrichmentMinBodyLength: 500,
          isActive: true,
        },
        {
          name: "BBC News Top Stories",
          fetchUrl: "https://feeds.bbci.co.uk/news/rss.xml",
          language: "en",
          pollIntervalSeconds: 600,
          adaptiveEnabled: true,
          isActive: true,
        },
      ],
      null,
      2
    ),
    requiredFields: ["name", "fetchUrl"],
    fieldSchema: {
      name: { type: "string", description: "Channel display name" },
      fetchUrl: { type: "string (URL)", description: "RSS feed URL" },
      channelId: {
        type: "string",
        description: "Optional stable channel ID when updating an existing RSS channel",
      },
      language: { type: "string", description: "ISO language code (default: en)" },
      pollIntervalSeconds: {
        type: "number",
        description: "Base poll interval in seconds (default: 300)",
      },
      adaptiveEnabled: {
        type: "boolean",
        description: "Enable adaptive polling (default: true)",
      },
      maxPollIntervalSeconds: {
        type: "number",
        description: "Max interval when adaptive (default: pollInterval * 16)",
      },
      maxItemsPerPoll: {
        type: "number",
        description: "Max items per fetch (default: 20)",
      },
      requestTimeoutMs: {
        type: "number",
        description: "Request timeout in ms (default: 10000)",
      },
      userAgent: {
        type: "string",
        description: "Custom request identity for upstream fetches",
      },
      preferContentEncoded: {
        type: "boolean",
        description: "Prefer content:encoded when the feed provides it",
      },
      adapterStrategy: {
        type: "string",
        description: "Optional feed-ingress adapter override",
      },
      maxEntryAgeHours: {
        type: "number",
        description: "Optional stale-entry cutoff in hours",
      },
      enrichmentEnabled: {
        type: "boolean",
        description: "Enable pre-normalize article enrichment (default: true)",
      },
      enrichmentMinBodyLength: {
        type: "number",
        description:
          "Skip enrichment when body length already exceeds this threshold (default: 500)",
      },
      authorizationHeader: {
        type: "string",
        description: "Optional raw Authorization header value",
      },
      clearAuthorizationHeader: {
        type: "boolean",
        description: "Clear the stored Authorization header on update",
      },
      isActive: { type: "boolean", description: "Start fetching immediately (default: true)" },
    },
  },
  website: {
    title: "Bulk Import",
    description:
      "Paste a JSON array of website channel objects to bulk create or update site-entry onboarding with the same operator-safe discovery contract used by the manual form.",
    helpText:
      'Required: "name" and "fetchUrl". Existing website channels update by explicit "channelId" or by exact normalized "fetchUrl" match.',
    exampleJson: JSON.stringify(
      [
        {
          name: "EU Data Portal",
          fetchUrl: "https://example.com/",
          language: "en",
          pollIntervalSeconds: 900,
          adaptiveEnabled: true,
          maxPollIntervalSeconds: 14400,
          requestTimeoutMs: 10000,
          totalPollTimeoutMs: 60000,
          userAgent: "NewsPortalFetchers/0.1 (+https://newsportal.local)",
          maxResourcesPerPoll: 20,
          crawlDelayMs: 1000,
          sitemapDiscoveryEnabled: true,
          feedDiscoveryEnabled: true,
          collectionDiscoveryEnabled: true,
          downloadDiscoveryEnabled: true,
          browserFallbackEnabled: false,
          collectionSeedUrls: [
            "https://example.com/datasets",
            "https://example.com/archive"
          ],
          allowedUrlPatterns: ["/datasets/", "/news/"],
          blockedUrlPatterns: ["/login", "/privacy"],
          isActive: true
        },
        {
          name: "Protected Startup Directory",
          fetchUrl: "https://partners.example.com/",
          pollIntervalSeconds: 1800,
          maxResourcesPerPoll: 12,
          browserFallbackEnabled: true,
          authorizationHeader: "Bearer website-token",
          isActive: true
        }
      ],
      null,
      2
    ),
    requiredFields: ["name", "fetchUrl"],
    fieldSchema: {
      name: { type: "string", description: "Channel display name" },
      fetchUrl: { type: "string (URL)", description: "Website entry URL" },
      channelId: {
        type: "string",
        description: "Optional stable channel ID when updating a known website channel",
      },
      language: { type: "string", description: "ISO language code (default: en)" },
      pollIntervalSeconds: {
        type: "number",
        description: "Base poll interval in seconds (default: 900)",
      },
      adaptiveEnabled: {
        type: "boolean",
        description: "Enable adaptive polling (default: true)",
      },
      maxPollIntervalSeconds: {
        type: "number",
        description: "Max interval when adaptive (default: pollInterval * 16)",
      },
      requestTimeoutMs: {
        type: "number",
        description: "Per-request timeout in ms (default: 10000)",
      },
      totalPollTimeoutMs: {
        type: "number",
        description: "Whole-poll timeout ceiling in ms (default: 60000)",
      },
      userAgent: {
        type: "string",
        description: "Custom request identity for website probing",
      },
      maxResourcesPerPoll: {
        type: "number",
        description: "Max discovered resources persisted from one poll (default: 20)",
      },
      crawlDelayMs: {
        type: "number",
        description: "Minimum same-site delay between requests in ms (default: 1000)",
      },
      sitemapDiscoveryEnabled: {
        type: "boolean",
        description: "Probe declared sitemaps first",
      },
      feedDiscoveryEnabled: {
        type: "boolean",
        description: "Treat discovered feeds as website hints only",
      },
      collectionDiscoveryEnabled: {
        type: "boolean",
        description: "Scan listing and directory pages",
      },
      downloadDiscoveryEnabled: {
        type: "boolean",
        description: "Capture linked documents and data files",
      },
      browserFallbackEnabled: {
        type: "boolean",
        description: "Opt in to browser assistance for hard JS sites",
      },
      collectionSeedUrls: {
        type: "string[] | newline-separated string",
        description: "Optional seed URLs for listing or archive pages",
      },
      allowedUrlPatterns: {
        type: "string[] | newline-separated string",
        description: "Optional regex allowlist for persisted URLs",
      },
      blockedUrlPatterns: {
        type: "string[] | newline-separated string",
        description: "Optional regex blocklist for low-value URLs",
      },
      authorizationHeader: {
        type: "string",
        description: "Optional raw Authorization header value",
      },
      clearAuthorizationHeader: {
        type: "boolean",
        description:
          "Clear the stored Authorization header on update; omit both auth fields to preserve a matched website channel's existing header",
      },
      isActive: { type: "boolean", description: "Start fetching immediately (default: true)" },
    },
  },
};

export function getBulkChannelImportViewModel(
  providerType: BulkChannelImportProviderType
): BulkImportViewModel {
  return BULK_IMPORT_VIEW_MODELS[providerType];
}

export function BulkChannelImport({
  action,
  preflightAction,
  redirectTo,
  providerType = "rss",
}: BulkChannelImportProps) {
  const [json, setJson] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [preflightResult, setPreflightResult] =
    useState<BulkImportPreflightResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPreflighting, setIsPreflighting] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const confirmOverwriteRef = useRef<HTMLInputElement | null>(null);
  const viewModel = getBulkChannelImportViewModel(providerType);
  const updateItems =
    preflightResult?.items.filter((item) => item.action === "update") ?? [];

  function resetOverwriteConfirmation() {
    if (confirmOverwriteRef.current) {
      confirmOverwriteRef.current.value = "false";
    }
  }

  function clearPreviewState() {
    setValidationErrors([]);
    setPreflightResult(null);
    resetOverwriteConfirmation();
  }

  async function runPreflight(): Promise<BulkImportPreflightResult | null> {
    const rawJson = json.trim();
    if (!rawJson) {
      setPreflightResult(null);
      setValidationErrors(["Paste a JSON array of channel objects before validating."]);
      resetOverwriteConfirmation();
      return null;
    }

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(rawJson) as unknown;
    } catch (error) {
      setPreflightResult(null);
      setValidationErrors([
        `Invalid JSON: ${error instanceof Error ? error.message : "Unable to parse payload."}`,
      ]);
      resetOverwriteConfirmation();
      return null;
    }

    setIsPreflighting(true);
    try {
      const response = await fetch(preflightAction, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          providerType,
          channels: parsedPayload,
          redirectTo,
        }),
      });
      const payload = (await response.json()) as
        | BulkImportPreflightResult
        | { error?: string };

      if (!response.ok) {
        setPreflightResult(null);
        setValidationErrors([
          String(payload && "error" in payload ? payload.error ?? "Bulk preflight failed." : "Bulk preflight failed."),
        ]);
        resetOverwriteConfirmation();
        return null;
      }

      setValidationErrors([]);
      setPreflightResult(payload as BulkImportPreflightResult);
      resetOverwriteConfirmation();
      return payload as BulkImportPreflightResult;
    } catch (error) {
      setPreflightResult(null);
      setValidationErrors([
        error instanceof Error ? error.message : "Bulk preflight failed.",
      ]);
      resetOverwriteConfirmation();
      return null;
    } finally {
      setIsPreflighting(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    if (confirmOverwriteRef.current?.value === "true") {
      return;
    }

    event.preventDefault();
    const result = await runPreflight();
    if (!result) {
      return;
    }

    if (result.wouldUpdate > 0) {
      setConfirmOpen(true);
      return;
    }

    formRef.current?.submit();
  }

  async function handleValidate() {
    await runPreflight();
  }

  function handleConfirmOverwrite() {
    if (confirmOverwriteRef.current) {
      confirmOverwriteRef.current.value = "true";
    }
    setConfirmOpen(false);
    formRef.current?.submit();
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-1 text-sm font-semibold">{viewModel.title}</h2>
      <p className="mb-1 text-[11px] text-muted-foreground">{viewModel.description}</p>
      <p className="mb-3 text-[11px] text-muted-foreground">{viewModel.helpText}</p>
      <form
        ref={formRef}
        method="post"
        action={action}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="grid h-[calc(100%-2rem)] gap-2"
      >
        {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
        <input type="hidden" name="providerType" value={providerType} />
        <input
          ref={confirmOverwriteRef}
          type="hidden"
          name="confirmOverwrite"
          defaultValue="false"
        />
        <FormField
          label="Channels JSON"
          name="bulk-channel-json"
          required
          helpText={viewModel.helpText}
          helpWide
        >
          <Textarea
            id="bulk-channel-json"
            name="channelsJson"
            rows={12}
            value={json}
            onChange={(event) => {
              setJson(event.target.value);
              clearPreviewState();
            }}
            placeholder={viewModel.exampleJson}
            className="h-full min-h-[14rem] flex-1 font-mono text-xs"
          />
        </FormField>
        {preflightResult && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-2.5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Preflight ready
            </p>
            <p className="mt-1 text-[11px] text-emerald-700/90 dark:text-emerald-300/90">
              {preflightResult.wouldCreate} create
              {preflightResult.wouldCreate === 1 ? "" : "s"} and{" "}
              {preflightResult.wouldUpdate} update
              {preflightResult.wouldUpdate === 1 ? "" : "s"}.
              {preflightResult.matchedByChannelId > 0 && (
                <> {preflightResult.matchedByChannelId} matched by channel ID.</>
              )}
              {preflightResult.matchedByFetchUrl > 0 && (
                <> {preflightResult.matchedByFetchUrl} matched by fetch URL.</>
              )}
            </p>
          </div>
        )}
        {validationErrors.length > 0 && (
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
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={isPreflighting}
            className="h-8 rounded-md bg-secondary px-4 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPreflighting ? "Checking..." : "Import JSON"}
          </button>
          <button
            type="button"
            disabled={isPreflighting}
            onClick={() => {
              void handleValidate();
            }}
            className="h-8 rounded-md border border-input px-3 text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            Validate
          </button>
          <button
            type="button"
            onClick={() => {
              setJson(viewModel.exampleJson);
              clearPreviewState();
            }}
            className="h-8 rounded-md border border-input px-3 text-xs transition-colors hover:bg-accent"
          >
            Load example
          </button>
        </div>
      </form>
      {updateItems.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            Pending overwrite review
          </p>
          <ul className="mt-2 space-y-1 text-[11px] text-amber-700/90 dark:text-amber-300/90">
            {updateItems.slice(0, 5).map((item) => (
              <li key={`${item.index}-${item.fetchUrl}`}>
                Row {item.index + 1}: {item.name} via{" "}
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
      )}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm bulk channel updates</AlertDialogTitle>
            <AlertDialogDescription>
              This import will update {preflightResult?.wouldUpdate ?? 0} existing channel
              {(preflightResult?.wouldUpdate ?? 0) === 1 ? "" : "s"}.
              {(preflightResult?.matchedByFetchUrl ?? 0) > 0 && (
                <>
                  {" "}
                  {(preflightResult?.matchedByFetchUrl ?? 0)} match
                  {(preflightResult?.matchedByFetchUrl ?? 0) === 1 ? "" : "es"} came from
                  existing fetch URLs, so omitted website authorization headers will be preserved
                  unless you explicitly replace or clear them.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={handleConfirmOverwrite}>
              Overwrite {preflightResult?.wouldUpdate ?? 0} channel
              {(preflightResult?.wouldUpdate ?? 0) === 1 ? "" : "s"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="mt-3">
        <Collapsible>
          <CollapsibleTrigger className="text-[11px] text-primary hover:underline">
            Field reference
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 rounded-md border border-border bg-muted/30 p-3">
            <table className="w-full text-[11px]">
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
                    <td className="py-1 font-mono">
                      {field}
                      {viewModel.requiredFields.includes(field) && (
                        <span className="ml-0.5 text-red-500">*</span>
                      )}
                    </td>
                    <td className="py-1 text-muted-foreground">{info.type}</td>
                    <td className="py-1 text-muted-foreground">{info.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
