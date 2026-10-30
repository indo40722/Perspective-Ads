export function resolvePhotoStage(
    viewerX,
    currentStage,
    forwardProgress = 0,
    enterDistance = 7,
    exitDistance = 4.5,
    detailEnterThreshold = 0.12,
    detailExitThreshold = 0.08,
) {
    if (!Number.isFinite(viewerX)) return currentStage;
    if (forwardProgress >= (currentStage === 2 ? detailExitThreshold : detailEnterThreshold)) return 2;

    if (currentStage === 1) {
        return viewerX > -exitDistance ? 0 : 1;
    }

    if (currentStage === 2) {
        return viewerX <= -enterDistance ? 1 : 0;
    }

    if (viewerX <= -enterDistance) return 1;
    return 0;
}
export function getApproachProgress(faceScale, neutralFaceScale, startRatio = 1.08, fullRatio = 1.38) {
    if (!Number.isFinite(faceScale) || !Number.isFinite(neutralFaceScale) || neutralFaceScale <= 0 || fullRatio <= startRatio) {
        return 0;
    }

    const ratio = faceScale / neutralFaceScale;
    return Math.max(0, Math.min(1, (ratio - startRatio) / (fullRatio - startRatio)));
}

export function getCutProgress(forwardProgress, start = 0.12, complete = 0.9) {
    if (!Number.isFinite(forwardProgress) || complete <= start) return 0;
    return Math.max(0, Math.min(1, (forwardProgress - start) / (complete - start)));
}
