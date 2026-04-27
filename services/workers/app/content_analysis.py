from __future__ import annotations

import hashlib
import json
import re
import uuid
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Json

from .content_analysis_structured import (
    build_structured_extraction_prompt,
    iter_structured_field_values as _iter_structured_field_values,
    normalize_structured_template as _normalize_structured_template,
    structured_entity_type as _structured_entity_type,
    structured_field_specs as _structured_field_specs,
    structured_label_key as _structured_label_key,
    structured_label_projection_allowed as _structured_label_projection_allowed,
    validate_structured_extraction_output,
)
from .content_filter_policy import combine_filter_rule_results
from .gemini import review_with_gemini

HEURISTIC_NER_PROVIDER = "heuristic"
HEURISTIC_NER_MODEL_KEY = "newsportal-titlecase-v1"
HEURISTIC_NER_MODEL_VERSION = "1"
SYSTEM_LABEL_PROVIDER = "newsportal"
SYSTEM_LABEL_MODEL_KEY = "interest-filter-projection"
SYSTEM_LABEL_MODEL_VERSION = "1"
CONTENT_FILTER_PROVIDER = "newsportal"
CONTENT_FILTER_MODEL_KEY = "content-filter-policy"
CONTENT_FILTER_MODEL_VERSION = "1"
SENTIMENT_PROVIDER = "newsportal"
SENTIMENT_MODEL_KEY = "lexicon-sentiment-v1"
SENTIMENT_MODEL_VERSION = "1"
CATEGORY_PROVIDER = "newsportal"
CATEGORY_MODEL_KEY = "lexicon-taxonomy-v1"
CATEGORY_MODEL_VERSION = "1"
CLUSTER_SUMMARY_PROVIDER = "newsportal"
CLUSTER_SUMMARY_MODEL_KEY = "story-cluster-summary-v1"
CLUSTER_SUMMARY_MODEL_VERSION = "1"
STRUCTURED_EXTRACTION_PROVIDER = "gemini"
STRUCTURED_EXTRACTION_MODEL_VERSION = "1"
DEFAULT_CONTENT_FILTER_POLICY_KEY = "default_recent_content_gate"
DEFAULT_MAX_TEXT_CHARS = 50_000
TITLECASE_PATTERN = re.compile(
    r"\b[A-ZА-ЯІЇЄҐ][a-zа-яіїєґ'’-]+(?:\s+[A-ZА-ЯІЇЄҐ][a-zа-яіїєґ'’-]+){0,3}\b"
)
DATE_PATTERN = re.compile(r"\b(?:20\d{2}|19\d{2})[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\b")
ORG_HINT_PATTERN = re.compile(
    r"\b(?:inc|llc|ltd|corp|corporation|company|group|university|foundation|gmbh|s\.a\.|plc)\b",
    re.IGNORECASE,
)
GPE_HINTS = {
    "United States",
    "United Kingdom",
    "European Union",
    "Poland",
    "Germany",
    "France",
    "Ukraine",
    "Warsaw",
    "London",
    "Berlin",
    "Paris",
    "Kyiv",
    "New York",
}
POSITIVE_TERMS = {
    "approve",
    "approved",
    "benefit",
    "boost",
    "breakthrough",
    "growth",
    "improve",
    "improved",
    "positive",
    "profit",
    "record",
    "success",
    "surge",
    "win",
    "выиграл",
    "одобрил",
    "победа",
    "позитив",
    "прибыль",
    "рост",
    "улучшение",
    "успех",
}
NEGATIVE_TERMS = {
    "attack",
    "ban",
    "bankruptcy",
    "collapse",
    "concern",
    "crisis",
    "damage",
    "decline",
    "fail",
    "failed",
    "fraud",
    "loss",
    "negative",
    "risk",
    "scandal",
    "strike",
    "war",
    "банкротство",
    "война",
    "запрет",
    "кризис",
    "негатив",
    "падение",
    "потери",
    "риск",
    "скандал",
    "ущерб",
}
RISK_TERMS = {
    "attack",
    "breach",
    "collapse",
    "crisis",
    "fraud",
    "investigation",
    "lawsuit",
    "risk",
    "sanction",
    "war",
    "атака",
    "война",
    "иск",
    "кризис",
    "расследование",
    "риск",
    "санкции",
}
CATEGORY_TERMS = {
    "business": {
        "acquisition",
        "bank",
        "company",
        "earnings",
        "market",
        "merger",
        "profit",
        "revenue",
        "stock",
        "банк",
        "бизнес",
        "выручка",
        "компания",
        "прибыль",
        "рынок",
    },
    "technology": {
        "ai",
        "algorithm",
        "chip",
        "cloud",
        "cyber",
        "data",
        "software",
        "technology",
        "алгоритм",
        "данные",
        "кибер",
        "облако",
        "технологии",
        "чип",
    },
    "politics": {
        "cabinet",
        "campaign",
        "election",
        "government",
        "minister",
        "parliament",
        "policy",
        "president",
        "выборы",
        "кабинет",
        "министр",
        "парламент",
        "политика",
        "правительство",
        "президент",
    },
    "security": {
        "attack",
        "defense",
        "military",
        "sanction",
        "security",
        "war",
        "атака",
        "безопасность",
        "война",
        "оборона",
        "санкции",
    },
    "health": {
        "doctor",
        "drug",
        "health",
        "hospital",
        "medical",
        "patient",
        "vaccine",
        "вакцина",
        "врач",
        "здоровье",
        "медицина",
        "пациент",
    },
    "climate": {
        "climate",
        "emissions",
        "energy",
        "environment",
        "flood",
        "renewable",
        "weather",
        "выбросы",
        "климат",
        "погода",
        "энергия",
    },
    "science": {
        "discovery",
        "experiment",
        "research",
        "science",
        "space",
        "study",
        "исследование",
        "космос",
        "наука",
        "эксперимент",
    },
    "sports": {
        "championship",
        "coach",
        "football",
        "game",
        "match",
        "team",
        "tournament",
        "игра",
        "матч",
        "спорт",
        "турнир",
        "футбол",
    },
    "culture": {
        "artist",
        "book",
        "culture",
        "film",
        "music",
        "museum",
        "театр",
        "культура",
        "музыка",
        "фильм",
    },
    "legal": {
        "court",
        "judge",
        "law",
        "lawsuit",
        "legal",
        "regulation",
        "суд",
        "закон",
        "иск",
        "регулятор",
    },
}
WORD_PATTERN = re.compile(r"[0-9A-Za-zА-Яа-яІіЇїЄєҐґ'’-]+")
URL_PATTERN = re.compile(r"https?://[^\s)>\"]+", re.IGNORECASE)
MONEY_PATTERN = re.compile(
    r"(?:[$€£]\s?\d[\d,]*(?:\.\d+)?(?:\s?[kKmM])?|\d[\d,]*(?:\.\d+)?\s?(?:USD|EUR|GBP|PLN|грн|UAH))"
)
JOB_CUE_TERMS = {
    "career",
    "developer",
    "engineer",
    "full-time",
    "hiring",
    "job",
    "onsite",
    "remote",
    "salary",
    "vacancy",
}
BUYER_CUE_TERMS = {
    "bid",
    "contract",
    "deadline",
    "implementation",
    "migration",
    "outsourcing",
    "procurement",
    "proposal",
    "rfp",
    "tender",
}


def build_database_url() -> str:
    if os.getenv("DATABASE_URL"):
        return os.environ["DATABASE_URL"]

    user = os.getenv("POSTGRES_USER", "newsportal")
    password = os.getenv("POSTGRES_PASSWORD", "newsportal")
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = os.getenv(
        "POSTGRES_PORT",
        "55432" if host in {"127.0.0.1", "localhost"} else "5432",
    )
    database = os.getenv("POSTGRES_DB", "newsportal")
    return f"postgresql://{user}:{password}@{host}:{port}/{database}"


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


def _connect() -> psycopg.Connection[Any]:
    return psycopg.connect(build_database_url(), row_factory=dict_row)


def _normalize_key(value: str) -> str:
    lowered = value.strip().casefold()
    return re.sub(r"[^0-9a-zа-яіїєґ]+", "_", lowered).strip("_")


