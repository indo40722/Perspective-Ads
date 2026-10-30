import overviewPhoto from "../assets/steak-photo-hero.png";
import crossSectionPhoto from "../assets/steak-photo-cross-section.png";
import productNameImage from "../assets/steak-type-brand.png";
import overviewHeadlineImage from "../assets/steak-headline-overview-v2.png";
import grillHeadlineImage from "../assets/steak-headline-grill-v2.png";
import cutHeadlineImage from "../assets/steak-headline-cut-v2.png";
import overviewSupportImage from "../assets/steak-support-overview.png";
import grillSupportImage from "../assets/steak-support-grill.png";
import cutSupportImage from "../assets/steak-support-cut.png";
import grillRewardDetailImage from "../assets/steak-reward-detail-grill.png";
import cutRewardDetailImage from "../assets/steak-reward-detail-cut.png";
import rewardActionImage from "../assets/steak-reward-action.png";
import qrInstructionImage from "../assets/steak-qr-instruction.png";

const overviewFocus = { scale: 1, originX: 50, originY: 50, panX: 0, panY: 0 };

export const STEAK_AD = {
    id: "steak",
    itemName: "炭火焼きリブアイ",
    itemNameImage: productNameImage,
    photos: [
        { src: overviewPhoto, alt: "炭火で焼いたリブアイステーキ。格子状の焼き目がついている" },
        { src: overviewPhoto, alt: "炭火で焼いたリブアイステーキの焼き目のアップ" },
        { src: crossSectionPhoto, alt: "切り分けたリブアイステーキ。中は赤みを残した焼き加減" },
    ],
    stages: [
        {
            label: "全体",
            eyebrow: "炭火焼きリブアイ",
            title: "焼き目の先に、\nやわらかな赤身。",
            description: "厚切りリブアイを、炭火でじっくり。",
            instruction: "少し左へ動いて、焼き目を探す。",
            headlineImage: overviewHeadlineImage,
            supportImage: overviewSupportImage,
            photo: 0,
            focus: overviewFocus,
        },
        {
            label: "焼き目",
            eyebrow: "炭火焼きリブアイ",
            title: "香ばしさを生む、\n格子の焼き目。",
            description: "炭火で焼き上げた、表面の香ばしさ。",
            instruction: "少し左へ動いて、焼き目を探す。",
            headlineImage: grillHeadlineImage,
            supportImage: grillSupportImage,
            photo: 1,
            focus: { scale: 1.3, originX: 42, originY: 50, panX: 0, panY: 0 },
        },
        {
            label: "断面",
            eyebrow: "炭火焼きリブアイ",
            title: "切り分けて見える、\n赤身の火入れ。",
            description: "外は香ばしく、中はしっとり。",
            instruction: "前へ近づいて、断面を見る。",
            headlineImage: cutHeadlineImage,
            supportImage: cutSupportImage,
            photo: 2,
            focus: { scale: 1.12, originX: 52, originY: 52, panX: 0, panY: 0 },
        },
    ],
    reward: {
        title: "特典を受け取る",
        detailImages: {
            grill: grillRewardDetailImage,
            cut: cutRewardDetailImage,
        },
        detailAlts: {
            grill: "焼き目を見つけた方へ",
            cut: "断面を見つけた方へ",
        },
        actionImage: rewardActionImage,
        instructionImage: qrInstructionImage,
        actionAlt: "特典を受け取る",
        instructionAlt: "QRを読み取って受け取る",
        value: "15% OFF",
        note: "QRをスマートフォンで読み取る",
    },
};
