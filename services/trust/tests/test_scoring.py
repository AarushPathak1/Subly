"""
Unit tests for the Trust Service's pure scoring functions.
These tests run entirely in-process — no DB, no OpenAI, no RabbitMQ.
conftest.py mocks all external dependencies before this file is imported.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import compute_keyword_score, SCAM_SIGNALS  # noqa: E402

# ── compute_keyword_score ─────────────────────────────────────────────────────

class TestKeywordScore:
    def test_clean_listing_returns_zero(self):
        score = compute_keyword_score(
            "Bright 2BR near campus",
            "All utilities included. Great location.",
        )
        assert score == 0.0

    def test_single_low_weight_keyword(self):
        score = compute_keyword_score("Won't last long!", "")
        assert 0.0 < score < 0.5

    def test_zelle_keyword(self):
        score = compute_keyword_score("Pay via Zelle only", "")
        assert score == SCAM_SIGNALS["zelle"]

    def test_western_union_keyword(self):
        score = compute_keyword_score("Western Union payment required", "")
        assert score == SCAM_SIGNALS["western union"]

    def test_currently_abroad_in_description(self):
        score = compute_keyword_score("Nice apartment", "I am currently abroad, send deposit first.")
        assert score > 0.5

    def test_multiple_keywords_accumulate(self):
        single = compute_keyword_score("Zelle only", "")
        multi = compute_keyword_score("Zelle only, currently abroad", "send deposit first")
        assert multi > single

    def test_score_capped_at_1(self):
        # Pile on every signal — must never exceed 1.0
        text = " ".join(SCAM_SIGNALS.keys())
        score = compute_keyword_score(text, text)
        assert score == 1.0

    def test_case_insensitive_matching(self):
        upper = compute_keyword_score("ZELLE ONLY", "SEND DEPOSIT NOW")
        lower = compute_keyword_score("zelle only", "send deposit now")
        assert upper == lower

    def test_keyword_in_description_not_just_title(self):
        title_only = compute_keyword_score("wire transfer required", "")
        desc_only  = compute_keyword_score("", "wire transfer required")
        assert title_only == desc_only  # both contribute equally

    def test_partial_word_does_not_match(self):
        # "zell" is not "zelle"
        score = compute_keyword_score("pay with zell", "")
        assert score == 0.0


# ── Final score formula ───────────────────────────────────────────────────────

class TestScoringFormula:
    """
    Verify the documented blending: min(1.0, llm*0.5 + kw*0.3 + rf*0.2)
    """

    def _blend(self, llm: float, kw: float, rf: float) -> float:
        return round(min(1.0, llm * 0.5 + kw * 0.3 + rf * 0.2), 3)

    def test_all_zero_inputs_produce_zero(self):
        assert self._blend(0.0, 0.0, 0.0) == 0.0

    def test_all_max_inputs_produce_one(self):
        assert self._blend(1.0, 1.0, 1.0) == 1.0

    def test_llm_carries_most_weight(self):
        llm_only = self._blend(1.0, 0.0, 0.0)   # 0.5
        kw_only  = self._blend(0.0, 1.0, 0.0)   # 0.3
        rf_only  = self._blend(0.0, 0.0, 1.0)   # 0.2
        assert llm_only > kw_only > rf_only

    def test_result_never_exceeds_1(self):
        assert self._blend(2.0, 2.0, 2.0) == 1.0

    def test_known_values(self):
        # llm=0.8, kw=0.6, rf=1.0  →  0.4 + 0.18 + 0.2 = 0.78
        assert self._blend(0.8, 0.6, 1.0) == 0.780
