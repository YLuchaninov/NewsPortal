import { randomUUID } from "node:crypto";

import { INTEREST_COMPILE_REQUESTED_EVENT } from "@newsportal/contracts";

import type { PoolClient } from "pg";

export type Queryable = Pick<PoolClient, "query">;

interface StoredUserInterestRow {
  interest_id: string;
  version: number;
  description: string;
  positive_texts: string[];
  negative_texts: string[];
  places: string[];
  languages_allowed: string[];
  must_have_terms: string[];
  must_not_have_terms: string[];
  short_tokens_required: string[];
  short_tokens_forbidden: string[];
  priority: number;
  enabled: boolean;
}

export interface UserInterestCreateInput {
  description: string;
  positiveTexts: string[];
  negativeTexts: string[];
  places: string[];
  languagesAllowed: string[];
  mustHaveTerms: string[];
  mustNotHaveTerms: string[];
  shortTokensRequired: string[];
  shortTokensForbidden: string[];
  priority: number;
  enabled: boolean;
}

export interface UserInterestUpdatePatch {
  description?: string;
  positiveTexts?: string[];
  negativeTexts?: string[];
  places?: string[];
  languagesAllowed?: string[];
  mustHaveTerms?: string[];
  mustNotHaveTerms?: string[];
  shortTokensRequired?: string[];
  shortTokensForbidden?: string[];
  priority?: number;
  enabled?: boolean;
}

export interface UserInterestMutationResult {
  interestId: string;
  version: number;
}

