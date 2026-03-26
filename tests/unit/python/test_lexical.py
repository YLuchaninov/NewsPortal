import unittest

from services.workers.app.lexical import build_lexical_tsquery


class LexicalQueryTests(unittest.TestCase):
    def test_build_lexical_tsquery_normalizes_into_or_terms(self) -> None:
        self.assertEqual(
            build_lexical_tsquery("llm breakthroughs openai releases gpt5"),
            "llm | breakthroughs | openai | releases | gpt5",
        )

    def test_build_lexical_tsquery_dedupes_and_filters_short_or_noisy_tokens(self) -> None:
        self.assertEqual(
            build_lexical_tsquery("AI open-source OpenAI openai gpt-5 ++ ?? cloud"),
            "opensource | openai | gpt5 | cloud",
        )
        self.assertEqual(build_lexical_tsquery("AI ML ++ ??"), "")


if __name__ == "__main__":
    unittest.main()
