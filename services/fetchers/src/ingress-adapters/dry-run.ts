import { ingressAdapterKeyToLegacyApiAdapterKey, parseApiChannelConfig } from "@signalops/contracts";

import { validateAcquisitionUrl } from "../probe-url-guard";
import { executeDeclarativeApiRuntime } from "./declarative-api-runtime";

const MAX_DRY_RUN_BYTES = 2_000_000;
const DEFAULT_DRY_RUN_LIMIT = 5;
const SECRET_FIELD_PARTS = ["authorization", "cookie", "password", "secret", "token", "api_key", "apikey"];

interface DryRunInput {
  adapterKey?: unknown;
  providerType?: unknown;
  fetchUrl?: unknown;
  config?: unknown;
  limit?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_DRY_RUN_LIMIT;
  }
  return Math.max(1, Math.min(20, Math.round(value)));
}

function assertNoSecretConfig(value: unknown, path = "config"): string | null {
  if (value == null) {
    return null;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const result = assertNoSecretConfig(value[index], `${path}[${index}]`);
      if (result) {
        return result;
      }
    }
    return null;
  }
  if (typeof value !== "object") {
    return null;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase();
    if (SECRET_FIELD_PARTS.some((part) => normalizedKey.includes(part))) {
      return `${path}.${key} must not contain secrets.`;
    }
    const result = assertNoSecretConfig(nested, `${path}.${key}`);
    if (result) {
      return result;
    }
  }
  return null;
}

function parsePayload(text: string, responseFormat: ReturnType<typeof parseApiChannelConfig>["responseFormat"]): unknown {
  if (responseFormat === "ndjson") {
    return text
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown);
  }
  return JSON.parse(text) as unknown;
}

function buildRequestBody(apiConfig: ReturnType<typeof parseApiChannelConfig>): string | undefined {
  if (apiConfig.requestMethod !== "POST" || apiConfig.requestBodyJson == null) {
    return undefined;
  }
  return JSON.stringify(apiConfig.requestBodyJson);
}

async function fetchJsonPage(input: {
  url: string;
  apiConfig: ReturnType<typeof parseApiChannelConfig>;
}): Promise<
  | { ok: true; payload: unknown; finalUrl: string; status: number; statusText: string }
  | { ok: false; message: string; status?: number; statusText?: string }
> {
  const guardedUrl = await validateAcquisitionUrl(input.url, { resolveDns: true });
  if (!guardedUrl.url) {
    return { ok: false, message: guardedUrl.error ?? "URL is not allowed." };
  }
  const headers = new Headers({
    "user-agent": input.apiConfig.userAgent,
    accept: input.apiConfig.responseFormat === "ndjson" ? "application/x-ndjson,application/json" : "application/json",
  });
  for (const [name, value] of Object.entries(input.apiConfig.requestHeaders)) {
    headers.set(name, value);
  }
  const requestBody = buildRequestBody(input.apiConfig);
  if (requestBody != null) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(guardedUrl.url, {
    method: input.apiConfig.requestMethod,
    headers,
    body: requestBody,
    signal: AbortSignal.timeout(input.apiConfig.requestTimeoutMs),
  });
  const responseBytes = await response.arrayBuffer();
  if (responseBytes.byteLength > MAX_DRY_RUN_BYTES) {
    return { ok: false, message: "Dry-run response body is too large.", status: response.status, statusText: response.statusText };
  }
  if (!response.ok) {
    return {
      ok: false,
      message: `Dry-run fetch failed: ${response.status} ${response.statusText}`,
      status: response.status,
      statusText: response.statusText,
    };
  }
  try {
    return {
      ok: true,
      payload: parsePayload(new TextDecoder().decode(responseBytes), input.apiConfig.responseFormat),
      finalUrl: response.url || guardedUrl.url,
      status: response.status,
      statusText: response.statusText,
    };
  } catch {
    return { ok: false, message: "Dry-run response body is not valid JSON or NDJSON.", status: response.status, statusText: response.statusText };
  }
}

export async function dryRunIngressAdapter(input: DryRunInput): Promise<Record<string, unknown>> {
  const adapterKey = String(input.adapterKey ?? "api.generic_json_mapping").trim();
  const providerType = String(input.providerType ?? "api").trim();
  const fetchUrl = String(input.fetchUrl ?? "").trim();
  const limit = readLimit(input.limit);
  const config = asRecord(input.config);

  if (providerType !== "api") {
    return {
      adapterKey,
      status: "unsupported",
      itemsPreview: [],
      diagnostics: [{ level: "info", message: "Dry-run currently supports API declarative adapters only." }],
      providerMetrics: { fetchedItemCount: 0, validDraftCount: 0 },
    };
  }
  if (!fetchUrl) {
    return {
      adapterKey,
      status: "failed",
      itemsPreview: [],
      diagnostics: [{ level: "error", message: "fetchUrl is required." }],
      providerMetrics: { fetchedItemCount: 0, validDraftCount: 0 },
    };
  }

  const secretError = assertNoSecretConfig(config);
  if (secretError) {
    return {
      adapterKey,
      status: "failed",
      itemsPreview: [],
      diagnostics: [{ level: "error", message: secretError }],
      providerMetrics: { fetchedItemCount: 0, validDraftCount: 0 },
    };
  }
  let apiConfig: ReturnType<typeof parseApiChannelConfig>;
  try {
    apiConfig = parseApiChannelConfig({
      ...config,
      adapterKey: ingressAdapterKeyToLegacyApiAdapterKey(adapterKey),
    });
  } catch (error) {
    return {
      adapterKey,
      status: "failed",
      itemsPreview: [],
      diagnostics: [{ level: "error", message: error instanceof Error ? error.message : "Invalid adapter config." }],
      providerMetrics: { fetchedItemCount: 0, validDraftCount: 0 },
    };
  }
  let runtimeResult: Awaited<ReturnType<typeof executeDeclarativeApiRuntime>>;
  try {
    runtimeResult = await executeDeclarativeApiRuntime({
      fetchUrl,
      apiConfig,
      fetchedAt: new Date().toISOString(),
      limit,
      fetchPage: async (url) => {
        const page = await fetchJsonPage({ url, apiConfig });
        if (!page.ok) {
          throw new Error(page.message);
        }
        return {
          payload: page.payload,
          finalUrl: page.finalUrl,
          status: page.status,
          retryAfterSeconds: null,
        };
      },
      resolveNextUrl: async (rawUrl, baseUrl) => {
        const guardedNextUrl = await validateAcquisitionUrl(rawUrl, { baseUrl, resolveDns: true });
        return guardedNextUrl.url ?? null;
      },
    });
  } catch (error) {
    return {
      adapterKey,
      status: "failed",
      itemsPreview: [],
      diagnostics: [{ level: "error", message: error instanceof Error ? error.message : "Dry-run failed." }],
      providerMetrics: { fetchedItemCount: 0, validDraftCount: 0 },
    };
  }
  const itemsPreview = runtimeResult.items.map((item) => ({
    externalId: item.externalArticleId,
    url: item.url,
    title: item.title,
    publishedAt: item.publishedAt,
  }));

  return {
    adapterKey,
    status: "ok",
    itemsPreview,
    diagnostics: [
      { level: "info", message: "Dry-run mode completed without persistence writes.", writes: false },
      ...runtimeResult.diagnostics,
    ],
    providerMetrics: {
      fetchedItemCount: runtimeResult.fetchedItemCount,
      validDraftCount: itemsPreview.length,
    },
  };
}
