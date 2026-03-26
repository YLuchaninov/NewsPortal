from __future__ import annotations


def build_lexical_tsquery(lexical_query: str) -> str:
    tokens: list[str] = []
    seen: set[str] = set()
    for raw_token in str(lexical_query or "").split():
        normalized = "".join(character for character in raw_token.casefold() if character.isalnum())
        if len(normalized) < 3 or normalized in seen:
            continue
        seen.add(normalized)
        tokens.append(normalized)
    return " | ".join(tokens)
