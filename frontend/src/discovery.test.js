import assert from "node:assert/strict";
import test from "node:test";
import { createPhotoExperienceTracker, createPinchTracker, createSwipeTracker, moveSelectionIndex } from "./discovery.js";

const config = {
    DISCOVERY_SIDE_THRESHOLD_CM: 10,
    DISCOVERY_CENTER_THRESHOLD_CM: 4,
    FIRST_DETAIL_HOLD_MS: 500,
    SECOND_DETAIL_HOLD_MS: 700,
    SIDE_HOLD_MS: 400,
    SWIPE_DISTANCE: 0.18,
    SWIPE_MIN_DURATION_MS: 70,
    SWIPE_MAX_DURATION_MS: 900,
    SWIPE_COOLDOWN_MS: 800,
    HAND_LOST_TIMEOUT_MS: 220,
    PINCH_HOLD_MS: 140,
};

test("正面を見続けると2段階の見どころを順に表示する", () => {
    const tracker = createPhotoExperienceTracker(config);

    assert.equal(tracker.update(0, true, 0).progress, 0);
    assert.equal(tracker.update(0, true, 500).event, "detail-revealed");
    assert.equal(tracker.update(0, true, 1199).detailLevel, 1);
    assert.equal(tracker.update(0, true, 1200).event, "detail-revealed");
    assert.equal(tracker.update(0, true, 2000).detailLevel, 2);
});

test("視線を失った時間は正面注視の判定に含めない", () => {
    const tracker = createPhotoExperienceTracker(config);

    tracker.update(0, true, 0);
    tracker.update(0, false, 450);
    assert.equal(tracker.update(0, true, 600).event, null);
    assert.equal(tracker.update(0, true, 1100).event, "detail-revealed");
});

test("左右どちらかを一定時間見ると商材ごとの次の行動を一度だけ開く", () => {
    const tracker = createPhotoExperienceTracker(config);

    assert.equal(tracker.update(12, true, 0).event, null);
    assert.equal(tracker.update(12, true, 200).event, null);
    assert.equal(tracker.update(12, true, 400).event, "action-unlocked");
    assert.equal(tracker.update(-12, true, 850).rewardUnlocked, true);
});

test("次の行動を閉じた後は正面へ戻るまで再表示しない", () => {
    const tracker = createPhotoExperienceTracker(config);

    tracker.update(12, true, 0);
    assert.equal(tracker.update(12, true, 400).event, "action-unlocked");
    tracker.dismissAction();
    assert.equal(tracker.update(12, true, 900).event, null);
    assert.equal(tracker.update(12, true, 1400).event, null);
    tracker.update(0, true, 1500);
    tracker.update(12, true, 1600);
    assert.equal(tracker.update(12, true, 2000).event, "action-unlocked");
});

test("左右を切り替えたとき、注視時間を引き継がない", () => {
    const tracker = createPhotoExperienceTracker(config);

    tracker.update(-12, true, 0);
    tracker.update(-12, true, 350);
    assert.equal(tracker.update(12, true, 360).event, null);
    assert.equal(tracker.update(12, true, 700).event, null);
    assert.equal(tracker.update(12, true, 760).event, "action-unlocked");
});

test("スワイプで見どころを進めて戻り、商品切替時に段数を初期化する", () => {
    const tracker = createPhotoExperienceTracker(config, 3);

    assert.equal(tracker.moveDetail(1).detailLevel, 1);
    assert.equal(tracker.moveDetail(1).detailLevel, 2);
    assert.equal(tracker.moveDetail(1).detailLevel, 2);
    assert.equal(tracker.moveDetail(-1).detailLevel, 1);
    tracker.setStageCount(2);
    assert.equal(tracker.moveDetail(-1).detailLevel, 0);
    assert.equal(tracker.moveDetail(1).detailLevel, 1);
});

test("手の左右移動を一回のスワイプとして判定する", () => {
    const tracker = createSwipeTracker(config);

    assert.equal(tracker.update(0.7, true, 0), null);
    assert.equal(tracker.update(0.61, true, 90), null);
    assert.equal(tracker.update(0.48, true, 180), "left");
    assert.equal(tracker.update(0.25, true, 300), null);
    assert.equal(tracker.update(0.3, true, 1000), null);
    assert.equal(tracker.update(0.55, true, 1100), "right");
});

test("手を見失ってから戻った場合、以前の位置からのスワイプにしない", () => {
    const tracker = createSwipeTracker(config);

    tracker.update(0.2, true, 0);
    tracker.update(null, false, 300);
    assert.equal(tracker.update(0.8, true, 320), null);
    assert.equal(tracker.update(0.6, true, 400), "left");
});

test("つまみ動作を押下として一度だけ判定し、離すと再び使える", () => {
    const tracker = createPinchTracker(config);

    assert.equal(tracker.update(true, true, 0), null);
    assert.equal(tracker.update(true, true, 139), null);
    assert.equal(tracker.update(true, true, 140), "press");
    assert.equal(tracker.update(true, true, 220), null);
    assert.equal(tracker.update(false, true, 230), null);
    assert.equal(tracker.update(true, true, 300), null);
    assert.equal(tracker.update(true, true, 440), "press");
});

test("見失った手のつまみ時間を押下判定に含めない", () => {
    const tracker = createPinchTracker(config);

    tracker.update(true, true, 0);
    tracker.update(true, false, 250);
    assert.equal(tracker.update(true, true, 260), null);
    assert.equal(tracker.update(true, true, 400), "press");
});

test("左スワイプは右端から中央、左へ候補を移動し、端で止まる", () => {
    let selected = 2;
    selected = moveSelectionIndex(selected, -1, 3);
    assert.equal(selected, 1);
    selected = moveSelectionIndex(selected, -1, 3);
    assert.equal(selected, 0);
    assert.equal(moveSelectionIndex(selected, -1, 3), 0);
    assert.equal(moveSelectionIndex(selected, 1, 3), 1);
});
