# Perspective Ads Project

## 戦略コンセプト：A+B ハイブリッド（Ordinary Ad comes alive）
本プロジェクトは、以下の2つのアプローチを統合した「ハイブリッド型」の体験を提供します。

1.  **通常時（Poster Mode / Plan B）**:
    *   一見すると普通の2Dポスターやサイネージ広告。
    *   既存の広告素材（画像データ等）をそのまま活用可能で、広告主への導入ハードルを下げる。
2.  **体験時（3D Mode / Plan A）**:
    *   ユーザーが近づいたり覗き込んだりすると、奥行きが生まれ3D空間化する。
    *   更に角度を変えると、障害物の裏に隠された「クーポン」や「特典」を発見できる。

**体験フロー**:
`「ただのポスターかと思った（油断）」→「近づいたら奥行きが出た（驚き）」→「覗き込んだらクーポン見つけた（報酬）」`

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
