from __future__ import annotations

import hashlib
import html
import re
import unicodedata
import uuid
from typing import Any

import psycopg


def strip_html(value: str) -> str:
    without_scripts = re.sub(r"<script[\s\S]*?</script>", " ", value, flags=re.IGNORECASE)
    without_styles = re.sub(r"<style[\s\S]*?</style>", " ", without_scripts, flags=re.IGNORECASE)
    return re.sub(r"<[^>]+>", " ", without_styles)


def normalize_text(value: str) -> str:
    unescaped = html.unescape(value)
    nfkc = unicodedata.normalize("NFKC", unescaped)
    stripped = strip_html(nfkc)
    return re.sub(r"\s+", " ", stripped).strip()


def derive_lead(summary_source: str, body_source: str) -> str:
    summary = normalize_text(summary_source)
    if summary:
        return summary

    body = normalize_text(body_source)
    if not body:
        return ""

    sentences = re.split(r"(?<=[.!?])\s+", body)
    return " ".join(sentences[:3]).strip()


def detect_language(text: str, existing_hint: str | None) -> tuple[str | None, float | None]:
    if existing_hint:
        normalized = existing_hint.lower()
        if normalized.startswith("uk"):
            return ("uk", 0.9)
        if normalized.startswith("en"):
            return ("en", 0.9)
        return (normalized[:8], 0.6)

    lowered = text.lower()
    if any(character in lowered for character in ("і", "ї", "є", "ґ")):
        return ("uk", 0.7)
    if re.search(r"[а-яё]", lowered):
        return ("uk", 0.45)
    if re.search(r"[a-z]", lowered):
        return ("en", 0.45)
    return (None, None)


def compute_exact_hash(title: str, lead: str, body: str) -> str:
    payload = "\n".join((title, lead, body)).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def stable_hash64(token: str) -> int:
    digest = hashlib.sha256(token.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big", signed=False)


def to_signed_int64(value: int) -> int:
    if value >= (1 << 63):
        return value - (1 << 64)
    return value


def to_unsigned_int64(value: int) -> int:
    if value < 0:
        return value + (1 << 64)
    return value


def compute_simhash64(text: str) -> int:
    tokens = re.findall(r"[0-9A-Za-zА-Яа-яЁёІіЇїЄєҐґ-]{2,}", text.lower())
    if not tokens:
        return 0

    weights = [0] * 64
    for token in tokens:
        hashed = stable_hash64(token)
        for bit_index in range(64):
            if hashed & (1 << bit_index):
                weights[bit_index] += 1
            else:
                weights[bit_index] -= 1

    result = 0
    for bit_index, weight in enumerate(weights):
        if weight >= 0:
            result |= 1 << bit_index

    return to_signed_int64(result)


def hamming_distance64(left: int, right: int) -> int:
    return (to_unsigned_int64(left) ^ to_unsigned_int64(right)).bit_count()



def extract_raw_rss_payload(article: dict[str, Any]) -> tuple[str, str, str]:
    raw_payload = article.get("raw_payload_json") or {}
    entry_payload = raw_payload.get("entry") if isinstance(raw_payload, dict) else {}
    rss_payload = raw_payload.get("rss") if isinstance(raw_payload, dict) else {}
    if not isinstance(entry_payload, dict):
        entry_payload = {}
    if not isinstance(rss_payload, dict):
        rss_payload = {}

    title_source = str(article.get("title") or entry_payload.get("title") or rss_payload.get("title") or "")
    summary_source = str(
        article.get("extracted_description")
        or entry_payload.get("description")
        or rss_payload.get("description")
        or article.get("lead")
        or ""
    )
    content_source = str(
        article.get("full_content_html")
        or entry_payload.get("contentEncoded")
        or rss_payload.get("contentEncoded")
        or article.get("body")
        or ""
    )
    return (title_source, summary_source, content_source)



async def find_exact_duplicate_candidate(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: uuid.UUID,
    exact_hash: str,
) -> dict[str, Any] | None:
    await cursor.execute(
        """
        select
          doc_id,
          canonical_doc_id,
          family_id,
          ingested_at
        from articles
        where
          doc_id <> %s
          and exact_hash = %s
          and processing_state in ('normalized', 'deduped', 'embedded', 'clustered', 'matched', 'notified')
          and ingested_at >= now() - interval '7 days'
        order by ingested_at, doc_id
        limit 1
        """,
        (doc_id, exact_hash),
    )
    return await cursor.fetchone()


async def find_near_duplicate_candidate(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: uuid.UUID,
    simhash64: int,
) -> dict[str, Any] | None:
    await cursor.execute(
        """
        select
          doc_id,
          canonical_doc_id,
          family_id,
          simhash64,
          ingested_at
        from articles
        where
          doc_id <> %s
          and simhash64 is not null
          and processing_state in ('normalized', 'deduped', 'embedded', 'clustered', 'matched', 'notified')
          and ingested_at >= now() - interval '7 days'
        order by ingested_at desc
        limit 200
        """,
        (doc_id,),
    )
    candidates = await cursor.fetchall()

    best_candidate: dict[str, Any] | None = None
    best_distance = 64
    for candidate in candidates:
        distance = hamming_distance64(simhash64, int(candidate["simhash64"]))
        if distance <= 3 and distance < best_distance:
            best_candidate = candidate
            best_distance = distance

    return best_candidate


def resolve_canonical_doc_id(candidate: dict[str, Any]) -> uuid.UUID:
    return candidate.get("canonical_doc_id") or candidate["doc_id"]


def resolve_family_id(candidate: dict[str, Any]) -> uuid.UUID:
    return candidate.get("family_id") or resolve_canonical_doc_id(candidate)
