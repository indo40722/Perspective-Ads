import { createViewerSelector } from "./viewerSelection.js";

export function createBrowserFaceTracker({ wasmRoot, modelUrl, onFace, onFaceLost, onViewerReleased, onStatus }) {
    let stream = null;
    let video = null;
    let worker = null;
    let readyResolver = null;
    let readyRejecter = null;
    let videoFrameCallbackId = 0;
    let animationFrameId = 0;
    let frameId = 0;
    let lastSubmittedAt = 0;
    let frameInFlight = false;
    let running = false;
    let lastFaceDetected = false;
    const viewerSelector = createViewerSelector();

    const reportError = (error) => {
        onStatus?.("error", error?.message || "顔検出を開始できませんでした");
    };

    const handleWorkerMessage = (event) => {
        const message = event.data || {};
        if (message.type === "ready") {
            onStatus?.("ready");
            readyResolver?.();
            readyResolver = null;
            readyRejecter = null;
            return;
        }
        if (message.type === "error") {
            frameInFlight = false;
            const error = new Error(message.message || "顔検出を開始できませんでした");
            readyRejecter?.(error);
            readyResolver = null;
            readyRejecter = null;
            reportError(error);
            return;
        }
        if (message.type === "faces") {
            frameInFlight = false;
            const nowMs = performance.now();
            const selection = viewerSelector.update(message.faces, nowMs);
            if (selection.face) {
                lastFaceDetected = true;
                onFace?.({ ...selection.face, frame_id: message.frameId });
            } else if (lastFaceDetected) {
                lastFaceDetected = false;
                onFaceLost?.({ frame_id: message.frameId });
            }
            if (selection.released) {
                const holdMs = onViewerReleased?.() || 0;
                if (holdMs > 0) viewerSelector.suspend(holdMs, nowMs);
            }
            if (selection.stateChanged && selection.state === "waiting") {
                onStatus?.("participant-waiting", "顔を検出しました。横に動くか、近づいて参加してください");
            } else if (selection.stateChanged && selection.state === "occluded") {
                onStatus?.("participant-occluded", "操作中の人を一時的に見失いました。画面を保持しています");
            } else if (selection.stateChanged && selection.state === "cooldown") {
                onStatus?.("participant-cooldown", "特典を読み取る時間を確保しています");
            }
            return;
        }
        if (message.type === "face") {
            frameInFlight = false;
            lastFaceDetected = true;
            onFace?.(message.data);
            return;
        }
        if (message.type === "face_lost") {
            frameInFlight = false;
            if (lastFaceDetected) onFaceLost?.({ frame_id: message.frameId });
            lastFaceDetected = false;
            return;
        }
        if (message.type === "frame_done") frameInFlight = false;
    };

    const submitFrame = (timestamp) => {
        if (!running || !worker || !video || frameInFlight || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
        if (timestamp - lastSubmittedAt < 50) return;

        let frame;
        try {
            if (typeof VideoFrame !== "undefined") {
                frame = new VideoFrame(video, { timestamp: Math.round(timestamp * 1000) });
            } else {
                frame = createImageBitmap(video);
            }
        } catch (error) {
            reportError(error);
            return;
        }

        frameInFlight = true;
        lastSubmittedAt = timestamp;
        const currentFrameId = ++frameId;
        Promise.resolve(frame).then((image) => {
            if (!running || !worker) {
                image.close?.();
                frameInFlight = false;
                return;
            }
            worker.postMessage({
                type: "frame",
                frame: image,
                frameId: currentFrameId,
                width: video.videoWidth,
                height: video.videoHeight,
                timestamp,
            }, [image]);
        }).catch((error) => {
            frameInFlight = false;
            reportError(error);
        });
    };

    const requestNextFrame = () => {
        if (!running || !video) return;
        if (typeof video.requestVideoFrameCallback === "function") {
            videoFrameCallbackId = video.requestVideoFrameCallback((timestamp) => {
                submitFrame(timestamp);
                requestNextFrame();
            });
        } else {
            animationFrameId = requestAnimationFrame((timestamp) => {
                submitFrame(timestamp);
                requestNextFrame();
            });
        }
    };

    const stop = ({ notify = true } = {}) => {
        running = false;
        if (video && videoFrameCallbackId && typeof video.cancelVideoFrameCallback === "function") {
            video.cancelVideoFrameCallback(videoFrameCallbackId);
        }
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        videoFrameCallbackId = 0;
        animationFrameId = 0;
        worker?.terminate();
        worker = null;
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
        if (video) {
            video.pause();
            video.srcObject = null;
        }
        video = null;
        frameInFlight = false;
        lastFaceDetected = false;
        viewerSelector.reset();
        if (notify) onStatus?.("stopped");
    };

    const start = async ({ deviceId } = {}) => {
        if (running) return stream;
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("このブラウザーではカメラを利用できません。HTTPSまたはlocalhostで開いてください");
        }

        onStatus?.("starting");
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" }),
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30, max: 30 },
                },
            });

            video = document.createElement("video");
            video.muted = true;
            video.playsInline = true;
            video.autoplay = true;
            video.srcObject = stream;

            worker = new Worker(new URL("./faceTrackingWorker.js", import.meta.url));
            worker.addEventListener("message", handleWorkerMessage);
            worker.addEventListener("error", (event) => {
                const error = new Error(event.message || "顔検出ワーカーでエラーが発生しました");
                readyRejecter?.(error);
                reportError(error);
            });
            const ready = new Promise((resolve, reject) => {
                readyResolver = resolve;
                readyRejecter = reject;
            });
            worker.postMessage({ type: "initialize", wasmRoot, modelUrl });
            await Promise.all([video.play(), ready]);

            running = true;
            onStatus?.("ready");
            requestNextFrame();
            return stream;
        } catch (error) {
            stop({ notify: false });
            throw error;
        }
    };

    return {
        start,
        stop,
        getStream: () => stream,
    };
}
