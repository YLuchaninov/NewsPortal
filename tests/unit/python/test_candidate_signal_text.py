import unittest

from services.workers.app.candidate_signal_text import looks_like_generic_advice_title


class CandidateSignalTextTest(unittest.TestCase):
    def test_generic_advice_title_detection_is_prefix_based(self) -> None:
        self.assertTrue(looks_like_generic_advice_title("how to choose a vendor"))
        self.assertTrue(looks_like_generic_advice_title("what is vector search"))
        self.assertFalse(looks_like_generic_advice_title("vendor launches migration program"))


if __name__ == "__main__":
    unittest.main()
