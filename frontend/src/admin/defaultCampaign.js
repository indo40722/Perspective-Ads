import { STEAK_AD } from "../steakAd.js";

export function createDefaultCampaign() {
    return {
        id: STEAK_AD.id,
        name: STEAK_AD.itemName,
        advertiser: "CHAR STEAKHOUSE",
        itemName: STEAK_AD.itemName,
        itemNameImage: STEAK_AD.itemNameImage,
        photos: STEAK_AD.photos.map((photo) => ({ ...photo })),
        stages: STEAK_AD.stages.map((stage) => ({
            ...stage,
            headlineMode: "image",
            supportMode: "image",
        })),
        reward: {
            ...STEAK_AD.reward,
            qrMode: "url",
            qrUrl: "",
            chancePercent: 100,
        },
        theme: {
            background: "#24160f",
            accent: "#d8ae73",
            text: "#f6eee3",
        },
    };
}

export function createNewCampaign() {
    const campaign = createDefaultCampaign();
    const suffix = crypto.randomUUID().slice(0, 8);
    return {
        ...campaign,
        id: `campaign-${suffix}`,
        name: "新しい広告",
        advertiser: "広告主名を入力",
        itemName: "商品名を入力",
        itemNameImage: "",
        photos: campaign.photos.map((photo, index) => ({ ...photo, src: "", alt: "写真 " + (index + 1) })),
        stages: campaign.stages.map((stage, index) => ({
            ...stage,
            label: ["全体", "見どころ", "詳細"][index],
            title: "",
            description: "",
            instruction: "",
            headlineMode: "text",
            supportMode: "text",
            headlineImage: "",
            supportImage: "",
        })),
        reward: {
            ...campaign.reward,
            detailImages: {},
            actionImage: "",
            instructionImage: "",
            title: "特典名を入力",
            value: "特典内容を入力",
            note: "QRコードをスマートフォンで読み取る",
            qrImage: "",
        },
    };
}
