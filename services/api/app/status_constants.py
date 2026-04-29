from __future__ import annotations

from services.api.app import content_query as _content_query
from services.api.app import discovery_payloads as _discovery_payloads
from services.api.app import web_resource_read_model as _web_resource_read_model

SEQUENCE_DEFINITION_STATUSES = {"draft", "active", "archived"}
SEQUENCE_RUN_CANCELLABLE_STATUSES = {"pending"}

DISCOVERY_MISSION_STATUSES = {"planned", "active", "completed", "paused", "failed", "archived"}
DISCOVERY_RECALL_MISSION_STATUSES = {"planned", "active", "completed", "paused", "failed"}
DISCOVERY_RECALL_MISSION_KINDS = {"manual", "domain_seed", "query_seed"}
DISCOVERY_CLASS_STATUSES = {"draft", "active", "archived"}
DISCOVERY_PROFILE_STATUSES = {"draft", "active", "archived"}
DISCOVERY_GRAPH_STATUSES = {"pending", "compiled", "failed"}
DISCOVERY_CANDIDATE_STATUSES = {"pending", "approved", "rejected", "auto_approved", "duplicate"}
DISCOVERY_RECALL_CANDIDATE_STATUSES = {"pending", "shortlisted", "rejected", "duplicate"}
DISCOVERY_HYPOTHESIS_STATUSES = {"pending", "running", "completed", "failed", "skipped"}
DISCOVERY_PROVIDER_TYPES = {"rss", "website", "api", "email_imap", "youtube"}
DISCOVERY_PROFILE_PROVIDER_TYPES = _discovery_payloads.DISCOVERY_PROFILE_PROVIDER_TYPES

CONTENT_ITEM_ORIGINS = {"editorial", "resource"}
WEB_RESOURCE_EXTRACTION_STATES = _web_resource_read_model.WEB_RESOURCE_EXTRACTION_STATES
WEB_CONTENT_LIST_SORTS = _content_query.WEB_CONTENT_LIST_SORTS
WEB_RESOURCE_KINDS = _web_resource_read_model.WEB_RESOURCE_KINDS
WEB_RESOURCE_PROJECTION_FILTERS = _web_resource_read_model.WEB_RESOURCE_PROJECTION_FILTERS

CONTENT_ANALYSIS_SUBJECT_TYPES = {
    "article",
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
