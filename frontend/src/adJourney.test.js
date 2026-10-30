import assert from "node:assert/strict";
import test from "node:test";
import { createAdJourneyTracker, getDetailAtViewer } from "./adJourney.js";

const config = {
    DISCOVERY_SIDE_THRESHOLD_CM: 10,
    DETAIL_APPROACH_THRESHOLD: 0.2,
    DETAIL_HOLD_MS: 600,
};

test("見どころの判定は断面を優先し、範囲外や無効値を無視する", () => {
    assert.equal(getDetailAtViewer(-12, 0, config), "grill");
    assert.equal(getDetailAtViewer(0, 0.7, config), "cut");
    assert.equal(getDetailAtViewer(-12, 0.7, config), "cut");
    assert.equal(getDetailAtViewer(0, 0, config), null);
    assert.equal(getDetailAtViewer(Number.NaN, 0, config), null);
});

test("焼き目を一つ見つけた時点でQRへ進める", () => {
    const tracker = createAdJourneyTracker(config);

    tracker.update(-12, 0, true, 0);
    const result = tracker.update(-12, 0, true, 600);

    assert.equal(result.event, "detail-found-grill");
    assert.equal(result.phase, "revealed");
    assert.equal(result.foundDetail, "grill");
});

test("断面を一つ見つけた時点でQRへ進み、選択済みの見どころは変わらない", () => {
    const tracker = createAdJourneyTracker(config);

    tracker.update(0, 0.7, true, 0);
    const result = tracker.update(0, 0.7, true, 600);
    const later = tracker.update(-12, 0, true, 1200);

    assert.equal(result.event, "detail-found-cut");
    assert.equal(result.phase, "revealed");
    assert.equal(result.foundDetail, "cut");
    assert.equal(later.foundDetail, "cut");
});

test("顔を見失うと見どころの注視時間を取り直す", () => {
    const tracker = createAdJourneyTracker(config);

    tracker.update(-12, 0, true, 0);
    tracker.update(-12, 0, false, 500);
    assert.equal(tracker.update(-12, 0, true, 600).event, null);
    assert.equal(tracker.update(-12, 0, true, 1200).event, "detail-found-grill");
});

test("最初に戻すと発見状態を消す", () => {
    const tracker = createAdJourneyTracker(config);

    tracker.update(-12, 0, true, 0);
    tracker.update(-12, 0, true, 600);
    const reset = tracker.reset();

    assert.equal(reset.phase, "exploring");
    assert.equal(reset.foundDetail, null);
});