def _source_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _analysis_source_hash(source: Any, policy: RuntimeAnalysisPolicy | None = None) -> str:
    payload: dict[str, Any] = {"source": source}
    if policy is not None:
        payload["policy"] = {
            "policyKey": policy.policy_key,
            "version": policy.version,
            "config": dict(policy.config),
        }
    return _source_hash(json.dumps(payload, default=str, sort_keys=True))


def _policy_result_json(policy: RuntimeAnalysisPolicy | None) -> dict[str, Any] | None:
    if policy is None:
        return None
    return {
        "policyId": policy.policy_id,
        "policyKey": policy.policy_key,
        "policyVersion": policy.version,
        "mode": policy.mode,
        "failurePolicy": policy.failure_policy,
    }


def _default_model_for_module(module: str) -> tuple[str, str, str]:
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


def _policy_supports_local_runtime(policy: RuntimeAnalysisPolicy) -> bool:
    if policy.module == "structured_extraction":
        return policy.provider in {None, STRUCTURED_EXTRACTION_PROVIDER}
    provider, model_key, _model_version = _default_model_for_module(policy.module)
    if policy.provider and policy.provider != provider:
        return False
    return not (policy.model_key and policy.model_key != model_key)


def _merge_terms(base_terms: set[str], config: Mapping[str, Any], key: str) -> set[str]:
    raw_terms = config.get(key)
    if not isinstance(raw_terms, list):
        return set(base_terms)
    merged = set(base_terms)
    for item in raw_terms:
        term = str(item).strip().casefold()
        if term:
            merged.add(term)
    return merged


def _read_config_float(config: Mapping[str, Any], key: str, default: float) -> float:
    value = config.get(key)
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _read_config_int(config: Mapping[str, Any], key: str, default: int) -> int:
    value = config.get(key)
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _read_config_bool(config: Mapping[str, Any], key: str, default: bool) -> bool:
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


def _resolve_max_text_chars(
    *,
    explicit_max_text_chars: int | None,
    policy: RuntimeAnalysisPolicy | None,
) -> int:
    if explicit_max_text_chars is not None:
        return max(1, int(explicit_max_text_chars))
    if policy is not None:
        return max(1, _read_config_int(policy.config, "maxTextChars", DEFAULT_MAX_TEXT_CHARS))
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
    with _connect() as connection:
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


def _policy_skipped(policy: RuntimeAnalysisPolicy, reason: str) -> dict[str, Any]:
    return {
        "skipped": True,
        "reason": reason,
        "policyKey": policy.policy_key,
        "policyVersion": policy.version,
        "failurePolicy": policy.failure_policy,
    }


def _resolve_policy_for_module(module: str, subject: ContentSubject) -> RuntimeAnalysisPolicy | dict[str, Any] | None:
    policy = load_analysis_policy(module, subject)
    if policy is None:
        return None
    if not policy.enabled or policy.mode == "disabled":
        return _policy_skipped(policy, "disabled_policy")
    if not _policy_supports_local_runtime(policy):
        return _policy_skipped(policy, "unsupported_policy_provider")
    return policy


def _coerce_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if value is None:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _classify_entity(text: str) -> str:
    if text in GPE_HINTS:
        return "GPE"
    if ORG_HINT_PATTERN.search(text):
        return "ORG"
    if len(text.split()) >= 2:
        return "PERSON"
    return "ORG"


def _tokenize(text: str, *, max_chars: int = DEFAULT_MAX_TEXT_CHARS) -> list[str]:
    return [match.group(0).casefold() for match in WORD_PATTERN.finditer(text[:max_chars])]


def _score_terms(tokens: list[str], terms: set[str]) -> tuple[int, list[str]]:
    token_counts: dict[str, int] = {}
    for token in tokens:
        token_counts[token] = token_counts.get(token, 0) + 1
    matched = sorted(term for term in terms if token_counts.get(term.casefold(), 0) > 0)
    total = sum(token_counts.get(term.casefold(), 0) for term in terms)
    return total, matched


def extract_heuristic_entities(
    text: str,
    *,
    max_chars: int = DEFAULT_MAX_TEXT_CHARS,
    config: Mapping[str, Any] | None = None,
) -> list[dict[str, Any]]:
    config = config or {}
    bounded_text = text[:max_chars]
    allowed_types_raw = config.get("entityTypeAllowlist")
    allowed_types = {
        str(item).strip().upper()
        for item in allowed_types_raw
        if str(item).strip()
    } if isinstance(allowed_types_raw, list) else set()
    mentions_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for match in TITLECASE_PATTERN.finditer(bounded_text):
        entity_text = match.group(0).strip()
        if len(entity_text) < 3:
            continue
        entity_type = _classify_entity(entity_text)
        if allowed_types and entity_type not in allowed_types:
            continue
        key = (entity_type, _normalize_key(entity_text))
        current = mentions_by_key.setdefault(
            key,
            {
                "text": entity_text,
                "type": entity_type,
                "normalizedKey": key[1],
                "mentions": [],
            },
        )
        current["mentions"].append(
            {
                "text": entity_text,
                "start": match.start(),
                "end": match.end(),
            }
        )
    for match in DATE_PATTERN.finditer(bounded_text):
        entity_text = match.group(0)
        if allowed_types and "DATE" not in allowed_types:
            continue
        key = ("DATE", _normalize_key(entity_text))
        mentions_by_key[key] = {
            "text": entity_text,
            "type": "DATE",
            "normalizedKey": key[1],
            "mentions": [{"text": entity_text, "start": match.start(), "end": match.end()}],
        }
    entities = list(mentions_by_key.values())
    entities.sort(key=lambda item: (-len(item["mentions"]), str(item["text"]).casefold()))
    total_mentions = sum(len(item["mentions"]) for item in entities) or 1
    for entity in entities:
        mention_count = len(entity["mentions"])
        entity["mentionCount"] = mention_count
        entity["confidence"] = min(0.95, 0.55 + (0.08 * mention_count))
        entity["salience"] = mention_count / total_mentions
    return entities


