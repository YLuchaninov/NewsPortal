import {
  BETA_INGEST_PROVIDER_TYPES,
  type BetaIngestProviderType,
} from "./source/capabilities";

export type JsonSchemaType =
  | "object"
  | "array"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null";

export interface JsonSchema {
  type?: JsonSchemaType | readonly JsonSchemaType[];
  required?: readonly string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  enum?: readonly unknown[];
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

export interface JsonSchemaValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface JsonSchemaValidationOptions {
  boundaryName?: string;
}

const FLEXIBLE_STRING_SCHEMA = { type: "string" } satisfies JsonSchema;
const FLEXIBLE_BOOLEAN_SCHEMA = { type: ["boolean", "string"] } satisfies JsonSchema;
const FLEXIBLE_INTEGER_SCHEMA = { type: ["integer", "string"] } satisfies JsonSchema;
const FLEXIBLE_NUMBER_SCHEMA = { type: ["number", "string"] } satisfies JsonSchema;
const STRING_LIST_INPUT_SCHEMA = {
  type: ["string", "array"],
  items: { type: "string" },
} satisfies JsonSchema;
export const JSON_OBJECT_SCHEMA = {
  type: "object",
  additionalProperties: true,
} satisfies JsonSchema;
const OPTIONAL_JSON_OBJECT_OR_STRING_SCHEMA = {
  type: ["object", "string"],
  additionalProperties: true,
} satisfies JsonSchema;

export const MUTATION_RESULT_SCHEMA = {
  type: ["object", "array", "null"],
  additionalProperties: true,
} satisfies JsonSchema;

const WEB_INTEREST_PROPERTIES = {
  description: FLEXIBLE_STRING_SCHEMA,
  positive_texts: FLEXIBLE_STRING_SCHEMA,
  negative_texts: FLEXIBLE_STRING_SCHEMA,
  places: FLEXIBLE_STRING_SCHEMA,
  languages_allowed: FLEXIBLE_STRING_SCHEMA,
  time_window_hours: FLEXIBLE_INTEGER_SCHEMA,
  must_have_terms: FLEXIBLE_STRING_SCHEMA,
  must_not_have_terms: FLEXIBLE_STRING_SCHEMA,
  short_tokens_required: FLEXIBLE_STRING_SCHEMA,
  short_tokens_forbidden: FLEXIBLE_STRING_SCHEMA,
  priority: FLEXIBLE_NUMBER_SCHEMA,
  enabled: FLEXIBLE_BOOLEAN_SCHEMA,
} satisfies Record<string, JsonSchema>;

export const WEB_BFF_ACTION_PAYLOAD_SCHEMAS = {
  "auth.bootstrap": {
    type: "object",
    additionalProperties: false,
  },
  "auth.google": {
    type: "object",
    required: ["credential"],
    properties: {
      credential: FLEXIBLE_STRING_SCHEMA,
    },
    additionalProperties: false,
  },
  "auth.logout": {
    type: "object",
    additionalProperties: false,
  },
  "content-state": {
    type: "object",
    required: ["contentItemId", "action"],
    properties: {
      contentItemId: FLEXIBLE_STRING_SCHEMA,
      action: {
        type: "string",
        enum: ["mark_seen", "mark_unread", "save", "unsave", "archive"],
      },
    },
    additionalProperties: false,
  },
  "digest-settings": {
    type: "object",
    properties: {
      digestEnabled: FLEXIBLE_BOOLEAN_SCHEMA,
      digestCadence: {
        type: "string",
        enum: ["daily", "every_3_days", "weekly", "monthly"],
      },
      digestTime: FLEXIBLE_STRING_SCHEMA,
      digestSkipIfEmpty: FLEXIBLE_BOOLEAN_SCHEMA,
      digestTimezone: FLEXIBLE_STRING_SCHEMA,
    },
    additionalProperties: false,
  },
  feedback: {
    type: "object",
    required: ["notificationId", "docId", "feedbackValue"],
    properties: {
      notificationId: FLEXIBLE_STRING_SCHEMA,
      docId: FLEXIBLE_STRING_SCHEMA,
      interestId: FLEXIBLE_STRING_SCHEMA,
      feedbackValue: { type: "string", enum: ["helpful", "not_helpful"] },
    },
    additionalProperties: false,
  },
  "interests.create": {
    type: "object",
    required: ["description"],
    properties: WEB_INTEREST_PROPERTIES,
    additionalProperties: false,
  },
  "interests.update": {
    type: "object",
    properties: {
      _action: { type: "string", enum: ["update", "delete", "clone"] },
      ...WEB_INTEREST_PROPERTIES,
    },
    additionalProperties: false,
  },
  "notification-channels": {
    type: "object",
    required: ["channelType"],
    properties: {
      channelType: { type: "string", enum: ["web_push", "telegram", "email_digest"] },
      subscription: OPTIONAL_JSON_OBJECT_OR_STRING_SCHEMA,
      chatId: FLEXIBLE_STRING_SCHEMA,
      email: FLEXIBLE_STRING_SCHEMA,
    },
    additionalProperties: false,
  },
  preferences: {
    type: "object",
    properties: {
      themePreference: { type: "string", enum: ["light", "dark", "system"] },
      webPushEnabled: FLEXIBLE_BOOLEAN_SCHEMA,
      telegramEnabled: FLEXIBLE_BOOLEAN_SCHEMA,
    },
    additionalProperties: false,
  },
  reactions: {
    type: "object",
    required: ["docId", "reactionType"],
    properties: {
      docId: FLEXIBLE_STRING_SCHEMA,
      reactionType: { type: "string", enum: ["like", "dislike"] },
    },
    additionalProperties: false,
  },
  "saved-digest": {
    type: "object",
    properties: {
      itemIds: STRING_LIST_INPUT_SCHEMA,
      returnTo: FLEXIBLE_STRING_SCHEMA,
    },
    additionalProperties: true,
  },
  "story-follow": {
    type: "object",
    required: ["contentItemId", "action"],
    properties: {
      contentItemId: FLEXIBLE_STRING_SCHEMA,
      action: { type: "string", enum: ["follow", "unfollow"] },
    },
    additionalProperties: false,
  },
} as const satisfies Record<string, JsonSchema>;

export type WebBffActionSchemaKey = keyof typeof WEB_BFF_ACTION_PAYLOAD_SCHEMAS;

export function validateWebBffActionPayload(
  key: WebBffActionSchemaKey,
  payload: unknown
): JsonSchemaValidationIssue[] {
  return validateJsonSchema(payload, WEB_BFF_ACTION_PAYLOAD_SCHEMAS[key]);
}

export function assertWebBffActionPayload(
  key: WebBffActionSchemaKey,
  payload: unknown,
  options: JsonSchemaValidationOptions = {}
): asserts payload is Record<string, unknown> {
  assertJsonSchema(payload, WEB_BFF_ACTION_PAYLOAD_SCHEMAS[key], {
    boundaryName: options.boundaryName ?? `web BFF action "${key}" payload`,
  });
}

export const ADMIN_BFF_ACTION_PAYLOAD_SCHEMAS = {
  "signal_candidates.enrichment-retry": JSON_OBJECT_SCHEMA,
  automation: JSON_OBJECT_SCHEMA,
  channels: JSON_OBJECT_SCHEMA,
  "channels.bulk": JSON_OBJECT_SCHEMA,
  "channels.bulk.preflight": JSON_OBJECT_SCHEMA,
  "channels.schedule": JSON_OBJECT_SCHEMA,
  "content-analysis": JSON_OBJECT_SCHEMA,
  "content-analysis-policies": JSON_OBJECT_SCHEMA,
  "content-filter-policies": JSON_OBJECT_SCHEMA,
  discovery: JSON_OBJECT_SCHEMA,
  funnels: JSON_OBJECT_SCHEMA,
  "ingress-adapters": JSON_OBJECT_SCHEMA,
  "mcp-tokens": JSON_OBJECT_SCHEMA,
  moderation: JSON_OBJECT_SCHEMA,
  reindex: JSON_OBJECT_SCHEMA,
  templates: JSON_OBJECT_SCHEMA,
  "user-interests": JSON_OBJECT_SCHEMA,
} as const satisfies Record<string, JsonSchema>;

export type AdminBffActionSchemaKey = keyof typeof ADMIN_BFF_ACTION_PAYLOAD_SCHEMAS;

export function assertAdminBffActionPayload(
  key: AdminBffActionSchemaKey,
  payload: unknown,
  options: JsonSchemaValidationOptions = {}
): asserts payload is Record<string, unknown> {
  assertJsonSchema(payload, ADMIN_BFF_ACTION_PAYLOAD_SCHEMAS[key], {
    boundaryName: options.boundaryName ?? `admin BFF action "${key}" payload`,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function formatPath(path: readonly string[]): string {
  return path.length > 0 ? path.join(".") : "$";
}

function listTypes(type: JsonSchema["type"]): readonly JsonSchemaType[] {
  if (!type) {
    return [];
  }
  return typeof type === "string" ? [type] : type;
}

function valueMatchesType(value: unknown, type: JsonSchemaType): boolean {
  switch (type) {
    case "object":
      return isRecord(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
  }
}

function enumIncludes(values: readonly unknown[], value: unknown): boolean {
  return values.some((entry) => Object.is(entry, value));
}

function pushIssue(
  issues: JsonSchemaValidationIssue[],
  path: readonly string[],
  code: string,
  message: string
): void {
  issues.push({
    path: formatPath(path),
    code,
    message,
  });
}

function validateAgainstSchema(
  value: unknown,
  schema: JsonSchema,
  path: readonly string[],
  issues: JsonSchemaValidationIssue[]
): void {
  const expectedTypes = listTypes(schema.type);
  if (
    expectedTypes.length > 0 &&
    !expectedTypes.some((expectedType) => valueMatchesType(value, expectedType))
  ) {
    pushIssue(
      issues,
      path,
      "invalid_type",
      `${formatPath(path)} must be ${expectedTypes.join(" or ")}.`
    );
    return;
  }

  if (schema.enum && !enumIncludes(schema.enum, value)) {
    pushIssue(issues, path, "invalid_enum", `${formatPath(path)} contains an unsupported value.`);
    return;
  }

  if (typeof value === "string") {
    if (schema.minLength != null && value.length < schema.minLength) {
      pushIssue(
        issues,
        path,
        "string_too_short",
        `${formatPath(path)} must contain at least ${schema.minLength} characters.`
      );
    }
    if (schema.maxLength != null && value.length > schema.maxLength) {
      pushIssue(
        issues,
        path,
        "string_too_long",
        `${formatPath(path)} must contain at most ${schema.maxLength} characters.`
      );
    }
  }

  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) {
      pushIssue(
        issues,
        path,
        "number_too_small",
        `${formatPath(path)} must be at least ${schema.minimum}.`
      );
    }
    if (schema.maximum != null && value > schema.maximum) {
      pushIssue(
        issues,
        path,
        "number_too_large",
        `${formatPath(path)} must be at most ${schema.maximum}.`
      );
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) {
      pushIssue(
        issues,
        path,
        "array_too_short",
        `${formatPath(path)} must contain at least ${schema.minItems} items.`
      );
    }
    if (schema.maxItems != null && value.length > schema.maxItems) {
      pushIssue(
        issues,
        path,
        "array_too_long",
        `${formatPath(path)} must contain at most ${schema.maxItems} items.`
      );
    }
    if (schema.items) {
      value.forEach((item, index) =>
        validateAgainstSchema(item, schema.items as JsonSchema, [...path, String(index)], issues)
      );
    }
  }

  if (!isRecord(value)) {
    return;
  }

  const properties = schema.properties ?? {};
  for (const requiredKey of schema.required ?? []) {
    if (value[requiredKey] === undefined) {
      pushIssue(
        issues,
        [...path, requiredKey],
        "required",
        `${formatPath([...path, requiredKey])} is required.`
      );
    }
  }

  for (const [key, childValue] of Object.entries(value)) {
    const childSchema = properties[key];
    if (childSchema) {
      validateAgainstSchema(childValue, childSchema, [...path, key], issues);
      continue;
    }

    if (schema.additionalProperties === false) {
      pushIssue(
        issues,
        [...path, key],
        "unknown_property",
        `${formatPath([...path, key])} is not allowed.`
      );
      continue;
    }

    if (isRecord(schema.additionalProperties)) {
      validateAgainstSchema(
        childValue,
        schema.additionalProperties,
        [...path, key],
        issues
      );
    }
  }
}

export function validateJsonSchema(
  value: unknown,
  schema: JsonSchema
): JsonSchemaValidationIssue[] {
  const issues: JsonSchemaValidationIssue[] = [];
  validateAgainstSchema(value, schema, [], issues);
  return issues;
}

export function assertJsonSchema(
  value: unknown,
  schema: JsonSchema,
  options: JsonSchemaValidationOptions = {}
): void {
  const issues = validateJsonSchema(value, schema);
  if (issues.length === 0) {
    return;
  }

  const boundaryName = options.boundaryName ?? "JSON boundary";
  const firstIssue = issues[0];
  throw new Error(`${boundaryName} failed schema validation: ${firstIssue?.message}`);
}

export const ADMIN_CHANNEL_PROVIDER_TYPES = BETA_INGEST_PROVIDER_TYPES;

export type AdminChannelSchemaProviderType = BetaIngestProviderType;

const COMMON_CHANNEL_PROPERTIES = {
  providerType: { type: "string", enum: ADMIN_CHANNEL_PROVIDER_TYPES },
  channelId: FLEXIBLE_STRING_SCHEMA,
  name: FLEXIBLE_STRING_SCHEMA,
  language: FLEXIBLE_STRING_SCHEMA,
  isActive: FLEXIBLE_BOOLEAN_SCHEMA,
  pollIntervalSeconds: FLEXIBLE_INTEGER_SCHEMA,
  adaptiveEnabled: FLEXIBLE_BOOLEAN_SCHEMA,
  maxPollIntervalSeconds: FLEXIBLE_INTEGER_SCHEMA,
  enrichmentEnabled: FLEXIBLE_BOOLEAN_SCHEMA,
  enrichmentMinBodyLength: FLEXIBLE_INTEGER_SCHEMA,
} satisfies Record<string, JsonSchema>;

const AUTH_PROPERTIES = {
  authorizationHeader: FLEXIBLE_STRING_SCHEMA,
  clearAuthorizationHeader: FLEXIBLE_BOOLEAN_SCHEMA,
} satisfies Record<string, JsonSchema>;

const HTTP_CHANNEL_PROPERTIES = {
  fetchUrl: FLEXIBLE_STRING_SCHEMA,
  requestTimeoutMs: FLEXIBLE_INTEGER_SCHEMA,
  userAgent: FLEXIBLE_STRING_SCHEMA,
  ...AUTH_PROPERTIES,
} satisfies Record<string, JsonSchema>;

export const ADMIN_CHANNEL_PAYLOAD_SCHEMAS = {
  rss: {
    type: "object",
    required: ["name", "fetchUrl"],
    properties: {
      ...COMMON_CHANNEL_PROPERTIES,
      ...HTTP_CHANNEL_PROPERTIES,
      providerType: { type: "string", enum: ["rss"] },
      maxItemsPerPoll: FLEXIBLE_INTEGER_SCHEMA,
      preferContentEncoded: FLEXIBLE_BOOLEAN_SCHEMA,
      adapterStrategy: FLEXIBLE_STRING_SCHEMA,
      maxEntryAgeHours: FLEXIBLE_INTEGER_SCHEMA,
    },
    additionalProperties: false,
  },
  website: {
    type: "object",
    required: ["providerType", "name", "fetchUrl"],
    properties: {
      ...COMMON_CHANNEL_PROPERTIES,
      ...HTTP_CHANNEL_PROPERTIES,
      providerType: { type: "string", enum: ["website"] },
      totalPollTimeoutMs: FLEXIBLE_INTEGER_SCHEMA,
      maxResourcesPerPoll: FLEXIBLE_INTEGER_SCHEMA,
      crawlDelayMs: FLEXIBLE_INTEGER_SCHEMA,
      sitemapDiscoveryEnabled: FLEXIBLE_BOOLEAN_SCHEMA,
      feedDiscoveryEnabled: FLEXIBLE_BOOLEAN_SCHEMA,
      collectionDiscoveryEnabled: FLEXIBLE_BOOLEAN_SCHEMA,
      downloadDiscoveryEnabled: FLEXIBLE_BOOLEAN_SCHEMA,
      browserFallbackEnabled: FLEXIBLE_BOOLEAN_SCHEMA,
      allowedUrlPatterns: STRING_LIST_INPUT_SCHEMA,
      blockedUrlPatterns: STRING_LIST_INPUT_SCHEMA,
      collectionSeedUrls: STRING_LIST_INPUT_SCHEMA,
      curatedPreferCollectionDiscovery: FLEXIBLE_BOOLEAN_SCHEMA,
      curatedPreferBrowserFallback: FLEXIBLE_BOOLEAN_SCHEMA,
      curatedEditorialUrlPatterns: STRING_LIST_INPUT_SCHEMA,
      curatedListingUrlPatterns: STRING_LIST_INPUT_SCHEMA,
      curatedEntityUrlPatterns: STRING_LIST_INPUT_SCHEMA,
      curatedDocumentUrlPatterns: STRING_LIST_INPUT_SCHEMA,
      curatedDataFileUrlPatterns: STRING_LIST_INPUT_SCHEMA,
    },
    additionalProperties: false,
  },
  api: {
    type: "object",
    required: ["providerType", "name", "fetchUrl"],
    properties: {
      ...COMMON_CHANNEL_PROPERTIES,
      ...HTTP_CHANNEL_PROPERTIES,
      providerType: { type: "string", enum: ["api"] },
      maxItemsPerPoll: FLEXIBLE_INTEGER_SCHEMA,
      requestMethod: FLEXIBLE_STRING_SCHEMA,
      requestHeaders: JSON_OBJECT_SCHEMA,
      requestBodyJson: JSON_OBJECT_SCHEMA,
      responseFormat: FLEXIBLE_STRING_SCHEMA,
      pagination: JSON_OBJECT_SCHEMA,
      itemsPath: FLEXIBLE_STRING_SCHEMA,
      titleField: STRING_LIST_INPUT_SCHEMA,
      leadField: STRING_LIST_INPUT_SCHEMA,
      bodyField: STRING_LIST_INPUT_SCHEMA,
      urlField: STRING_LIST_INPUT_SCHEMA,
      urlTemplate: FLEXIBLE_STRING_SCHEMA,
      publishedAtField: STRING_LIST_INPUT_SCHEMA,
      externalIdField: STRING_LIST_INPUT_SCHEMA,
      languageField: STRING_LIST_INPUT_SCHEMA,
      adapterKey: FLEXIBLE_STRING_SCHEMA,
      researchMode: FLEXIBLE_STRING_SCHEMA,
      accessKind: FLEXIBLE_STRING_SCHEMA,
      sourceRole: FLEXIBLE_STRING_SCHEMA,
      contentKind: FLEXIBLE_STRING_SCHEMA,
      query: FLEXIBLE_STRING_SCHEMA,
      platform: FLEXIBLE_STRING_SCHEMA,
      searchQuery: JSON_OBJECT_SCHEMA,
      organization: FLEXIBLE_STRING_SCHEMA,
      tags: STRING_LIST_INPUT_SCHEMA,
      githubEvidence: { type: "array", items: JSON_OBJECT_SCHEMA },
      tosRisk: FLEXIBLE_STRING_SCHEMA,
      requiresProductionReplacement: FLEXIBLE_BOOLEAN_SCHEMA,
      adapter: JSON_OBJECT_SCHEMA,
    },
    additionalProperties: false,
  },
  email_imap: {
    type: "object",
    required: ["providerType", "name", "host", "username"],
    properties: {
      ...COMMON_CHANNEL_PROPERTIES,
      providerType: { type: "string", enum: ["email_imap"] },
      host: FLEXIBLE_STRING_SCHEMA,
      port: FLEXIBLE_INTEGER_SCHEMA,
      secure: FLEXIBLE_BOOLEAN_SCHEMA,
      username: FLEXIBLE_STRING_SCHEMA,
      password: FLEXIBLE_STRING_SCHEMA,
      mailbox: FLEXIBLE_STRING_SCHEMA,
      searchFrom: FLEXIBLE_STRING_SCHEMA,
      searchSinceHours: FLEXIBLE_INTEGER_SCHEMA,
      maxMessageBytes: FLEXIBLE_INTEGER_SCHEMA,
      bodyPreference: FLEXIBLE_STRING_SCHEMA,
      maxItemsPerPoll: FLEXIBLE_INTEGER_SCHEMA,
    },
    additionalProperties: false,
  },
} as const satisfies Record<AdminChannelSchemaProviderType, JsonSchema>;

export const SOURCE_PROVIDER_CONFIG_SCHEMAS = ADMIN_CHANNEL_PAYLOAD_SCHEMAS;
export type SourceProviderConfigSchemaProviderType = AdminChannelSchemaProviderType;

function resolveAdminChannelSchemaProviderType(payload: Record<string, unknown>) {
  const providerType = String(payload.providerType ?? "rss").trim();
  return ADMIN_CHANNEL_PROVIDER_TYPES.find((candidate) => candidate === providerType) ?? null;
}

export function validateAdminChannelPayload(payload: unknown): JsonSchemaValidationIssue[] {
  if (!isRecord(payload)) {
    return [
      {
        path: "$",
        code: "invalid_type",
        message: "$ must be object.",
      },
    ];
  }

  const providerType = resolveAdminChannelSchemaProviderType(payload);
  if (!providerType) {
    return [
      {
        path: "providerType",
        code: "invalid_enum",
        message: "providerType contains an unsupported value.",
      },
    ];
  }

  return validateJsonSchema(payload, ADMIN_CHANNEL_PAYLOAD_SCHEMAS[providerType]);
}

export function assertAdminChannelPayload(
  payload: unknown,
  options: JsonSchemaValidationOptions = {}
): asserts payload is Record<string, unknown> {
  const issues = validateAdminChannelPayload(payload);
  if (issues.length === 0) {
    return;
  }

  const boundaryName = options.boundaryName ?? "admin channel payload";
  const firstIssue = issues[0];
  throw new Error(`${boundaryName} failed schema validation: ${firstIssue?.message}`);
}

export function validateSourceProviderConfig(
  providerType: SourceProviderConfigSchemaProviderType,
  payload: unknown
): JsonSchemaValidationIssue[] {
  return validateJsonSchema(payload, SOURCE_PROVIDER_CONFIG_SCHEMAS[providerType]);
}

export function assertSourceProviderConfig(
  providerType: SourceProviderConfigSchemaProviderType,
  payload: unknown,
  options: JsonSchemaValidationOptions = {}
): asserts payload is Record<string, unknown> {
  const issues = validateSourceProviderConfig(providerType, payload);
  if (issues.length === 0) {
    return;
  }

  const boundaryName = options.boundaryName ?? `${providerType} source provider config`;
  const firstIssue = issues[0];
  throw new Error(`${boundaryName} failed schema validation: ${firstIssue?.message}`);
}
