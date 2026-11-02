import steakForeground from "../assets/steak-photo-foreground.webp";
import steakCrossSection from "../assets/steak-photo-cross-section-cutout.webp";

const profiles = {
    steak: {
        backgroundPhotoIndex: 0,
        subjectPhoto: steakForeground,
        detailPhoto: steakCrossSection,
        subjectOffsetX: -6.6,
        subjectOffsetY: 1.7,
        subjectScale: 0.92,
    },
};

export function resolvePhotoDepthProfile(product) {
    const savedProfile = product?.photoDepthProfile;
    const productNames = [product?.itemName, product?.name].map((value) => String(value ?? "").trim());
    const profileId = savedProfile || (productNames.includes("炭火焼きリブアイ") ? "steak" : "");
    return profiles[profileId] ?? null;
}