def load_content_subject(subject_type: str, subject_id: str) -> ContentSubject | None:
    if subject_type == "article":
        sql = """
            select
              a.doc_id::text as subject_id,
              a.title,
              a.lead,
              a.body,
              a.lang,
              a.channel_id::text as source_channel_id,
              coalesce(obs.canonical_document_id, a.canonical_doc_id)::text as canonical_document_id,
              a.published_at,
              a.ingested_at,
              a.updated_at,
              a.extracted_published_at
            from articles a
            left join document_observations obs
              on obs.origin_type = 'article'
             and obs.origin_id = a.doc_id
            where a.doc_id = %s
        """
        with _connect() as connection:
            row = connection.execute(sql, (subject_id,)).fetchone()
        if row is None:
            return None
        return ContentSubject(
            subject_type="article",
            subject_id=str(row["subject_id"]),
            title=str(row.get("title") or ""),
            lead=str(row.get("lead") or ""),
            body=str(row.get("body") or ""),
            language=str(row.get("lang") or "") or None,
            source_channel_id=str(row.get("source_channel_id") or "") or None,
            canonical_document_id=str(row.get("canonical_document_id") or "") or None,
            dates={
                "published_at": _coerce_datetime(row.get("extracted_published_at") or row.get("published_at")),
                "source_lastmod_at": None,
                "discovered_at": _coerce_datetime(row.get("ingested_at")),
                "ingested_at": _coerce_datetime(row.get("ingested_at")),
                "updated_at": _coerce_datetime(row.get("updated_at")),
            },
        )
    if subject_type == "web_resource":
        sql = """
            select
              wr.resource_id::text as subject_id,
              wr.title,
              wr.summary,
              wr.body,
              wr.lang,
              wr.channel_id::text as source_channel_id,
              wr.projected_article_id::text as canonical_document_id,
              wr.published_at,
              wr.discovered_at,
              wr.updated_at,
              wr.raw_payload_json
            from web_resources wr
            where wr.resource_id = %s
        """
        with _connect() as connection:
            row = connection.execute(sql, (subject_id,)).fetchone()
        if row is None:
            return None
        raw_payload = row.get("raw_payload_json") if isinstance(row.get("raw_payload_json"), Mapping) else {}
        source_lastmod = None
        if isinstance(raw_payload, Mapping):
            source_lastmod = raw_payload.get("lastmod") or raw_payload.get("sourceLastmodAt")
        return ContentSubject(
            subject_type="web_resource",
            subject_id=str(row["subject_id"]),
            title=str(row.get("title") or ""),
            lead=str(row.get("summary") or ""),
            body=str(row.get("body") or ""),
            language=str(row.get("lang") or "") or None,
            source_channel_id=str(row.get("source_channel_id") or "") or None,
            canonical_document_id=str(row.get("canonical_document_id") or "") or None,
            dates={
                "published_at": _coerce_datetime(row.get("published_at")),
                "source_lastmod_at": _coerce_datetime(source_lastmod),
                "discovered_at": _coerce_datetime(row.get("discovered_at")),
                "ingested_at": _coerce_datetime(row.get("discovered_at")),
                "updated_at": _coerce_datetime(row.get("updated_at")),
            },
        )
    if subject_type == "story_cluster":
        sql = """
            select
              story_cluster_id::text as subject_id,
              primary_title,
              top_entities,
              top_places,
              min_published_at,
              max_published_at,
              created_at,
              updated_at
            from story_clusters
            where story_cluster_id = %s
        """
        with _connect() as connection:
            row = connection.execute(sql, (subject_id,)).fetchone()
        if row is None:
            return None
        top_entities = row.get("top_entities") if isinstance(row.get("top_entities"), list) else []
        top_places = row.get("top_places") if isinstance(row.get("top_places"), list) else []
        return ContentSubject(
            subject_type="story_cluster",
            subject_id=str(row["subject_id"]),
            title=str(row.get("primary_title") or ""),
            lead=" ".join(str(item) for item in top_entities[:10]),
            body=" ".join(str(item) for item in top_places[:10]),
            language=None,
            source_channel_id=None,
            canonical_document_id=None,
            dates={
                "published_at": _coerce_datetime(row.get("max_published_at")),
                "source_lastmod_at": None,
                "discovered_at": _coerce_datetime(row.get("created_at")),
                "ingested_at": _coerce_datetime(row.get("created_at")),
                "updated_at": _coerce_datetime(row.get("updated_at")),
                "min_published_at": _coerce_datetime(row.get("min_published_at")),
                "max_published_at": _coerce_datetime(row.get("max_published_at")),
            },
        )
    return None


