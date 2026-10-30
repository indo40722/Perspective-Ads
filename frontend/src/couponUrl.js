const validDetails = new Set(["grill", "cut"]);

export function createCouponUrl(configuredUrl, currentUrl, campaignId, detailId) {
    const destination = new URL(configuredUrl || "./coupon.html", currentUrl);
    destination.searchParams.delete("code");
    destination.searchParams.delete("detail");
    destination.searchParams.set("campaign", campaignId);
    if (validDetails.has(detailId)) destination.searchParams.set("detail", detailId);
    return destination.toString();
}

export function getCouponDetail(search) {
    const detailId = new URLSearchParams(search).get("detail");
    return validDetails.has(detailId) ? detailId : null;
}
