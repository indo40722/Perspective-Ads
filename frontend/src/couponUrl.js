export function createCouponUrl(configuredUrl, currentUrl, campaignId) {
    const destination = new URL(configuredUrl || "./coupon.html", currentUrl);
    destination.searchParams.delete("code");
    destination.searchParams.set("campaign", campaignId);
    return destination.toString();
}
