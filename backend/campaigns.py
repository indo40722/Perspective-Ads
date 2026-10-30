import json
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse


CAMPAIGN_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{1,47}$")
COLOR_PATTERN = re.compile(r"^#[0-9a-fA-F]{6}$")


class CampaignStore:
    def __init__(self, database_path):
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS campaigns (
                    campaign_id TEXT PRIMARY KEY,
                    campaign_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS campaign_settings (
                    setting_key TEXT PRIMARY KEY,
                    setting_value TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS reward_draws (
                    campaign_id TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    won INTEGER NOT NULL,
                    chance_percent INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (campaign_id, session_id)
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

    @staticmethod
    def validate_campaign(campaign):
        if not isinstance(campaign, dict):
            raise ValueError("広告データの形式が正しくありません")
        campaign_id = campaign.get("id")
        if not isinstance(campaign_id, str) or not CAMPAIGN_ID_PATTERN.fullmatch(campaign_id):
            raise ValueError("広告IDは英小文字・数字・ハイフンで入力してください")
        for key, label, limit in (("name", "広告名", 100), ("advertiser", "広告主名", 100), ("itemName", "商品名", 100)):
            value = campaign.get(key)
            if not isinstance(value, str) or not value.strip() or len(value) > limit:
                raise ValueError(f"{label}を1〜{limit}文字で入力してください")

        photos = campaign.get("photos")
        stages = campaign.get("stages")
        if not isinstance(photos, list) or len(photos) != 3:
            raise ValueError("商品写真を3枚登録してください")
        if not isinstance(stages, list) or len(stages) != 3:
            raise ValueError("広告の表示段階を3つ登録してください")
        for photo in photos:
            if (
                not isinstance(photo, dict)
                or not isinstance(photo.get("src"), str)
                or not photo["src"].strip()
                or len(photo["src"]) > 2048
            ):
                raise ValueError("全体・見どころ・詳細の写真を登録してください")
        for stage in stages:
            if not isinstance(stage, dict):
                raise ValueError("各表示段階の内容を確認してください")
            if stage.get("photo") not in range(3):
                raise ValueError("各表示段階の写真を選択してください")
            for key, limit in (("label", 40), ("title", 300), ("description", 500), ("instruction", 200)):
                value = stage.get(key, "")
                if not isinstance(value, str) or len(value) > limit:
                    raise ValueError("広告コピーの文字数を確認してください")
            for key in ("headlineMode", "supportMode"):
                if stage.get(key, "text") not in {"text", "image"}:
                    raise ValueError("コピーの表示形式を選択してください")

        theme = campaign.get("theme")
        if not isinstance(theme, dict) or any(
            not isinstance(theme.get(key), str) or not COLOR_PATTERN.fullmatch(theme[key])
            for key in ("background", "accent", "text")
        ):
            raise ValueError("テーマの色は16進数のカラーコードで指定してください")

        reward = campaign.get("reward")
        if not isinstance(reward, dict):
            raise ValueError("特典の設定を確認してください")
        try:
            chance_percent = int(reward.get("chancePercent"))
        except (TypeError, ValueError) as error:
            raise ValueError("特典表示確率を0〜100で指定してください") from error
        if not 0 <= chance_percent <= 100:
            raise ValueError("特典表示確率を0〜100で指定してください")
        for key, limit in (("title", 100), ("value", 100), ("note", 200), ("qrUrl", 2048)):
            value = reward.get(key, "")
            if not isinstance(value, str) or len(value) > limit:
                raise ValueError("特典とQRの設定内容を確認してください")
        qr_url = reward.get("qrUrl", "").strip()
        parsed_qr_url = urlparse(qr_url)
        is_web_url = parsed_qr_url.scheme in {"http", "https"} and bool(parsed_qr_url.netloc) and not parsed_qr_url.username
        if qr_url and not is_web_url:
            raise ValueError("QRのリンク先はhttp://またはhttps://で始まるURLにしてください")
        encoded = json.dumps(campaign, ensure_ascii=False, separators=(",", ":"))
        if len(encoded) > 1_000_000:
            raise ValueError("広告データが大きすぎます。画像はアップロード欄から登録してください")
        return campaign

    @staticmethod
    def _decode(row):
        if row is None:
            return None
        campaign = json.loads(row["campaign_json"])
        campaign["updatedAt"] = row["updated_at"]
        return campaign

    def list_campaigns(self):
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT campaign_id, campaign_json, updated_at FROM campaigns ORDER BY updated_at DESC"
            ).fetchall()
            active = connection.execute(
                "SELECT setting_value FROM campaign_settings WHERE setting_key = 'activeCampaignId'"
            ).fetchone()
        return {
            "campaigns": [self._decode(row) for row in rows],
            "activeCampaignId": active["setting_value"] if active else None,
        }

    def get(self, campaign_id):
        with self._connect() as connection:
            row = connection.execute(
                "SELECT campaign_id, campaign_json, updated_at FROM campaigns WHERE campaign_id = ?",
                (campaign_id,),
            ).fetchone()
        return self._decode(row)

    def get_active(self):
        with self._connect() as connection:
            row = connection.execute(
                "SELECT c.campaign_id, c.campaign_json, c.updated_at FROM campaigns c "
                "JOIN campaign_settings s ON s.setting_value = c.campaign_id "
                "WHERE s.setting_key = 'activeCampaignId'"
            ).fetchone()
        return self._decode(row)

    def save(self, campaign, activate=True):
        campaign = self.validate_campaign(campaign)
        updated_at = self._now()
        serialized = json.dumps(campaign, ensure_ascii=False, separators=(",", ":"))
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO campaigns (campaign_id, campaign_json, updated_at) VALUES (?, ?, ?) "
                "ON CONFLICT(campaign_id) DO UPDATE SET campaign_json = excluded.campaign_json, updated_at = excluded.updated_at",
                (campaign["id"], serialized, updated_at),
            )
            if activate:
                connection.execute(
                    "INSERT INTO campaign_settings (setting_key, setting_value) VALUES ('activeCampaignId', ?) "
                    "ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value",
                    (campaign["id"],),
                )
        saved = dict(campaign)
        saved["updatedAt"] = updated_at
        return saved

    def set_active(self, campaign_id):
        with self._connect() as connection:
            exists = connection.execute(
                "SELECT 1 FROM campaigns WHERE campaign_id = ?", (campaign_id,)
            ).fetchone()
            if exists is None:
                return None
            connection.execute(
                "INSERT INTO campaign_settings (setting_key, setting_value) VALUES ('activeCampaignId', ?) "
                "ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value",
                (campaign_id,),
            )
        return self.get(campaign_id)

    def draw_reward(self, campaign_id, session_id):
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                "SELECT won, chance_percent FROM reward_draws WHERE campaign_id = ? AND session_id = ?",
                (campaign_id, session_id),
            ).fetchone()
            if existing:
                return {"won": bool(existing["won"]), "chancePercent": existing["chance_percent"]}

            row = connection.execute(
                "SELECT campaign_json FROM campaigns WHERE campaign_id = ?", (campaign_id,)
            ).fetchone()
            chance_percent = json.loads(row["campaign_json"])["reward"]["chancePercent"] if row else 100
            won = secrets.randbelow(100) < chance_percent
            connection.execute(
                "INSERT INTO reward_draws (campaign_id, session_id, won, chance_percent, created_at) VALUES (?, ?, ?, ?, ?)",
                (campaign_id, session_id, int(won), chance_percent, self._now()),
            )
            return {"won": won, "chancePercent": chance_percent}
