import assert from "node:assert/strict";
import test from "node:test";

import {
  ARTICLE_INGEST_REQUESTED_EVENT,
  FETCH_QUEUE,
  LLM_REVIEW_REQUESTED_EVENT,
  RESOURCE_INGEST_REQUESTED_EVENT,
  SEQUENCE_QUEUE
} from "../../../packages/contracts/src/queue.ts";
import { OutboxRelay } from "../../../services/relay/src/relay.ts";
import type {
  RelaySqlClient,
  SequenceRoutingRepository
} from "../../../services/relay/src/sequence-routing.ts";

interface PendingOutboxRow {
  event_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload_json: Record<string, unknown>;
}

class FakeQueue {
  jobs = new Map<string, FakeJob>();
  added: Array<{
    name: string;
    data: unknown;
    options: {
      jobId: string;
      removeOnComplete: number;
      removeOnFail: number;
      priority?: number;
    };
  }> = [];

  async add(
    name: string,
    data: unknown,
    options: {
      jobId: string;
      removeOnComplete: number;
      removeOnFail: number;
      priority?: number;
    }
  ): Promise<void> {
    this.added.push({ name, data, options });
    this.jobs.set(options.jobId, new FakeJob(options.priority ?? 0));
  }

  seedJob(jobId: string, priority = 0): FakeJob {
    const job = new FakeJob(priority);
    this.jobs.set(jobId, job);
    return job;
  }

  getSeededJob(jobId: string): FakeJob | undefined {
    return this.jobs.get(jobId);
  }

  async getJob(jobId: string): Promise<FakeJob | undefined> {
    return this.jobs.get(jobId);
  }

  async close(): Promise<void> {
    return undefined;
  }
}

class FakeJob {
  changePriorityCalls: Array<{
    priority: number;
    lifo?: boolean;
  }> = [];

  constructor(
    public priority: number
  ) {}

  async changePriority(options: {
    priority: number;
    lifo?: boolean;
  }): Promise<void> {
    this.priority = options.priority;
    this.changePriorityCalls.push(options);
  }
}

class FakeSequenceRoutingRepository implements SequenceRoutingRepository {
  readonly triggerLookups: string[] = [];
  readonly createInputs: Array<{
    sequenceId: string;
    contextJson: Record<string, unknown>;
    triggerType: "event";
    triggerMeta: Record<string, unknown>;
  }> = [];

  constructor(
    private readonly sequenceIds: readonly string[]
  ) {}

  async listActiveSequencesByTrigger(
    _client: RelaySqlClient,
    triggerEvent: string
  ): Promise<readonly { sequenceId: string }[]> {
    this.triggerLookups.push(triggerEvent);
    return this.sequenceIds.map((sequenceId) => ({ sequenceId }));
  }

  async createSequenceRun(
    _client: RelaySqlClient,
    input: {
      sequenceId: string;
      contextJson: Record<string, unknown>;
      triggerType: "event";
      triggerMeta: Record<string, unknown>;
    }
  ): Promise<{ runId: string; sequenceId: string }> {
    this.createInputs.push(input);
    return {
      runId: `run-for-${input.sequenceId}`,
      sequenceId: input.sequenceId
    };
  }
}

function createRelayHarness(sequenceIds: readonly string[]) {
  const queues = new Map<string, FakeQueue>();
  const repository = new FakeSequenceRoutingRepository(sequenceIds);
  const relay = new OutboxRelay({} as never, {} as never, 10, {
    queueMap: {
      ["source.channel.sync.requested"]: [FETCH_QUEUE]
    },
    queueFactory: (queueName) => {
      const queue = new FakeQueue();
      queues.set(queueName, queue);
      return queue;
    },
    sequenceRouting: {
      enabled: true,
      repository
    }
  });

  return { relay, repository, queues };
}

function createPriorityRepairPool(runIds: readonly string[]) {
  const queries: Array<{
    text: string;
    values?: readonly unknown[];
  }> = [];

  return {
    queries,
    pool: {
      connect: async () => ({
        query: async (text: string, values?: readonly unknown[]) => {
          queries.push({ text, values });
          const batchSize = Number(values?.[1] ?? runIds.length);
          const offset = Number(values?.[2] ?? 0);

          return {
            rows: runIds
              .slice(offset, offset + batchSize)
              .map((runId) => ({ runId }))
          };
        },
        release: () => undefined
      })
    }
  };
}

