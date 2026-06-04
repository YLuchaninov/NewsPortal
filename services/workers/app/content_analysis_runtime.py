from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Mapping

import psycopg
from psycopg.rows import dict_row

HEURISTIC_NER_PROVIDER = "heuristic"
HEURISTIC_NER_MODEL_KEY = "signalops-titlecase-v1"
HEURISTIC_NER_MODEL_VERSION = "1"
SYSTEM_LABEL_PROVIDER = "signalops"
SYSTEM_LABEL_MODEL_KEY = "interest-filter-projection"
SYSTEM_LABEL_MODEL_VERSION = "1"
CONTENT_FILTER_PROVIDER = "signalops"
CONTENT_FILTER_MODEL_KEY = "content-filter-policy"
CONTENT_FILTER_MODEL_VERSION = "1"
SENTIMENT_PROVIDER = "signalops"
SENTIMENT_MODEL_KEY = "lexicon-sentiment-v1"
SENTIMENT_MODEL_VERSION = "1"
CATEGORY_PROVIDER = "signalops"
CATEGORY_MODEL_KEY = "lexicon-taxonomy-v1"
CATEGORY_MODEL_VERSION = "1"
CLUSTER_SUMMARY_PROVIDER = "signalops"
CLUSTER_SUMMARY_MODEL_KEY = "story-cluster-summary-v1"
CLUSTER_SUMMARY_MODEL_VERSION = "1"
STRUCTURED_EXTRACTION_PROVIDER = "gemini"
STRUCTURED_EXTRACTION_MODEL_VERSION = "1"
DEFAULT_CONTENT_FILTER_POLICY_KEY = "default_recent_content_gate"
DEFAULT_MAX_TEXT_CHARS = 50_000


@dataclass(frozen=True)
class ContentSubject:
    subject_type: str
    subject_id: str
    title: str
    lead: str
    body: str
    language: str | None
    source_channel_id: str | None
    canonical_document_id: str | None
    dates: dict[str, datetime | None]

    @property
    def text(self) -> str:
        return " ".join(part.strip() for part in (self.title, self.lead, self.body) if part.strip())


@dataclass(frozen=True)
class RuntimeAnalysisPolicy:
    policy_id: str
    policy_key: str
    module: str
    enabled: bool
    mode: str
    provider: str | None
    model_key: str | None
    model_version: str | None
    config: Mapping[str, Any]
    failure_policy: str
    version: int


def build_database_url() -> str:
    if os.getenv("DATABASE_URL"):
        return os.environ["DATABASE_URL"]

    user = os.getenv("POSTGRES_USER", "signalops")
    password = os.getenv("POSTGRES_PASSWORD", "signalops")
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = os.getenv(
        "POSTGRES_PORT",
        "55432" if host in {"127.0.0.1", "localhost"} else "5432",
    )
    database = os.getenv("POSTGRES_DB", "signalops")
    return f"postgresql://{user}:{password}@{host}:{port}/{database}"


def connect() -> psycopg.Connection[Any]:
    return psycopg.connect(build_database_url(), row_factory=dict_row)


def normalize_key(value: str) -> str:
    lowered = value.strip().casefold()
    return re.sub(r"[^0-9a-zа-яіїєґ]+", "_", lowered).strip("_")


def source_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def analysis_source_hash(source: Any, policy: RuntimeAnalysisPolicy | None = None) -> str:
    payload: dict[str, Any] = {"source": source}
    if policy is not None:
        payload["policy"] = {
            "policyKey": policy.policy_key,
            "version": policy.version,
            "config": dict(policy.config),
        }
    return source_hash(json.dumps(payload, default=str, sort_keys=True))


def policy_result_json(policy: RuntimeAnalysisPolicy | None) -> dict[str, Any] | None:
    if policy is None:
        return None
    return {
        "policyId": policy.policy_id,
        "policyKey": policy.policy_key,
        "policyVersion": policy.version,
        "mode": policy.mode,
        "failurePolicy": policy.failure_policy,
    }


def default_model_for_module(module: str) -> tuple[str, str, str]:
    structured_model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash").strip() or "gemini-2.0-flash"
    defaults = {
        "ner": (HEURISTIC_NER_PROVIDER, HEURISTIC_NER_MODEL_KEY, HEURISTIC_NER_MODEL_VERSION),
        "sentiment": (SENTIMENT_PROVIDER, SENTIMENT_MODEL_KEY, SENTIMENT_MODEL_VERSION),
        "category": (CATEGORY_PROVIDER, CATEGORY_MODEL_KEY, CATEGORY_MODEL_VERSION),
        "system_interest_label": (SYSTEM_LABEL_PROVIDER, SYSTEM_LABEL_MODEL_KEY, SYSTEM_LABEL_MODEL_VERSION),
        "cluster_summary": (CLUSTER_SUMMARY_PROVIDER, CLUSTER_SUMMARY_MODEL_KEY, CLUSTER_SUMMARY_MODEL_VERSION),
        "clustering": (CLUSTER_SUMMARY_PROVIDER, CLUSTER_SUMMARY_MODEL_KEY, CLUSTER_SUMMARY_MODEL_VERSION),
        "structured_extraction": (
            STRUCTURED_EXTRACTION_PROVIDER,
            structured_model,
            STRUCTURED_EXTRACTION_MODEL_VERSION,
        ),
    }
    return defaults[module]


