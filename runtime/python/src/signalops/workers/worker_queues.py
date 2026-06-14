NORMALIZE_QUEUE = "q.normalize"
DEDUP_QUEUE = "q.dedup"
EMBED_QUEUE = "q.embed"
CLUSTER_QUEUE = "q.cluster"
CRITERIA_MATCH_QUEUE = "q.match.criteria"
INTEREST_MATCH_QUEUE = "q.match.interests"
NOTIFY_QUEUE = "q.notify"
LLM_REVIEW_QUEUE = "q.llm.review"
FEEDBACK_INGEST_QUEUE = "q.feedback.ingest"
REINDEX_QUEUE = "q.reindex"
INTEREST_COMPILE_QUEUE = "q.interest.compile"
CRITERION_COMPILE_QUEUE = "q.criterion.compile"
SEQUENCE_QUEUE = "q.sequence"

NORMALIZE_CONSUMER = "worker.normalize"
DEDUP_CONSUMER = "worker.dedup"
EMBED_CONSUMER = "worker.embed"
CLUSTER_CONSUMER = "worker.cluster"
CRITERIA_MATCH_CONSUMER = "worker.match.criteria"
INTEREST_MATCH_CONSUMER = "worker.match.interests"
NOTIFY_CONSUMER = "worker.notify"
LLM_REVIEW_CONSUMER = "worker.llm.review"
FEEDBACK_INGEST_CONSUMER = "worker.feedback.ingest"
REINDEX_CONSUMER = "worker.reindex"
INTEREST_COMPILE_CONSUMER = "worker.interest.compile"
CRITERION_COMPILE_CONSUMER = "worker.criterion.compile"

SIGNAL_CANDIDATE_NORMALIZED_EVENT = "signal_candidate.normalized"
SIGNAL_CANDIDATE_EMBEDDED_EVENT = "signal_candidate.embedded"
SIGNAL_CANDIDATE_CLUSTERED_EVENT = "signal_candidate.clustered"
SIGNAL_CANDIDATE_CRITERIA_MATCHED_EVENT = "signal_candidate.criteria.matched"
SIGNAL_CANDIDATE_INTERESTS_MATCHED_EVENT = "signal_candidate.interests.matched"
LLM_REVIEW_REQUESTED_EVENT = "llm.review.requested"
REINDEX_REQUESTED_EVENT = "reindex.requested"
INTEREST_CENTROIDS_INDEX_NAME = "interest_centroids"
EVENT_CLUSTER_CENTROIDS_INDEX_NAME = "event_cluster_centroids"

PROCESSING_STATE_ORDER = {
    "raw": 0,
    "normalized": 1,
    "deduped": 2,
    "embedded": 3,
    "clustered": 4,
    "matched": 5,
    "notified": 6,
}
