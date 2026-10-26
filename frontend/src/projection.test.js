import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { CONFIG } from "./config.js";
import { applyOffAxisProjection, normalizedFaceToViewerCm, viewerCmToWorld } from "./projection.js";

const screenConfig = {
    ...CONFIG,
    SCREEN_WIDTH_WORLD: 64,
    SCREEN_HEIGHT_WORLD: 36,
    SCREEN_WIDTH_CM: 53.1,
    SCREEN_HEIGHT_CM: 29.9,
};

function projectAt(viewerX, point) {
    const camera = new THREE.PerspectiveCamera();
    const viewerWorld = viewerCmToWorld({ x: viewerX, y: 0, z: CONFIG.VIEWER_DISTANCE_CM }, screenConfig);
    applyOffAxisProjection(camera, viewerWorld, screenConfig);
    camera.updateMatrixWorld(true);
    return new THREE.Vector3(...point).project(camera);
}

test("画面平面の中心は顔の左右移動後も画面中央に投影される", () => {
    for (const viewerX of [-30, -12, 0, 12, 30]) {
        const point = projectAt(viewerX, [0, 0, 0]);
        assert.ok(Math.abs(point.x) < 1e-10, `viewerX=${viewerX}, projectedX=${point.x}`);
        assert.ok(Math.abs(point.y) < 1e-10, `viewerX=${viewerX}, projectedY=${point.y}`);
    }
});

test("画面奥と手前の固定物は、視点移動に対して逆向きに連続投影される", () => {
    const farLeft = projectAt(-20, [0, 0, -10]).x;
    const farCenter = projectAt(0, [0, 0, -10]).x;
    const farRight = projectAt(20, [0, 0, -10]).x;
    const nearLeft = projectAt(-20, [0, 0, 5]).x;
    const nearCenter = projectAt(0, [0, 0, 5]).x;
    const nearRight = projectAt(20, [0, 0, 5]).x;

    assert.ok(farLeft < farCenter && farCenter < farRight);
    assert.ok(nearLeft > nearCenter && nearCenter > nearRight);
    assert.ok(Math.abs(farRight - farCenter) < 1);
    assert.ok(Math.abs(nearRight - nearCenter) < 1);
});

test("顔位置の左右変化は視点座標の左右へ単調に変換される", () => {
    const left = normalizedFaceToViewerCm({ x: -0.4 }, CONFIG).x;
    const center = normalizedFaceToViewerCm({ x: 0 }, CONFIG).x;
    const right = normalizedFaceToViewerCm({ x: 0.4 }, CONFIG).x;

    assert.ok(left < center && center < right);
    assert.equal(center, 0);
});
