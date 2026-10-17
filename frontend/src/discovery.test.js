import assert from "node:assert/strict";
import test from "node:test";
import { createDiscoveryTracker } from "./discovery.js";

const config = {
    DISCOVERY_SIDE_THRESHOLD_CM: 10,
    DISCOVERY_CENTER_THRESHOLD_CM: 4,
    DISCOVERY_HOLD_MS: 500,
    DISCOVERY_RETURN_HOLD_MS: 400,
};

test("左右の具材を別々に見つけ、正面へ戻ると完成する", () => {
    const tracker = createDiscoveryTracker(config);

    assert.equal(tracker.update(-12, true, 0).event, null);
    assert.equal(tracker.update(-12, true, 500).event, "left-found");
    assert.deepEqual(tracker.update(12, true, 600).discovered, {
        left: true,
        right: false,
    });
    assert.equal(tracker.update(12, true, 1100).event, "right-found");
    assert.equal(tracker.update(0, true, 1200).event, null);
    assert.equal(tracker.update(0, true, 1600).event, "completed");
    assert.equal(tracker.update(0, true, 1800).completed, true);
});

test("片側だけの発見では正面へ戻っても完成しない", () => {
    const tracker = createDiscoveryTracker(config);

    tracker.update(-12, true, 0);
    tracker.update(-12, true, 500);
    tracker.update(0, true, 600);

    assert.equal(tracker.update(0, true, 1200).completed, false);
});

test("顔を見失った間の滞在時間を発見判定に使わない", () => {
    const tracker = createDiscoveryTracker(config);

    tracker.update(12, true, 0);
    tracker.update(12, false, 450);

    assert.equal(tracker.update(12, true, 600).event, null);
    assert.equal(tracker.update(12, true, 1100).event, "right-found");
});

test("反対側へ移動したら滞在時間を取り直す", () => {
    const tracker = createDiscoveryTracker(config);

    tracker.update(-12, true, 0);
    tracker.update(-12, true, 450);
    assert.equal(tracker.update(12, true, 460).event, null);
    assert.equal(tracker.update(12, true, 900).event, null);
    assert.equal(tracker.update(12, true, 960).event, "right-found");
});
