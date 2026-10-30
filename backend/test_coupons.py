import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
import main
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

    def test_journey_discovery_events_are_idempotent(self):
        first = self.store.record_event("event-grill-123456", "session-1234567890", "steak", "detail_found", "grill")
        repeated = self.store.record_event("event-grill-123456", "session-1234567890", "steak", "detail_found", "grill")

        self.assertEqual(first["grillViews"], 1)
        self.assertEqual(repeated["grillViews"], 1)

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


class CouponEventEndpointTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = CouponStore(Path(self.temp_dir.name) / "coupons.sqlite3")
        self.client = TestClient(main.app)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_event_endpoint_records_valid_discovery(self):
        with patch.object(main, "get_coupon_store", return_value=self.store):
            response = self.client.post(
                "/api/coupons/events",
                headers={"Origin": "http://testserver"},
                json={
                    "campaignId": "steak",
                    "sessionId": "session-identifier-123456",
                    "eventId": "event-identifier-123456",
                    "eventType": "detail_found",
                    "detailId": "grill",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["grillViews"], 1)

    def test_event_endpoint_rejects_invalid_token(self):
        with patch.object(main, "get_coupon_store", return_value=self.store):
            response = self.client.post(
                "/api/coupons/events",
                headers={"Origin": "http://testserver"},
                json={
                    "campaignId": "steak",
                    "sessionId": "short",
                    "eventId": "event-identifier-123456",
                    "eventType": "detail_found",
                    "detailId": "grill",
                },
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.store.stats()["grillViews"], 0)

    def test_event_endpoint_rejects_obsolete_choice_event(self):
        with patch.object(main, "get_coupon_store", return_value=self.store):
            response = self.client.post(
                "/api/coupons/events",
                headers={"Origin": "http://testserver"},
                json={
                    "campaignId": "steak",
                    "sessionId": "session-identifier-123456",
                    "eventId": "event-identifier-123456",
                    "eventType": "choice_committed",
                    "detailId": "grill",
                },
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.store.stats()["grillViews"], 0)


if __name__ == "__main__":
    unittest.main()
