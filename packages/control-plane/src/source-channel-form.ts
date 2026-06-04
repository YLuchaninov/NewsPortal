import { parseSourceChannelAuthConfig } from "@signalops/contracts";

export type AuthorizationHeaderUpdateMode = "preserve" | "replace" | "clear" | "disabled";

export interface AuthorizationHeaderUpdate {
  mode: AuthorizationHeaderUpdateMode;
  authorizationHeader: string | null;
}

export interface SourceChannelFormReader {
  readOptionalString(value: unknown): string | null;
  readRequiredString(value: unknown, fieldName: string): string;
  readBoolean(value: unknown, fallback: boolean, fieldName: string): boolean;
  readPositiveInteger(value: unknown, fallback: number, fieldName: string): number;
  readOptionalPositiveInteger(value: unknown, fieldName: string): number | null;
  readTextareaList(value: unknown): string[];
  validateHttpUrl(rawUrl: string, fieldName?: string): string;
  resolveAuthorizationHeaderUpdate(
    payload: Record<string, unknown>,
    isUpdate: boolean
  ): AuthorizationHeaderUpdate;
}

export function createSourceChannelFormReader(fieldPrefix: string): SourceChannelFormReader {
  const fieldLabel = `${fieldPrefix} channel field`;

  function readOptionalString(value: unknown): string | null {
    if (value == null) {
      return null;
    }

    const normalized = String(value).trim();
    return normalized ? normalized : null;
  }

  function readRequiredString(value: unknown, fieldName: string): string {
    const normalized = readOptionalString(value);
    if (!normalized) {
      throw new Error(`${fieldLabel} "${fieldName}" is required.`);
    }
    return normalized;
  }

  function readBoolean(value: unknown, fallback: boolean, fieldName: string): boolean {
    if (value == null || value === "") {
      return fallback;
    }
    if (typeof value === "boolean") {
      return value;
    }

    const normalized = String(value).trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }

    throw new Error(`${fieldLabel} "${fieldName}" must be a boolean.`);
  }

  function readPositiveInteger(value: unknown, fallback: number, fieldName: string): number {
    if (value == null || value === "") {
      return fallback;
    }

    const parsed =
      typeof value === "number" && Number.isInteger(value)
        ? value
        : Number.parseInt(String(value), 10);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`${fieldLabel} "${fieldName}" must be a positive integer.`);
    }

    return parsed;
  }

  function readOptionalPositiveInteger(value: unknown, fieldName: string): number | null {
    if (value == null || value === "") {
      return null;
    }

    return readPositiveInteger(value, 0, fieldName);
  }

  function readTextareaList(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value
        .map((item) => String(item).trim())
        .filter(Boolean);
    }

    const normalized = readOptionalString(value);
    if (!normalized) {
      return [];
    }

    return normalized
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function validateHttpUrl(rawUrl: string, fieldName = "fetchUrl"): string {
    let parsed: URL;

    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error(`${fieldLabel} "${fieldName}" must be a valid absolute URL.`);
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(`${fieldLabel} "${fieldName}" must use http or https.`);
    }

    return parsed.toString();
  }

  function resolveAuthorizationHeaderUpdate(
    payload: Record<string, unknown>,
    isUpdate: boolean
  ): AuthorizationHeaderUpdate {
    const authorizationHeader = readOptionalString(payload.authorizationHeader);
    const clearAuthorizationHeader = readBoolean(
      payload.clearAuthorizationHeader,
      false,
      "clearAuthorizationHeader"
    );

    if (clearAuthorizationHeader) {
      return {
        mode: "clear",
        authorizationHeader: null
      };
    }

    if (authorizationHeader) {
      return {
        mode: "replace",
        authorizationHeader
      };
    }

    return {
      mode: isUpdate ? "preserve" : "disabled",
      authorizationHeader: null
    };
  }

  return {
    readOptionalString,
    readRequiredString,
    readBoolean,
    readPositiveInteger,
    readOptionalPositiveInteger,
    readTextareaList,
    validateHttpUrl,
    resolveAuthorizationHeaderUpdate
  };
}

export function resolveNextAuthorizationHeader(
  existingAuthConfigJson: unknown,
  update: AuthorizationHeaderUpdate
): string | null {
  if (update.mode === "replace") {
    return update.authorizationHeader;
  }

  if (update.mode === "clear" || update.mode === "disabled") {
    return null;
  }

  return parseSourceChannelAuthConfig(existingAuthConfigJson).authorizationHeader;
}

export function normalizeMatchedAuthorizationHeaderUpdate(
  update: AuthorizationHeaderUpdate
): AuthorizationHeaderUpdate {
  if (update.mode !== "disabled") {
    return update;
  }

  return {
    mode: "preserve",
    authorizationHeader: null
  };
}
