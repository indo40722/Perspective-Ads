# Perspective Ads Project

## プロジェクト構造
このプロジェクトは、Python (Backend) と JavaScript/Three.js (Frontend) で構成されています。

### ディレクトリ構成 (予定)
```
Perspective_ads/
├── docs/               # ドキュメント (要件定義, ユースケース)
├── backend/            # Python バックエンド
│   ├── app.py          # エントリーポイント
│   ├── detector.py     # 顔認識・視線追跡ロジック (MediaPipe)
│   └── requirements.txt
├── frontend/           # Web フロントエンド
│   ├── index.html
│   ├── style.css
│   ├── main.js         # Three.js ロジック
│   └── assets/         # 3Dモデル, 画像など
├── README.md
└── .gitignore
```

## 開発の進め方
1. `docs/` 内の要件定義書に従い実装を進めます。
2. まずは `backend/` でWebカメラから顔座標を取得し、WebSocketで送信する部分を作成します。
3. 次に `frontend/` でThree.jsのシーンを構築し、受信したデータでカメラを動かす実装を行います。
