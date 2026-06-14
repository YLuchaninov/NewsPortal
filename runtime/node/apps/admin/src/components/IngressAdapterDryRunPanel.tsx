import { useMemo, useState } from "react";

import { Button, FormField, Input } from "@signalops/ui";

import { postJson, readText } from "./admin-client-helpers";
import { channelEditorInputClassName, channelEditorTextareaClassName } from "./channel-editor-form-model";

type DryRunResult = {
  status?: unknown;
  itemsPreview?: unknown;
  diagnostics?: unknown;
  providerMetrics?: unknown;
};

interface IngressAdapterDryRunPanelProps {
  action: string;
  adapterKey: string;
  providerType: string;
}

function renderJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

export function IngressAdapterDryRunPanel({
  action,
  adapterKey,
  providerType,
}: IngressAdapterDryRunPanelProps) {
  const [fetchUrl, setFetchUrl] = useState("");
  const [configJson, setConfigJson] = useState("{\n  \"itemsPath\": \"items\"\n}");
  const [limit, setLimit] = useState("5");
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const resultText = useMemo(() => renderJson(result), [result]);

  async function runDryRun() {
    setPending(true);
    setError("");
    setResult(null);
    try {
      const response = await postJson(action, {
        intent: "dry-run",
        adapterKey,
        providerType,
        fetchUrl,
        configJson,
        limit: Number.parseInt(limit, 10),
      });
      setResult(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dry-run failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Dry-run</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Runs the adapter preview path without writing signal_candidates, resources, cursors, outbox rows, or fetch runs.
          </p>
        </div>
        <Button type="button" onClick={runDryRun} disabled={pending || !fetchUrl.trim()}>
          {pending ? "Running..." : "Run"}
        </Button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <div className="grid gap-4">
          <FormField label="Fetch URL" name="adapter-dry-run-url" required>
            <Input
              id="adapter-dry-run-url"
              value={fetchUrl}
              onChange={(event) => setFetchUrl(event.currentTarget.value)}
              placeholder="https://example.com/api/items"
              className={channelEditorInputClassName}
            />
          </FormField>
          <FormField label="Config JSON" name="adapter-dry-run-config" helpWide>
            <textarea
              id="adapter-dry-run-config"
              value={configJson}
              onChange={(event) => setConfigJson(event.currentTarget.value)}
              rows={8}
              className={channelEditorTextareaClassName}
            />
          </FormField>
          <FormField label="Preview limit" name="adapter-dry-run-limit">
            <Input
              id="adapter-dry-run-limit"
              type="number"
              min={1}
              max={20}
              value={limit}
              onChange={(event) => setLimit(event.currentTarget.value)}
              className={channelEditorInputClassName}
            />
          </FormField>
        </div>

        <div className="rounded-lg border border-dashed border-border bg-background p-4">
          <p className="text-sm font-medium text-foreground">Result</p>
          {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
          {result ? (
            <div className="mt-3 space-y-3">
              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <span className="rounded-md bg-muted px-2 py-1">
                  status: {readText(result.status)}
                </span>
                <span className="rounded-md bg-muted px-2 py-1">
                  items: {Array.isArray(result.itemsPreview) ? result.itemsPreview.length : 0}
                </span>
                <span className="rounded-md bg-muted px-2 py-1">writes: none</span>
              </div>
              <pre className="max-h-96 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-50">
                {resultText}
              </pre>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No preview result yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}