def policy_supports_local_runtime(policy: RuntimeAnalysisPolicy) -> bool:
    if policy.module == "structured_extraction":
        return policy.provider in {None, STRUCTURED_EXTRACTION_PROVIDER}
    provider, model_key, _model_version = default_model_for_module(policy.module)
    if policy.provider and policy.provider != provider:
        return False
    return not (policy.model_key and policy.model_key != model_key)


def merge_terms(base_terms: set[str], config: Mapping[str, Any], key: str) -> set[str]:
    raw_terms = config.get(key)
    if not isinstance(raw_terms, list):
        return set(base_terms)
    merged = set(base_terms)
    for item in raw_terms:
        term = str(item).strip().casefold()
        if term:
            merged.add(term)
    return merged


def read_config_float(config: Mapping[str, Any], key: str, default: float) -> float:
    value = config.get(key)
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def read_config_int(config: Mapping[str, Any], key: str, default: int) -> int:
    value = config.get(key)
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def read_config_bool(config: Mapping[str, Any], key: str, default: bool) -> bool:
    value = config.get(key)
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().casefold()
        if lowered in {"true", "1", "yes", "on"}:
            return True
        if lowered in {"false", "0", "no", "off"}:
            return False
    return default


def resolve_max_text_chars(
    *,
    explicit_max_text_chars: int | None,
    policy: RuntimeAnalysisPolicy | None,
) -> int:
    if explicit_max_text_chars is not None:
        return max(1, int(explicit_max_text_chars))
    if policy is not None:
        return max(1, read_config_int(policy.config, "maxTextChars", DEFAULT_MAX_TEXT_CHARS))
    return DEFAULT_MAX_TEXT_CHARS


def load_analysis_policy(module: str, subject: ContentSubject | None = None) -> RuntimeAnalysisPolicy | None:
    module_aliases = [module]
    if module == "cluster_summary":
        module_aliases.append("clustering")
    elif module == "clustering":
        module_aliases.append("cluster_summary")
    params: list[Any] = [module_aliases]
    scope_clause = "scope_type = 'global'"
    if subject is not None and subject.source_channel_id:
        scope_clause = "(scope_type = 'global' or (scope_type = 'source_channel' and scope_id = %s::uuid))"
        params.append(subject.source_channel_id)
    with connect() as connection:
        row = connection.execute(
            f"""
            select
              policy_id::text as policy_id,
              policy_key,
              module,
              enabled,
              mode,
              provider,
              model_key,
              model_version,
              config_json,
              failure_policy,
              version
            from content_analysis_policies
            where module = any(%s)
              and is_active = true
              and {scope_clause}
            order by
              case when scope_type = 'source_channel' then 0 else 1 end,
              priority asc,
              version desc
            limit 1
            """,
            tuple(params),
        ).fetchone()
    if row is None:
        return None
    config = row.get("config_json") if isinstance(row.get("config_json"), Mapping) else {}
    return RuntimeAnalysisPolicy(
        policy_id=str(row["policy_id"]),
        policy_key=str(row["policy_key"]),
        module=str(row["module"]),
        enabled=bool(row["enabled"]),
        mode=str(row["mode"]),
        provider=str(row["provider"]) if row.get("provider") else None,
        model_key=str(row["model_key"]) if row.get("model_key") else None,
        model_version=str(row["model_version"]) if row.get("model_version") else None,
        config=config,
        failure_policy=str(row["failure_policy"]),
        version=int(row["version"]),
    )


def policy_skipped(policy: RuntimeAnalysisPolicy, reason: str) -> dict[str, Any]:
    return {
        "skipped": True,
        "reason": reason,
        "policyKey": policy.policy_key,
        "policyVersion": policy.version,
        "failurePolicy": policy.failure_policy,
    }


def resolve_policy_for_module(module: str, subject: ContentSubject) -> RuntimeAnalysisPolicy | dict[str, Any] | None:
    policy = load_analysis_policy(module, subject)
    if policy is None:
        return None
    if not policy.enabled or policy.mode == "disabled":
        return policy_skipped(policy, "disabled_policy")
    if not policy_supports_local_runtime(policy):
        return policy_skipped(policy, "unsupported_policy_provider")
    return policy