test("relay routes active sequence triggers into q.sequence without legacy queue fanout", async () => {
  const { relay, repository, queues } = createRelayHarness(["sequence-a", "sequence-b"]);
  const publishRow = (relay as any).publishRow.bind(relay) as (
    client: RelaySqlClient,
    row: PendingOutboxRow
  ) => Promise<void>;
  const row: PendingOutboxRow = {
    event_id: "event-1",
    event_type: ARTICLE_INGEST_REQUESTED_EVENT,
    aggregate_type: "article",
    aggregate_id: "doc-1",
    payload_json: {
      docId: "doc-1",
      version: 3
    }
  };

  await publishRow(
    {
      query: async () => ({ rows: [] })
    },
    row
  );

  assert.deepEqual(repository.triggerLookups, [ARTICLE_INGEST_REQUESTED_EVENT]);
  assert.equal(repository.createInputs.length, 2);
  assert.deepEqual(repository.createInputs[0]?.contextJson, {
    event_id: "event-1",
    doc_id: "doc-1",
    version: 3
  });
  assert.deepEqual(repository.createInputs[0]?.triggerMeta, {
    eventId: "event-1",
    eventType: ARTICLE_INGEST_REQUESTED_EVENT,
    aggregateType: "article",
    aggregateId: "doc-1"
  });

  const sequenceQueue = queues.get(SEQUENCE_QUEUE);
  const legacyQueue = queues.get(FETCH_QUEUE);

  assert.ok(sequenceQueue);
  assert.ok(legacyQueue);
  assert.equal(legacyQueue?.added.length, 0);
  assert.equal(sequenceQueue?.added.length, 2);
  assert.deepEqual(sequenceQueue?.added[0], {
    name: "sequence.run",
    data: {
      jobId: "run-for-sequence-a",
      runId: "run-for-sequence-a",
      sequenceId: "sequence-a"
    },
    options: {
      jobId: "run-for-sequence-a",
      removeOnComplete: 100,
      removeOnFail: 100,
      priority: 100
    }
  });
});

test("relay keeps llm review sequence jobs on the default wait lane", async () => {
  const { relay, queues } = createRelayHarness(["sequence-llm"]);
  const publishRow = (relay as any).publishRow.bind(relay) as (
    client: RelaySqlClient,
    row: PendingOutboxRow
  ) => Promise<void>;

  await publishRow(
    {
      query: async () => ({ rows: [] })
    },
    {
      event_id: "event-llm-1",
      event_type: LLM_REVIEW_REQUESTED_EVENT,
      aggregate_type: "article",
      aggregate_id: "doc-llm-1",
      payload_json: {
        docId: "doc-llm-1",
        targetId: "criterion-1",
        scope: "criterion",
        promptTemplateId: "template-1",
        version: 2
      }
    }
  );

  assert.deepEqual(queues.get(SEQUENCE_QUEUE)?.added[0]?.options, {
    jobId: "run-for-sequence-llm",
    removeOnComplete: 100,
    removeOnFail: 100
  });
});

test("relay repairs already enqueued article-ingest sequence jobs into the prioritized set", async () => {
  const { pool, queries } = createPriorityRepairPool([
    "run-article-a",
    "run-already-prioritized",
    "run-missing"
  ]);
  const queues = new Map<string, FakeQueue>();
  const relay = new OutboxRelay(pool as never, {} as never, 10, {
    queueMap: {
      ["source.channel.sync.requested"]: [FETCH_QUEUE]
    },
    queueFactory: (queueName) => {
      const queue = new FakeQueue();
      queues.set(queueName, queue);
      return queue;
    },
    sequenceRouting: {
      enabled: true,
      repository: new FakeSequenceRoutingRepository([])
    }
  });

  const sequenceQueue = queues.get(SEQUENCE_QUEUE);

  assert.ok(sequenceQueue);
  sequenceQueue?.seedJob("run-article-a", 0);
  sequenceQueue?.seedJob("run-already-prioritized", 100);

  const summary = await relay.repairPendingSequenceQueuePriorities();

  assert.deepEqual(summary, {
    inspectedRuns: 3,
    reprioritizedRuns: 1,
    alreadyPrioritizedRuns: 1,
    missingJobs: 1
  });
  assert.equal(sequenceQueue?.getSeededJob("run-article-a")?.priority, 100);
  assert.deepEqual(
    sequenceQueue?.getSeededJob("run-article-a")?.changePriorityCalls,
    [{ priority: 100 }]
  );
  assert.equal(
    sequenceQueue?.getSeededJob("run-already-prioritized")?.priority,
    100
  );
  assert.deepEqual(
    sequenceQueue?.getSeededJob("run-already-prioritized")?.changePriorityCalls,
    []
  );
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0]?.values, [
    ARTICLE_INGEST_REQUESTED_EVENT,
    500,
    0
  ]);
});

