// Tracks anonymous face positions during one camera session, not biometric identity.
const DEFAULTS = Object.freeze({
  minObservedMs: 200,
  lateralIntent: 0.075,
  approachIntentRatio: 1.1,
  settleMs: 180,
  motionSpeed: 0.22,
  matchingDistance: 0.20,
  competingFaceDistance: 0.105,
  ambiguousJoinMs: 120,
  lostHoldMs: 1500,
  staleTrackMs: 1800,
});

const finite = (n) => typeof n === "number" && Number.isFinite(n);
const dist = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * 2);

export function createViewerSelector(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  let tracks = new Map();
  let nextId = 1;
  let selectedId = null;
  let previousState = "empty";
  let suspendedUntilMs = 0;

  const reset = () => {
    tracks = new Map();
    selectedId = null;
    nextId = 1;
    previousState = "empty";
    suspendedUntilMs = 0;
  };

  const suspend = (durationMs, nowMs) => {
    reset();
    suspendedUntilMs = nowMs + Math.max(0, durationMs);
  };

  const normalized = (faces) => (Array.isArray(faces) ? faces : [])
    .filter((f) => finite(f.x) && finite(f.y) && finite(f.face_scale) && f.face_scale > 0)
    .map((f) => ({
      x: Math.max(-1, Math.min(1, f.x)),
      y: Math.max(0, Math.min(1, f.y)),
      face_scale: f.face_scale,
      confidence: finite(f.confidence) ? f.confidence : 0,
    }));

  function update(faces, nowMs) {
    if (!finite(nowMs)) throw new Error("A monotonic timestamp is required");
    if (nowMs < suspendedUntilMs) {
      const result = { face: null, state: "cooldown", selectedId: null, visibleCount: 0, released: false, stateChanged: previousState !== "cooldown" };
      previousState = "cooldown";
      return result;
    }

    const observations = normalized(faces);
    const recent = [...tracks.values()].filter((track) => nowMs - track.lastSeenAt <= cfg.staleTrackMs);
    const matches = [];
    for (let i = 0; i < recent.length; i += 1) {
      const t = recent[i];
      for (let j = 0; j < observations.length; j += 1) {
        const f = observations[j];
        const dt = Math.max(0, Math.min(0.25, (nowMs - t.lastSeenAt) / 1000));
        const predicted = { x: t.x + t.vx * dt, y: t.y + t.vy * dt };
        const distance = dist(predicted, f);
        const ratio = f.face_scale / t.face_scale;
        const maxDistance = cfg.matchingDistance + Math.min(0.13, dt * 0.35);
        if (distance > maxDistance || ratio < 0.55 || ratio > 1.8) continue;
        const score = distance + Math.abs(Math.log(ratio)) * 0.055;
        matches.push({ id: t.id, j, score });
      }
    }
    matches.sort((a, b) => a.score - b.score);
    const usedTracks = new Set();
    const usedFaces = new Set();
    for (const match of matches) {
      if (usedTracks.has(match.id) || usedFaces.has(match.j)) continue;
      usedTracks.add(match.id);
      usedFaces.add(match.j);
      const t = tracks.get(match.id);
      const f = observations[match.j];
      const dt = Math.max(0.001, (nowMs - t.lastSeenAt) / 1000);
      const speed = Math.abs(f.x - t.x) / dt;
      t.vx = 0.55 * t.vx + 0.45 * ((f.x - t.x) / dt);
      t.vy = 0.55 * t.vy + 0.45 * ((f.y - t.y) / dt);
      t.x = f.x;
      t.y = f.y;
      t.face_scale = f.face_scale;
      t.lastSeenAt = nowMs;
      t.hits += 1;
      t.observed = f;
      const lateral = Math.abs(f.x - t.originX) >= cfg.lateralIntent;
      const approach = f.face_scale / t.originScale >= cfg.approachIntentRatio;
      if (nowMs - t.firstSeenAt >= cfg.minObservedMs && (lateral || approach)) {
        if (!finite(t.intentAt)) t.intentAt = nowMs;
        if (speed <= cfg.motionSpeed) {
          if (!finite(t.settleStartAt)) t.settleStartAt = nowMs;
          if (nowMs - t.settleStartAt >= cfg.settleMs && !finite(t.qualifiedAt)) {
            t.qualifiedAt = nowMs;
          }
        } else {
          t.settleStartAt = null;
        }
      } else {
        t.settleStartAt = null;
        t.qualifiedAt = null;
      }
    }

    for (let j = 0; j < observations.length; j += 1) {
      if (usedFaces.has(j)) continue;
      const f = observations[j];
      const id = nextId++;
      tracks.set(id, {
        id, x: f.x, y: f.y, face_scale: f.face_scale, originX: f.x,
        originScale: f.face_scale, firstSeenAt: nowMs, lastSeenAt: nowMs,
        vx: 0, vy: 0, hits: 1, observed: f,
        intentAt: null, settleStartAt: null, qualifiedAt: null,
      });
    }

    let released = false;
    const active = selectedId === null ? null : tracks.get(selectedId);
    if (selectedId !== null && (!active || nowMs - active.lastSeenAt > cfg.lostHoldMs)) {
      released = true;
      reset();
    }
    for (const [id, track] of tracks) {
      if (id !== selectedId && nowMs - track.lastSeenAt > cfg.staleTrackMs) tracks.delete(id);
    }

    if (selectedId === null && !released) {
      const eligible = [...tracks.values()]
        .filter((t) => t.lastSeenAt === nowMs && finite(t.qualifiedAt))
        .sort((a, b) => a.qualifiedAt - b.qualifiedAt || a.id - b.id);
      if (eligible.length && (eligible.length === 1 ||
          eligible[1].qualifiedAt - eligible[0].qualifiedAt > cfg.ambiguousJoinMs)) {
        selectedId = eligible[0].id;
      }
    }
    const target = selectedId === null ? null : tracks.get(selectedId);
    const visibleTarget = target && target.lastSeenAt === nowMs ? target : null;
    // Do not pass control during ambiguous overlap.
    const crowded = visibleTarget && [...tracks.values()].some((t) =>
      t.id !== selectedId && t.lastSeenAt === nowMs && dist(visibleTarget, t) < cfg.competingFaceDistance);
    const state = released ? "released" : visibleTarget && !crowded ? "locked" :
      selectedId !== null ? "occluded" : observations.length ? "waiting" : "empty";
    const result = {
      face: state === "locked" ? {
        ...visibleTarget.observed,
        tracking_id: selectedId,
        baseline_x: visibleTarget.originX,
        baseline_face_scale: visibleTarget.originScale,
      } : null,
      state, selectedId, visibleCount: observations.length, released,
      stateChanged: state !== previousState,
    };
    previousState = state;
    return result;
  }

  return { update, reset, suspend };
}
