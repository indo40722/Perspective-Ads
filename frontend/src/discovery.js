export function createPhotoExperienceTracker(config, stageCount = 3) {
    let detailLevel = 0;
    let activeZone = null;
    let holdStartedAt = null;
    let rewardUnlocked = false;
    let actionDismissed = false;
    let maxDetailLevel = Math.max(0, stageCount - 1);

    const snapshot = (event = null, progress = 0) => ({
        detailLevel,
        activeZone,
        progress,
        rewardUnlocked,
        event,
    });

    const resetHold = () => {
        activeZone = null;
        holdStartedAt = null;
    };

    return {
        reset() {
            detailLevel = 0;
            rewardUnlocked = false;
            actionDismissed = false;
            resetHold();
        },

        setStageCount(nextStageCount) {
            maxDetailLevel = Math.max(0, nextStageCount - 1);
            this.reset();
        },

        moveDetail(direction) {
            detailLevel = Math.max(0, Math.min(maxDetailLevel, detailLevel + direction));
            resetHold();
            return snapshot();
        },

        dismissAction() {
            rewardUnlocked = false;
            actionDismissed = true;
            resetHold();
        },

        update(viewerX, faceDetected, timeMs) {
            if (rewardUnlocked) {
                return snapshot();
            }

            if (!faceDetected || !Number.isFinite(viewerX)) {
                resetHold();
                return snapshot();
            }

            if (actionDismissed) {
                if (Math.abs(viewerX) > config.DISCOVERY_CENTER_THRESHOLD_CM) {
                    resetHold();
                    return snapshot();
                }
                actionDismissed = false;
            }

            const side = viewerX <= -config.DISCOVERY_SIDE_THRESHOLD_CM
                ? "left"
                : viewerX >= config.DISCOVERY_SIDE_THRESHOLD_CM
                    ? "right"
                    : null;

            if (side) {
                if (activeZone !== side) {
                    activeZone = side;
                    holdStartedAt = timeMs;
                }

                const progress = Math.min(
                    1,
                    Math.max(0, timeMs - holdStartedAt) / config.SIDE_HOLD_MS
                );

            if (progress >= 1) {
                    rewardUnlocked = true;
                    resetHold();
                return snapshot("action-unlocked", 1);
                }

                return snapshot(null, progress);
            }

            if (Math.abs(viewerX) > config.DISCOVERY_CENTER_THRESHOLD_CM) {
                resetHold();
                return snapshot();
            }

            if (detailLevel >= maxDetailLevel) {
                resetHold();
                return snapshot();
            }

            if (activeZone !== "center") {
                activeZone = "center";
                holdStartedAt = timeMs;
            }

            const holdDuration = detailLevel === 0
                ? config.FIRST_DETAIL_HOLD_MS
                : config.SECOND_DETAIL_HOLD_MS;
            const progress = Math.min(
                1,
                Math.max(0, timeMs - holdStartedAt) / holdDuration
            );

            if (progress >= 1) {
                detailLevel += 1;
                holdStartedAt = timeMs;
                return snapshot("detail-revealed", 1);
            }

            return snapshot(null, progress);
        },
    };
}

export function createSwipeTracker(config) {
    let anchorX = null;
    let anchorAt = null;
    let lastDetectedAt = null;
    let cooldownUntil = 0;

    const reset = () => {
        anchorX = null;
        anchorAt = null;
        lastDetectedAt = null;
        cooldownUntil = 0;
    };

    return {
        reset,

        update(x, detected, timeMs) {
            if (!detected || !Number.isFinite(x)) {
                if (lastDetectedAt === null || timeMs - lastDetectedAt > config.HAND_LOST_TIMEOUT_MS) {
                    reset();
                }
                return null;
            }

            if (lastDetectedAt === null || timeMs - lastDetectedAt > config.HAND_LOST_TIMEOUT_MS) {
                anchorX = x;
                anchorAt = timeMs;
            }
            lastDetectedAt = timeMs;

            if (timeMs < cooldownUntil) {
                anchorX = x;
                anchorAt = timeMs;
                return null;
            }

            if (anchorX === null || timeMs - anchorAt > config.SWIPE_MAX_DURATION_MS) {
                anchorX = x;
                anchorAt = timeMs;
                return null;
            }

            const elapsed = timeMs - anchorAt;
            const distance = x - anchorX;
            if (
                elapsed < config.SWIPE_MIN_DURATION_MS ||
                Math.abs(distance) < config.SWIPE_DISTANCE
            ) {
                return null;
            }

            anchorX = x;
            anchorAt = timeMs;
            cooldownUntil = timeMs + config.SWIPE_COOLDOWN_MS;
            return distance < 0 ? "left" : "right";
        },
    };
}

export function createPinchTracker(config) {
    let pinchStartedAt = null;
    let lastDetectedAt = null;
    let pressSent = false;

    const reset = () => {
        pinchStartedAt = null;
        lastDetectedAt = null;
        pressSent = false;
    };

    return {
        reset,

        update(pinched, detected, timeMs) {
            if (!detected) {
                pinchStartedAt = null;
                if (lastDetectedAt === null || timeMs - lastDetectedAt > config.HAND_LOST_TIMEOUT_MS) {
                    reset();
                }
                return null;
            }

            lastDetectedAt = timeMs;
            if (!pinched) {
                pinchStartedAt = null;
                pressSent = false;
                return null;
            }

            if (pinchStartedAt === null) {
                pinchStartedAt = timeMs;
                return null;
            }

            if (!pressSent && timeMs - pinchStartedAt >= config.PINCH_HOLD_MS) {
                pressSent = true;
                return "press";
            }

            return null;
        },
    };
}

export function moveSelectionIndex(index, direction, optionCount) {
    if (optionCount <= 0) {
        return -1;
    }
    return Math.max(0, Math.min(optionCount - 1, index + direction));
}
