import {
  normalizeText,
  readOptionalString,
  summarizeBody,
} from "./resource-enrichment-extraction";

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_PAGES = 20;
const DEFAULT_MAX_TEXT_CHARS = 12_000;
const DEFAULT_TIMEOUT_MS = 15_000;

export interface PdfExtractionOptions {
  fallbackTitle: string;
  maxBytes?: number;
  maxPages?: number;
  maxTextChars?: number;
  timeoutMs?: number;
}

export interface PdfExtractionResult {
  status: "extracted" | "skipped";
  title: string | null;
  summary: string | null;
  body: string | null;
  pageCount: number;
  parsedPageCount: number;
  extractedChars: number;
  truncated: boolean;
  publishedAt: string | null;
  modifiedAt: string | null;
  metadata: Record<string, string>;
  parser: {
    name: "pdfjs-dist";
    version: string;
  };
  errorReason: string | null;
}

type PdfInfoRecord = Record<string, unknown>;
type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfJsModulePromise: Promise<PdfJsModule> | null = null;

class PdfTextExtractionDOMMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: unknown) {
    if (Array.isArray(init)) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = [
        Number(init[0] ?? 1),
        Number(init[1] ?? 0),
        Number(init[2] ?? 0),
        Number(init[3] ?? 1),
        Number(init[4] ?? 0),
        Number(init[5] ?? 0),
      ];
    }
  }

  multiplySelf(): this {
    return this;
  }

  preMultiplySelf(): this {
    return this;
  }

  translate(): this {
    return this;
  }

  scale(): this {
    return this;
  }

  invertSelf(): this {
    return this;
  }
}

function ensurePdfJsNodeGlobals(): void {
  const mutableGlobals = globalThis as unknown as Record<string, unknown>;
  mutableGlobals.DOMMatrix ??= PdfTextExtractionDOMMatrix;
  mutableGlobals.ImageData ??= class PdfTextExtractionImageData {};
  mutableGlobals.Path2D ??= class PdfTextExtractionPath2D {
    addPath(): void {
      // Rendering is disabled for PDF text extraction.
    }
  };
}

async function loadPdfJs(): Promise<PdfJsModule> {
  ensurePdfJsNodeGlobals();
  pdfJsModulePromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return await pdfJsModulePromise;
}

function readPdfInfoValue(info: PdfInfoRecord, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = readOptionalString(info[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function parsePdfDate(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const match = value.match(/^D:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/);
  if (!match) {
    return null;
  }
  const [, year, month = "01", day = "01", hour = "00", minute = "00", second = "00"] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function metadataFromInfo(info: PdfInfoRecord): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(info)) {
    const text = readOptionalString(value);
    if (text) {
      metadata[key] = text.slice(0, 500);
    }
  }
  return metadata;
}

async function withTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void | Promise<void>,
): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          void onTimeout();
          reject(new Error("pdf_extraction_timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function extractPdfDocument(
  pdfBytes: Uint8Array,
  options: PdfExtractionOptions,
): Promise<PdfExtractionResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const maxTextChars = options.maxTextChars ?? DEFAULT_MAX_TEXT_CHARS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pdfjs = await loadPdfJs();
  const parser = { name: "pdfjs-dist" as const, version: pdfjs.version };

  if (pdfBytes.byteLength > maxBytes) {
    return {
      status: "skipped",
      title: options.fallbackTitle,
      summary: null,
      body: null,
      pageCount: 0,
      parsedPageCount: 0,
      extractedChars: 0,
      truncated: true,
      publishedAt: null,
      modifiedAt: null,
      metadata: {},
      parser,
      errorReason: "pdf_size_exceeds_limit",
    };
  }

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBytes),
    verbosity: pdfjs.VerbosityLevel.ERRORS,
    useWorkerFetch: false,
    useSystemFonts: false,
    useWasm: false,
    stopAtErrors: true,
    maxImageSize: 0,
    disableFontFace: true,
    disableRange: true,
    disableStream: true,
    disableAutoFetch: true,
    enableXfa: false,
  });

  try {
    const pdf = await withTimeout(loadingTask.promise, timeoutMs, () => loadingTask.destroy());
    const pageCount = Number(pdf.numPages || 0);
    const parsedPageCount = Math.min(pageCount, maxPages);
    const metadataResult = await pdf.getMetadata().catch(() => ({ info: {} }));
    const info = (metadataResult.info ?? {}) as PdfInfoRecord;
    const metadata = metadataFromInfo(info);
    const title = readPdfInfoValue(info, ["Title", "title"]) ?? options.fallbackTitle;
    const publishedAt = parsePdfDate(readPdfInfoValue(info, ["CreationDate", "creationDate"]));
    const modifiedAt = parsePdfDate(readPdfInfoValue(info, ["ModDate", "modDate"]));
    const pageTexts: string[] = [];
    let truncated = pageCount > parsedPageCount;

    for (let pageNumber = 1; pageNumber <= parsedPageCount; pageNumber += 1) {
      if (pageTexts.join("\n").length >= maxTextChars) {
        truncated = true;
        break;
      }
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = normalizeText(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" "),
      );
      if (text) {
        pageTexts.push(text);
      }
      page.cleanup();
    }

    const rawBody = normalizeText(pageTexts.join("\n"));
    const body =
      rawBody.length > maxTextChars
        ? rawBody.slice(0, maxTextChars).trim()
        : rawBody;
    if (rawBody.length > maxTextChars) {
      truncated = true;
    }

    if (!body) {
      return {
        status: "skipped",
        title,
        summary: null,
        body: null,
        pageCount,
        parsedPageCount,
        extractedChars: 0,
        truncated,
        publishedAt,
        modifiedAt,
        metadata,
        parser,
        errorReason: "pdf_text_empty_or_image_only",
      };
    }

    return {
      status: "extracted",
      title,
      summary: summarizeBody(body),
      body,
      pageCount,
      parsedPageCount,
      extractedChars: body.length,
      truncated,
      publishedAt,
      modifiedAt,
      metadata,
      parser,
      errorReason: null,
    };
  } catch (error) {
    return {
      status: "skipped",
      title: options.fallbackTitle,
      summary: null,
      body: null,
      pageCount: 0,
      parsedPageCount: 0,
      extractedChars: 0,
      truncated: false,
      publishedAt: null,
      modifiedAt: null,
      metadata: {},
      parser,
      errorReason: error instanceof Error ? error.message : "pdf_extraction_failed",
    };
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}
