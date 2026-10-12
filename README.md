# Perspective Ads

「広告を見る」を「広告の中を探す」に変える、視点連動型デジタルサイネージのプロトタイプです。

Webカメラで1人の顔位置を取得し、その左右移動に合わせてThree.js上の3D広告空間の見え方を変化させます。正面からは商品に隠れて見えない報酬を、身体を左右に動かして「覗く」ことで発見する体験を検証しています。

> 技育展2026に向けて継続開発中です。現在は核となる「覗き込み」体験を検証するPoC段階です。

## 現在のデモ

現在の `geekten-2026` ブランチでは、既存ポスター画像を無理に3D化する方式をやめ、広告そのものをThree.js上の3Dショーケースとして設計しています。

- 画面奥：広告コピーと背景
- 中央：Three.jsで構成した3Dバーガー
- 商品の奥：隠しクーポン
- ユーザー：左右へ移動して商品の裏を覗く
- 発見後：取得用QRを大きく表示

この構成により、「特定の画像を切り抜いたから成立するデモ」ではなく、商品や広告表現を差し替えられる3D広告テンプレートとして検証できます。

## 現在できること

- Webカメラ映像からMediaPipe Face Meshで1人の顔を検出
- 鼻先ランドマークを基準に、画面内の相対的なX / Y / Z値を取得
- Socket.IOで検出結果を約30FPSでフロントエンドへ送信
- 画面寸法と概算視点位置から非対称視錐台を計算するOff-Axis Projection
- Deadzone・Lerpを使った簡易的な揺れ対策
- Three.jsだけで構成した3D広告ショーケース
- 商品の奥に隠した「SECRET COUPON」を左右へ覗いて発見
- 一定時間覗いた後に取得用QRを表示
- Fキーで全画面、Dキーでデバッグ、Rキーで報酬状態をリセット

## 現在の技術的な制約

現時点の実装は完成版ではありません。

- Off-Axis Projection自体は初期実装済みだが、視点Zは固定値で、WebカメラFOVも概算値を使っている
- 実ディスプレイ寸法・カメラ位置・実視点位置を合わせるキャリブレーションは未完成
- MediaPipeのランドマーク `z` は実距離そのものではなく、現在の投影計算では利用していない
- トラッキングの平滑化は単純なLerpのみ
- 現在の3D商品は技術検証用の簡易モデル
- 複数人対応、行動計測、実環境での比較検証は未実装

## 技育展2026に向けた改善

優先順位は次の通りです。

1. Off-Axis Projectionのキャリブレーション精度向上
2. 視点推定とトラッキングの安定化
3. 正面では隠れ、覗いたときだけ自然に発見できる遮蔽表現の改善
4. 3D広告としての見た目と商品テンプレートの改善
5. 実際に取得できるクーポン導線
6. 通常広告との比較を行うための行動計測
7. 実店舗・イベント会場などを想定した検証

周辺機能よりも、まず「覗くことで広告を見る行為そのものが探索になるか」という核体験の完成度を優先します。

## システム構成

```text
Webcam
  ↓
OpenCV / MediaPipe Face Mesh
  ↓
Python / FastAPI / Socket.IO
  ↓  face_data
JavaScript / Three.js
  ↓
Off-Axis Projection
  ↓
3D Advertisement Showcase
```

## ディレクトリ

```text
Perspective-Ads/
├── backend/
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── assets/
│   ├── css/
│   ├── js/
│   │   ├── app.js
│   │   └── projection.js
│   └── index.html
├── docs/
├── start_backend.bat
├── open_frontend.bat
└── README.md
```

## 起動方法

### 1. Python環境を用意

Python環境を有効化した状態で依存関係をインストールします。

```bash
pip install -r backend/requirements.txt
```

### 2. バックエンドを起動

```bash
py -3.10 backend/main.py
```

Windowsでは `start_backend.bat` でも起動できます。

### 3. ブラウザで開く

```text
http://localhost:8000/view/index.html
```

Windowsでは `open_frontend.bat` でも開けます。

## 使用技術

- Python
- FastAPI
- OpenCV
- MediaPipe Face Mesh
- python-socketio
- JavaScript
- Three.js
- Socket.IO Client

## ブランチと旧バージョン

技育展2026向けの現行開発は `geekten-2026` ブランチです。

ポスター画像を前景レイヤー化していた旧PoCは、削除せず `archive/layered-poster-prototype` ブランチに保存しています。

GitHubのリポジトリトップで最新状態を見せる場合は、`geekten-2026` を default branch にするか、`main` を `geekten-2026` へ fast-forward します。公開済み履歴を書き換えずに整理するなら、まずこのどちらかで入口をそろえます。
