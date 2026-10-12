const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const degToRad = (degrees) => degrees * Math.PI / 180;

// 左右の顔位置の差を、画面前の概算視点位置へ変換する。
export function normalizedFaceToViewerCm(face, config) {
    const distanceCm = Math.max(1, config.VIEWER_DISTANCE_CM);
    const normalizedX = clamp(face.x ?? 0, -1, 1);
    const horizontalAngle = normalizedX * degToRad(config.CAMERA_HFOV_DEG / 2);
    const x = Math.tan(horizontalAngle) * distanceCm * config.TRACKING_GAIN_X;

    return {
        x: clamp(x, -config.MAX_VIEWER_X_CM, config.MAX_VIEWER_X_CM),
        y: 0,
        z: distanceCm,
    };
}

// 視点位置を画面のワールド座標へ換算する。
export function viewerCmToWorld(viewerCm, config) {
    const worldPerCmX = config.SCREEN_WIDTH_WORLD / config.SCREEN_WIDTH_CM;
    const worldPerCmY = config.SCREEN_HEIGHT_WORLD / config.SCREEN_HEIGHT_CM;
    const worldPerCmZ = (worldPerCmX + worldPerCmY) / 2;

    return {
        x: viewerCm.x * worldPerCmX,
        y: 0,
        z: viewerCm.z * worldPerCmZ,
    };
}

// 視点と画面平面から非対称視錐台を作り、投影行列へ反映する。
export function applyOffAxisProjection(camera, viewerWorld, config) {
    const near = config.NEAR;
    const far = config.FAR;
    const eyeZ = Math.max(viewerWorld.z, near + 0.001);
    const halfWidth = config.SCREEN_WIDTH_WORLD / 2;
    const halfHeight = config.SCREEN_HEIGHT_WORLD / 2;

    const left = near * (-halfWidth - viewerWorld.x) / eyeZ;
    const right = near * (halfWidth - viewerWorld.x) / eyeZ;
    const bottom = near * (-halfHeight) / eyeZ;
    const top = near * halfHeight / eyeZ;

    camera.position.set(viewerWorld.x, 0, viewerWorld.z);
    camera.rotation.set(0, 0, 0);
    camera.near = near;
    camera.far = far;
    camera.projectionMatrix.makePerspective(left, right, top, bottom, near, far);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}