test("relay falls back to non-sequence queue fanout for non-managed events", async () => {
  const { relay, repository, queues } = createRelayHarness([]);
  const publishRow = (relay as any).publishRow.bind(relay) as (
    client: RelaySqlClient,
    row: PendingOutboxRow
  ) => Promise<void>;
  const row: PendingOutboxRow = {
    event_id: "event-2",
    event_type: "source.channel.sync.requested",
    aggregate_type: "source_channel",
    aggregate_id: "channel-2",
    payload_json: {
      channelId: "channel-2",
      version: 1
    }
  };

  await publishRow(
    {
      query: async () => ({ rows: [] })
    },
    row
  );

  assert.deepEqual(repository.triggerLookups, ["source.channel.sync.requested"]);
  assert.equal(repository.createInputs.length, 0);
  assert.equal(queues.get(SEQUENCE_QUEUE)?.added.length ?? 0, 0);
  assert.deepEqual(queues.get(FETCH_QUEUE)?.added[0], {
    name: "source.channel.sync.requested",
    data: {
      jobId: "event-2",
      eventId: "event-2",
      aggregateType: "source_channel",
      aggregateId: "channel-2",
      version: 1
    },
    options: {
      jobId: "event-2",
      removeOnComplete: 100,
      removeOnFail: 100
    }
  });
});

test("relay includes resource context when routing resource ingestion events into q.sequence", async () => {
  const { relay, repository, queues } = createRelayHarness(["sequence-resource"]);
  const publishRow = (relay as any).publishRow.bind(relay) as (
    client: RelaySqlClient,
    row: PendingOutboxRow
  ) => Promise<void>;

  await publishRow(
    {
      query: async () => ({ rows: [] })
    },
    {
      event_id: "event-resource-1",
      event_type: RESOURCE_INGEST_REQUESTED_EVENT,
      aggregate_type: "resource",
      aggregate_id: "resource-1",
      payload_json: {
        resourceId: "resource-1",
        version: 7
      }
    }
  );

  assert.deepEqual(repository.triggerLookups, [RESOURCE_INGEST_REQUESTED_EVENT]);
  assert.deepEqual(repository.createInputs[0]?.contextJson, {
    event_id: "event-resource-1",
    resource_id: "resource-1",
    version: 7
  });
  assert.equal(queues.get(FETCH_QUEUE)?.added.length ?? 0, 0);
  assert.equal(queues.get(SEQUENCE_QUEUE)?.added.length ?? 0, 1);
});

test("relay fails managed events when no active sequence exists after cutover", async () => {
  const { relay, repository, queues } = createRelayHarness([]);
  const publishRow = (relay as any).publishRow.bind(relay) as (
    client: RelaySqlClient,
    row: PendingOutboxRow
  ) => Promise<void>;

  await assert.rejects(
    publishRow(
      {
        query: async () => ({ rows: [] })
      },
      {
        event_id: "event-3",
        event_type: ARTICLE_INGEST_REQUESTED_EVENT,
        aggregate_type: "article",
        aggregate_id: "doc-3",
        payload_json: {
          docId: "doc-3",
          version: 1
        }
      }
    ),
    /No active sequence routing found/
  );

  assert.deepEqual(repository.triggerLookups, [ARTICLE_INGEST_REQUESTED_EVENT]);
  assert.equal(repository.createInputs.length, 0);
  assert.equal(queues.get(SEQUENCE_QUEUE)?.added.length ?? 0, 0);
});
