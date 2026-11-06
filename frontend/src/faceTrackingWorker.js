import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

let detector = null;

self.addEventListener("message", async (event) => {
    const message = event.data || {};
    if (message.type === "initialize") {
        try {
            const fileset = await FilesetResolver.forVisionTasks(message.wasmRoot);
            detector = await FaceDetector.createFromOptions(fileset, {
                baseOptions: { modelAssetPath: message.modelUrl },
                runningMode: "VIDEO",
                minDetectionConfidence: 0.35,
                minSuppressionThreshold: 0.3,
            });
            self.postMessage({ type: "ready" });
        } catch (error) {
            self.postMessage({ type: "error", message: error?.message || "顔検出モデルを読み込めませんでした" });
        }
        return;
    }

    if (message.type !== "frame" || !detector) {
        message.frame?.close?.();
        return;
    }

    try {
        const result = detector.detectForVideo(message.frame, message.timestamp);
        const faces = (result.detections || [])
            .filter((item) => item.boundingBox)
            .sort((a, b) => (b.categories?.[0]?.score || 0) - (a.categories?.[0]?.score || 0))
            .slice(0, 8)
            .map((detection) => {
                const box = detection.boundingBox;
                const nose = (detection.keypoints || [])
                    .find((keypoint) => keypoint.label?.toLowerCase().includes("nose"));
                const centerX = nose?.x ?? (box.originX + box.width / 2) / message.width;
                const centerY = nose?.y ?? (box.originY + box.height / 2) / message.height;
                return {
                    x: (centerX - 0.5) * 2,
                    y: centerY,
                    face_scale: Math.sqrt((box.width / message.width) * (box.height / message.height)),
                    confidence: detection.categories?.[0]?.score || 0,
                };
            });
        self.postMessage({ type: "faces", faces, frameId: message.frameId });
    } catch (error) {
        self.postMessage({ type: "error", message: error?.message || "顔位置を検出できませんでした" });
    } finally {
        message.frame.close?.();
    }
});
