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
interface BulkChannelImportProps {
  action: string;
  redirectTo?: string;
}
const REQUIRED_FIELDS = ["name", "fetchUrl"] as const;
const FIELD_SCHEMA: Record<string, { type: string; description: string }> = {
  name: { type: "string", description: "Channel display name" },
  fetchUrl: { type: "string (URL)", description: "RSS feed URL" },
  language: { type: "string", description: "ISO language code (default: en)" },
  pollIntervalSeconds: { type: "number", description: "Base poll interval in seconds (default: 300)" },
  adaptiveEnabled: { type: "boolean", description: "Enable adaptive polling (default: true)" },
  maxPollIntervalSeconds: { type: "number", description: "Max interval when adaptive (default: pollInterval * 16)" },
  maxItemsPerPoll: { type: "number", description: "Max items per fetch (default: 20)" },
  requestTimeoutMs: { type: "number", description: "Request timeout in ms (default: 10000)" },
  enrichmentEnabled: { type: "boolean", description: "Enable pre-normalize article enrichment (default: true)" },
  enrichmentMinBodyLength: { type: "number", description: "Skip enrichment when body length already exceeds this threshold (default: 500)" },
  isActive: { type: "boolean", description: "Start fetching immediately (default: true)" },
};
const EXAMPLE_JSON = JSON.stringify([
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
], null, 2);
interface ValidationError {
  index: number;
  field: string;
  message: string;
}

function countOverwriteRows(raw: string): number {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return 0;
    }
    return parsed.filter((item) => {
      if (item == null || typeof item !== "object" || Array.isArray(item)) {
        return false;
      }
      const channelId = (item as { channelId?: unknown }).channelId;
      return typeof channelId === "string" && channelId.trim().length > 0;
    }).length;
  } catch {
    return 0;
  }
}

