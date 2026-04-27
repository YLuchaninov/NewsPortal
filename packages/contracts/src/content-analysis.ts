export type ContentAnalysisSubjectType =
  | "article"
  | "web_resource"
  | "canonical_document"
  | "story_cluster";

export type ContentAnalysisType =
  | "ner"
  | "sentiment"
  | "entity_sentiment"
  | "category"
  | "system_interest_label"
  | "content_filter"
  | "cluster_summary"
  | "structured_extraction";

export type ContentAnalysisStatus = "pending" | "completed" | "failed" | "skipped";
export type ContentAnalysisMode = "disabled" | "observe" | "dry_run" | "hold" | "enforce";
export type ContentAnalysisPolicyModule =
  | "ner"
  | "sentiment"
  | "category"
  | "system_interest_label"
  | "content_filter"
  | "cluster_summary"
  | "clustering"
  | "structured_extraction";
export type ContentLabelType =
  | "system_interest"
  | "taxonomy"
  | "sentiment"
  | "tone"
  | "risk"
  | "extracted_field";
export type ContentLabelDecision = "match" | "no_match" | "gray_zone" | "hold" | "rejected";
export type ContentFilterDecision = "keep" | "reject" | "hold" | "needs_review";

export interface ContentAnalysisPolicy {
  policy_id: string;
  policy_key: string;
  title: string;
  description?: string | null;
  scope_type: string;
  scope_id?: string | null;
  module: ContentAnalysisPolicyModule;
  enabled: boolean;
  mode: ContentAnalysisMode;
  provider?: string | null;
  model_key?: string | null;
  model_version?: string | null;
  config_json: Record<string, unknown>;
  failure_policy: "skip" | "hold" | "reject" | "fail_run";
  priority: number;
  version: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ContentAnalysisResult {
  analysis_id: string;
  subject_type: ContentAnalysisSubjectType;
  subject_id: string;
  canonical_document_id?: string | null;
  source_channel_id?: string | null;
  analysis_type: ContentAnalysisType;
  provider: string;
  model_key: string;
  model_version?: string | null;
  language?: string | null;
  status: ContentAnalysisStatus;
  result_json: Record<string, unknown>;
  confidence?: number | null;
  source_hash?: string | null;
  error_text?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ContentEntity {
  entity_id: string;
  subject_type: ContentAnalysisSubjectType;
  subject_id: string;
  canonical_document_id?: string | null;
  source_channel_id?: string | null;
  entity_text: string;
  normalized_key: string;
  entity_type: string;
  salience?: number | null;
  confidence?: number | null;
  mention_count: number;
  mentions_json?: unknown[];
  provider: string;
  model_key: string;
  analysis_id?: string | null;
  created_at?: string;
}

export interface ContentLabel {
  label_id: string;
  subject_type: ContentAnalysisSubjectType;
  subject_id: string;
  canonical_document_id?: string | null;
  source_channel_id?: string | null;
  label_type: ContentLabelType;
  label_key: string;
  label_name?: string | null;
  decision: ContentLabelDecision;
  score?: number | null;
  confidence?: number | null;
  explain_json?: Record<string, unknown>;
  analysis_id?: string | null;
  created_at?: string;
}

export interface ContentFilterPolicy {
  filter_policy_id: string;
  policy_key: string;
  title: string;
  description?: string | null;
  scope_type: string;
  scope_id?: string | null;
  mode: ContentAnalysisMode;
  combiner: "all" | "any" | "priority_first";
  policy_json: Record<string, unknown>;
  version: number;
  is_active: boolean;
  priority: number;
  created_at?: string;
  updated_at?: string;
}

export interface ContentFilterResult {
  filter_result_id: string;
  subject_type: ContentAnalysisSubjectType;
  subject_id: string;
  canonical_document_id?: string | null;
  source_channel_id?: string | null;
  filter_policy_id?: string | null;
  policy_key: string;
  policy_version: number;
  mode: ContentAnalysisMode;
  decision: ContentFilterDecision;
  passed: boolean;
  score?: number | null;
  matched_rules_json?: unknown[];
  failed_rules_json?: unknown[];
  explain_json?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface ContentAnalysisSummary {
  subjectType: ContentAnalysisSubjectType;
  subjectId: string;
  latestResults: ContentAnalysisResult[];
  entities: ContentEntity[];
  labels: ContentLabel[];
  contentFilter?: ContentFilterResult | null;
}
