import crossSectionPhoto from "../assets/steak-photo-cross-section-cutout.png";
import foregroundPhoto from "../assets/steak-photo-foreground.png";
import sizzlePhoto from "../assets/steak-photo-sizzle.png";

const overviewFocus = { scale: 1, originX: 50, originY: 50, panX: 0, panY: 0 };

export const STEAK_AD = {
    id: "steak",
    brand: "CHAR / STEAKHOUSE",
    edition: "FOOD / CUT 01",
    itemName: "炭火焼きリブアイ",
    photos: [
        { src: foregroundPhoto, alt: "皿ごと切り抜かれた炭火焼きステーキ" },
        { src: crossSectionPhoto, alt: "皿ごと切り抜かれた断面の見えるステーキ" },
        { src: sizzlePhoto, alt: "脂の艶が増した炭火焼きステーキ" },
    ],
    stages: [
        {
            label: "全体",
            eyebrow: "CHAR / STEAKHOUSE",
            title: "焼き目の奥に、\nやわらかな赤身。",
            description: "炭火の香ばしさと、ミディアムレアの余韻。",
            photo: 0,
            focus: overviewFocus,
        },
        {
            label: "焼き目",
            eyebrow: "01 / GRILL",
            title: "炭火が残す、\n格子の焼き目。",
            description: "表面に走る焼き目と、溶けた脂の艶。",
            photo: 2,
            focus: { scale: 1.12, originX: 40, originY: 52, panX: 0, panY: 0 },
        },
        {
            label: "断面",
            eyebrow: "02 / CUT",
            title: "ひと切れの奥に、\nミディアムレア。",
            description: "厚みのある肉に、火入れの表情を見る。",
            photo: 1,
            focus: { scale: 1.12, originX: 52, originY: 52, panX: 0, panY: 0 },
        },
    ],
    reward: {
        title: "スマホで読み取る",
        value: "15% OFF",
        note: "スマートフォンで受け取る一回限りのデモ特典",
    },
};
