from __future__ import annotations

from signalops.api import content_query as _content_query
from signalops.api import web_resource_read_model as _web_resource_read_model

SEQUENCE_DEFINITION_STATUSES = {"draft", "active", "archived"}
SEQUENCE_RUN_CANCELLABLE_STATUSES = {"pending"}

CONTENT_ITEM_ORIGINS = {"signal_candidate", "resource"}
WEB_RESOURCE_EXTRACTION_STATES = _web_resource_read_model.WEB_RESOURCE_EXTRACTION_STATES
WEB_CONTENT_LIST_SORTS = _content_query.WEB_CONTENT_LIST_SORTS
WEB_RESOURCE_KINDS = _web_resource_read_model.WEB_RESOURCE_KINDS
WEB_RESOURCE_PROJECTION_FILTERS = _web_resource_read_model.WEB_RESOURCE_PROJECTION_FILTERS

CONTENT_ANALYSIS_SUBJECT_TYPES = {
    "signal_candidate",
    "web_resource",
    "canonical_document",
    "story_cluster",
}
CONTENT_ANALYSIS_TYPES = {
    "ner",
    "sentiment",
    "entity_sentiment",
    "category",
    "system_interest_label",
    "content_filter",
    "cluster_summary",
    "structured_extraction",
}
CONTENT_ANALYSIS_STATUSES = {"pending", "completed", "failed", "skipped"}
CONTENT_ANALYSIS_MODES = {"disabled", "observe", "dry_run", "hold", "enforce"}
CONTENT_ANALYSIS_POLICY_MODULES = {
    "ner",
    "sentiment",
    "category",
    "system_interest_label",
    "content_filter",
    "cluster_summary",
    "clustering",
    "structured_extraction",
}
CONTENT_ANALYSIS_POLICY_FAILURE_POLICIES = {"skip", "hold", "reject", "fail_run"}
CONTENT_ANALYSIS_POLICY_SCOPE_TYPES = {
    "global",
    "source_channel",
    "system_interest",
    "sequence",
    "manual",
}
CONTENT_FILTER_DECISIONS = {"keep", "reject", "hold", "needs_review"}
