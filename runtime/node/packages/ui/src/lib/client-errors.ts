import { toast } from "sonner";

export interface ClientActionErrorOptions {
  userMessage?: string;
  technicalError?: unknown;
  errorCode?: string | null;
  status?: number;
  serverPayload?: unknown;
}

export interface ClientErrorToastOptions {
  duration?: number;
}

export type ClientErrorToastFn = (message: string, options?: ClientErrorToastOptions) => unknown;

export interface ReportClientErrorOptions extends ClientActionErrorOptions {
  context?: string;
  fallbackMessage?: string;
  toastDurationMs?: number;
  toastError?: ClientErrorToastFn;
  consoleError?: (...args: unknown[]) => unknown;
}

export class ClientActionError extends Error {
  readonly userMessage: string;
  readonly technicalError: unknown;
  readonly errorCode: string | null;
  readonly status: number | null;
  readonly serverPayload: unknown;

  constructor(message: string, options: ClientActionErrorOptions = {}) {
    super(message);
    this.name = "ClientActionError";
    this.userMessage = options.userMessage ?? message;
    this.technicalError = options.technicalError ?? null;
    this.errorCode = options.errorCode ?? null;
    this.status = options.status ?? null;
    this.serverPayload = options.serverPayload ?? null;
  }
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readPayloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function createClientActionError(
  payload: unknown,
  options: { fallbackMessage: string; status?: number } = { fallbackMessage: "Request failed." },
): ClientActionError {
  const record = readPayloadRecord(payload);
  const userMessage =
    readText(record.error) ||
    readText(record.message) ||
    options.fallbackMessage;
  const technicalError =
    readText(record.technicalError) ||
    readText(record.detail) ||
    readText(record.error_description) ||
    null;
  const errorCode = readText(record.errorCode) || readText(record.code) || null;

  return new ClientActionError(userMessage, {
    userMessage,
    technicalError,
    errorCode,
    status: options.status,
    serverPayload: payload,
  });
}

export function readClientErrorMessage(error: unknown, fallbackMessage = "Action failed."): string {
  if (error instanceof ClientActionError) {
    return error.userMessage || fallbackMessage;
  }
  return fallbackMessage;
}

export function reportClientError(error: unknown, options: ReportClientErrorOptions = {}): string {
  const userMessage =
    readText(options.userMessage) ||
    (error instanceof ClientActionError ? error.userMessage : "") ||
    readText(options.fallbackMessage) ||
    "Action failed.";
  const technicalError =
    options.technicalError ??
    (error instanceof ClientActionError ? error.technicalError : null) ??
    (error instanceof Error ? error.message : error);
  const errorCode =
    readText(options.errorCode) ||
    (error instanceof ClientActionError ? error.errorCode : null);
  const status =
    options.status ??
    (error instanceof ClientActionError ? error.status ?? undefined : undefined);
  const serverPayload =
    options.serverPayload ??
    (error instanceof ClientActionError ? error.serverPayload : null);

  const toastError = options.toastError ?? toast.error;
  const consoleError = options.consoleError ?? console.error;
  toastError(userMessage, { duration: options.toastDurationMs ?? 7000 });
  consoleError("[SignalOps client error]", {
    context: options.context ?? "browser action",
    userMessage,
    errorCode,
    status,
    technicalError,
    serverPayload,
  });

  return userMessage;
}
