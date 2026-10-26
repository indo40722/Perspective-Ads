import tempfile
import unittest
from pathlib import Path

from coupons import CouponStore


class CouponStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = CouponStore(Path(self.temp_dir.name) / "coupons.sqlite3")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_page_visit_count_is_idempotent_for_one_session(self):
        first = self.store.record_visit("visit-session-123456", "steak")
        repeated = self.store.record_visit("visit-session-123456", "steak")

        self.assertEqual(first["visits"], 1)
        self.assertEqual(repeated["visits"], 1)

    def test_claim_issues_one_unique_code_for_the_same_claim_key(self):
        first = self.store.claim("claim-session-123456", "steak")
        repeated = self.store.claim("claim-session-123456", "steak")
        another = self.store.claim("claim-session-654321", "steak")

        self.assertEqual(first["code"], repeated["code"])
        self.assertNotEqual(first["code"], another["code"])
        self.assertEqual(first["status"], "issued")

    def test_coupon_can_be_redeemed_only_once(self):
        coupon = self.store.claim("claim-session-123456", "steak")

        redeemed, newly_redeemed = self.store.redeem(coupon["code"].lower())
        repeated, second_redeem = self.store.redeem(coupon["code"])

        self.assertTrue(newly_redeemed)
        self.assertEqual(redeemed["status"], "redeemed")
        self.assertFalse(second_redeem)
        self.assertEqual(repeated["redeemed_at"], redeemed["redeemed_at"])
        self.assertEqual(self.store.stats()["redeemed"], 1)

    def test_unknown_coupon_cannot_be_redeemed(self):
        self.assertIsNone(self.store.redeem("CHAR-UNKNOWN"))


if __name__ == "__main__":
    unittest.main()
