import test from "node:test";
import assert from "node:assert/strict";
import { createCouponUrl } from "./couponUrl.js";

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
