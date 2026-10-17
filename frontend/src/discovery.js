export function createDiscoveryTracker(config) {
    const discovered = { left: false, right: false };
    let activeSide = null;
    let holdStartedAt = null;
    let returnStartedAt = null;
    let completed = false;

    const snapshot = (event = null, progress = 0) => ({
        discovered: { ...discovered },
        activeSide,
        progress,
        completed,
        event,
    });

    const resetHold = () => {
        activeSide = null;
        holdStartedAt = null;
        returnStartedAt = null;
    };

    return {
        reset() {
            discovered.left = false;
            discovered.right = false;
            completed = false;
            resetHold();
        },

        update(viewerX, faceDetected, timeMs) {
            if (completed) {
                return snapshot();
            }

            if (!faceDetected || !Number.isFinite(viewerX)) {
                resetHold();
                return snapshot();
            }

            const side = viewerX <= -config.DISCOVERY_SIDE_THRESHOLD_CM
                ? "left"
                : viewerX >= config.DISCOVERY_SIDE_THRESHOLD_CM
                    ? "right"
                    : null;

            if (side && !discovered[side]) {
                returnStartedAt = null;
                if (activeSide !== side) {
                    activeSide = side;
                    holdStartedAt = timeMs;
                }

                const progress = Math.min(
                    1,
                    Math.max(0, timeMs - holdStartedAt) / config.DISCOVERY_HOLD_MS
                );

                if (progress >= 1) {
                    discovered[side] = true;
                    resetHold();
                    return snapshot(`${side}-found`, 1);
                }

                return snapshot(null, progress);
            }

            activeSide = null;
            holdStartedAt = null;

            const allFound = discovered.left && discovered.right;
            const isCentered = Math.abs(viewerX) <= config.DISCOVERY_CENTER_THRESHOLD_CM;
            if (!allFound || !isCentered) {
                returnStartedAt = null;
                return snapshot();
            }

            if (returnStartedAt === null) {
                returnStartedAt = timeMs;
            }

            const progress = Math.min(
                1,
                Math.max(0, timeMs - returnStartedAt) / config.DISCOVERY_RETURN_HOLD_MS
            );

            if (progress >= 1) {
                completed = true;
                resetHold();
                return snapshot("completed", 1);
            }

            activeSide = "center";
            return snapshot(null, progress);
        },
    };
}
