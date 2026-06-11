import {
  DEFAULT_SOURCE_CHANNEL_ADAPTIVE_MAX_CAP_SECONDS,
  DEFAULT_SOURCE_CHANNEL_AUTH_CONFIG,
  MAX_SOURCE_CHANNEL_POLL_INTERVAL_SECONDS,
} from "./model";
import type { SourceChannelAuthConfig, SourceChannelAuthSummary } from "./model";

export function asRecord(config: unknown): Record<string, unknown> {
  if (config == null) {
    return {};
  }

  if (typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Source channel config must be an object.");
  }

  return config as Record<string, unknown>;
}

export function readPositiveInteger(
  value: unknown,
  fallback: number,
  fieldName: string
): number {
  if (value == null) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Source channel config field "${fieldName}" must be a positive integer.`);
  }

  return value;
}

export function readNumberInRange(
  value: unknown,
  fallback: number,
  fieldName: string,
  min: number,
  max: number
): number {
  if (value == null) {
    return fallback;
  }

  if (typeof value !== "number" || Number.isNaN(value) || value < min || value > max) {
    throw new Error(
      `Source channel config field "${fieldName}" must be a number between ${min} and ${max}.`
    );
  }

  return value;
}

export function defaultMaxPollIntervalSeconds(basePollIntervalSeconds: number): number {
  if (!Number.isInteger(basePollIntervalSeconds) || basePollIntervalSeconds <= 0) {
    throw new Error("Base poll interval must be a positive integer.");
  }

  return Math.min(
    basePollIntervalSeconds * 16,
    DEFAULT_SOURCE_CHANNEL_ADAPTIVE_MAX_CAP_SECONDS
  );
}

export function normalizeMaxPollIntervalSeconds(
  basePollIntervalSeconds: number,
  maxPollIntervalSeconds: number | null | undefined
): number {
  const fallback = defaultMaxPollIntervalSeconds(basePollIntervalSeconds);
  if (maxPollIntervalSeconds == null) {
    return fallback;
  }

  if (!Number.isInteger(maxPollIntervalSeconds) || maxPollIntervalSeconds <= 0) {
    throw new Error('Source channel config field "maxPollIntervalSeconds" must be a positive integer.');
  }

  return Math.max(
    basePollIntervalSeconds,
    Math.min(maxPollIntervalSeconds, MAX_SOURCE_CHANNEL_POLL_INTERVAL_SECONDS)
  );
}

export function readBoolean(value: unknown, fallback: boolean, fieldName: string): boolean {
  if (value == null) {
    return fallback;
  }

  if (typeof value !== "boolean") {
    throw new Error(`Source channel config field "${fieldName}" must be a boolean.`);
  }

  return value;
}

export function readString(value: unknown, fallback: string, fieldName: string): string {
  if (value == null) {
    return fallback;
  }

  if (typeof value !== "string") {
    throw new Error(`Source channel config field "${fieldName}" must be a string.`);
  }

  return value.trim() || fallback;
}

export function readStringOrStringList(
  value: unknown,
  fallback: string | string[],
  fieldName: string
): string | string[] {
  if (value == null) {
    return Array.isArray(fallback) ? [...fallback] : fallback;
  }

  if (typeof value === "string") {
    return value.trim() || fallback;
  }

  if (!Array.isArray(value)) {
    throw new Error(`Source channel config field "${fieldName}" must be a string or string array.`);
  }

  const paths = value.map((item, index) => {
    if (typeof item !== "string") {
      throw new Error(`Source channel config field "${fieldName}[${index}]" must be a string.`);
    }
    return item.trim();
  }).filter(Boolean);
  return paths.length > 0 ? paths : fallback;
}

export function readOptionalString(
  value: unknown,
  fallback: string | null,
  fieldName: string
): string | null {
  if (value == null) {
    return fallback;
  }

  if (typeof value !== "string") {
    throw new Error(`Source channel config field "${fieldName}" must be a string.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function readNullablePositiveInteger(
  value: unknown,
  fallback: number | null,
  fieldName: string
): number | null {
  if (value == null) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Source channel config field "${fieldName}" must be a positive integer.`);
  }

  return value;
}

export function assertJsonCompatible(value: unknown, fieldName: string): unknown {
  if (value == null || typeof value === "string" || typeof value === "boolean") {
    return value ?? null;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Source channel config field "${fieldName}" must be JSON-compatible.`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => assertJsonCompatible(item, `${fieldName}[${index}]`));
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, childValue] of Object.entries(value as Record<string, unknown>)) {
      output[key] = assertJsonCompatible(childValue, `${fieldName}.${key}`);
    }
    return output;
  }
  throw new Error(`Source channel config field "${fieldName}" must be JSON-compatible.`);
}

export function readStringList(
  value: unknown,
  fallback: string[],
  fieldName: string
): string[] {
  if (value == null) {
    return [...fallback];
  }

  if (!Array.isArray(value)) {
    throw new Error(`Source channel config field "${fieldName}" must be an array of strings.`);
  }

  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new Error(
        `Source channel config field "${fieldName}" item ${index} must be a string.`
      );
    }

    const trimmed = item.trim();
    if (!trimmed) {
      throw new Error(
        `Source channel config field "${fieldName}" item ${index} must not be empty.`
      );
    }

    return trimmed;
  });
}

export function parseSourceChannelAuthConfig(config: unknown): SourceChannelAuthConfig {
  const candidate = asRecord(config);

  return {
    authorizationHeader: readOptionalString(
      candidate.authorizationHeader,
      DEFAULT_SOURCE_CHANNEL_AUTH_CONFIG.authorizationHeader,
      "authorizationHeader"
    )
  };
}

export function serializeSourceChannelAuthConfig(
  config: SourceChannelAuthConfig
): Record<string, unknown> {
  const parsed = parseSourceChannelAuthConfig(config);
  const serialized: Record<string, unknown> = {};

  if (parsed.authorizationHeader) {
    serialized.authorizationHeader = parsed.authorizationHeader;
  }

  return serialized;
}

export function buildSourceChannelAuthSummary(config: unknown): SourceChannelAuthSummary {
  return {
    hasAuthorizationHeader: Boolean(parseSourceChannelAuthConfig(config).authorizationHeader)
  };
}

export function resolveSourceChannelAuthorizationHeader(
  requestUrl: string,
  channelUrl: string | null | undefined,
  authConfig: unknown
): string | null {
  const authorizationHeader = parseSourceChannelAuthConfig(authConfig).authorizationHeader;
  if (!authorizationHeader || !channelUrl) {
    return null;
  }

  try {
    const requestOrigin = new URL(requestUrl).origin;
    const channelOrigin = new URL(channelUrl).origin;
    return requestOrigin === channelOrigin ? authorizationHeader : null;
  } catch {
    return null;
  }
}
