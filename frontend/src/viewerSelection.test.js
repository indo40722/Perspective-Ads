import test from "node:test";
import assert from "node:assert/strict";
import { createViewerSelector } from "./viewerSelection.js";

const face = (x, scale = 0.18, y = 0.5) => ({ x, y, face_scale: scale });
const seq = (selector, frames) => frames.map(([t, faces]) => selector.update(faces, t));
const engage = (selector) => seq(selector, [
  [0, [face(0)]], [100, [face(0)]], [240, [face(0.10)]],
  [290, [face(0.10)]], [370, [face(0.10)]],
  [490, [face(0.10)]], [550, [face(0.10)]],
]).at(-1);

test("three stationary spectators do not take control", () => {
  const selector = createViewerSelector();
  const crowd = [face(-0.4), face(0), face(0.4)];
  const result = seq(selector, [[0, crowd], [200, crowd], [500, crowd]]).at(-1);
  assert.equal(result.selectedId, null);
  assert.equal(result.state, "waiting");
});

test("first moving and settling participant locks even with spectators", () => {
  const selector = createViewerSelector();
  const crowd = (x) => [face(-0.4), face(x), face(0.4)];
  const result = seq(selector, [[0, crowd(0)], [180, crowd(0)], [260, crowd(0.11)],
    [350, crowd(0.11)], [520, crowd(0.11)], [590, crowd(0.11)]]).at(-1);
  assert.equal(result.state, "locked");
  assert.ok(Math.abs(result.face.x - 0.11) < 0.01);
});

test("crossing spectator does not steal the active lock", () => {
  const selector = createViewerSelector();
  assert.equal(engage(selector).state, "locked");
  assert.equal(selector.update([face(0.10), face(-0.6)], 650).face.tracking_id, 1);
  assert.equal(selector.update([face(0.10), face(-0.5)], 710).face.tracking_id, 1);
});

test("brief occlusion holds selected ID, longer absence releases", () => {
  const selector = createViewerSelector();
  assert.equal(engage(selector).state, "locked");
  assert.equal(selector.update([], 650).state, "occluded");
  assert.equal(selector.update([face(0.10)], 900).state, "locked");
  assert.equal(selector.update([], 1100).state, "occluded");
  const result = selector.update([], 2800);
  assert.equal(result.state, "released");
  assert.equal(result.selectedId, null);
});

test("simultaneous actions do not arbitrarily choose one person", () => {
  const selector = createViewerSelector();
  const crowd = (x) => [face(x), face(x + 0.6)];
  const result = seq(selector, [[0, crowd(-0.35)], [200, crowd(-0.35)],
    [280, crowd(-0.23)], [350, crowd(-0.23)], [440, crowd(-0.23)],
    [550, crowd(-0.23)], [620, crowd(-0.23)]]).at(-1);
  assert.equal(result.selectedId, null);
});

test("approaching the camera also qualifies as an intent signal", () => {
  const selector = createViewerSelector();
  const result = seq(selector, [[0, [face(0, 0.20)]], [150, [face(0, 0.20)]],
    [250, [face(0, 0.23)]], [350, [face(0, 0.23)]],
    [450, [face(0, 0.23)]], [570, [face(0, 0.23)]]]).at(-1);
  assert.equal(result.state, "locked");
});

test("other visitors cannot replace a temporarily occluded target", () => {
  const selector = createViewerSelector();
  assert.equal(engage(selector).state, "locked");
  const result = seq(selector, [[630, [face(0.7)]], [850, [face(0.7)]],
    [1000, [face(0.82)]], [1200, [face(0.82)]]]).at(-1);
  assert.equal(result.state, "occluded");
  assert.equal(result.selectedId, 1);
});

test("selected face retains its original calibration position", () => {
  const selector = createViewerSelector();
  const result = engage(selector);
  assert.equal(result.face.baseline_x, 0);
  assert.equal(result.face.baseline_face_scale, 0.18);
});

test("reward scanning grace period prevents immediate selection", () => {
  const selector = createViewerSelector();
  assert.equal(engage(selector).state, "locked");
  selector.suspend(6000, 700);
  assert.equal(selector.update([face(0)], 800).state, "cooldown");
  assert.equal(selector.update([face(0)], 6800).state, "waiting");
});

test("crossing faces pause and release rather than transfer the lock", () => {
  const selector = createViewerSelector();
  assert.equal(engage(selector).state, "locked");
  let result;
  for (const [time, a, b] of [[600, 0.10, 0.40], [650, 0.14, 0.35],
    [700, 0.20, 0.29], [750, 0.29, 0.20], [800, 0.35, 0.14],
    [850, 0.40, 0.10]]) {
    result = selector.update([face(a), face(b)], time);
    if (time >= 700) assert.equal(result.face, null);
  }
  assert.equal(result.selectedId, null);
});
