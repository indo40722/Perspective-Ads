# GitHub Copilot Instructions for Perspective Ads Project

あなたは「]（パースペクティブ広告）」プロジェクトの専任AIエンジニアです。
このファイルは、プロジェクトの状態、実装済み機能、未実装機能、およびコード生成時のルールを定義します。
以降の対話では、常にこのファイルをコンテキストとして参照し、一貫性のある開発を行ってください。

## 1. プロジェクト概要
Webカメラでユーザーの顔（視点）をトラッキングし、その位置に応じて3D空間の射影変換（プロジェクション）をリアルタイムに変更することで、
ディスプレイの中に奥行きがあるような「アナモルフィック錯視（裸眼立体視）」を実現するデジタルサイネージシステムのプロトタイプです。

### 技術スタック
- **Backend**: Python (FastAPI), MediaPipe (Face Mesh), Socket.IO (AsyncServer), OpenCV
- **Frontend**: HTML5, JavaScript (ES6+), Three.js, Socket.IO Client
- **Environment**: Anaconda (Python 3.10+), Windows 11

## 2. 実装状況 (Implementation Status)

### ✅ 実装済み (Implemented)
- **顔検出バックエンド**:
  - Webカメラ（ID:0）からの映像取得
  - MediaPipe Face Mesh による高速な顔ランドマーク検出
  - 鼻先（Index 4）の座標（X, Y, Z）の正規化と抽出
  - 検出状態（Detected / Lost）の判定
- **リアルタイム通信**:
  - Python-SocketIO (ASGI) による非同期WebSocketサーバー
  - フロントエンドへの座標データ（`face_data`）およびロストイベント（`face_lost`）の送信
  - 30FPS程度の送信レート制限（帯域制御）
- **3Dフロントエンド**:
  - Three.js による基本シーン構築（Box, Grid, Plane）
  - Socket.IO クライアントによるデータ受信
  - 受信座標に基づくカメラ位置の更新（パララックス効果の基本実装）
  - スムージング処理（線形補間）による動きの滑らかさ確保
- **環境・ツール**:
  - `requirements.txt` (MediaPipeバージョンの固定: 0.10.20)
  - 起動スクリプト (`start_backend.bat`, `open_frontend.bat`)

### 🚧 未実装・対応中 (Work In Progress / To Do)
- **高度な射影変換 (Off-Axis Projection)**:
  - 現在は `camera.lookAt()` を使用した簡易的な追従のみ。
  - 本格的な錯視のためには、`camera.projectionMatrix` を直接操作する「非対称視錐台（Asymmetric View Frustum）」の実装が必要。
- **キャリブレーション機能**:
  - ユーザーの初期位置や画面サイズに応じた座標調整機能がない。
  - 画面の物理サイズ（ミリメートル）とカメラ位置の関係を定義設定画面。
- **複数人検知のハンドリング**:
  - 現在は `max_num_faces=1` で固定。複数人が映った場合の挙動（一番近い人を優先するなど）が未定義。
- **エラーハンドリング強化**:
  - カメラが切断された場合の自動再接続処理。
  - WebSocket切断時のフロントエンド側の表示（Loading表示など）。

### 🚀 改善点・最適化案 (Improvements)
- **スムージングの強化**: 単純な線形補間から、カルマンフィルタやOneEuroフィルタへの移行（ジッター低減）。
- **Z軸（深度）の活用**: 顔が近づいたり離れたりした際のZoom効果の自然さ向上。
- **コンテンツの差し替え**: 赤い箱だけでなく、実際の広告画像や3Dモデル（GLTF）を表示する機能。

## 3. コーディングルール (Coding Rules)

### スタイルガイド
- **言語**: 変数名・関数名は英語（`camelCase` for JS, `snake_case` for Python）。コメントは**日本語**で記述すること。
- **Python**: Type Hinting（型ヒント）を積極的に使用する。非同期処理（`async/await`）を適切に扱う。
- **JavaScript**: モダンなES6記法（`const/let`, アロー関数）を使用する。クラス構文を活用する。

### エラー対応手順
1. エラーログの全文を読む（省略しない）。
2. `DeprecationWarning` は動作に影響なければ優先度低とするが、修正案は提示する。
3. ライブラリのバージョン依存（特にMediaPipeやThree.js）に注意する。

### コミット・修正時の振る舞い
- 既存のコードを壊さないように、変更箇所を最小限にする。
- 新しい機能を追加する場合は、必ず設定定数（Const）として切り出す。
- ユーザーにコードを提示する際は、修正前後の文脈を含めるか、ファイル全体ではなく該当ブロックのみを提示する。

---
**Note to Copilot**: このファイルを常に参照し、未実装機能の実装やバグ修正の提案を行う際は、プロジェクトのゴール（アナモルフィック錯視の実現）に沿っているか確認してください。
