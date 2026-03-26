import assert from "node:assert/strict";
import test from "node:test";

import {
  createAdminUserInterest,
  findAdminUserInterestTarget,
  resolveAdminUserInterestLookupInput,
  updateAdminUserInterest,
} from "../../../apps/admin/src/lib/server/user-interests.ts";

type QueryResponse = {
  rowCount?: number;
  rows?: unknown[];
};

function createQueryable(responses: QueryResponse[]) {
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const queue = [...responses];

  return {
    calls,
    query: async <T>(sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      const next = queue.shift();
      if (!next) {
        throw new Error(`Unexpected query: ${sql}`);
      }
      return {
        rowCount: next.rowCount,
        rows: (next.rows ?? []) as T[],
      };
    },
  };
}

const target = {
  userId: "user-1",
  email: "reader@example.com",
  status: "active",
  isAnonymous: false,
};

test("resolveAdminUserInterestLookupInput accepts user_id and normalizes email", () => {
  assert.deepEqual(
    resolveAdminUserInterestLookupInput({
      user_id: "  user-123  ",
      email: "UPPER@example.com",
    }),
    { userId: "user-123" }
  );
  assert.deepEqual(
    resolveAdminUserInterestLookupInput({
      email: "UPPER@example.com",
    }),
    { email: "upper@example.com" }
  );
});

test("findAdminUserInterestTarget rejects ambiguous email matches", async () => {
  const queryable = createQueryable([
    {
      rows: [
        {
          user_id: "user-1",
          email: "reader@example.com",
          status: "active",
          is_anonymous: false,
        },
        {
          user_id: "user-2",
          email: "reader@example.com",
          status: "active",
          is_anonymous: false,
        },
      ],
    },
  ]);

  await assert.rejects(
    () =>
      findAdminUserInterestTarget(queryable, {
        email: "reader@example.com",
      }),
    /Multiple users matched this email\./
  );
});

test("createAdminUserInterest queues compile work for the selected target user and audits the action", async () => {
  const queryable = createQueryable([{ rows: [] }, { rows: [] }]);
  const queued: Array<Record<string, unknown>> = [];

  const result = await createAdminUserInterest(queryable, {
    actorUserId: "admin-1",
    target,
    interestId: "interest-1",
    interest: {
      description: "AI policy",
      positiveTexts: ["AI policy"],
      negativeTexts: ["sports"],
      places: ["EU"],
      languagesAllowed: ["en"],
      mustHaveTerms: ["policy"],
      mustNotHaveTerms: [],
      shortTokensRequired: [],
      shortTokensForbidden: [],
      priority: 0.8,
      enabled: true,
    },
    queueCompileRequest: async (event) => {
      queued.push(event);
    },
  });

  assert.deepEqual(result, {
    interestId: "interest-1",
    version: 1,
  });
  assert.equal(queryable.calls[0]?.params?.[1], "user-1");
  assert.deepEqual(queued[0], {
    eventType: "interest.compile.requested",
    aggregateType: "interest",
    aggregateId: "interest-1",
    payload: {
      interestId: "interest-1",
      version: 1,
    },
  });

  const auditPayload = JSON.parse(String(queryable.calls[1]?.params?.[3] ?? "{}"));
  assert.deepEqual(auditPayload, {
    targetUserId: "user-1",
    targetUserEmail: "reader@example.com",
    targetUserStatus: "active",
    targetUserIsAnonymous: false,
    description: "AI policy",
    version: 1,
    compileRequested: true,
  });
});

test("updateAdminUserInterest preserves ownership and requeues compilation on behalf of the selected user", async () => {
  const queryable = createQueryable([
    {
      rows: [
        {
          interest_id: "interest-9",
          version: 3,
          description: "AI policy",
          positive_texts: ["AI policy"],
          negative_texts: [],
          places: ["EU"],
          languages_allowed: ["en"],
          must_have_terms: [],
          must_not_have_terms: [],
          short_tokens_required: [],
          short_tokens_forbidden: [],
          priority: 1,
          enabled: true,
        },
      ],
    },
    { rows: [] },
    { rows: [] },
  ]);
  const queued: Array<Record<string, unknown>> = [];

  const result = await updateAdminUserInterest(queryable, {
    actorUserId: "admin-1",
    target,
    interestId: "interest-9",
    patch: {
      places: ["Warsaw"],
      enabled: false,
    },
    queueCompileRequest: async (event) => {
      queued.push(event);
    },
  });

  assert.deepEqual(result, {
    interestId: "interest-9",
    version: 4,
  });
  assert.equal(queryable.calls[1]?.params?.[1], "user-1");
  assert.equal(queryable.calls[1]?.params?.[12], false);
  assert.deepEqual(queued[0], {
    eventType: "interest.compile.requested",
    aggregateType: "interest",
    aggregateId: "interest-9",
    payload: {
      interestId: "interest-9",
      version: 4,
    },
  });

  const auditPayload = JSON.parse(String(queryable.calls[2]?.params?.[3] ?? "{}"));
  assert.deepEqual(auditPayload, {
    targetUserId: "user-1",
    targetUserEmail: "reader@example.com",
    targetUserStatus: "active",
    targetUserIsAnonymous: false,
    updatedFields: ["places", "enabled"],
    version: 4,
    compileRequested: true,
  });
});
