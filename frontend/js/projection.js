// Perspective Ads - Off-Axis Projection helper
// 画面を「窓」とみなし、ユーザー視点から非対称視錐台を計算する。

(() => {
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const degToRad = (deg) => deg * Math.PI / 180;

    /**
     * MediaPipe由来の正規化座標から、カメラ基準の概算視点位置(cm)を求める。
     *
     * 現時点では実距離推定を行っていないため、viewerDistanceCmを固定値として使う。
     * x/yはWebカメラの概算FOVから角度へ変換し、固定距離上の横移動量として扱う。
     */
    const normalizedFaceToViewerCm = (face, config) => {
        const distanceCm = Math.max(1, config.viewerDistanceCm);
        const normalizedX = clamp(face.x ?? 0, -1, 1);
        const normalizedY = clamp(face.y ?? 0, -1, 1);

        const horizontalAngle = normalizedX * degToRad(config.cameraHFovDeg / 2);
        const verticalAngle = normalizedY * degToRad(config.cameraVFovDeg / 2);

        const x = Math.tan(horizontalAngle) * distanceCm * (config.trackingGainX ?? 1);
        // MediaPipeのyは下方向が正なので、3D空間では反転する。
        const y = -Math.tan(verticalAngle) * distanceCm * (config.trackingGainY ?? 1);

        return {
            x: clamp(x, -(config.maxViewerXcm ?? 40), config.maxViewerXcm ?? 40),
            y: clamp(y, -(config.maxViewerYcm ?? 25), config.maxViewerYcm ?? 25),
            z: distanceCm,
        };
    };

    /**
     * cmで表した視点位置をThree.jsのワールド座標へ変換する。
     * 仮想スクリーンと実ディスプレイの縦横比がほぼ一致する前提。
     */
    const viewerCmToWorld = (viewerCm, config) => {
        const worldPerCmX = config.screenWidthWorld / config.screenWidthCm;
        const worldPerCmY = config.screenHeightWorld / config.screenHeightCm;
        const worldPerCmZ = (worldPerCmX + worldPerCmY) / 2;

        return {
            x: viewerCm.x * worldPerCmX,
            y: viewerCm.y * worldPerCmY,
            z: viewerCm.z * worldPerCmZ,
        };
    };

    /**
     * ユーザー視点とスクリーン平面(z=0)から非対称視錐台を作り、
     * Three.jsのcamera.projectionMatrixへ直接設定する。
     */
    const apply = (camera, viewerWorld, config) => {
        const near = config.near ?? 0.1;
        const far = config.far ?? 1000;
        const eyeZ = Math.max(viewerWorld.z, near + 0.001);

        const halfWidth = config.screenWidthWorld / 2;
        const halfHeight = config.screenHeightWorld / 2;

        const left = near * (-halfWidth - viewerWorld.x) / eyeZ;
        const right = near * (halfWidth - viewerWorld.x) / eyeZ;
        const bottom = near * (-halfHeight - viewerWorld.y) / eyeZ;
        const top = near * (halfHeight - viewerWorld.y) / eyeZ;

        camera.position.set(viewerWorld.x, viewerWorld.y, viewerWorld.z);
        // スクリーンはz=0、画面奥は-z方向として扱う。
        camera.rotation.set(0, 0, 0);

        camera.near = near;
        camera.far = far;
        camera.projectionMatrix.makePerspective(left, right, top, bottom, near, far);
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    };

    window.OffAxisProjection = {
        clamp,
        normalizedFaceToViewerCm,
        viewerCmToWorld,
        apply,
    };
})();