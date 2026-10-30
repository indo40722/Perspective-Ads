# サイネージ・管理画面のデザイン参照調査

## 調査の目的

広告面は、通行人が短い時間で商品と見どころをつかめることを優先する。管理画面は、広告主が写真・コピー・特典を迷わず編集し、公開前後を見分けられることを優先する。二つの画面で同じ装飾を使い回さず、実際の広告作品とサイネージCMSを別々に調べた。

広告のブランド表現、商品写真、コピーは模倣しない。画面の焦点、情報量、媒体の使い方から、再利用できる原則だけを記録する。

## 広告・サイネージの実例

| 実例 | 観察した特徴 | 今回へ取り入れる原則 |
| --- | --- | --- |
| [McDonald's「Follow the Arches」](https://aurora.dawn.com/news/1143349) | ロゴの一部と短い方向案内だけで、通行中にも意味が伝わる。 | 一画面に伝える内容を一つに絞り、商品写真と短いコピーを主役にする。 |
| [McDonald's「Go Dynamic」](https://www.jcdecaux.ie/news/mcdonalds-go-dynamic-digital) | 気温や天候に合わせ、飲料広告の内容を切り替える。 | 動きは飾りではなく、見る状況と商品の関係を伝えるために使う。 |
| [McDelivery「Anticipation」](https://creative.salon/articles/work/mcdonalds-leo-burnett-mcdelivery-ooh) | 配達を待つ人の実際の表情を中心に、食べる前の気持ちを写す。 | 商品の説明を増やすより、食べる人が共感できる一瞬を見せる。 |
| [Burger King「Cheddar」](https://www.jcdecaux.fr/annonceurs-agences/inspirations/burger-king-une-campagne-qui-fait-le-plein-de-cheddar) | 主役の具材を大胆に見せ、ユーモアのある題材にまとめる。 | 具材の重なりや食感を写真で伝え、文字装飾に頼らない。 |
| [Burger King「Arch Nemesis」](https://creative.salon/articles/work/burger-king-big-arch-bbh-london) | 新商品に反応する屋外広告で、バーガー本体が視覚の中心にある。 | 反応を見せても、広告の中心は商品から動かさない。 |
| [Burger King「Food Moments」](https://www.thecloudandcompass.com/burger-king-case-study) | 朝・昼・夜の食事時に合わせ、近くの店舗で異なる商品広告を配信する。 | 変化には理由を持たせ、閲覧者に無関係なランダム演出を加えない。 |
| [Burger King「Home of the Billboards」](https://www.ogilvy.com/work/home-billboards) | 屋外広告の写真をビデオ通話の背景として使い、媒体そのものを体験に組み込む。 | サイネージの設置場所や画面の性質を、広告の仕掛けに結び付ける。 |
| [KFC「Out-Doors」](https://www.adsoftheworld.com/campaigns/kfc-out-doors) | 店のドアを広告面へ変え、QRから近くの店舗へ案内する。 | QRは画面の飾りにせず、次の行動と結び付ける。 |
| [KFC「Ultimate BBQ Burger」](https://www.creativereview.co.uk/kfc-bbq-summer-campaign/) | 雨の多い夏を広告の題材にし、屋外の水たまりまで表現に使う。 | 環境や素材を見せ方の一部にし、汎用テンプレートの印象を避ける。 |
| [KFC「Crispy Onion Rings」](https://lbbonline.com/news/canadian-chicken-fans-cry-tears-of-joy-over-arrival-of-kfcs-onion-rings) | 新商品を食べる人の感情を、大きな写真と短い問いで伝える。 | 写真とコピーが同じ食感・感情を支える構成にする。 |

## 管理画面・CMSの実例

| 実例 | 画面から確認できる構造 | 今回へ取り入れる原則 |
| --- | --- | --- |
| [Samsung VXT CMS](https://vxt.samsung.com/digital-signage-cms/p-series) | 画面、コンテンツ、プレイリスト、スケジュールを分けて管理する。 | 広告素材の編集と公開状態をひと目で分ける。 |
| [ScreenCloud Studio](https://screencloud.com/studio) | メディア、画面、チャンネルなどを別の管理領域に整理する。 | 左側の一覧、中央の編集、公開先の確認を安定した位置に置く。 |
| [Yodeck Layout Editor](https://www.yodeck.com/docs/user-manual/yodeck-layout-editor-introduction/) | キャンバス、ツール、上部操作、要素編集を役割ごとに分け、公開前プレビューを用意する。 | 9:16プレビューを実寸に近い見え方で常時示し、編集と公開の前後を確かめられるようにする。 |
| [OptiSigns Getting Started](https://support.optisigns.com/hc/en-us/articles/18823504383891-OptiSigns-Getting-Started-Guide) | コンテンツの登録から画面への公開までを段階として示す。 | 写真登録・場面編集・公開の順序を、ラベルと状態表示で迷わせない。 |

## SaaS管理画面・デザインシステムの実例

広告やサイネージCMSとは別に、日々の編集や設定に使う管理画面を調べた。ログインが必要な実画面は公開資料から確認できる範囲に限り、デザインシステム、公式ヘルプ、公開された画面例を参照した。

| 実例 | 確認した構造・ルール | 今回へ取り入れる点 |
| --- | --- | --- |
| [shadcn/ui Dashboard blocks](https://ui.shadcn.com/blocks?category=dashboard) | サイドバー、パンくず、見出し、一覧を役割ごとに分けた管理画面の土台。 | 既存のshadcn/ui部品を使い、画面の配色と間隔はCSS変数で一貫させる。 |
| [Shopify Polaris Layout](https://shopify.dev/docs/apps/design/layout) | 4px間隔の基準、ページ領域、用途に応じたコンテナと一覧表。 | 余白を小刻みにそろえ、編集欄ごとの境界を薄い線で示す。 |
| [GitHub Primer](https://primer.style/product/getting-started/foundations/) | 中立色を面・文字・境界に使い、青をリンクやフォーカスなどの機能色として扱う。 | 背景・文字・境界をニュートラルグレーにし、青を選択と操作に限定する。 |
| [GitHub Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/quickstart-for-projects) | テーブル、ボード、ロードマップを目的別のビューとして切り替える。 | サンプル広告と保存済み広告を区別し、編集工程は中央のタブへ集約する。 |
| [Stripe Dashboard Search](https://docs.stripe.com/dashboard/search) | リソース検索から結果一覧へ移り、列見出しや検索条件で絞り込む。 | 現在の広告と状態を上部に残し、次に行う操作を同じ場所に置く。 |
| [Vercel Dashboard Navigation](https://vercel.com/changelog/dashboard-navigation-redesign-rollout) | よく使う項目をサイドバーへまとめ、チームとプロジェクトでナビゲーションをそろえる。 | キャンペーン一覧は左、キャンペーン内の編集工程は中央とし、同じ項目を二重に並べない。 |
| [Linear UI Refresh](https://linear.app/changelog/page/3) | 見出し・ナビゲーション・表示操作の一貫性を高め、主作業領域を読み取りやすくする。 | 画面内の見出し、タブ、ボタンの書体と状態表示を統一する。 |
| [Notion Projects](https://www.notion.com/en-GB/product/projects) | 表、ボード、ロードマップなど、対象を読む目的に合わせてビューを選ぶ。 | 広告編集では一覧とプレビューを同時に見られる配置を保つ。 |
| [Airtable Dashboard Layout](https://support.airtable.com/articles/5415824889-airtable-interface-layout-dashboard) | 必要な概要、絞り込み、表やグラフを用途に応じて組み合わせる。 | 現在の画面では主要な編集・公開状態を優先し、装飾用の指標を増やさない。 |
| [Supabase Dashboard Navigation](https://supabase.com/changelog/37655-dashboard-navigation-updates-project-settings) | 設定項目を関連するサービスの画面へ移し、操作の文脈を近づける。 | 特典・QRや配色などの設定を対応する編集タブにまとめる。 |
| [IBM Carbon Data Table](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines) | 短い列名、行境界、操作ツールバーで情報量と一覧性を調整する。 | サイドバーの広告名と状態は短く読みやすくし、強い色や飾りを足さない。 |
| [HubSpot Report Viewer](https://knowledge.hubspot.com/reports/interact-with-reports-in-the-report-viewer) | レポート本文と絞り込み・詳細設定の領域を分け、変更を保存する位置を明確にする。 | 編集と公開操作を分け、未保存・公開中の状態を上部で判別できるようにする。 |

## 今回の設計判断

- 広告面は縦型写真を大きく使い、商品名・見出し・説明・動作案内の差を明確にする。特典は発見後に同じ場所へ現し、商品とつながる見せ方を保つ。
- 管理画面は[Pixelcave Codebase](https://demo.pixelcave.com/codebase/db_clean.html)を視覚的な参照先にする。濃いチャコールの背景とパネル、紫から青へ移る見出し、明るい青の主要操作を使う。サイドバー上部に主要な追加操作を置き、キャンペーン一覧をグループ化する。ヘッダーには開閉操作と公開操作を配置し、編集対象と公開状態を見分けやすくする。shadcn/uiの部品は維持し、色・状態・境界線を共通のCSS変数へまとめる。
- この調査は広告デザインの効果測定ではない。参考事例の受賞歴や数値を、今回の広告の効果として扱わない。