def persist_ner_analysis(subject: ContentSubject, *, max_text_chars: int | None = None) -> dict[str, Any]:
    policy_candidate = _resolve_policy_for_module("ner", subject)
    if isinstance(policy_candidate, dict):
        return policy_candidate
    policy = policy_candidate
    resolved_max_text_chars = _resolve_max_text_chars(explicit_max_text_chars=max_text_chars, policy=policy)
    provider, model_key, model_version = _default_model_for_module("ner")
    if policy is not None:
        provider = policy.provider or provider
        model_key = policy.model_key or model_key
        model_version = policy.model_version or model_version
    text = subject.text
    source_hash = _analysis_source_hash(text[:resolved_max_text_chars], policy)
    entities = extract_heuristic_entities(text, max_chars=resolved_max_text_chars, config=policy.config if policy else None)
    result_json = {
        "entities": entities,
        "entityCount": len(entities),
        "model": {
            "provider": provider,
            "modelKey": model_key,
            "modelVersion": model_version,
        },
        "policy": _policy_result_json(policy),
        "textChars": min(len(text), resolved_max_text_chars),
    }
    with _connect() as connection:
        with connection.transaction():
            analysis_id = _replace_analysis_result(
                connection,
                subject=subject,
                analysis_type="ner",
                provider=provider,
                model_key=model_key,
                model_version=model_version,
                result_json=result_json,
                confidence=max((float(item["confidence"]) for item in entities), default=None),
                source_hash=source_hash,
                policy=policy,
            )
            connection.execute(
                """
                delete from content_entities
                where subject_type = %s
                  and subject_id = %s
                  and provider = %s
                  and model_key = %s
                """,
                (
                    subject.subject_type,
                    subject.subject_id,
                    provider,
                    model_key,
                ),
            )
            for entity in entities:
                connection.execute(
                    """
                    insert into content_entities (
                      subject_type,
                      subject_id,
                      canonical_document_id,
                      source_channel_id,
                      entity_text,
                      normalized_key,
                      entity_type,
                      salience,
                      confidence,
                      mention_count,
                      mentions_json,
                      provider,
                      model_key,
                      analysis_id
                    )
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        subject.subject_type,
                        subject.subject_id,
                        subject.canonical_document_id,
                        subject.source_channel_id,
                        entity["text"],
                        entity["normalizedKey"],
                        entity["type"],
                        entity["salience"],
                        entity["confidence"],
                        entity["mentionCount"],
                        Json(entity["mentions"]),
                        provider,
                        model_key,
                        analysis_id,
                    ),
                )
    return {"analysisId": str(analysis_id), "entityCount": len(entities), "entityTypes": sorted({str(item["type"]) for item in entities})}


def _replace_analysis_result(
    connection: psycopg.Connection[Any],
    *,
    subject: ContentSubject,
    analysis_type: str,
    provider: str,
    model_key: str,
    model_version: str,
    result_json: Mapping[str, Any],
    confidence: float | None,
    source_hash: str | None,
    policy: RuntimeAnalysisPolicy | None = None,
    status: str = "completed",
    error_text: str | None = None,
) -> uuid.UUID:
    connection.execute(
        """
        delete from content_analysis_results
        where subject_type = %s
          and subject_id = %s
          and analysis_type = %s
          and provider = %s
          and model_key = %s
          and coalesce(source_hash, '') = coalesce(%s, '')
        """,
        (subject.subject_type, subject.subject_id, analysis_type, provider, model_key, source_hash),
    )
    row = connection.execute(
        """
        insert into content_analysis_results (
          subject_type,
          subject_id,
          canonical_document_id,
          source_channel_id,
          analysis_type,
          provider,
          model_key,
          model_version,
          language,
          policy_id,
          policy_version,
          status,
          result_json,
          confidence,
          source_hash,
          error_text
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        returning analysis_id
        """,
        (
            subject.subject_type,
            subject.subject_id,
            subject.canonical_document_id,
            subject.source_channel_id,
            analysis_type,
            provider,
            model_key,
            model_version,
            subject.language,
            policy.policy_id if policy else None,
            policy.version if policy else None,
            status,
            Json(dict(result_json)),
            confidence,
            source_hash,
            error_text,
        ),
    ).fetchone()
    return uuid.UUID(str(row["analysis_id"]))


def analyze_sentiment(
    text: str,
    *,
    max_chars: int = DEFAULT_MAX_TEXT_CHARS,
    config: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    config = config or {}
    tokens = _tokenize(text, max_chars=max_chars)
    positive_count, positive_terms = _score_terms(tokens, _merge_terms(POSITIVE_TERMS, config, "positiveTerms"))
    negative_count, negative_terms = _score_terms(tokens, _merge_terms(NEGATIVE_TERMS, config, "negativeTerms"))
    risk_count, risk_terms = _score_terms(tokens, _merge_terms(RISK_TERMS, config, "riskTerms"))
    total_signal = positive_count + negative_count
    polarity_score = 0.0 if total_signal == 0 else (positive_count - negative_count) / total_signal
    positive_threshold = _read_config_float(config, "positiveThreshold", 0.2)
    negative_threshold = _read_config_float(config, "negativeThreshold", -0.2)
    if polarity_score >= positive_threshold:
        sentiment = "positive"
    elif polarity_score <= negative_threshold:
        sentiment = "negative"
    else:
        sentiment = "neutral"
    risk_score = min(1.0, risk_count / max(1, _read_config_int(config, "riskScaleTerms", 5)))
    high_risk_threshold = _read_config_float(config, "highRiskThreshold", 0.4)
    risk_watch_threshold = _read_config_float(config, "riskWatchThreshold", 0.0)
    tone = "high_risk" if risk_score >= high_risk_threshold else ("risk_watch" if risk_score > risk_watch_threshold else "standard")
    confidence = min(0.95, 0.45 + (0.08 * total_signal) + (0.04 * risk_count))
    return {
        "sentiment": sentiment,
        "score": round(polarity_score, 4),
        "positiveCount": positive_count,
        "negativeCount": negative_count,
        "riskCount": risk_count,
        "riskScore": round(risk_score, 4),
        "tone": tone,
        "matchedTerms": {
            "positive": positive_terms[:20],
            "negative": negative_terms[:20],
            "risk": risk_terms[:20],
        },
        "confidence": confidence,
        "textChars": min(len(text), max_chars),
    }


def analyze_categories(
    text: str,
    *,
    max_chars: int = DEFAULT_MAX_TEXT_CHARS,
    config: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    config = config or {}
    tokens = _tokenize(text, max_chars=max_chars)
    category_results: list[dict[str, Any]] = []
    category_terms: dict[str, set[str]] = {key: set(terms) for key, terms in CATEGORY_TERMS.items()}
    custom_terms = config.get("taxonomyTerms")
    if isinstance(custom_terms, Mapping):
        for raw_key, raw_terms in custom_terms.items():
            category_key = _normalize_key(str(raw_key))
            if not category_key or not isinstance(raw_terms, list):
                continue
            terms = category_terms.setdefault(category_key, set())
            for raw_term in raw_terms:
                term = str(raw_term).strip().casefold()
                if term:
                    terms.add(term)
    min_score = _read_config_float(config, "minScore", 0.0)
    max_categories = max(1, _read_config_int(config, "maxCategories", 50))
    for category_key, terms in category_terms.items():
        count, matched_terms = _score_terms(tokens, terms)
        if count <= 0:
            continue
        score = min(1.0, count / 5)
        if score < min_score:
            continue
        category_results.append(
            {
                "key": category_key,
                "name": category_key.replace("_", " ").title(),
                "score": round(score, 4),
                "termCount": count,
                "matchedTerms": matched_terms[:20],
                "confidence": min(0.95, 0.5 + (0.08 * count)),
            }
        )
    category_results.sort(key=lambda item: (-float(item["score"]), str(item["key"])))
    category_results = category_results[:max_categories]
    primary = category_results[0]["key"] if category_results else "general"
    confidence = float(category_results[0]["confidence"]) if category_results else 0.35
    return {
        "primaryCategory": primary,
        "categories": category_results,
        "categoryCount": len(category_results),
        "confidence": confidence,
        "textChars": min(len(text), max_chars),
    }


def persist_sentiment_analysis(
    subject: ContentSubject,
    *,
    max_text_chars: int | None = None,
) -> dict[str, Any]:
    policy_candidate = _resolve_policy_for_module("sentiment", subject)
    if isinstance(policy_candidate, dict):
        return policy_candidate
    policy = policy_candidate
    resolved_max_text_chars = _resolve_max_text_chars(explicit_max_text_chars=max_text_chars, policy=policy)
    provider, model_key, model_version = _default_model_for_module("sentiment")
    if policy is not None:
        provider = policy.provider or provider
        model_key = policy.model_key or model_key
        model_version = policy.model_version or model_version
    text = subject.text
    source_hash = _analysis_source_hash(text[:resolved_max_text_chars], policy)
    analysis = analyze_sentiment(text, max_chars=resolved_max_text_chars, config=policy.config if policy else None)
    result_json = {
        **analysis,
        "model": {
            "provider": provider,
            "modelKey": model_key,
            "modelVersion": model_version,
        },
        "policy": _policy_result_json(policy),
    }
    labels = [
        {
            "labelType": "sentiment",
            "labelKey": analysis["sentiment"],
            "labelName": str(analysis["sentiment"]).title(),
            "score": abs(float(analysis["score"])),
            "confidence": analysis["confidence"],
            "explain": {
                "score": analysis["score"],
                "matchedTerms": analysis["matchedTerms"],
            },
        },
        {
            "labelType": "tone",
            "labelKey": analysis["tone"],
            "labelName": str(analysis["tone"]).replace("_", " ").title(),
            "score": analysis["riskScore"],
            "confidence": analysis["confidence"],
            "explain": {
                "riskScore": analysis["riskScore"],
                "riskCount": analysis["riskCount"],
                "matchedTerms": analysis["matchedTerms"]["risk"],
            },
        },
    ]
    if float(analysis["riskScore"]) > 0:
        labels.append(
            {
                "labelType": "risk",
                "labelKey": "risk_signal",
                "labelName": "Risk Signal",
                "score": analysis["riskScore"],
                "confidence": analysis["confidence"],
                "explain": {
                    "riskScore": analysis["riskScore"],
                    "riskCount": analysis["riskCount"],
                    "matchedTerms": analysis["matchedTerms"]["risk"],
                },
            }
        )
    with _connect() as connection:
        with connection.transaction():
            analysis_id = _replace_analysis_result(
                connection,
                subject=subject,
                analysis_type="sentiment",
                provider=provider,
                model_key=model_key,
                model_version=model_version,
                result_json=result_json,
                confidence=float(analysis["confidence"]),
                source_hash=source_hash,
                policy=policy,
            )
            connection.execute(
                """
                delete from content_labels
                where subject_type = %s
                  and subject_id = %s
                  and label_type in ('sentiment', 'tone', 'risk')
                """,
                (subject.subject_type, subject.subject_id),
            )
            for label in labels:
                connection.execute(
                    """
                    insert into content_labels (
                      subject_type,
                      subject_id,
                      canonical_document_id,
                      source_channel_id,
                      label_type,
                      label_key,
                      label_name,
                      decision,
                      score,
                      confidence,
                      explain_json,
                      analysis_id
                    )
                    values (%s, %s, %s, %s, %s, %s, %s, 'match', %s, %s, %s, %s)
                    """,
                    (
                        subject.subject_type,
                        subject.subject_id,
                        subject.canonical_document_id,
                        subject.source_channel_id,
                        label["labelType"],
                        label["labelKey"],
                        label["labelName"],
                        label["score"],
                        label["confidence"],
                        Json(label["explain"]),
                        analysis_id,
                    ),
                )
    return {
        "analysisId": str(analysis_id),
        "sentiment": analysis["sentiment"],
        "score": analysis["score"],
        "riskScore": analysis["riskScore"],
        "labelCount": len(labels),
    }


def persist_category_analysis(
    subject: ContentSubject,
    *,
    max_text_chars: int | None = None,
) -> dict[str, Any]:
    policy_candidate = _resolve_policy_for_module("category", subject)
    if isinstance(policy_candidate, dict):
        return policy_candidate
    policy = policy_candidate
    resolved_max_text_chars = _resolve_max_text_chars(explicit_max_text_chars=max_text_chars, policy=policy)
    provider, model_key, model_version = _default_model_for_module("category")
    if policy is not None:
        provider = policy.provider or provider
        model_key = policy.model_key or model_key
        model_version = policy.model_version or model_version
    text = subject.text
    source_hash = _analysis_source_hash(text[:resolved_max_text_chars], policy)
    analysis = analyze_categories(text, max_chars=resolved_max_text_chars, config=policy.config if policy else None)
    result_json = {
        **analysis,
        "model": {
            "provider": provider,
            "modelKey": model_key,
            "modelVersion": model_version,
        },
        "policy": _policy_result_json(policy),
    }
    with _connect() as connection:
        with connection.transaction():
            analysis_id = _replace_analysis_result(
                connection,
                subject=subject,
                analysis_type="category",
                provider=provider,
                model_key=model_key,
                model_version=model_version,
                result_json=result_json,
                confidence=float(analysis["confidence"]),
                source_hash=source_hash,
                policy=policy,
            )
            connection.execute(
                """
                delete from content_labels
                where subject_type = %s
                  and subject_id = %s
                  and label_type = 'taxonomy'
                """,
                (subject.subject_type, subject.subject_id),
            )
            for category in analysis["categories"]:
                connection.execute(
                    """
                    insert into content_labels (
                      subject_type,
                      subject_id,
                      canonical_document_id,
                      source_channel_id,
                      label_type,
                      label_key,
                      label_name,
                      decision,
                      score,
                      confidence,
                      explain_json,
                      analysis_id
                    )
                    values (%s, %s, %s, %s, 'taxonomy', %s, %s, 'match', %s, %s, %s, %s)
                    """,
                    (
                        subject.subject_type,
                        subject.subject_id,
                        subject.canonical_document_id,
                        subject.source_channel_id,
                        category["key"],
                        category["name"],
                        category["score"],
                        category["confidence"],
                        Json(
                            {
                                "primaryCategory": analysis["primaryCategory"],
                                "matchedTerms": category["matchedTerms"],
                                "termCount": category["termCount"],
                            }
                        ),
                        analysis_id,
                    ),
                )
    return {
        "analysisId": str(analysis_id),
        "primaryCategory": analysis["primaryCategory"],
        "categoryCount": analysis["categoryCount"],
        "labelCount": len(analysis["categories"]),
    }


def build_structured_extraction_hints(
    text: str,
    *,
    max_chars: int = DEFAULT_MAX_TEXT_CHARS,
) -> dict[str, Any]:
    bounded_text = text[:max_chars]
    tokens = set(_tokenize(bounded_text, max_chars=max_chars))
    entities = extract_heuristic_entities(
        bounded_text,
        max_chars=max_chars,
        config={"entityTypeAllowlist": ["ORG", "GPE", "DATE"]},
    )
    return {
        "candidateEntities": [
            {
                "text": entity["text"],
                "type": entity["type"],
                "mentionCount": entity["mentionCount"],
            }
            for entity in entities[:20]
        ],
        "candidateDates": [match.group(0) for match in DATE_PATTERN.finditer(bounded_text)][:20],
        "candidateMoney": [match.group(0) for match in MONEY_PATTERN.finditer(bounded_text)][:20],
        "candidateUrls": [match.group(0) for match in URL_PATTERN.finditer(bounded_text)][:20],
        "matchedCueTerms": {
            "job": sorted(term for term in JOB_CUE_TERMS if term.casefold() in tokens)[:20],
            "buyer": sorted(term for term in BUYER_CUE_TERMS if term.casefold() in tokens)[:20],
        },
    }

def persist_structured_extraction_analysis(
    subject: ContentSubject,
    *,
    max_text_chars: int | None = None,
) -> dict[str, Any]:
    policy_candidate = _resolve_policy_for_module("structured_extraction", subject)
    if isinstance(policy_candidate, dict):
        return policy_candidate
    if policy_candidate is None:
        return {"skipped": True, "reason": "missing_policy", "policyKey": "structured_extraction"}
    policy = policy_candidate
    resolved_max_text_chars = _resolve_max_text_chars(explicit_max_text_chars=max_text_chars, policy=policy)
    provider, default_model_key, model_version = _default_model_for_module("structured_extraction")
    model_key = policy.model_key or default_model_key
    if policy.model_version:
        model_version = policy.model_version
    text = subject.text
    try:
        template = _normalize_structured_template(policy.config)
    except ValueError as error:
        return _persist_structured_extraction_failure(
            subject,
            policy=policy,
            provider=provider,
            model_key=model_key,
            model_version=model_version,
            source_hash=_analysis_source_hash(text[:resolved_max_text_chars], policy),
            reason=str(error),
            parsed=None,
            provider_meta={},
        )
    hints = build_structured_extraction_hints(text, max_chars=resolved_max_text_chars)
    prompt = build_structured_extraction_prompt(
        subject=subject,
        template=template,
        hints=hints,
        max_text_chars=resolved_max_text_chars,
    )
    review = review_with_gemini(prompt, model_override=model_key, temperature=0)
    parsed = review.response_json.get("parsed") if isinstance(review.response_json, Mapping) else None
    extractions, validation_errors = validate_structured_extraction_output(parsed, template)
    source_hash = _analysis_source_hash(
        {
            "text": text[:resolved_max_text_chars],
            "template": template,
            "prompt": prompt,
        },
        policy,
    )
    provider_meta = {
        "providerLatencyMs": review.provider_latency_ms,
        "promptTokens": review.prompt_tokens,
        "completionTokens": review.completion_tokens,
        "totalTokens": review.total_tokens,
        "costEstimateUsd": float(review.cost_estimate_usd) if review.cost_estimate_usd is not None else None,
        "providerUsage": review.provider_usage_json,
    }
    if validation_errors:
        return _persist_structured_extraction_failure(
            subject,
            policy=policy,
            provider=provider,
            model_key=model_key,
            model_version=model_version,
            source_hash=source_hash,
            reason="; ".join(validation_errors[:5]),
            parsed=parsed,
            provider_meta=provider_meta,
        )
    field_specs = _structured_field_specs(template)
    result_json = {
        "templateKey": template["templateKey"],
        "extractions": extractions,
        "extractionCount": len(extractions),
        "hints": hints,
        "model": {
            "provider": provider,
            "modelKey": model_key,
            "modelVersion": model_version,
        },
        "policy": _policy_result_json(policy),
        "llm": provider_meta,
        "textChars": min(len(text), resolved_max_text_chars),
    }
    projected_entity_count = 0
    projected_label_count = 0
    with _connect() as connection:
        with connection.transaction():
            analysis_id = _replace_analysis_result(
                connection,
                subject=subject,
                analysis_type="structured_extraction",
                provider=provider,
                model_key=model_key,
                model_version=model_version,
                result_json=result_json,
                confidence=max((float(item["confidence"]) for item in extractions), default=0.0),
                source_hash=source_hash,
                policy=policy,
            )
            connection.execute(
                """
                delete from content_entities
                where subject_type = %s
                  and subject_id = %s
                  and provider = %s
                  and model_key = %s
                  and analysis_id in (
                    select analysis_id
                    from content_analysis_results
                    where subject_type = %s
                      and subject_id = %s
                      and analysis_type = 'structured_extraction'
                  )
                """,
                (
                    subject.subject_type,
                    subject.subject_id,
                    provider,
                    model_key,
                    subject.subject_type,
                    subject.subject_id,
                ),
            )
            connection.execute(
                """
                delete from content_labels
                where subject_type = %s
                  and subject_id = %s
                  and label_type = 'extracted_field'
                """,
                (subject.subject_type, subject.subject_id),
            )
            for index, extraction in enumerate(extractions):
                entity_type = str(extraction["type"])
                fields = extraction["fields"] if isinstance(extraction.get("fields"), Mapping) else {}
                display_text = str(fields.get("company") or fields.get("role") or fields.get("need") or entity_type)
                connection.execute(
                    """
                    insert into content_entities (
                      subject_type,
                      subject_id,
                      canonical_document_id,
                      source_channel_id,
                      entity_text,
                      normalized_key,
                      entity_type,
                      salience,
                      confidence,
                      mention_count,
                      mentions_json,
                      provider,
                      model_key,
                      analysis_id
                    )
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s, 1, %s, %s, %s, %s)
                    """,
                    (
                        subject.subject_type,
                        subject.subject_id,
                        subject.canonical_document_id,
                        subject.source_channel_id,
                        display_text,
                        _normalize_key(f"{entity_type}:{display_text}:{index}"),
                        _structured_entity_type(entity_type),
                        1.0 / max(1, len(extractions)),
                        extraction["confidence"],
                        Json(extraction.get("evidence", [])),
                        provider,
                        model_key,
                        analysis_id,
                    ),
                )
                projected_entity_count += 1
                for field_key, raw_value in fields.items():
                    field_spec = field_specs.get((entity_type, field_key), {})
                    projection = set(field_spec.get("project", []))
                    for value in _iter_structured_field_values(raw_value):
                        if "entity" in projection:
                            connection.execute(
                                """
                                insert into content_entities (
                                  subject_type,
                                  subject_id,
                                  canonical_document_id,
                                  source_channel_id,
                                  entity_text,
                                  normalized_key,
                                  entity_type,
                                  salience,
                                  confidence,
                                  mention_count,
                                  mentions_json,
                                  provider,
                                  model_key,
                                  analysis_id
                                )
                                values (%s, %s, %s, %s, %s, %s, %s, 0.5, %s, 1, %s, %s, %s, %s)
                                """,
                                (
                                    subject.subject_type,
                                    subject.subject_id,
                                    subject.canonical_document_id,
                                    subject.source_channel_id,
                                    str(value),
                                    _normalize_key(str(value)),
                                    _structured_entity_type(entity_type, field_key),
                                    extraction["confidence"],
                                    Json(extraction.get("evidence", [])),
                                    provider,
                                    model_key,
                                    analysis_id,
                                ),
                            )
                            projected_entity_count += 1
                        if "label" in projection and _structured_label_projection_allowed(
                            field_spec,
                            value,
                            allow_high_cardinality_labels=bool(template.get("allowHighCardinalityLabels")),
                        ):
                            label_key = _structured_label_key(entity_type, field_key, value)
                            connection.execute(
                                """
                                insert into content_labels (
                                  subject_type,
                                  subject_id,
                                  canonical_document_id,
                                  source_channel_id,
                                  label_type,
                                  label_key,
                                  label_name,
                                  decision,
                                  score,
                                  confidence,
                                  explain_json,
                                  analysis_id
                                )
                                values (%s, %s, %s, %s, 'extracted_field', %s, %s, 'match', %s, %s, %s, %s)
                                """,
                                (
                                    subject.subject_type,
                                    subject.subject_id,
                                    subject.canonical_document_id,
                                    subject.source_channel_id,
                                    label_key,
                                    f"{entity_type}.{field_key}",
                                    extraction["confidence"],
                                    extraction["confidence"],
                                    Json(
                                        {
                                            "entityType": entity_type,
                                            "fieldKey": field_key,
                                            "value": value,
                                            "templateKey": template["templateKey"],
                                        }
                                    ),
                                    analysis_id,
                                ),
                            )
                            projected_label_count += 1
    return {
        "analysisId": str(analysis_id),
        "extractionCount": len(extractions),
        "entityCount": projected_entity_count,
        "labelCount": projected_label_count,
        "templateKey": template["templateKey"],
    }


def _persist_structured_extraction_failure(
    subject: ContentSubject,
    *,
    policy: RuntimeAnalysisPolicy,
    provider: str,
    model_key: str,
    model_version: str,
    source_hash: str,
    reason: str,
    parsed: Any,
    provider_meta: Mapping[str, Any],
) -> dict[str, Any]:
    status = "skipped" if policy.failure_policy == "skip" else "failed"
    result_json = {
        "error": reason,
        "parsed": parsed if isinstance(parsed, Mapping) else {},
        "policy": _policy_result_json(policy),
        "llm": dict(provider_meta),
    }
    with _connect() as connection:
        with connection.transaction():
            analysis_id = _replace_analysis_result(
                connection,
                subject=subject,
                analysis_type="structured_extraction",
                provider=provider,
                model_key=model_key,
                model_version=model_version,
                result_json=result_json,
                confidence=0.0,
                source_hash=source_hash,
                policy=policy,
                status=status,
                error_text=reason,
            )
    return {
        "skipped": status == "skipped",
        "failed": status == "failed",
        "reason": reason,
        "analysisId": str(analysis_id),
        "policyKey": policy.policy_key,
        "policyVersion": policy.version,
    }


def load_story_cluster_summary(story_cluster_id: str) -> dict[str, Any] | None:
    with _connect() as connection:
        cluster = connection.execute(
            """
            select
              story_cluster_id::text as story_cluster_id,
              canonical_document_count,
              observation_count,
              source_family_count,
              corroboration_count,
              conflicting_signal_count,
              verification_state,
              primary_title,
              top_entities,
              top_places,
              min_published_at,
              max_published_at,
              updated_at
            from story_clusters
            where story_cluster_id = %s
            """,
            (story_cluster_id,),
        ).fetchone()
        if cluster is None:
            return None
        members = connection.execute(
            """
            select
              cd.canonical_document_id::text as canonical_document_id,
              cd.title,
              cd.canonical_domain,
              cd.published_at
            from story_cluster_members scm
            join canonical_documents cd
              on cd.canonical_document_id = scm.canonical_document_id
            where scm.story_cluster_id = %s
            order by cd.published_at desc nulls last, scm.created_at desc
            limit 20
            """,
            (story_cluster_id,),
        ).fetchall()
        verification = connection.execute(
            """
            select
              verification_state,
              corroboration_count,
              source_family_count,
              observation_count,
              conflicting_signal_count,
              rationale_json
            from verification_results
            where target_type = 'story_cluster'
              and target_id = %s
            """,
            (story_cluster_id,),
        ).fetchone()
    cluster_dict = dict(cluster)
    member_items = [dict(member) for member in members]
    source_families = sorted(
        {
            str(member.get("canonical_domain") or "").strip()
            for member in member_items
            if str(member.get("canonical_domain") or "").strip()
        }
    )
    min_published_at = _coerce_datetime(cluster_dict.get("min_published_at"))
    max_published_at = _coerce_datetime(cluster_dict.get("max_published_at"))
    updated_at = _coerce_datetime(cluster_dict.get("updated_at"))
    return {
        "storyClusterId": cluster_dict["story_cluster_id"],
        "primaryTitle": cluster_dict.get("primary_title"),
        "verificationState": cluster_dict.get("verification_state"),
        "canonicalDocumentCount": cluster_dict.get("canonical_document_count"),
        "observationCount": cluster_dict.get("observation_count"),
        "sourceFamilyCount": cluster_dict.get("source_family_count"),
        "corroborationCount": cluster_dict.get("corroboration_count"),
        "conflictingSignalCount": cluster_dict.get("conflicting_signal_count"),
        "topEntities": list(cluster_dict.get("top_entities") or []),
        "topPlaces": list(cluster_dict.get("top_places") or []),
        "sourceFamilies": source_families[:20],
        "publishedWindow": {
            "min": min_published_at.isoformat() if min_published_at else None,
            "max": max_published_at.isoformat() if max_published_at else None,
        },
        "members": [
            {
                "canonicalDocumentId": member.get("canonical_document_id"),
                "title": member.get("title"),
                "canonicalDomain": member.get("canonical_domain"),
                "publishedAt": published_at.isoformat() if published_at else None,
            }
            for member in member_items
            for published_at in [_coerce_datetime(member.get("published_at"))]
        ],
        "verification": dict(verification) if verification else None,
        "updatedAt": updated_at.isoformat() if updated_at else None,
    }


def persist_cluster_summary_analysis(story_cluster_id: str) -> dict[str, Any]:
    subject = load_content_subject("story_cluster", story_cluster_id)
    if subject is None:
        raise ValueError(f"Story cluster {story_cluster_id} was not found.")
    summary = load_story_cluster_summary(story_cluster_id)
    if summary is None:
        raise ValueError(f"Story cluster {story_cluster_id} was not found.")
    result_json = {
        **summary,
        "model": {
            "provider": CLUSTER_SUMMARY_PROVIDER,
            "modelKey": CLUSTER_SUMMARY_MODEL_KEY,
            "modelVersion": CLUSTER_SUMMARY_MODEL_VERSION,
        },
    }
    confidence_by_state = {
        "strong": 0.95,
        "medium": 0.8,
        "weak": 0.55,
        "conflicting": 0.65,
    }
    source_hash = _source_hash(json.dumps(summary, default=str, sort_keys=True))
    with _connect() as connection:
        with connection.transaction():
            analysis_id = _replace_analysis_result(
                connection,
                subject=subject,
                analysis_type="cluster_summary",
                provider=CLUSTER_SUMMARY_PROVIDER,
                model_key=CLUSTER_SUMMARY_MODEL_KEY,
                model_version=CLUSTER_SUMMARY_MODEL_VERSION,
                result_json=result_json,
                confidence=confidence_by_state.get(str(summary.get("verificationState")), 0.5),
                source_hash=source_hash,
            )
    return {
        "analysisId": str(analysis_id),
        "storyClusterId": story_cluster_id,
        "verificationState": summary.get("verificationState"),
        "canonicalDocumentCount": summary.get("canonicalDocumentCount"),
        "sourceFamilyCount": summary.get("sourceFamilyCount"),
        "memberCount": len(summary.get("members") or []),
    }


def project_system_interest_labels(doc_id: str) -> dict[str, Any]:
    subject = load_content_subject("article", doc_id)
    if subject is None:
        raise ValueError(f"Article {doc_id} was not found.")
    policy_candidate = _resolve_policy_for_module("system_interest_label", subject)
    if isinstance(policy_candidate, dict):
        return policy_candidate
    policy = policy_candidate
    include_gray_zone = _read_config_bool(policy.config, "includeGrayZone", True) if policy else True
    include_no_match = _read_config_bool(policy.config, "includeNoMatch", False) if policy else False
    decisions = ["match"]
    if include_gray_zone:
        decisions.append("gray_zone")
    if include_no_match:
        decisions.append("no_match")
    decision_literals = ", ".join(f"'{decision}'" for decision in decisions)
    with _connect() as connection:
        rows = connection.execute(
            f"""
            select
              ifr.filter_key,
              ifr.criterion_id::text as criterion_id,
              it.interest_template_id::text as interest_template_id,
              it.name as interest_name,
              ifr.semantic_decision,
              ifr.semantic_score,
              ifr.explain_json
            from interest_filter_results ifr
            left join criteria c on c.criterion_id = ifr.criterion_id
            left join interest_templates it on it.interest_template_id = c.source_interest_template_id
            where ifr.doc_id = %s
              and ifr.filter_scope = 'system_criterion'
              and ifr.semantic_decision in ({decision_literals})
            order by ifr.semantic_score desc
            """,
            (doc_id,),
        ).fetchall()
        with connection.transaction():
            analysis_id = _replace_analysis_result(
                connection,
                subject=subject,
                analysis_type="system_interest_label",
                provider=SYSTEM_LABEL_PROVIDER,
                model_key=SYSTEM_LABEL_MODEL_KEY,
                model_version=SYSTEM_LABEL_MODEL_VERSION,
                result_json={
                    "labelCount": len(rows),
                    "source": "interest_filter_results",
                    "includedDecisions": decisions,
                    "policy": _policy_result_json(policy),
                },
                confidence=max((float(row["semantic_score"] or 0) for row in rows), default=None),
                source_hash=_analysis_source_hash([dict(row) for row in rows], policy),
                policy=policy,
            )
            connection.execute(
                """
                delete from content_labels
                where subject_type = 'article'
                  and subject_id = %s
                  and label_type = 'system_interest'
                """,
                (doc_id,),
            )
            for row in rows:
                label_key = str(row.get("interest_template_id") or row.get("criterion_id") or row["filter_key"])
                decision = str(row["semantic_decision"])
                if decision not in {"match", "gray_zone", "no_match"}:
                    decision = "match"
                connection.execute(
                    """
                    insert into content_labels (
                      subject_type,
                      subject_id,
                      canonical_document_id,
                      source_channel_id,
                      label_type,
                      label_key,
                      label_name,
                      decision,
                      score,
                      confidence,
                      explain_json,
                      analysis_id
                    )
                    values ('article', %s, %s, %s, 'system_interest', %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        subject.subject_id,
                        subject.canonical_document_id,
                        subject.source_channel_id,
                        label_key,
                        row.get("interest_name"),
                        decision,
                        row.get("semantic_score"),
                        row.get("semantic_score"),
                        Json(dict(row.get("explain_json") or {})),
                        analysis_id,
                    ),
                )
    return {"analysisId": str(analysis_id), "labelCount": len(rows), "includedDecisions": decisions}


