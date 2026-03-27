import { Queue } from "bullmq";
import {
  OUTBOX_EVENT_QUEUE_MAP,
  SEQUENCE_QUEUE,
  isSequenceManagedOutboxEvent,
  isCriterionCompileOutboxEvent,
  isInterestCompileOutboxEvent,
  isLlmReviewOutboxEvent,
  isNotificationFeedbackOutboxEvent,
  isReindexOutboxEvent,
  isArticleOutboxEvent,
  type ArticleQueueJobPayload,
  type CriterionCompileQueueJobPayload,
  type InterestCompileQueueJobPayload,
  type LlmReviewQueueJobPayload,
  type NotificationFeedbackQueueJobPayload,
  type ReindexQueueJobPayload,
  type SequenceQueueJobPayload,
  type ThinQueueJobPayload
} from "@newsportal/contracts";
import type IORedis from "ioredis";
import type { Pool } from "pg";
import type {
  RelaySqlClient,
  SequenceRoutingRepository
} from "./sequence-routing";

interface RelayState {
  isPolling: boolean;
  lastPollStartedAt: string | null;
  lastPollCompletedAt: string | null;
  lastPublishedEventId: string | null;
  lastError: string | null;
  publishedCount: number;
  failedCount: number;
}

interface PendingOutboxRow {
  event_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload_json: Record<string, unknown>;
}

type RelayOutboxRow = PendingOutboxRow;

interface OutboxRelayOptions {
  queueMap?: Record<string, readonly string[]>;
  queueFactory?: (queueName: string, connection: IORedis) => QueueLike;
  sequenceRouting?: SequenceRoutingOptions;
}

interface QueueLike {
  add(
    name: string,
    data: unknown,
    options: {
      jobId: string;
      removeOnComplete: number;
      removeOnFail: number;
    }
  ): Promise<unknown>;
  close(): Promise<void>;
}

interface SequenceRoutingOptions {
  enabled: boolean;
  repository: SequenceRoutingRepository;
  queueName?: string;
  jobName?: string;
}

export class OutboxRelay {
  private readonly queues = new Map<string, QueueLike>();
  private readonly queueMap: Record<string, readonly string[]>;
  private readonly queueFactory: (queueName: string, connection: IORedis) => QueueLike;
  private readonly sequenceRouting?: SequenceRoutingOptions;
  private readonly state: RelayState = {
    isPolling: false,
    lastPollStartedAt: null,
    lastPollCompletedAt: null,
    lastPublishedEventId: null,
    lastError: null,
    publishedCount: 0,
    failedCount: 0
  };

  constructor(
    private readonly pool: Pool,
    connection: IORedis,
    private readonly batchSize: number,
    options: OutboxRelayOptions = {}
  ) {
    this.queueMap = options.queueMap ?? OUTBOX_EVENT_QUEUE_MAP;
    this.queueFactory =
      options.queueFactory ??
      ((queueName, queueConnection) =>
        new Queue(queueName, {
          connection: queueConnection
        }));
    this.sequenceRouting = options.sequenceRouting;

    const queueNames = new Set(
      Object.values(this.queueMap).flatMap((queueNameList) => queueNameList)
    );
    if (this.sequenceRouting?.enabled) {
      queueNames.add(this.sequenceRouting.queueName ?? SEQUENCE_QUEUE);
    }

    for (const queueName of queueNames) {
      this.queues.set(queueName, this.queueFactory(queueName, connection));
    }
  }

  getState(): RelayState {
    return {
      ...this.state
    };
  }

