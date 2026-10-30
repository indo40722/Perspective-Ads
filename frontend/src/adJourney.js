export function getDetailAtViewer(viewerX, forwardProgress, config) {
    if (!Number.isFinite(viewerX) || !Number.isFinite(forwardProgress)) return null;
    if (forwardProgress >= config.DETAIL_APPROACH_THRESHOLD) return "cut";
    if (viewerX <= -config.DISCOVERY_SIDE_THRESHOLD_CM) return "grill";
    return null;
}

export function createAdJourneyTracker(config) {
    let phase = "exploring";
    let activeZone = null;
    let holdStartedAt = null;
    let progress = 0;
    let foundDetail = null;

    const clearHold = () => {
        activeZone = null;
        holdStartedAt = null;
        progress = 0;
    };

    const snapshot = (event = null, eventDetail = null) => ({
        phase,
        foundDetail,
        progress,
        event,
        eventDetail,
    });

    const holdAt = (zone, timeMs, durationMs) => {
        if (activeZone !== zone) {
            activeZone = zone;
            holdStartedAt = timeMs;
        }
        progress = Math.max(0, Math.min(1, (timeMs - holdStartedAt) / durationMs));
        return progress >= 1;
    };

    return {
        reset() {
            phase = "exploring";
            foundDetail = null;
            clearHold();
            return snapshot();
        },

        snapshot,

        update(viewerX, forwardProgress, inputActive, timeMs) {
            if (phase === "revealed") return snapshot();
            if (!inputActive || !Number.isFinite(viewerX) || !Number.isFinite(forwardProgress)) {
                clearHold();
                return snapshot();
            }

            const detail = getDetailAtViewer(viewerX, forwardProgress, config);

            if (!detail) {
                clearHold();
                return snapshot();
            }

            if (holdAt(`detail:${detail}`, timeMs, config.DETAIL_HOLD_MS)) {
                foundDetail = detail;
                phase = "revealed";
                clearHold();
                progress = 1;
                return snapshot(`detail-found-${detail}`, detail);
            }

            return snapshot();
        },
    };
}