function validateChannels(raw: string): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { valid: false, errors: [{ index: -1, field: "json", message: "Invalid JSON: " + (e as Error).message }] };
  }
  if (!Array.isArray(parsed)) {
    return { valid: false, errors: [{ index: -1, field: "json", message: "Root must be a JSON array of channel objects." }] };
  }
  if (parsed.length === 0) {
    return { valid: false, errors: [{ index: -1, field: "json", message: "Array is empty. Add at least one channel." }] };
  }
  parsed.forEach((item, idx) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      errors.push({ index: idx, field: "item", message: "Item " + (idx + 1) + " is not an object." });
      return;
    }
    const obj = item as Record<string, unknown>;
    for (const req of REQUIRED_FIELDS) {
      if (!obj[req] || String(obj[req]).trim() === "") {
        errors.push({ index: idx, field: req, message: "Item " + (idx + 1) + ': missing required field "' + req + '".' });
      }
    }
    if (obj.fetchUrl && typeof obj.fetchUrl === "string") {
      try { new URL(obj.fetchUrl); } catch { errors.push({ index: idx, field: "fetchUrl", message: "Item " + (idx + 1) + ': "' + obj.fetchUrl + '" is not a valid URL.' }); }
    }
    if (obj.pollIntervalSeconds !== undefined && (typeof obj.pollIntervalSeconds !== "number" || obj.pollIntervalSeconds < 30)) {
      errors.push({ index: idx, field: "pollIntervalSeconds", message: "Item " + (idx + 1) + ": pollIntervalSeconds must be >= 30." });
    }
  });
  return { valid: errors.length === 0, errors };
}
export function BulkChannelImport({ action, redirectTo }: BulkChannelImportProps) {
  const [json, setJson] = useState("");
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const confirmOverwriteRef = useRef<HTMLInputElement | null>(null);
  const overwriteCount = countOverwriteRows(json);
  const requiresOverwriteConfirmation = overwriteCount > 0;

  function resetOverwriteConfirmation() {
    if (confirmOverwriteRef.current) {
      confirmOverwriteRef.current.value = "false";
    }
  }

  function validateCurrentJson(): boolean {
    const { valid, errors } = validateChannels(json);
    setValidationErrors(errors);
    return valid;
  }

  function handleSubmit(e: React.FormEvent) {
    const valid = validateCurrentJson();
    if (!valid) {
      resetOverwriteConfirmation();
      e.preventDefault();
      return;
    }

    if (
      requiresOverwriteConfirmation &&
      confirmOverwriteRef.current?.value !== "true"
    ) {
      e.preventDefault();
      setConfirmOpen(true);
    }
  }

  function handleReviewUpdates() {
    resetOverwriteConfirmation();
    if (validateCurrentJson()) {
      setConfirmOpen(true);
    }
  }

  function handleConfirmOverwrite() {
    if (confirmOverwriteRef.current) {
      confirmOverwriteRef.current.value = "true";
    }
    setConfirmOpen(false);
    formRef.current?.requestSubmit();
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-semibold text-sm mb-1">Bulk Import</h2>
      <p className="text-[11px] text-muted-foreground mb-3">
        Paste a JSON array of channel objects to import multiple RSS feeds at once.
        Required: <code className="rounded bg-muted px-1 py-0.5">name</code>,{" "}
        <code className="rounded bg-muted px-1 py-0.5">fetchUrl</code>.
      </p>
      <form
        ref={formRef}
        method="post"
        action={action}
        onSubmit={handleSubmit}
        className="grid gap-2 h-[calc(100%-2rem)]"
      >
        {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
        <input ref={confirmOverwriteRef} type="hidden" name="confirmOverwrite" defaultValue="false" />
        <FormField
          label="Channels JSON"
          name="bulk-channel-json"
          required
          helpText="Paste a JSON array of RSS channel objects. Each item needs at least name and fetchUrl."
          helpWide
        >
          <Textarea
            id="bulk-channel-json"
            name="channelsJson"
            rows={12}
            value={json}
            onChange={(e) => {
              setJson(e.target.value);
              setValidationErrors([]);
              resetOverwriteConfirmation();
            }}
            placeholder={EXAMPLE_JSON}
            className="h-full min-h-[14rem] flex-1 text-xs font-mono"
          />
        </FormField>
        {requiresOverwriteConfirmation && (
          <div className="rounded-md border border-amber-200 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20 p-2.5">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Overwrite confirmation required</p>
            <p className="mt-1 text-[11px] text-amber-700/90 dark:text-amber-300/90">
              This payload includes {overwriteCount} channel{overwriteCount === 1 ? "" : "s"} with a
              <code className="mx-1 rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-900/40">channelId</code>
              field, so the import will update existing records instead of creating new ones.
            </p>
          </div>
        )}
        {validationErrors.length > 0 && (
          <div className="rounded-md border border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20 p-2.5">
            <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Validation errors:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {validationErrors.map((err, i) => (
                <li key={i} className="text-[11px] text-red-600 dark:text-red-400">{err.message}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {requiresOverwriteConfirmation ? (
            <button
              type="button"
              onClick={handleReviewUpdates}
              className="h-8 px-4 rounded-md bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
            >
              Review updates
            </button>
          ) : (
            <button type="submit" className="h-8 px-4 rounded-md bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors">Import JSON</button>
          )}
          <button type="button" onClick={() => { const { errors } = validateChannels(json); setValidationErrors(errors); }} className="h-8 px-3 rounded-md border border-input text-xs hover:bg-accent transition-colors">Validate</button>
          <button type="button" onClick={() => { setJson(EXAMPLE_JSON); setValidationErrors([]); resetOverwriteConfirmation(); }} className="h-8 px-3 rounded-md border border-input text-xs hover:bg-accent transition-colors">Load example</button>
        </div>
      </form>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm bulk channel updates</AlertDialogTitle>
            <AlertDialogDescription>
              This import will overwrite {overwriteCount} existing channel{overwriteCount === 1 ? "" : "s"} because the JSON payload includes stable channel IDs. Review the payload carefully before continuing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={handleConfirmOverwrite}>
              Overwrite {overwriteCount} channel{overwriteCount === 1 ? "" : "s"}
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
              <thead><tr className="border-b border-border"><th className="text-left py-1 font-medium">Field</th><th className="text-left py-1 font-medium">Type</th><th className="text-left py-1 font-medium">Description</th></tr></thead>
              <tbody>
                {Object.entries(FIELD_SCHEMA).map(([field, info]) => (
                  <tr key={field} className="border-b border-border last:border-0">
                    <td className="py-1 font-mono">{field}{(REQUIRED_FIELDS as readonly string[]).includes(field) && <span className="text-red-500 ml-0.5">*</span>}</td>
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