def load_filter_policy(policy_key: str = DEFAULT_CONTENT_FILTER_POLICY_KEY) -> dict[str, Any] | None:
    with _connect() as connection:
        row = connection.execute(
            """
            select
              filter_policy_id::text as filter_policy_id,
              policy_key,
              mode,
              combiner,
              policy_json,
              version
            from content_filter_policies
            where policy_key = %s
              and is_active = true
            order by version desc, priority asc
            limit 1
            """,
            (policy_key,),
        ).fetchone()
    return dict(row) if row else None


def _relative_threshold(value: Mapping[str, Any]) -> datetime:
    amount = int(value.get("amount") or 0)
    unit = str(value.get("unit") or "days")
    days_by_unit = {
        "day": 1,
        "days": 1,
        "week": 7,
        "weeks": 7,
        "month": 30,
        "months": 30,
        "year": 365,
        "years": 365,
    }
    days = max(0, amount) * days_by_unit.get(unit, 1)
    return datetime.now(timezone.utc) - timedelta(days=days)


def _resolve_date(subject: ContentSubject, field: str, policy_json: Mapping[str, Any]) -> tuple[datetime | None, str | None]:
    candidates = [field]
    candidates.extend(str(item) for item in policy_json.get("dateFallback", []) if str(item).strip())
    for candidate in candidates:
        value = subject.dates.get(candidate)
        if value is not None:
            return value, candidate
    return None, None


