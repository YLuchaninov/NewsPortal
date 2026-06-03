from __future__ import annotations

import re
from typing import Any

from services.workers.app.discovery_vnext_artifacts import validate_discovery_brief, validation_json


_TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9_-]{2,}")
_KEYWORD_STOPWORDS = {
    "and",
    "for",
    "from",
    "gap",
    "live",
    "proof",
    "test",
    "that",
    "the",
    "this",
    "with",
}


def compile_discovery_brief(
    system_interest: dict[str, Any],
    *,
    operator_constraints: dict[str, Any] | None = None,
) -> dict[str, Any]:
    name = _text(system_interest.get("name") or system_interest.get("title") or "System interest")
    description = _text(system_interest.get("description") or system_interest.get("goal") or name)
    signal_text = "\n".join(
        [
            *_string_list(system_interest.get("positive_texts") or system_interest.get("positiveTexts")),
            *_string_list(system_interest.get("candidate_positive_signals") or system_interest.get("candidatePositiveSignals")),
        ]
    ).strip()
    negative_text = "\n".join(
        [
            *_string_list(system_interest.get("negative_texts") or system_interest.get("negativeTexts")),
            *_string_list(system_interest.get("candidate_negative_signals") or system_interest.get("candidateNegativeSignals")),
        ]
    ).strip()
    interest_text = "\n".join(item for item in [signal_text, name, description] if item).strip()
    keyword_source = signal_text or interest_text
    keywords = _keywords(keyword_source)
    query_seeds = _query_seeds(signal_text or description or name)
    evidence_patterns = _evidence_patterns_for_text(interest_text)
    artifact_expectations = _artifact_expectations_for_text(interest_text)
    constraints = {
        "publicOnly": True,
        "noLoginBypass": True,
        "noCaptchaBypass": True,
        "respectRobotsAndTerms": True,
        **(operator_constraints or {}),
    }
    brief = {
        "interestId": system_interest.get("interestId") or system_interest.get("interest_id"),
        "interestName": name,
        "sourceInterestText": interest_text,
        "goal": (
            "Detect public observable signals relevant to this interest without assuming "
            "a fixed domain taxonomy."
        ),
        "desiredSignals": [
            {
                "signalId": "sig-public-artifact",
                "description": (
                    "A concrete public artifact indicating that the event, need, risk, "
                    "opportunity, change, or condition tracked by the interest may exist."
                ),
                "whyItMatters": "The artifact can become useful only after downstream filtering verifies it.",
                "directness": "direct",
                "expectedEvidencePatterns": evidence_patterns,
            },
            {
                "signalId": "sig-recurring-source",
                "description": (
                    "A recurring public source behavior that could publish future artifacts "
                    "matching the interest, even if no useful signal is present yet."
                ),
                "whyItMatters": "Rare-signal sources should be retained when capability and observability are strong.",
                "directness": "precursor",
                "expectedEvidencePatterns": ["listing page", "stable item URLs", "dated or versioned updates"],
            },
        ],
        "negativeSignals": [
            {
                "description": (
                    "Content that only shares vocabulary with the interest but lacks observable "
                    "evidence of the tracked condition."
                ),
                "reason": "Prevents acquisition from optimizing toward misleading keyword matches.",
            },
            {
                "description": "Generic SEO, marketing, duplicate, spam, or inaccessible surfaces.",
                "reason": "These are acquisition quality problems, not positive source capability evidence.",
            },
            *(
                [
                    {
                        "description": negative_text,
                        "reason": "Operator-provided near-miss cues should guide acquisition quality review.",
                    }
                ]
                if negative_text
                else []
            ),
        ],
        "artifactExpectations": artifact_expectations,
        "geographies": _string_list(system_interest.get("geographies") or system_interest.get("places")),
        "languages": _string_list(system_interest.get("languages") or system_interest.get("languages_allowed")),
        "freshnessNeed": _freshness_need(interest_text),
        "constraints": constraints,
        "keywordHints": keywords[:12],
        "querySeeds": query_seeds[:8],
    }
    issues = validate_discovery_brief(brief)
    return {
        "artifactType": "DiscoveryBrief",
        "schemaVersion": "1.0",
        "status": "validated" if not issues else "rejected",
        "payload": brief,
        "validation": validation_json(issues),
    }


def _text(value: Any) -> str:
    normalized = str(value or "").strip()
    return " ".join(normalized.split())


def _string_list(value: Any) -> list[str]:
    if isinstance(value, str):
        return [item.strip() for item in re.split(r"[,;\n]", value) if item.strip()]
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


def _keywords(text: str) -> list[str]:
    seen: set[str] = set()
    keywords: list[str] = []
    for token in _TOKEN_RE.findall(text.lower()):
        if token in seen or token in _KEYWORD_STOPWORDS:
            continue
        seen.add(token)
        keywords.append(token)
    return keywords


def _query_seeds(text: str) -> list[str]:
    seeds: list[str] = []
    for item in _string_list(text):
        cleaned = re.sub(r"^[a-z_]+:\s*", "", item.strip(), flags=re.IGNORECASE)
        cleaned = re.sub(r"\s+", " ", cleaned)
        if not cleaned:
            continue
        words = [
            token.lower()
            for token in _TOKEN_RE.findall(cleaned)
            if token.lower() not in _KEYWORD_STOPWORDS
        ]
        if len(words) < 3:
            continue
        candidate = " ".join(words[:6])
        if candidate not in seeds:
            seeds.append(candidate)
    return seeds


def _evidence_patterns_for_text(text: str) -> list[str]:
    lower = text.lower()
    patterns = [
        "official announcement",
        "listing or notice",
        "document or report",
        "dataset row or API response",
        "discussion thread",
        "changelog or release note",
        "registry update",
    ]
    if any(term in lower for term in ("document", "report", "paper", "pdf")):
        patterns.insert(0, "downloadable document metadata")
    if any(term in lower for term in ("data", "dataset", "api")):
        patterns.insert(0, "machine-readable dataset or API record")
    return _unique(patterns)


def _artifact_expectations_for_text(text: str) -> list[str]:
    lower = text.lower()
    values = ["article", "listing", "document", "dataset", "thread", "changelog", "registry_entry", "unknown"]
    if "profile" in lower:
        values.insert(4, "profile")
    return _unique(values)


def _freshness_need(text: str) -> str:
    lower = text.lower()
    if any(term in lower for term in ("breaking", "urgent", "real-time", "incident")):
        return "fast"
    if any(term in lower for term in ("rare", "occasional", "low frequency")):
        return "rare"
    if any(term in lower for term in ("archive", "historical", "annual")):
        return "slow"
    return "normal"


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result
