import test from "node:test";
import assert from "node:assert/strict";
import { createCouponUrl, getCouponDetail } from "./couponUrl.js";

test("現在の広告と同じ場所に特典の受取URLを作る", () => {
    assert.equal(
        createCouponUrl(undefined, "https://sign.example/view/index.html", "steak"),
        "https://sign.example/view/coupon.html?campaign=steak"
    );
});

test("設定された公開URLへ広告の受取先を指定する", () => {
    assert.equal(
        createCouponUrl("https://promo.example/coupon?code=OLD", "http://localhost:8000/view/index.html", "steak"),
        "https://promo.example/coupon?campaign=steak"
    );
});

test("発見した見どころを受取URLへ引き継ぐ", () => {
    assert.equal(
        createCouponUrl(undefined, "https://sign.example/view/index.html", "steak", "cut"),
        "https://sign.example/view/coupon.html?campaign=steak&detail=cut"
    );
});

test("不正な見どころと既存の見どころ指定は受取URLから除く", () => {
    assert.equal(
        createCouponUrl("https://promo.example/coupon?detail=grill", "https://sign.example/", "steak", "other"),
        "https://promo.example/coupon?campaign=steak"
    );
});

test("受取画面では許可した見どころだけを読み取る", () => {
    assert.equal(getCouponDetail("?campaign=steak&detail=grill"), "grill");
    assert.equal(getCouponDetail("?campaign=steak&detail=unknown"), null);
});