def _load_subject_labels(subject: ContentSubject) -> list[dict[str, Any]]:
    with _connect() as connection:
        rows = connection.execute(
            """
            select
              label_type,
              label_key,
              label_name,
              decision,
              score,
              confidence,
              explain_json
            from content_labels
            where subject_type = %s
              and subject_id = %s
            """,
            (subject.subject_type, subject.subject_id),
        ).fetchall()
    return [dict(row) for row in rows]


def _evaluate_label_rule(subject: ContentSubject, value: Any) -> tuple[bool, dict[str, Any]]:
    detail: dict[str, Any] = {}
    if not isinstance(value, Mapping):
        detail["reason"] = "invalid_label_rule_value"
        return False, detail
    label_type = str(value.get("labelType") or value.get("label_type") or "").strip()
    label_key = str(value.get("labelKey") or value.get("label_key") or "").strip()
    decisions = {
        str(item)
        for item in value.get("decisions", ["match", "gray_zone"])
        if str(item).strip()
    }
    min_score_value = value.get("minScore", value.get("min_score"))
    min_score = float(min_score_value) if min_score_value is not None else None
    detail.update(
        {
            "labelType": label_type or None,
            "labelKey": label_key or None,
            "decisions": sorted(decisions),
            "minScore": min_score,
        }
    )
    labels = _load_subject_labels(subject)
    matched_labels: list[dict[str, Any]] = []
    for label in labels:
        if label_type and str(label.get("label_type")) != label_type:
            continue
        if label_key and str(label.get("label_key")) != label_key:
            continue
        if decisions and str(label.get("decision")) not in decisions:
            continue
        score = label.get("score")
        if min_score is not None and (score is None or float(score) < min_score):
            continue
        matched_labels.append(
            {
                "labelType": label.get("label_type"),
                "labelKey": label.get("label_key"),
                "decision": label.get("decision"),
                "score": label.get("score"),
                "confidence": label.get("confidence"),
            }
        )
    detail["matchedLabels"] = matched_labels[:10]
    return bool(matched_labels), detail


