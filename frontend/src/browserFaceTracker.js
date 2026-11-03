export function createBrowserFaceTracker({ wasmRoot, modelUrl, onFace, onFaceLost, onStatus }) {
    const retryableCameraErrors = new Set([
        "AbortError",
        "NotFoundError",
        "NotReadableError",
        "OverconstrainedError",
    ]);
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
        if (notify) onStatus?.("stopped");
    };

    const openCamera = async (preferredDeviceId) => {
        const triedDeviceIds = new Set();
        const failures = [];
        const open = async (deviceId) => {
            const key = deviceId || "__default__";
            if (triedDeviceIds.has(key)) return null;
            triedDeviceIds.add(key);
            try {
                return await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" }),
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        frameRate: { ideal: 30, max: 30 },
                    },
                });
            } catch (error) {
                if (!retryableCameraErrors.has(error?.name)) throw error;
                failures.push(error);
                return null;
            }
        };

        if (preferredDeviceId) {
            const preferredStream = await open(preferredDeviceId);
            if (preferredStream) return preferredStream;
        } else {
            const defaultStream = await open("");
            if (defaultStream) return defaultStream;
        }

        let devices = [];
        try {
            devices = (await navigator.mediaDevices.enumerateDevices())
                .filter((device) => device.kind === "videoinput" && device.deviceId);
        } catch {
            // 端末一覧を取得できない場合も、既定カメラでの再試行を続ける。
        }

        for (const device of devices) {
            const alternateStream = await open(device.deviceId);
            if (alternateStream) return alternateStream;
        }

        const defaultStream = await open("");
        if (defaultStream) return defaultStream;

        const readableFailure = failures.find((error) => error.name === "NotReadableError");
        throw readableFailure || failures[0] || new Error("利用できるカメラが見つかりません");
    };

    const start = async ({ deviceId } = {}) => {
        if (running) return stream;
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("このブラウザーではカメラを利用できません。HTTPSまたはlocalhostで開いてください");
        }

        onStatus?.("starting");
        let failureStage = "camera";
        try {
            stream = await openCamera(deviceId);

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
            failureStage = "face-detection";
            await Promise.all([video.play(), ready]);

            running = true;
            onStatus?.("ready");
            requestNextFrame();
            return stream;
        } catch (error) {
            stop({ notify: false });
            const failure = new Error(error?.message || "カメラを起動できませんでした");
            failure.name = error?.name || "Error";
            failure.trackingStage = failureStage;
            throw failure;
        }
    };

    return {
        start,
        stop,
        getStream: () => stream,
    };
}