  async pollOnce(): Promise<void> {
    if (this.state.isPolling) {
      return;
    }

    this.state.isPolling = true;
    this.state.lastPollStartedAt = new Date().toISOString();

    const client = await this.pool.connect();

    try {
      await client.query("begin");

      const pendingRows = await client.query<PendingOutboxRow>(
        `
          select
            event_id::text as event_id,
            event_type,
            aggregate_type,
            aggregate_id::text as aggregate_id,
            payload_json
          from outbox_events
          where status = 'pending'
          order by created_at
          limit $1
          for update skip locked
        `,
        [this.batchSize]
      );

      for (const row of pendingRows.rows) {
        try {
          await this.publishRow(client, row);
          await client.query(
            `
              update outbox_events
              set
                status = 'published',
                published_at = now(),
                attempt_count = attempt_count + 1,
                error_message = null
              where event_id = $1
            `,
            [row.event_id]
          );
          this.state.lastPublishedEventId = row.event_id;
          this.state.publishedCount += 1;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown relay failure";
          await client.query(
            `
              update outbox_events
              set
                status = 'failed',
                attempt_count = attempt_count + 1,
                error_message = $2
              where event_id = $1
            `,
            [row.event_id, message]
          );
          this.state.failedCount += 1;
          this.state.lastError = message;
        }
      }

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      this.state.lastError =
        error instanceof Error ? error.message : "Unknown relay transaction failure";
      throw error;
    } finally {
      client.release();
      this.state.isPolling = false;
      this.state.lastPollCompletedAt = new Date().toISOString();
    }
  }

  async close(): Promise<void> {
    await Promise.all(
      Array.from(this.queues.values(), (queue) => queue.close())
    );
  }

  async enqueueOutboxRow(row: RelayOutboxRow): Promise<void> {
    const queueNames = this.queueMap[row.event_type];

    if (!queueNames || queueNames.length === 0) {
      throw new Error(`No BullMQ queue mapping found for event type ${row.event_type}.`);
    }

    const payload = this.createQueuePayload(row);

    for (const queueName of queueNames) {
      const queue = this.queues.get(queueName);

      if (!queue) {
        throw new Error(`BullMQ queue ${queueName} is not configured.`);
      }

      await queue.add(row.event_type, payload, {
        jobId: row.event_id,
        removeOnComplete: 100,
        removeOnFail: 100
      });
    }
  }

  private async publishRow(
    client: RelaySqlClient,
    row: PendingOutboxRow
  ): Promise<void> {
    const routedToSequences = await this.routeToSequences(client, row);

    if (routedToSequences) {
      return;
    }

    if (
      this.sequenceRouting?.enabled &&
      isSequenceManagedOutboxEvent(row.event_type)
    ) {
      throw new Error(
        `No active sequence routing found for sequence-managed event type ${row.event_type}.`
      );
    }

    await this.enqueueOutboxRow(row);
  }

  private async routeToSequences(
    client: RelaySqlClient,
    row: PendingOutboxRow
  ): Promise<boolean> {
    if (!this.sequenceRouting?.enabled) {
      return false;
    }

    const sequenceRoutes =
      await this.sequenceRouting.repository.listActiveSequencesByTrigger(
        client,
        row.event_type
      );

    if (sequenceRoutes.length === 0) {
      return false;
    }

    const sequenceQueueName = this.sequenceRouting.queueName ?? SEQUENCE_QUEUE;
    const sequenceQueue = this.queues.get(sequenceQueueName);

    if (!sequenceQueue) {
      throw new Error(`BullMQ queue ${sequenceQueueName} is not configured.`);
    }

    const baseContext = this.createSequenceContext(row);
    const triggerMeta = this.createSequenceTriggerMeta(row);
    const sequenceJobName = this.sequenceRouting.jobName ?? "sequence.run";

    for (const sequenceRoute of sequenceRoutes) {
      const createdRun = await this.sequenceRouting.repository.createSequenceRun(client, {
        sequenceId: sequenceRoute.sequenceId,
        contextJson: { ...baseContext },
        triggerType: "event",
        triggerMeta: { ...triggerMeta }
      });

      const payload: SequenceQueueJobPayload = {
        jobId: createdRun.runId,
        runId: createdRun.runId,
        sequenceId: createdRun.sequenceId
      };

      await sequenceQueue.add(sequenceJobName, payload, {
        jobId: createdRun.runId,
        removeOnComplete: 100,
        removeOnFail: 100
      });
    }

    return true;
  }