def _load_subject_structured_extractions(subject: ContentSubject) -> list[dict[str, Any]]:
    with _connect() as connection:
        row = connection.execute(
            """
            select result_json
            from content_analysis_results
            where subject_type = %s
              and subject_id = %s
              and analysis_type = 'structured_extraction'
              and status = 'completed'
            order by updated_at desc
            limit 1
            """,
            (subject.subject_type, subject.subject_id),
        ).fetchone()
    result_json = row.get("result_json") if row and isinstance(row.get("result_json"), Mapping) else {}
    extractions = result_json.get("extractions") if isinstance(result_json, Mapping) else []
    return [dict(item) for item in extractions if isinstance(item, Mapping)] if isinstance(extractions, list) else []


def _structured_field_matches(
    extraction: Mapping[str, Any],
    *,
    entity_type: str,
    field_key: str,
    expected: Any = None,
    expected_values: set[str] | None = None,
    min_confidence: float | None = None,
) -> tuple[bool, Any]:
    if entity_type and str(extraction.get("type") or "") != entity_type:
        return False, None
    confidence = extraction.get("confidence")
    if min_confidence is not None:
        try:
            if float(confidence) < min_confidence:
                return False, None
        except (TypeError, ValueError):
            return False, None
    fields = extraction.get("fields")
    if not isinstance(fields, Mapping) or field_key not in fields:
        return False, None
    raw_value = fields.get(field_key)
    values = _iter_structured_field_values(raw_value)
    if expected is None and expected_values is None:
        return bool(values), raw_value
    normalized_values = {_normalize_key(str(value)) for value in values}
    if expected is not None and _normalize_key(str(expected)) in normalized_values:
        return True, raw_value
    if expected_values and normalized_values.intersection(expected_values):
        return True, raw_value
    return False, raw_value


