import steakHeroPhoto from "../assets/steak-photo-hero.png";
import steakCrossSectionPhoto from "../assets/steak-photo-cross-section.png";
import shoesPhoto from "../assets/shoes-side-tread.png";
import cosmeticsPhoto from "../assets/cosmetics-shades.png";
import roseLipstickPhoto from "../assets/cosmetics-rose.png";
import redLipstickPhoto from "../assets/cosmetics-red.png";
import plumLipstickPhoto from "../assets/cosmetics-plum.png";
import apparelPhoto from "../assets/apparel-detail.png";
import furniturePhoto from "../assets/furniture-fabric.png";
import appliancePhoto from "../assets/espresso-machine.png";

const overviewFocus = { scale: 1, originX: 50, originY: 50, panX: 0, panY: 0 };

export const PRODUCTS = [
    {
        id: "steak",
        tab: "ステーキ",
        brand: "CHAR / STEAKHOUSE",
        edition: "FOOD / CUT 01",
        itemName: "炭火焼きリブアイ",
        accent: "#d8946f",
        photos: [
            { src: steakHeroPhoto, alt: "焼き目のあるステーキの写真" },
            { src: steakCrossSectionPhoto, alt: "切り口が見えるステーキの写真" },
        ],
        stages: [
            { label: "全体", eyebrow: "FOOD / CUT 01", title: "香ばしさの、\nその奥へ。", description: "焼き目から、赤身の余韻まで。", photo: 0, focus: overviewFocus },
            { label: "焼き目", eyebrow: "01 / 焼き目", title: "火が残した、\n格子の香り。", description: "表面の焼き目を写真の寄りで確かめる。", photo: 0, focus: { scale: 1.55, originX: 38, originY: 51, panX: 2, panY: 0 } },
            { label: "断面", eyebrow: "02 / 断面", title: "赤身に残る、\nやわらかな熱。", description: "焼き目と重なる、ミディアムレアの断面。", photo: 1, focus: { scale: 1.4, originX: 43, originY: 53, panX: 1, panY: 0 } },
        ],
        action: {
            type: "coupon",
            kicker: "CHAR / STEAKHOUSE",
            title: "今夜の一皿に、ありがとう。",
            offer: "ステーキを",
            value: "15% OFF",
            button: "デモ特典を受け取る",
            note: "受取操作で一回限りのコードを発行するデモです。実際の割引には使えません。",
        },
        closingLine: "今夜の一皿を、ゆっくり味わって。",
    },
    {
        id: "shoes",
        tab: "靴",
        brand: "FIELD / RUNNING",
        edition: "FIT / OUTSOLE 02",
        itemName: "トレイルランニングシューズ",
        accent: "#c8e963",
        photos: [{ src: shoesPhoto, alt: "側面と靴底を並べたランニングシューズの写真" }],
        stages: [
            { label: "全体", eyebrow: "FIT / RUNNING 01", title: "一歩の軽さを、\n写真から。", description: "シルエットと足元のバランス。", photo: 0, focus: overviewFocus },
            { label: "靴底", eyebrow: "01 / OUTSOLE", title: "地面をつかむ、\n溝のかたち。", description: "アウトソールのパターンを近くで見る。", photo: 0, focus: { scale: 1.65, originX: 44, originY: 50, panX: 2, panY: 0 } },
            { label: "素材", eyebrow: "02 / UPPER", title: "足を包む、\n編み目まで。", description: "アッパーの編み地とミッドソール。", photo: 0, focus: { scale: 1.45, originX: 28, originY: 46, panX: 1, panY: 0 } },
        ],
        action: {
            type: "choice",
            kicker: "FIT / SIZE GUIDE",
            title: "試着するサイズを選ぶ",
            description: "足に合うサイズを起点に、店頭で試す流れを確認できます。",
            options: ["24.5 cm", "25.0 cm", "25.5 cm"],
            button: "試着の相談へ進む",
            note: "店舗検索・在庫確認には接続していないデモです。",
            confirmation: (choice) => `${choice}を選択しました。店頭試着へ進むデモです。`,
        },
        closingLine: "次の一歩は、足に合う一足から。",
    },
    {
        id: "cosmetics",
        tab: "コスメ",
        brand: "TINT / COLOR STUDY",
        edition: "BEAUTY / SHADES 03",
        itemName: "リップカラー",
        accent: "#f07f92",
        photos: [
            { src: cosmeticsPhoto, alt: "3色のリップカラーと色見本の写真" },
            { src: roseLipstickPhoto, alt: "ローズ色の口紅と色見本の写真" },
            { src: redLipstickPhoto, alt: "レッド色の口紅と色見本の写真" },
            { src: plumLipstickPhoto, alt: "プラム色の口紅と色見本の写真" },
        ],
        stages: [
            { label: "全体", eyebrow: "BEAUTY / COLOR 01", title: "色を、塗る前に。", description: "3つの色が並ぶ、リップカラー。", photo: 0, focus: overviewFocus },
            { label: "発色", eyebrow: "01 / SWATCH", title: "肌にのせる色を、\n比べてみる。", description: "選んだ色の口紅と色見本を表示。", photo: 0, variantPhotos: [1, 2, 3], focus: { scale: 1.65, originX: 59, originY: 72, panX: 1, panY: 0 } },
            { label: "質感", eyebrow: "02 / FINISH", title: "つやの残り方まで。", description: "選んだ色の光沢と、なめらかな質感。", photo: 0, variantPhotos: [1, 2, 3], focus: { scale: 1.45, originX: 34, originY: 45, panX: 1, panY: 0 } },
        ],
        defaultOptionIndex: 2,
        variants: [
            { label: "ローズ", color: "#c98188", photo: 1 },
            { label: "レッド", color: "#d33d48", photo: 2 },
            { label: "プラム", color: "#713b55", photo: 3 },
        ],
        action: {
            type: "choice",
            kicker: "TINT / COLOR SELECT",
            title: "気になる色を選ぶ",
            description: "色見本からひとつ選んで、仕上がりの違いを見比べます。",
            options: ["ローズ", "レッド", "プラム"],
            button: "この色を選ぶ",
            note: "肌色や実商品の発色を再現したものではありません。",
            confirmation: (choice) => `${choice}を選択しました。色を比べるデモです。`,
        },
        closingLine: "今日の気分に合う色を。",
    },
    {
        id: "apparel",
        tab: "服",
        brand: "NORTH / FIELD NOTES",
        edition: "APPAREL / LAYER 04",
        itemName: "シェルジャケット",
        accent: "#8fc0f2",
        photos: [{ src: apparelPhoto, alt: "正面と裏地を見せた青いジャケットの写真" }],
        stages: [
            { label: "全体", eyebrow: "APPAREL / SHELL 01", title: "着る前に、\n生地を知る。", description: "形と色、袖のライン。", photo: 0, focus: overviewFocus },
            { label: "縫製", eyebrow: "01 / CONSTRUCTION", title: "縫い目の先まで、\n確かめる。", description: "袖口、ファスナー、縫製の仕上がり。", photo: 0, focus: { scale: 1.6, originX: 52, originY: 55, panX: 2, panY: 0 } },
            { label: "裏地", eyebrow: "02 / LINING", title: "内側のつくりも。", description: "裏地とポケットの構造を写真で見る。", photo: 0, focus: { scale: 1.42, originX: 36, originY: 48, panX: 1, panY: 0 } },
        ],
        action: {
            type: "choice",
            kicker: "FIELD / SIZE GUIDE",
            title: "サイズを選ぶ",
            description: "選んだサイズの在庫を確認する場面を試せます。",
            options: ["S", "M", "L", "XL"],
            button: "サイズを確認する",
            note: "サイズ表・実在庫には接続していないデモです。",
            confirmation: (choice) => `${choice}を選択しました。在庫確認のデモです。`,
        },
        closingLine: "次の天気に、ちょうどいい一枚を。",
    },
    {
        id: "furniture",
        tab: "家具",
        brand: "FORM / LIVING OBJECTS",
        edition: "LIVING / MATERIAL 05",
        itemName: "ラウンジチェア",
        accent: "#7dceb0",
        photos: [{ src: furniturePhoto, alt: "青緑のラウンジチェアと生地見本の写真" }],
        stages: [
            { label: "全体", eyebrow: "LIVING / CHAIR 01", title: "部屋に置く前に。", description: "輪郭、脚、座面の高さ。", photo: 0, focus: overviewFocus },
            { label: "生地", eyebrow: "01 / TEXTURE", title: "触れる場所の、\n織り目を見る。", description: "座面と背もたれの生地に寄る。", photo: 0, focus: { scale: 1.55, originX: 47, originY: 54, panX: 2, panY: 0 } },
            { label: "設置", eyebrow: "02 / ROOM FIT", title: "置く場所まで、\n想像する。", description: "脚部と生地見本。部屋の寸法を確かめる手掛かり。", photo: 0, focus: { scale: 1.42, originX: 25, originY: 83, panX: 1, panY: 0 } },
        ],
        action: {
            type: "choice",
            kicker: "FORM / ROOM FIT",
            title: "搬入経路の幅を選ぶ",
            description: "家具を置く前に、玄関や廊下の通り幅を確認します。",
            options: ["65 cm", "75 cm", "85 cm"],
            button: "搬入条件を確認する",
            note: "椅子の寸法・配送条件は架空のデモ設定です。",
            confirmation: (choice) => `${choice}を選択しました。搬入確認のデモです。`,
        },
        closingLine: "座る時間から、部屋を選ぶ。",
    },
    {
        id: "appliance",
        tab: "家電",
        brand: "STEAM / DAILY BREW",
        edition: "HOME / ESPRESSO 06",
        itemName: "エスプレッソマシン",
        accent: "#7bc9c9",
        photos: [{ src: appliancePhoto, alt: "操作部と抽出中のエスプレッソマシンの写真" }],
        stages: [
            { label: "全体", eyebrow: "HOME / BREW 01", title: "毎日の一杯を、\n近くで見る。", description: "操作部と、カウンターに置いた姿。", photo: 0, focus: overviewFocus },
            { label: "操作", eyebrow: "01 / CONTROLS", title: "ダイヤルの先に、\nできること。", description: "ボタンと抽出部の構成。", photo: 0, focus: { scale: 1.55, originX: 43, originY: 36, panX: 2, panY: 0 } },
            { label: "手入れ", eyebrow: "02 / CARE", title: "使ったあとの、\n手入れまで。", description: "取り外せるトレイや付属パーツを見る。", photo: 0, focus: { scale: 1.45, originX: 27, originY: 81, panX: 1, panY: 0 } },
        ],
        action: {
            type: "choice",
            kicker: "STEAM / PRODUCT GUIDE",
            title: "先に知りたい項目を選ぶ",
            description: "設置場所や手入れなど、購入前に比べたい点を選択します。",
            options: ["設置サイズ", "お手入れ", "抽出方法"],
            button: "製品ガイドを見る",
            note: "仕様・消費電力・実際の抽出性能は架空のデモです。",
            confirmation: (choice) => `${choice}を選択しました。製品ガイドのデモです。`,
        },
        closingLine: "朝の手順まで、想像できる一台。",
    },
];
