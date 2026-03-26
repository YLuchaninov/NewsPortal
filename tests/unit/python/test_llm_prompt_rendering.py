import unittest

from services.workers.app.prompting import render_llm_prompt_template


class LlmPromptRenderingTests(unittest.TestCase):
    def test_render_llm_prompt_template_supports_documented_single_brace_placeholders(self) -> None:
        prompt = render_llm_prompt_template(
            'Criterion: {criterion_name}\nTitle: {title}\nLead: {lead}\nContext: {context}',
            article={
                "title": "EU updates AI law",
                "lead": "Brussels publishes new safeguards",
                "body": "Long body",
            },
            review_context={
                "criterion_name": "AI Policy",
                "decision": "gray_zone",
                "score": 0.64,
            },
            scope="criterion",
        )

        self.assertIn("AI Policy", prompt)
        self.assertIn("EU updates AI law", prompt)
        self.assertIn("Brussels publishes new safeguards", prompt)
        self.assertIn('"decision": "gray_zone"', prompt)
        self.assertNotIn("{criterion_name}", prompt)
        self.assertNotIn("{title}", prompt)
        self.assertNotIn("{context}", prompt)

    def test_render_llm_prompt_template_keeps_backward_compatibility_for_double_brace_tokens(self) -> None:
        prompt = render_llm_prompt_template(
            "Interest: {{interest_name}}\nTitle: {{title}}\nBody: {{body}}\nExplain: {{explain_json}}",
            article={
                "title": "AI chip export controls widen",
                "lead": "",
                "body": "Body copy for the article",
            },
            review_context={
                "interest_name": "Semiconductor policy",
                "majorUpdate": True,
            },
            scope="interest",
        )

        self.assertIn("Semiconductor policy", prompt)
        self.assertIn("AI chip export controls widen", prompt)
        self.assertIn("Body copy for the article", prompt)
        self.assertIn('"majorUpdate": true', prompt)
        self.assertNotIn("{{interest_name}}", prompt)
        self.assertNotIn("{{title}}", prompt)
        self.assertNotIn("{{explain_json}}", prompt)


if __name__ == "__main__":
    unittest.main()