def _evaluate_structured_field_rule(
    subject: ContentSubject,
    value: Any,
    *,
    op: str,
) -> tuple[bool, dict[str, Any]]:
    detail: dict[str, Any] = {}
    if not isinstance(value, Mapping):
        detail["reason"] = "invalid_structured_rule_value"
        return False, detail
    entity_type = _normalize_key(str(value.get("entityType") or value.get("entity_type") or ""))
    field_key = _normalize_key(str(value.get("fieldKey") or value.get("field_key") or ""))
    min_confidence_raw = value.get("minConfidence", value.get("min_confidence"))
    min_confidence = float(min_confidence_raw) if min_confidence_raw is not None else None
    expected_values = None
    if op == "extracted_field_in":
        raw_values = value.get("values")
        if isinstance(raw_values, list):
            expected_values = {_normalize_key(str(item)) for item in raw_values if str(item).strip()}
    detail.update(
        {
            "entityType": entity_type or None,
            "fieldKey": field_key or None,
            "minConfidence": min_confidence,
        }
    )
    if not field_key:
        detail["reason"] = "missing_field_key"
        return False, detail
    matched: list[dict[str, Any]] = []
    for extraction in _load_subject_structured_extractions(subject):
        passed, raw_value = _structured_field_matches(
            extraction,
            entity_type=entity_type,
            field_key=field_key,
            expected=value.get("value") if op == "has_extracted_field" else None,
            expected_values=expected_values,
            min_confidence=min_confidence,
        )
        if passed:
            matched.append(
                {
                    "entityType": extraction.get("type"),
                    "fieldKey": field_key,
                    "value": raw_value,
                    "confidence": extraction.get("confidence"),
                }
            )
    detail["matchedExtractions"] = matched[:10]
    return bool(matched), detail


def _evaluate_structured_date_rule(subject: ContentSubject, value: Any) -> tuple[bool, dict[str, Any]]:
    detail: dict[str, Any] = {}
    if not isinstance(value, Mapping):
        detail["reason"] = "invalid_structured_date_rule_value"
        return False, detail
    threshold_value = value.get("threshold")
    threshold = _relative_threshold(threshold_value) if isinstance(threshold_value, Mapping) else _relative_threshold(value)
    passed, field_detail = _evaluate_structured_field_rule(subject, value, op="has_extracted_field")
    detail.update(field_detail)
    detail["threshold"] = threshold.isoformat()
    if not passed:
        return False, detail
    matched_dates: list[dict[str, Any]] = []
    for matched in field_detail.get("matchedExtractions", []):
        actual = _coerce_datetime(matched.get("value"))
        if actual is not None and actual >= threshold:
            matched_dates.append({**matched, "actual": actual.isoformat()})
    detail["matchedDates"] = matched_dates[:10]
    return bool(matched_dates), detail


def evaluate_content_filter_policy(subject: ContentSubject, policy: Mapping[str, Any]) -> dict[str, Any]:
    policy_json = policy.get("policy_json") if isinstance(policy.get("policy_json"), Mapping) else {}
    rules = policy_json.get("rules") if isinstance(policy_json, Mapping) else []
    matched: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []
    for raw_rule in rules if isinstance(rules, list) else []:
        if not isinstance(raw_rule, Mapping):
            continue
        key = str(raw_rule.get("key") or raw_rule.get("field") or "rule")
        field = str(raw_rule.get("field") or "")
        op = str(raw_rule.get("op") or "")
        value = raw_rule.get("value")
        passed = False
        detail: dict[str, Any] = {"key": key, "field": field, "op": op}
        if op == "gte_relative" and field.endswith("_at") and isinstance(value, Mapping):
            actual, actual_field = _resolve_date(subject, field, policy_json)
            threshold = _relative_threshold(value)
            passed = actual is not None and actual >= threshold
            detail.update(
                {
                    "actual": actual.isoformat() if actual else None,
                    "actualField": actual_field,
                    "threshold": threshold.isoformat(),
                }
            )
        elif op == "exists":
            passed = bool(subject.text.strip()) if field in {"text", "body"} else False
        elif op == "has_label":
            passed, label_detail = _evaluate_label_rule(subject, value)
            detail.update(label_detail)
        elif op == "not_has_label":
            has_label, label_detail = _evaluate_label_rule(subject, value)
            passed = not has_label
            detail.update(label_detail)
        elif op in {"has_extracted_field", "extracted_field_in"}:
            passed, structured_detail = _evaluate_structured_field_rule(subject, value, op=op)
            detail.update(structured_detail)
        elif op == "extracted_date_gte_relative":
            passed, structured_detail = _evaluate_structured_date_rule(subject, value)
            detail.update(structured_detail)
        detail["passed"] = passed
        (matched if passed else failed).append(detail)
    combined = combine_filter_rule_results(policy=policy, matched_rules=matched, failed_rules=failed)
    return {
        "passed": combined["passed"],
        "decision": combined["decision"],
        "matchedRules": matched,
        "failedRules": failed,
        "explain": {
            "policyKey": policy.get("policy_key"),
            "policyVersion": policy.get("version"),
            "combiner": combined["combiner"],
            "mode": policy.get("mode"),
        },
    }


def persist_content_filter_result(
    subject_type: str,
    subject_id: str,
    *,
    policy_key: str = DEFAULT_CONTENT_FILTER_POLICY_KEY,
    mode_override: str | None = None,
) -> dict[str, Any]:
    subject = load_content_subject(subject_type, subject_id)
    if subject is None:
        raise ValueError(f"{subject_type} {subject_id} was not found.")
    policy = load_filter_policy(policy_key)
    if policy is None:
        return {"skipped": True, "reason": "missing_policy", "policyKey": policy_key}
    mode = mode_override or str(policy["mode"])
    if mode == "disabled":
        return {"skipped": True, "reason": "disabled_policy", "policyKey": policy_key}
    evaluation = evaluate_content_filter_policy(subject, policy)
    with _connect() as connection:
        with connection.transaction():
            result_row = connection.execute(
                """
                insert into content_filter_results (
                  subject_type,
                  subject_id,
                  canonical_document_id,
                  source_channel_id,
                  filter_policy_id,
                  policy_key,
                  policy_version,
                  mode,
                  decision,
                  passed,
                  score,
                  matched_rules_json,
                  failed_rules_json,
                  explain_json
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                on conflict (subject_type, subject_id, policy_key, policy_version) do update
                set
                  canonical_document_id = excluded.canonical_document_id,
                  source_channel_id = excluded.source_channel_id,
                  filter_policy_id = excluded.filter_policy_id,
                  mode = excluded.mode,
                  decision = excluded.decision,
                  passed = excluded.passed,
                  score = excluded.score,
                  matched_rules_json = excluded.matched_rules_json,
                  failed_rules_json = excluded.failed_rules_json,
                  explain_json = excluded.explain_json,
                  updated_at = now()
                returning filter_result_id
                """,
                (
                    subject.subject_type,
                    subject.subject_id,
                    subject.canonical_document_id,
                    subject.source_channel_id,
                    policy["filter_policy_id"],
                    policy["policy_key"],
                    policy["version"],
                    mode,
                    evaluation["decision"],
                    evaluation["passed"],
                    1.0 if evaluation["passed"] else 0.0,
                    Json(evaluation["matchedRules"]),
                    Json(evaluation["failedRules"]),
                    Json(evaluation["explain"]),
                ),
            ).fetchone()
            _replace_analysis_result(
                connection,
                subject=subject,
                analysis_type="content_filter",
                provider=CONTENT_FILTER_PROVIDER,
                model_key=CONTENT_FILTER_MODEL_KEY,
                model_version=CONTENT_FILTER_MODEL_VERSION,
                result_json=evaluation,
                confidence=1.0,
                source_hash=_source_hash(json.dumps(policy, default=str)),
            )
    return {
        "filterResultId": str(result_row["filter_result_id"]),
        "policyKey": policy["policy_key"],
        "policyVersion": policy["version"],
        "mode": mode,
        "decision": evaluation["decision"],
        "passed": evaluation["passed"],
    }