  private createQueuePayload(
    row: PendingOutboxRow
  ):
    | ThinQueueJobPayload
    | ArticleQueueJobPayload
    | InterestCompileQueueJobPayload
    | CriterionCompileQueueJobPayload
    | LlmReviewQueueJobPayload
    | NotificationFeedbackQueueJobPayload
    | ReindexQueueJobPayload {
    const payloadVersion = this.readPayloadVersion(row.payload_json);

    if (isArticleOutboxEvent(row.event_type)) {
      return {
        jobId: row.event_id,
        eventId: row.event_id,
        docId: this.readStringValue(row.payload_json.docId, row.aggregate_id),
        version: payloadVersion
      };
    }

    if (isInterestCompileOutboxEvent(row.event_type)) {
      return {
        jobId: row.event_id,
        eventId: row.event_id,
        interestId: this.readStringValue(row.payload_json.interestId, row.aggregate_id),
        version: payloadVersion
      };
    }

    if (isCriterionCompileOutboxEvent(row.event_type)) {
      return {
        jobId: row.event_id,
        eventId: row.event_id,
        criterionId: this.readStringValue(row.payload_json.criterionId, row.aggregate_id),
        version: payloadVersion
      };
    }

    if (isLlmReviewOutboxEvent(row.event_type)) {
      return {
        jobId: row.event_id,
        eventId: row.event_id,
        docId: this.readStringValue(row.payload_json.docId, row.aggregate_id),
        scope: this.readScopeValue(row.payload_json.scope),
        targetId: this.readStringValue(row.payload_json.targetId, row.aggregate_id),
        promptTemplateId: this.readNullableStringValue(row.payload_json.promptTemplateId),
        version: payloadVersion
      };
    }

    if (isNotificationFeedbackOutboxEvent(row.event_type)) {
      return {
        jobId: row.event_id,
        eventId: row.event_id,
        notificationId: this.readStringValue(row.payload_json.notificationId, row.aggregate_id),
        docId: this.readStringValue(row.payload_json.docId, row.aggregate_id),
        userId: this.readStringValue(row.payload_json.userId, row.aggregate_id),
        interestId: this.readNullableStringValue(row.payload_json.interestId),
        version: payloadVersion
      };
    }

    if (isReindexOutboxEvent(row.event_type)) {
      return {
        jobId: row.event_id,
        eventId: row.event_id,
        reindexJobId: this.readStringValue(row.payload_json.reindexJobId, row.aggregate_id),
        indexName: this.readStringValue(row.payload_json.indexName, "interest_centroids"),
        version: payloadVersion
      };
    }

    return {
      jobId: row.event_id,
      eventId: row.event_id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      version: payloadVersion
    };
  }

  private createSequenceContext(
    row: PendingOutboxRow
  ): Record<string, unknown> {
    const queuePayload = this.createQueuePayload(row);
    return Object.fromEntries(
      Object.entries(queuePayload)
        .filter(([key]) => key !== "jobId")
        .map(([key, value]) => [this.toSnakeCase(key), value])
    );
  }

  private createSequenceTriggerMeta(
    row: PendingOutboxRow
  ): Record<string, unknown> {
    return {
      eventId: row.event_id,
      eventType: row.event_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id
    };
  }

  private readStringValue(value: unknown, fallback: string): string {
    return typeof value === "string" && value.length > 0 ? value : fallback;
  }

  private readNullableStringValue(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
  }

  private readScopeValue(value: unknown): "criterion" | "interest" {
    return value === "criterion" ? "criterion" : "interest";
  }

  private readPayloadVersion(payloadJson: Record<string, unknown>): number {
    const rawVersion = payloadJson.version;

    if (typeof rawVersion === "number" && Number.isInteger(rawVersion) && rawVersion > 0) {
      return rawVersion;
    }

    return 1;
  }

  private toSnakeCase(value: string): string {
    return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  }
}
