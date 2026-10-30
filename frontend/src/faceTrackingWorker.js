import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

let detector = null;
let detectedInPreviousFrame = false;

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
        const detection = result.detections
            .filter((item) => item.boundingBox)
            .sort((left, right) => (right.categories?.[0]?.score || 0) - (left.categories?.[0]?.score || 0))[0];

        if (!detection) {
            if (detectedInPreviousFrame) self.postMessage({ type: "face_lost", frameId: message.frameId });
            detectedInPreviousFrame = false;
            self.postMessage({ type: "frame_done" });
            return;
        }

        const box = detection.boundingBox;
        const nose = detection.keypoints.find((keypoint) => keypoint.label?.toLowerCase().includes("nose"));
        const centerX = nose?.x ?? (box.originX + box.width / 2) / message.width;
        const faceScale = Math.sqrt((box.width / message.width) * (box.height / message.height));
        detectedInPreviousFrame = true;
        self.postMessage({
            type: "face",
            data: {
                x: (centerX - 0.5) * 2,
                face_scale: faceScale,
                frame_id: message.frameId,
            },
        });
    } catch (error) {
        self.postMessage({ type: "error", message: error?.message || "顔位置を検出できませんでした" });
    } finally {
        message.frame.close?.();
    }
});
