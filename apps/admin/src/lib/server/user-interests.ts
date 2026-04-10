import { randomUUID } from "node:crypto";

import { INTEREST_COMPILE_REQUESTED_EVENT } from "@newsportal/contracts";

import type { Pool, PoolClient } from "pg";

export type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

interface StoredUserInterestRow {
  interest_id: string;
  version: number;
  description: string;
  positive_texts: string[];
  negative_texts: string[];
  places: string[];
  languages_allowed: string[];
  time_window_hours: number | null;
  must_have_terms: string[];
  must_not_have_terms: string[];
  short_tokens_required: string[];
  short_tokens_forbidden: string[];
  priority: number;
  enabled: boolean;
}

interface TargetUserRow {
  user_id: string;
  email: string | null;
  status: string;
  is_anonymous: boolean;
}

export interface AdminUserInterestTarget {
  userId: string;
  email: string | null;
  status: string;
  isAnonymous: boolean;
}

export interface AdminUserInterestLookupInput {
  userId?: string;
  email?: string;
}

export interface UserInterestCreateInput {
  description: string;
  positiveTexts: string[];
  negativeTexts: string[];
  places: string[];
  languagesAllowed: string[];
  timeWindowHours: number | null;
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
  timeWindowHours?: number | null;
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

type InterestCompileRequestedEvent = {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
};

interface AdminUserInterestMutationBase {
  actorUserId: string;
  target: AdminUserInterestTarget;
  queueCompileRequest: (
    event: InterestCompileRequestedEvent
  ) => Promise<unknown> | unknown;
}

interface CreateAdminUserInterestInput extends AdminUserInterestMutationBase {
  interest: UserInterestCreateInput;
  interestId?: string;
}

interface UpdateAdminUserInterestInput extends AdminUserInterestMutationBase {
  interestId: string;
  patch: UserInterestUpdatePatch;
}

interface CloneAdminUserInterestInput extends AdminUserInterestMutationBase {
  interestId: string;
  descriptionOverride?: string;
}

interface DeleteAdminUserInterestInput {
  actorUserId: string;
  target: AdminUserInterestTarget;
  interestId: string;
}

function hasOwn(payload: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

function hasDefinedPatchKey<T extends object>(value: T, key: keyof T): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeEmail(value: unknown): string {
  return normalizeString(value).toLowerCase();
}

function parseLineList(value: unknown): string[] {
  return normalizeString(value)
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseCsvList(value: unknown): string[] {
  return normalizeString(value)
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function clampPriority(value: unknown, fallback = 1): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0.1, Math.min(parsed, 1));
}

function parseNullablePositiveInteger(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function normalizeEnabled(value: unknown, fallback = true): boolean {
  if (value == null) {
    return fallback;
  }
  return String(value) === "true";
}

function mapAdminTarget(row: TargetUserRow): AdminUserInterestTarget {
  return {
    userId: row.user_id,
    email: row.email,
    status: row.status,
    isAnonymous: row.is_anonymous === true,
  };
}

async function readUserInterestForOwner(
  queryable: Queryable,
  interestId: string,
  userId: string
): Promise<StoredUserInterestRow | null> {
  const result = await queryable.query<StoredUserInterestRow>(
    `
      select
        interest_id::text as interest_id,
        version,
        description,
        positive_texts,
        negative_texts,
        places,
        languages_allowed,
        time_window_hours,
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

async function createUserInterest(
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
        time_window_hours,
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
        $8,
        $9::jsonb,
        $10::jsonb,
        $11::jsonb,
        $12,
        $13,
        $14,
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
      input.timeWindowHours,
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

async function updateUserInterest(
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
  const nextTimeWindowHours = hasDefinedPatchKey(patch, "timeWindowHours")
    ? patch.timeWindowHours ?? null
    : current.time_window_hours ?? null;

  await queryable.query(
    `
      update user_interests
      set
        description = $3,
        positive_texts = $4::jsonb,
        negative_texts = $5::jsonb,
        places = $6::jsonb,
        languages_allowed = $7::jsonb,
        time_window_hours = $8,
        must_have_terms = $9::jsonb,
        must_not_have_terms = $10::jsonb,
        short_tokens_required = $11::jsonb,
        short_tokens_forbidden = $12::jsonb,
        priority = $13,
        enabled = $14,
        compiled = false,
        compile_status = 'queued',
        version = $15,
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
      nextTimeWindowHours,
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

async function cloneUserInterest(
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
      normalizeString(descriptionOverride) || `Copy of ${current.description}`,
    positiveTexts: current.positive_texts ?? [],
    negativeTexts: current.negative_texts ?? [],
    places: current.places ?? [],
    languagesAllowed: current.languages_allowed ?? [],
    timeWindowHours: current.time_window_hours ?? null,
    mustHaveTerms: current.must_have_terms ?? [],
    mustNotHaveTerms: current.must_not_have_terms ?? [],
    shortTokensRequired: current.short_tokens_required ?? [],
    shortTokensForbidden: current.short_tokens_forbidden ?? [],
    priority: Number(current.priority ?? 1),
    enabled: true,
  });
}

async function deleteUserInterest(
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

async function writeUserInterestAuditLog(
  queryable: Queryable,
  actorUserId: string,
  actionType: string,
  interestId: string,
  payloadJson: Record<string, unknown>
): Promise<void> {
  await queryable.query(
    `
      insert into audit_log (
        actor_user_id,
        action_type,
        entity_type,
        entity_id,
        payload_json
      )
      values ($1, $2, 'user_interest', $3, $4::jsonb)
    `,
    [actorUserId, actionType, interestId, JSON.stringify(payloadJson)]
  );
}

export function parseUserInterestCreateInput(
  payload: Record<string, unknown>
): UserInterestCreateInput {
  const description = normalizeString(payload.description);
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
    timeWindowHours: parseNullablePositiveInteger(payload.time_window_hours),
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
    const description = normalizeString(payload.description);
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
  if (hasOwn(payload, "time_window_hours")) {
    patch.timeWindowHours = parseNullablePositiveInteger(payload.time_window_hours);
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

export function buildInterestCompileRequestedEvent(
  interestId: string,
  version: number
): InterestCompileRequestedEvent {
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

export function resolveAdminUserInterestLookupInput(
  payload: Record<string, unknown>
): AdminUserInterestLookupInput {
  const userId =
    normalizeString(payload.userId) || normalizeString(payload.user_id);
  if (userId) {
    return { userId };
  }

  const email = normalizeEmail(payload.email);
  if (email) {
    return { email };
  }

  return {};
}

export async function findAdminUserInterestTarget(
  queryable: Queryable,
  lookup: AdminUserInterestLookupInput
): Promise<AdminUserInterestTarget | null> {
  if (lookup.userId) {
    const result = await queryable.query<TargetUserRow>(
      `
        select
          user_id::text as user_id,
          email,
          status,
          is_anonymous
        from users
        where user_id = $1
        limit 1
      `,
      [lookup.userId]
    );

    const row = result.rows[0];
    return row ? mapAdminTarget(row) : null;
  }

  if (!lookup.email) {
    return null;
  }

  const result = await queryable.query<TargetUserRow>(
    `
      select
        user_id::text as user_id,
        email,
        status,
        is_anonymous
      from users
      where lower(coalesce(email, '')) = lower($1)
      order by created_at asc
    `,
    [lookup.email]
  );

  if (result.rows.length > 1) {
    throw new Error("Multiple users matched this email.");
  }

  const row = result.rows[0];
  return row ? mapAdminTarget(row) : null;
}

export async function listAdminUserInterests(
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

export async function createAdminUserInterest(
  queryable: Queryable,
  input: CreateAdminUserInterestInput
): Promise<UserInterestMutationResult> {
  const result = await createUserInterest(
    queryable,
    input.target.userId,
    input.interest,
    input.interestId
  );
  await input.queueCompileRequest(
    buildInterestCompileRequestedEvent(result.interestId, result.version)
  );
  await writeUserInterestAuditLog(
    queryable,
    input.actorUserId,
    "user_interest_created",
    result.interestId,
    {
      targetUserId: input.target.userId,
      targetUserEmail: input.target.email,
      targetUserStatus: input.target.status,
      targetUserIsAnonymous: input.target.isAnonymous,
      description: input.interest.description,
      version: result.version,
      compileRequested: true,
    }
  );
  return result;
}

export async function updateAdminUserInterest(
  queryable: Queryable,
  input: UpdateAdminUserInterestInput
): Promise<UserInterestMutationResult> {
  const result = await updateUserInterest(
    queryable,
    input.interestId,
    input.target.userId,
    input.patch
  );
  await input.queueCompileRequest(
    buildInterestCompileRequestedEvent(result.interestId, result.version)
  );
  await writeUserInterestAuditLog(
    queryable,
    input.actorUserId,
    "user_interest_updated",
    result.interestId,
    {
      targetUserId: input.target.userId,
      targetUserEmail: input.target.email,
      targetUserStatus: input.target.status,
      targetUserIsAnonymous: input.target.isAnonymous,
      updatedFields: Object.keys(input.patch),
      version: result.version,
      compileRequested: true,
    }
  );
  return result;
}

export async function cloneAdminUserInterest(
  queryable: Queryable,
  input: CloneAdminUserInterestInput
): Promise<UserInterestMutationResult> {
  const result = await cloneUserInterest(
    queryable,
    input.interestId,
    input.target.userId,
    input.descriptionOverride
  );
  await input.queueCompileRequest(
    buildInterestCompileRequestedEvent(result.interestId, result.version)
  );
  await writeUserInterestAuditLog(
    queryable,
    input.actorUserId,
    "user_interest_cloned",
    result.interestId,
    {
      targetUserId: input.target.userId,
      targetUserEmail: input.target.email,
      targetUserStatus: input.target.status,
      targetUserIsAnonymous: input.target.isAnonymous,
      sourceInterestId: input.interestId,
      version: result.version,
      compileRequested: true,
    }
  );
  return result;
}

export async function deleteAdminUserInterest(
  queryable: Queryable,
  input: DeleteAdminUserInterestInput
): Promise<void> {
  const deleted = await deleteUserInterest(
    queryable,
    input.interestId,
    input.target.userId
  );
  if (!deleted) {
    throw new Error("Interest not found.");
  }

  await writeUserInterestAuditLog(
    queryable,
    input.actorUserId,
    "user_interest_deleted",
    input.interestId,
    {
      targetUserId: input.target.userId,
      targetUserEmail: input.target.email,
      targetUserStatus: input.target.status,
      targetUserIsAnonymous: input.target.isAnonymous,
    }
  );
}
