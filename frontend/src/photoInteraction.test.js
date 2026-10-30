import test from "node:test";
import assert from "node:assert/strict";
import { getApproachProgress, getCutProgress, resolvePhotoStage } from "./photoInteraction.js";

test("左へ覗くと焼き目に寄り、右移動だけでは断面へ切り替わらない", () => {
    assert.equal(resolvePhotoStage(-8, 0), 1);
    assert.equal(resolvePhotoStage(8, 0), 0);
    assert.equal(resolvePhotoStage(0, 1), 0);
});
test("中央付近の小さな揺れでは表示中の見どころを保つ", () => {
    assert.equal(resolvePhotoStage(-5, 1), 1);
    assert.equal(resolvePhotoStage(0, 2, 0.1), 2);
});

test("視点を反対側へ移すと次の見どころへ切り替わる", () => {
    assert.equal(resolvePhotoStage(8, 1), 0);
    assert.equal(resolvePhotoStage(-8, 2), 1);
});

test("顔の画面占有サイズから前進量を正規化する", () => {
    assert.equal(getApproachProgress(0.2, 0.2), 0);
    assert.equal(getApproachProgress(0.216, 0.2), 0);
    assert.ok(Math.abs(getApproachProgress(0.246, 0.2) - 0.5) < 1e-9);
    assert.equal(getApproachProgress(0.276, 0.2), 1);
    assert.equal(getApproachProgress(0.3, 0), 0);
});

test("前進量に応じてステーキの断面を段階的に見せる", () => {
    assert.equal(getCutProgress(0), 0);
    assert.equal(getCutProgress(0.12), 0);
    assert.ok(Math.abs(getCutProgress(0.51) - 0.5) < 1e-9);
    assert.equal(getCutProgress(0.9), 1);
    assert.equal(resolvePhotoStage(0, 0, 0.2), 2);
    assert.equal(resolvePhotoStage(0, 2, 0.1), 2);
    assert.equal(resolvePhotoStage(0, 2, 0.05), 0);
});
