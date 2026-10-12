# Perspective Ads — 初期プロトタイプ

**現在の開発版は [`geekten-2026` ブランチ](https://github.com/indo40722/Perspective-Ads/tree/geekten-2026) にあります。**

Perspective Adsは、見る人が少し横に動くことで、広告の奥に隠れた情報を発見できるデジタルサイネージの試作です。

この `main` ブランチは、2026年3月ごろに作成した**初期プロトタイプの記録**として残しています。技育展2026向けの現行版とは実装が異なります。

## このブランチで試したこと

- WebカメラとMediaPipe Face Meshによる顔位置の取得
- PythonからSocket.IOを使った座標の送信
- Three.jsでの視点移動に合わせた簡易的なパララックス表示
- ポスターの裏に置いた疑似QR画像の表示

現在の `geekten-2026` 版では、既存ポスター画像を切り替える方式ではなく、Three.js上の3Dバーガーと、その奥に置いた特典を覗く構成へ変更しています。視点に合わせたOff-Axis Projectionも初期実装しています。

**作品の説明・実装状況・起動方法は [現行版のREADME](https://github.com/indo40722/Perspective-Ads/blob/geekten-2026/README.md) を参照してください。**

過去の試作を残しているのは、方式の違いや開発中の試行錯誤を確認できるようにするためです。
