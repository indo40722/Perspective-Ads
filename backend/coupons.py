import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


class CouponStore:
    def __init__(self, database_path):
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS coupon_visits (
                    visit_id TEXT PRIMARY KEY,
                    campaign_id TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS coupons (
                    claim_id TEXT PRIMARY KEY,
                    campaign_id TEXT NOT NULL,
                    code TEXT NOT NULL UNIQUE,
                    status TEXT NOT NULL CHECK (status IN ('issued', 'redeemed')),
                    issued_at TEXT NOT NULL,
                    redeemed_at TEXT
                );
                CREATE TABLE IF NOT EXISTS coupon_events (
                    event_id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    campaign_id TEXT NOT NULL,
                    event_type TEXT NOT NULL CHECK (event_type IN ('detail_found', 'choice_committed')),
                    detail_id TEXT NOT NULL CHECK (detail_id IN ('grill', 'cut')),
                    created_at TEXT NOT NULL
                );
                """
            )

    def _connect(self):
        connection = sqlite3.connect(self.database_path, timeout=5)
        connection.row_factory = sqlite3.Row
        return connection

    @staticmethod
    def _now():
        return datetime.now(timezone.utc).isoformat(timespec="seconds")

    def record_visit(self, visit_id, campaign_id):
        with self._connect() as connection:
            connection.execute(
                "INSERT OR IGNORE INTO coupon_visits (visit_id, campaign_id, created_at) VALUES (?, ?, ?)",
                (visit_id, campaign_id, self._now()),
            )
        return self.stats()

    def claim(self, claim_id, campaign_id):
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                "SELECT * FROM coupons WHERE claim_id = ?", (claim_id,)
            ).fetchone()
            if existing:
                if existing["campaign_id"] != campaign_id:
                    raise ValueError("受取キーが別の広告で使われています")
                return dict(existing)

            for _ in range(8):
                suffix = "".join(secrets.choice(alphabet) for _ in range(8))
                code = f"CHAR-{suffix}"
                try:
                    connection.execute(
                        "INSERT INTO coupons (claim_id, campaign_id, code, status, issued_at) VALUES (?, ?, ?, 'issued', ?)",
                        (claim_id, campaign_id, code, self._now()),
                    )
                    break
                except sqlite3.IntegrityError:
                    continue
            else:
                raise RuntimeError("クーポンコードを発行できませんでした")

            issued = connection.execute(
                "SELECT * FROM coupons WHERE claim_id = ?", (claim_id,)
            ).fetchone()
            return dict(issued)

    def get_claim(self, claim_id):
        with self._connect() as connection:
            claim = connection.execute(
                "SELECT * FROM coupons WHERE claim_id = ?", (claim_id,)
            ).fetchone()
        return dict(claim) if claim else None

    def record_event(self, event_id, session_id, campaign_id, event_type, detail_id):
        with self._connect() as connection:
            connection.execute(
                "INSERT OR IGNORE INTO coupon_events (event_id, session_id, campaign_id, event_type, detail_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (event_id, session_id, campaign_id, event_type, detail_id, self._now()),
            )
        return self.stats()

    def redeem(self, code):
        normalized_code = code.strip().upper()
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            coupon = connection.execute(
                "SELECT * FROM coupons WHERE code = ?", (normalized_code,)
            ).fetchone()
            if coupon is None:
                return None
            if coupon["status"] == "redeemed":
                return dict(coupon), False

            connection.execute(
                "UPDATE coupons SET status = 'redeemed', redeemed_at = ? WHERE code = ? AND status = 'issued'",
                (self._now(), normalized_code),
            )
            redeemed = connection.execute(
                "SELECT * FROM coupons WHERE code = ?", (normalized_code,)
            ).fetchone()
            return dict(redeemed), True

    def stats(self):
        with self._connect() as connection:
            visit_count = connection.execute("SELECT COUNT(*) FROM coupon_visits").fetchone()[0]
            coupon_counts = connection.execute(
                "SELECT status, COUNT(*) AS count FROM coupons GROUP BY status"
            ).fetchall()
            event_counts = connection.execute(
                "SELECT event_type, detail_id, COUNT(*) AS count FROM coupon_events GROUP BY event_type, detail_id"
            ).fetchall()
        counts = {row["status"]: row["count"] for row in coupon_counts}
        events = {(row["event_type"], row["detail_id"]): row["count"] for row in event_counts}
        return {
            "visits": visit_count,
            "issued": counts.get("issued", 0) + counts.get("redeemed", 0),
            "redeemed": counts.get("redeemed", 0),
            "grillViews": events.get(("detail_found", "grill"), 0),
            "cutViews": events.get(("detail_found", "cut"), 0),
        }
