export const FOUNDATION_SMOKE_EVENT = "foundation.smoke.requested";
export const FOUNDATION_SMOKE_QUEUE = "q.foundation.smoke";
export const SOURCE_CHANNEL_SYNC_REQUESTED_EVENT = "source.channel.sync.requested";
export const FETCH_QUEUE = "q.fetch";
export const ARTICLE_INGEST_REQUESTED_EVENT = "article.ingest.requested";
export const ARTICLE_NORMALIZED_EVENT = "article.normalized";
export const ARTICLE_EMBEDDED_EVENT = "article.embedded";
export const ARTICLE_CLUSTERED_EVENT = "article.clustered";
export const ARTICLE_CRITERIA_MATCHED_EVENT = "article.criteria.matched";
export const ARTICLE_INTERESTS_MATCHED_EVENT = "article.interests.matched";
export const LLM_REVIEW_REQUESTED_EVENT = "llm.review.requested";
export const NOTIFICATION_FEEDBACK_RECORDED_EVENT = "notification.feedback.recorded";
export const REINDEX_REQUESTED_EVENT = "reindex.requested";
export const NORMALIZE_QUEUE = "q.normalize";
export const DEDUP_QUEUE = "q.dedup";
export const EMBED_QUEUE = "q.embed";
export const CLUSTER_QUEUE = "q.cluster";
export const CRITERIA_MATCH_QUEUE = "q.match.criteria";
export const INTEREST_MATCH_QUEUE = "q.match.interests";
export const NOTIFY_QUEUE = "q.notify";
export const LLM_REVIEW_QUEUE = "q.llm.review";
export const FEEDBACK_INGEST_QUEUE = "q.feedback.ingest";
export const REINDEX_QUEUE = "q.reindex";
export const INTEREST_COMPILE_REQUESTED_EVENT = "interest.compile.requested";
export const INTEREST_COMPILE_QUEUE = "q.interest.compile";
export const CRITERION_COMPILE_REQUESTED_EVENT = "criterion.compile.requested";
export const CRITERION_COMPILE_QUEUE = "q.criterion.compile";

export interface OutboxEventQueueMapOptions {
  enableEmbedFanout?: boolean;
}

export function buildOutboxEventQueueMap(
  options: OutboxEventQueueMapOptions = {}
): Record<string, readonly string[]> {
  const articleNormalizedQueues = options.enableEmbedFanout
    ? [DEDUP_QUEUE, EMBED_QUEUE]
    : [DEDUP_QUEUE];

  return {
    [FOUNDATION_SMOKE_EVENT]: [FOUNDATION_SMOKE_QUEUE],
    [SOURCE_CHANNEL_SYNC_REQUESTED_EVENT]: [FETCH_QUEUE],
    [ARTICLE_INGEST_REQUESTED_EVENT]: [NORMALIZE_QUEUE],
    [ARTICLE_NORMALIZED_EVENT]: articleNormalizedQueues,
    [ARTICLE_EMBEDDED_EVENT]: [CRITERIA_MATCH_QUEUE],
    [ARTICLE_CLUSTERED_EVENT]: [INTEREST_MATCH_QUEUE],
    [ARTICLE_CRITERIA_MATCHED_EVENT]: [CLUSTER_QUEUE],
    [ARTICLE_INTERESTS_MATCHED_EVENT]: [NOTIFY_QUEUE],
    [LLM_REVIEW_REQUESTED_EVENT]: [LLM_REVIEW_QUEUE],
    [NOTIFICATION_FEEDBACK_RECORDED_EVENT]: [FEEDBACK_INGEST_QUEUE],
    [REINDEX_REQUESTED_EVENT]: [REINDEX_QUEUE],
    [INTEREST_COMPILE_REQUESTED_EVENT]: [INTEREST_COMPILE_QUEUE],
    [CRITERION_COMPILE_REQUESTED_EVENT]: [CRITERION_COMPILE_QUEUE]
  };
}

export const OUTBOX_EVENT_QUEUE_MAP = buildOutboxEventQueueMap();

export interface ThinQueueJobPayload {
  jobId: string;
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  version: number;
}

export interface ArticleQueueJobPayload {
  jobId: string;
  eventId: string;
  docId: string;
  version: number;
}

export interface InterestCompileQueueJobPayload {
  jobId: string;
  eventId: string;
  interestId: string;
  version: number;
}

export interface CriterionCompileQueueJobPayload {
  jobId: string;
  eventId: string;
  criterionId: string;
  version: number;
}

export interface LlmReviewQueueJobPayload {
  jobId: string;
  eventId: string;
  docId: string;
  scope: "criterion" | "interest";
  targetId: string;
  promptTemplateId?: string | null;
  version: number;
}

export interface NotificationFeedbackQueueJobPayload {
  jobId: string;
  eventId: string;
  notificationId: string;
  docId: string;
  userId: string;
  interestId?: string | null;
  version: number;
}

export interface ReindexQueueJobPayload {
  jobId: string;
  eventId: string;
  reindexJobId: string;
  indexName: string;
  version: number;
}

export function isArticleOutboxEvent(eventType: string): boolean {
  return (
    eventType === ARTICLE_INGEST_REQUESTED_EVENT ||
    eventType === ARTICLE_NORMALIZED_EVENT ||
    eventType === ARTICLE_EMBEDDED_EVENT ||
    eventType === ARTICLE_CLUSTERED_EVENT ||
    eventType === ARTICLE_CRITERIA_MATCHED_EVENT ||
    eventType === ARTICLE_INTERESTS_MATCHED_EVENT
  );
}

export function isInterestCompileOutboxEvent(eventType: string): boolean {
  return eventType === INTEREST_COMPILE_REQUESTED_EVENT;
}

export function isCriterionCompileOutboxEvent(eventType: string): boolean {
  return eventType === CRITERION_COMPILE_REQUESTED_EVENT;
}

export function isLlmReviewOutboxEvent(eventType: string): boolean {
  return eventType === LLM_REVIEW_REQUESTED_EVENT;
}

export function isNotificationFeedbackOutboxEvent(eventType: string): boolean {
  return eventType === NOTIFICATION_FEEDBACK_RECORDED_EVENT;
}

export function isReindexOutboxEvent(eventType: string): boolean {
  return eventType === REINDEX_REQUESTED_EVENT;
}
