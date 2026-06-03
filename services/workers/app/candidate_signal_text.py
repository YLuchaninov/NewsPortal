from __future__ import annotations


GENERIC_ADVICE_TITLE_PREFIXES = ("how ", "how to ", "guide to ", "what is ", "why ")


def looks_like_generic_advice_title(normalized_title: str) -> bool:
    return str(normalized_title or "").startswith(GENERIC_ADVICE_TITLE_PREFIXES)