function hasOwn(payload: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

function parseLineList(value: unknown): string[] {
  return String(value ?? "")
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseCsvList(value: unknown): string[] {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeDescription(value: unknown): string {
  return String(value ?? "").trim();
}

function clampPriority(value: unknown, fallback = 1): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0.1, Math.min(parsed, 1));
}

function normalizeEnabled(value: unknown, fallback = true): boolean {
  if (value == null) {
    return fallback;
  }
  return String(value) === "true";
}

export function parseUserInterestCreateInput(
  payload: Record<string, unknown>
): UserInterestCreateInput {
  const description = normalizeDescription(payload.description);
  if (!description) {
    throw new Error("Description is required.");
  }

  const positiveTexts = parseLineList(payload.positive_texts);

  return {
    description,
    positiveTexts: positiveTexts.length > 0 ? positiveTexts : [description],
    negativeTexts: parseLineList(payload.negative_texts),
    places: parseCsvList(payload.places),
    languagesAllowed: (() => {
      const values = parseCsvList(payload.languages_allowed);
      return values.length > 0 ? values : ["en"];
    })(),
    mustHaveTerms: parseCsvList(payload.must_have_terms),
    mustNotHaveTerms: parseCsvList(payload.must_not_have_terms),
    shortTokensRequired: parseCsvList(payload.short_tokens_required),
    shortTokensForbidden: parseCsvList(payload.short_tokens_forbidden),
    priority: clampPriority(payload.priority, 1),
    enabled: normalizeEnabled(payload.enabled, true),
  };
}

export function buildUserInterestUpdatePatch(
  payload: Record<string, unknown>
): UserInterestUpdatePatch {
  const patch: UserInterestUpdatePatch = {};

  if (hasOwn(payload, "description")) {
    const description = normalizeDescription(payload.description);
    if (description) {
      patch.description = description;
    }
  }
  if (hasOwn(payload, "positive_texts")) {
    patch.positiveTexts = parseLineList(payload.positive_texts);
  }
  if (hasOwn(payload, "negative_texts")) {
    patch.negativeTexts = parseLineList(payload.negative_texts);
  }
  if (hasOwn(payload, "places")) {
    patch.places = parseCsvList(payload.places);
  }
  if (hasOwn(payload, "languages_allowed")) {
    patch.languagesAllowed = parseCsvList(payload.languages_allowed);
  }
  if (hasOwn(payload, "must_have_terms")) {
    patch.mustHaveTerms = parseCsvList(payload.must_have_terms);
  }
  if (hasOwn(payload, "must_not_have_terms")) {
    patch.mustNotHaveTerms = parseCsvList(payload.must_not_have_terms);
  }
  if (hasOwn(payload, "short_tokens_required")) {
    patch.shortTokensRequired = parseCsvList(payload.short_tokens_required);
  }
  if (hasOwn(payload, "short_tokens_forbidden")) {
    patch.shortTokensForbidden = parseCsvList(payload.short_tokens_forbidden);
  }
  if (hasOwn(payload, "priority")) {
    patch.priority = clampPriority(payload.priority, 1);
  }
  if (hasOwn(payload, "enabled")) {
    patch.enabled = normalizeEnabled(payload.enabled, true);
  }

  return patch;
}

export async function readUserInterestForOwner(
  queryable: Queryable,
  interestId: string,
  userId: string
): Promise<StoredUserInterestRow | null> {
  const result = await queryable.query<StoredUserInterestRow>(
    `
      select
        interest_id,
        version,
        description,
        positive_texts,
        negative_texts,
        places,
        languages_allowed,
        must_have_terms,
        must_not_have_terms,
        short_tokens_required,
        short_tokens_forbidden,
        priority,
        enabled
      from user_interests
      where interest_id = $1 and user_id = $2
    `,
    [interestId, userId]
  );

  return result.rows[0] ?? null;
}

export async function listUserInterestsForOwner(
  queryable: Queryable,
  userId: string
): Promise<Record<string, unknown>[]> {
  const result = await queryable.query<Record<string, unknown>>(
    `
      select
        ui.*,
        uic.compiled_json,
        uic.compiled_at,
        uic.error_text
      from user_interests ui
      left join user_interests_compiled uic on uic.interest_id = ui.interest_id
      where ui.user_id = $1
      order by ui.updated_at desc
    `,
    [userId]
  );

  return result.rows;
}

export async function createUserInterest(
  queryable: Queryable,
  userId: string,
  input: UserInterestCreateInput,
  interestId: string = randomUUID()
): Promise<UserInterestMutationResult> {
  await queryable.query(
    `
      insert into user_interests (
        interest_id,
        user_id,
        description,
        positive_texts,
        negative_texts,
        places,
        languages_allowed,
        must_have_terms,
        must_not_have_terms,
        short_tokens_required,
        short_tokens_forbidden,
        priority,
        enabled,
        compiled,
        compile_status,
        version
      )
      values (
        $1,
        $2,
        $3,
        $4::jsonb,
        $5::jsonb,
        $6::jsonb,
        $7::jsonb,
        $8::jsonb,
        $9::jsonb,
        $10::jsonb,
        $11::jsonb,
        $12,
        $13,
        false,
        'queued',
        1
      )
    `,
    [
      interestId,
      userId,
      input.description,
      JSON.stringify(input.positiveTexts),
      JSON.stringify(input.negativeTexts),
      JSON.stringify(input.places),
      JSON.stringify(input.languagesAllowed),
      JSON.stringify(input.mustHaveTerms),
      JSON.stringify(input.mustNotHaveTerms),
      JSON.stringify(input.shortTokensRequired),
      JSON.stringify(input.shortTokensForbidden),
      input.priority,
      input.enabled,
    ]
  );

  return {
    interestId,
    version: 1,
  };
}

export async function updateUserInterest(
  queryable: Queryable,
  interestId: string,
  userId: string,
  patch: UserInterestUpdatePatch
): Promise<UserInterestMutationResult> {
  const current = await readUserInterestForOwner(queryable, interestId, userId);
  if (!current) {
    throw new Error("Interest not found.");
  }

  const nextVersion = current.version + 1;

  await queryable.query(
    `
      update user_interests
      set
        description = $3,
        positive_texts = $4::jsonb,
        negative_texts = $5::jsonb,
        places = $6::jsonb,
        languages_allowed = $7::jsonb,
        must_have_terms = $8::jsonb,
        must_not_have_terms = $9::jsonb,
        short_tokens_required = $10::jsonb,
        short_tokens_forbidden = $11::jsonb,
        priority = $12,
        enabled = $13,
        compiled = false,
        compile_status = 'queued',
        version = $14,
        updated_at = now()
      where interest_id = $1 and user_id = $2
    `,
    [
      interestId,
      userId,
      patch.description ?? current.description,
      JSON.stringify(patch.positiveTexts ?? current.positive_texts ?? []),
      JSON.stringify(patch.negativeTexts ?? current.negative_texts ?? []),
      JSON.stringify(patch.places ?? current.places ?? []),
      JSON.stringify(patch.languagesAllowed ?? current.languages_allowed ?? []),
      JSON.stringify(patch.mustHaveTerms ?? current.must_have_terms ?? []),
      JSON.stringify(patch.mustNotHaveTerms ?? current.must_not_have_terms ?? []),
      JSON.stringify(
        patch.shortTokensRequired ?? current.short_tokens_required ?? []
      ),
      JSON.stringify(
        patch.shortTokensForbidden ?? current.short_tokens_forbidden ?? []
      ),
      patch.priority ?? Number(current.priority ?? 1),
      patch.enabled ?? current.enabled,
      nextVersion,
    ]
  );

  return {
    interestId,
    version: nextVersion,
  };
}

export async function cloneUserInterest(
  queryable: Queryable,
  interestId: string,
  userId: string,
  descriptionOverride?: string
): Promise<UserInterestMutationResult> {
  const current = await readUserInterestForOwner(queryable, interestId, userId);
  if (!current) {
    throw new Error("Interest not found.");
  }

  return createUserInterest(queryable, userId, {
    description:
      normalizeDescription(descriptionOverride) || `Copy of ${current.description}`,
    positiveTexts: current.positive_texts ?? [],
    negativeTexts: current.negative_texts ?? [],
    places: current.places ?? [],
    languagesAllowed: current.languages_allowed ?? [],
    mustHaveTerms: current.must_have_terms ?? [],
    mustNotHaveTerms: current.must_not_have_terms ?? [],
    shortTokensRequired: current.short_tokens_required ?? [],
    shortTokensForbidden: current.short_tokens_forbidden ?? [],
    priority: Number(current.priority ?? 1),
    enabled: true,
  });
}

export async function deleteUserInterest(
  queryable: Queryable,
  interestId: string,
  userId: string
): Promise<boolean> {
  const result = await queryable.query(
    `
      delete from user_interests
      where interest_id = $1 and user_id = $2
    `,
    [interestId, userId]
  );

  return Number(result.rowCount ?? 0) > 0;
}

export function buildInterestCompileRequestedEvent(
  interestId: string,
  version: number
): {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
} {
  return {
    eventType: INTEREST_COMPILE_REQUESTED_EVENT,
    aggregateType: "interest",
    aggregateId: interestId,
    payload: {
      interestId,
      version,
    },
  };
}
