# Prototype Versions

Perspective Adsでは、試した案を削除せずブランチとして残す。

## main

2026年3月時点の初期PoC。

- MediaPipe Face Mesh
- Socket.IO
- Three.js
- 仮想カメラ移動による簡易パララックス
- ポスターの裏に疑似QR

## archive/layered-poster-prototype

2026年9月に試した「既存ポスター画像をレイヤー化する」案。

- poster.pngを背景として利用
- poster.pngからバーガー周辺を切り出し前景化
- 前景バーガーの奥にクーポンを配置
- Off-Axis Projection

この方式は、特定の1枚絵に合わせた画像処理が必要になり、汎用的な広告体験として不自然だったため現行案から外した。

## geekten-2026

技育展2026向けの現行開発。

- Off-Axis Projection
- 既存画像の切り抜きに依存しない
- Three.js上で広告そのものを3D空間として設計
- 商品の死角に報酬を配置
- 身体を動かして覗くことで報酬を発見
- 発見後に取得用QRを表示

方針：過去案は削除せず、比較・振り返り・審査資料の「試行錯誤」の証拠として残す。
