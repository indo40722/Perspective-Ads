import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import QRCode from "qrcode";
import { createShowcase } from "./photoShowcase.js";
import { resolvePhotoStage, getApproachProgress, getCouponRevealProgress, getCutProgress } from "./photoInteraction.js";
import { createCouponUrl } from "./couponUrl.js";
import { STEAK_AD } from "./steakAd.js";
import { CONFIG } from "./config.js";
import { normalizedFaceToViewerCm } from "./projection.js";
import { createOneEuroFilter, median, removeDeadzone } from "./tracking.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export default function App() {
    const containerRef = useRef(null);
    const showcaseRef = useRef(null);
    const [cameraConnected, setCameraConnected] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [activeStageIndex, setActiveStageIndex] = useState(0);
    const [couponQr, setCouponQr] = useState({ url: "", dataUrl: "", failed: false });
    const [debugVisible, setDebugVisible] = useState(false);
    const [debugValues, setDebugValues] = useState({ x: "0.0", depth: "0%", status: "カメラ未接続" });
    const [verificationVisible, setVerificationVisible] = useState(false);
    const [verificationMode, setVerificationMode] = useState(false);
    const [verificationPosition, setVerificationPosition] = useState({ x: 0, depth: 0 });
    const [verificationSnapshot, setVerificationSnapshot] = useState({
        cameraConnected: false,
        faceDetected: false,
        x: 0,
        depth: 0,
        cut: 0,
        coupon: 0,
        stage: "全体",
        status: "カメラ未接続",
    });
    const [recording, setRecording] = useState(false);
    const [recordingStopping, setRecordingStopping] = useState(false);
    const [recordingError, setRecordingError] = useState("");
    const [status, setStatus] = useState("カメラ未接続・ドラッグ操作ができます");
    const debugVisibleRef = useRef(false);
    const verificationVisibleRef = useRef(false);
    const verificationControlsRef = useRef({ setMode: () => {}, setPosition: () => {}, reset: () => {} });
    const mediaRecorderRef = useRef(null);
    const screenStreamRef = useRef(null);
    const recordingChunksRef = useRef([]);
    const socketRef = useRef(null);
    const cameraRecordingIdRef = useRef(null);
    const recordingFilenameBaseRef = useRef("");
    const recordingStoppingRef = useRef(false);
    const resetViewRef = useRef(() => {});
    debugVisibleRef.current = debugVisible;
    verificationVisibleRef.current = verificationVisible;

    const handleVerificationMode = (enabled) => {
        setVerificationMode(enabled);
        verificationControlsRef.current.setMode(enabled);
        if (!enabled) setVerificationPosition({ x: 0, depth: 0 });
    };

    const handleVerificationPosition = (axis, value) => {
        const next = { ...verificationPosition, [axis]: Number(value) };
        setVerificationPosition(next);
        verificationControlsRef.current.setPosition(next.x, next.depth);
    };

    const resetVerification = () => {
        setVerificationPosition({ x: 0, depth: 0 });
        verificationControlsRef.current.reset();
        resetViewRef.current();
    };

    const cameraRecordingRequest = async (path, socketId) => {
        const response = await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ socket_id: socketId }),
        });
        const contentType = response.headers.get("content-type") || "";
        const body = contentType.includes("application/json") ? await response.json().catch(() => ({})) : {};
        if (!response.ok) throw new Error(body.detail || "カメラ映像を保存できませんでした");
        return { response, body };
    };

    const downloadRecording = (blob, filename) => {
        if (!blob.size) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    };

    const stopScreenRecording = async () => {
        if (recordingStoppingRef.current) return;
        const recorder = mediaRecorderRef.current;
        const recordingId = cameraRecordingIdRef.current;
        if (!recorder && !recordingId) return;

        recordingStoppingRef.current = true;
        setRecordingStopping(true);
        let screenStopped = Promise.resolve();
        if (recorder && recorder.state !== "inactive") {
            screenStopped = new Promise((resolve) => recorder.addEventListener("stop", resolve, { once: true }));
            recorder.stop();
        }

        try {
            if (recordingId) {
                const socketId = socketRef.current?.id;
                if (!socketId) throw new Error("カメラとの接続が切れたため、カメラ映像を保存できませんでした");
                const stopped = await cameraRecordingRequest(`/api/camera-recording/${recordingId}/stop`, socketId);
                const downloaded = await cameraRecordingRequest(`/api/camera-recording/${recordingId}/download`, socketId);
                downloadRecording(await downloaded.response.blob(), stopped.body.filename);
            }
        } catch (error) {
            setRecordingError(error?.message || "カメラ映像を保存できませんでした");
            const socketId = socketRef.current?.id;
            if (recordingId && socketId) {
                await cameraRecordingRequest(`/api/camera-recording/${recordingId}/cancel`, socketId).catch(() => {});
            }
        } finally {
            cameraRecordingIdRef.current = null;
            await screenStopped;
            screenStreamRef.current?.getTracks().forEach((track) => track.stop());
            screenStreamRef.current = null;
            mediaRecorderRef.current = null;
            setRecording(false);
            setRecordingStopping(false);
            recordingStoppingRef.current = false;
        }
    };

    const startScreenRecording = async () => {
        setRecordingError("");
        if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
            setRecordingError("このブラウザーは画面録画に対応していません");
            return;
        }

        let stream;
        let recorder;
        let recordingId;
        try {
            stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            const socketId = socketRef.current?.id;
            if (!socketId) throw new Error("カメラに接続してから録画を開始してください");
            const mimeType = typeof MediaRecorder.isTypeSupported === "function"
                ? ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type))
                : undefined;
            recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            const started = await cameraRecordingRequest("/api/camera-recording/start", socketId);
            recordingId = started.body.recording_id;
            cameraRecordingIdRef.current = recordingId;
            recordingFilenameBaseRef.current = started.body.filename_base;
            recordingChunksRef.current = [];
            screenStreamRef.current = stream;
            mediaRecorderRef.current = recorder;
            recorder.addEventListener("dataavailable", (event) => {
                if (event.data.size > 0) recordingChunksRef.current.push(event.data);
            });
            recorder.addEventListener("stop", () => {
                const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "video/webm" });
                downloadRecording(blob, `${recordingFilenameBaseRef.current}-screen.webm`);
                stream.getTracks().forEach((track) => track.stop());
                screenStreamRef.current = null;
                mediaRecorderRef.current = null;
            }, { once: true });
            recorder.addEventListener("error", () => {
                setRecordingError("画面録画中にエラーが発生しました");
                void stopScreenRecording();
            }, { once: true });
            stream.getVideoTracks()[0]?.addEventListener("ended", () => void stopScreenRecording(), { once: true });
            recorder.start(1000);
            setRecording(true);
        } catch (error) {
            if (recordingId) {
                const socketId = socketRef.current?.id;
                if (socketId) await cameraRecordingRequest(`/api/camera-recording/${recordingId}/cancel`, socketId).catch(() => {});
            }
            stream?.getTracks().forEach((track) => track.stop());
            screenStreamRef.current = null;
            mediaRecorderRef.current = null;
            cameraRecordingIdRef.current = null;
            setRecording(false);
            setRecordingError(error?.name === "NotAllowedError" ? "画面共有がキャンセルされました" : error?.message || "画面とカメラの録画を開始できませんでした");
        }
    };

    useEffect(() => () => {
        const recordingId = cameraRecordingIdRef.current;
        const socketId = socketRef.current?.id;
        if (recordingId && socketId) {
            fetch(`/api/camera-recording/${recordingId}/cancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ socket_id: socketId }),
                keepalive: true,
            }).catch(() => {});
        }
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== "inactive") recorder.stop();
        screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    }, []);

    useEffect(() => {
        let cancelled = false;
        let url;
        try {
            url = createCouponUrl(
                import.meta.env.VITE_COUPON_URL,
                window.location.href,
                STEAK_AD.id
            );
        } catch {
            setCouponQr({ url: "", dataUrl: "", failed: true });
            return undefined;
        }
        setCouponQr({ url, dataUrl: "", failed: false });
        QRCode.toDataURL(url, {
            errorCorrectionLevel: "Q",
            margin: 2,
            width: 420,
            color: { dark: "#142019", light: "#fffdf7" },
        }).then((dataUrl) => {
            if (!cancelled) setCouponQr({ url, dataUrl, failed: false });
        }).catch(() => {
            if (!cancelled) setCouponQr({ url, dataUrl: "", failed: true });
        });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        showcaseRef.current?.setCouponQr(couponQr);
    }, [couponQr]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return undefined;

        const showcase = createShowcase(container, STEAK_AD);
        showcaseRef.current = showcase;
        const stageHost = container.querySelector(".photo-stage");
        let animationFrameId = 0;
        let lastFrameTime = performance.now();
        let lastDebugTime = 0;
        let lastVerificationTime = 0;
        let faceLostTimeoutId = 0;
        let latestFrameId = -1;
        let statusMessage = "カメラ未接続・ドラッグ操作ができます";
        let currentStageIndex = 0;

        const targetViewerXRef = { current: 0 };
        const currentViewerXRef = { current: 0 };
        const targetViewerDepthRef = { current: 0 };
        const currentViewerDepthRef = { current: 0 };
        const neutralFaceXRef = { current: null };
        const neutralFaceScaleRef = { current: null };
        const calibrationSamples = [];
        const calibrationScaleSamples = [];
        const manualInputUntilRef = { current: 0 };
        const pointerDragRef = { current: null };
        const faceDetectedRef = { current: false };
        const cameraConnectedRef = { current: false };
        const cameraDisabledRef = { current: false };
        const verificationModeRef = { current: false };
        const filter = createOneEuroFilter({
            minCutoffHz: CONFIG.FILTER_MIN_CUTOFF_HZ,
            speedCoefficient: CONFIG.FILTER_SPEED_COEFFICIENT,
            derivativeCutoffHz: CONFIG.FILTER_DERIVATIVE_CUTOFF_HZ,
        });

        const handleFaceData = (data = {}) => {
            if (verificationModeRef.current || performance.now() < manualInputUntilRef.current) return;
            window.clearTimeout(faceLostTimeoutId);
            faceLostTimeoutId = 0;

            const frameId = Number(data.frame_id);
            if (Number.isFinite(frameId)) {
                if (frameId <= latestFrameId) return;
                latestFrameId = frameId;
            }

            const rawX = Number(data.x);
            if (!Number.isFinite(rawX)) return;
            const faceScale = Number(data.face_scale);
            faceDetectedRef.current = true;
            setCameraReady(true);

            if (neutralFaceXRef.current === null) {
                calibrationSamples.push(rawX);
                if (Number.isFinite(faceScale) && faceScale > 0) calibrationScaleSamples.push(faceScale);
                if (calibrationSamples.length > CONFIG.CALIBRATION_SAMPLE_COUNT) calibrationSamples.shift();
                if (calibrationScaleSamples.length > CONFIG.CALIBRATION_SAMPLE_COUNT) calibrationScaleSamples.shift();
                if (calibrationSamples.length < CONFIG.CALIBRATION_SAMPLE_COUNT) {
                    statusMessage = "正面位置を調整中 " + calibrationSamples.length + "/" + CONFIG.CALIBRATION_SAMPLE_COUNT;
                    setStatus(statusMessage);
                    return;
                }

                const sampleRange = Math.max(...calibrationSamples) - Math.min(...calibrationSamples);
                const scaleMedian = calibrationScaleSamples.length === CONFIG.CALIBRATION_SAMPLE_COUNT
                    ? median(calibrationScaleSamples)
                    : null;
                const scaleRange = scaleMedian
                    ? (Math.max(...calibrationScaleSamples) - Math.min(...calibrationScaleSamples)) / scaleMedian
                    : 0;
                if (sampleRange > CONFIG.CALIBRATION_MAX_RANGE || scaleRange > 0.16) {
                    calibrationSamples.length = 0;
                    calibrationScaleSamples.length = 0;
                    statusMessage = "顔を正面で静止してください";
                    setStatus(statusMessage);
                    return;
                }

                neutralFaceXRef.current = median(calibrationSamples);
                calibrationSamples.length = 0;
                neutralFaceScaleRef.current = scaleMedian;
                calibrationScaleSamples.length = 0;
                filter.reset();
                targetViewerXRef.current = 0;
                targetViewerDepthRef.current = 0;
                statusMessage = "顔位置を追跡中";
                setStatus(statusMessage);
                return;
            }

            const offset = removeDeadzone(rawX - neutralFaceXRef.current, CONFIG.INPUT_DEADZONE);
            const filteredX = filter.filter(offset, performance.now());
            targetViewerXRef.current = normalizedFaceToViewerCm({ x: filteredX }, CONFIG).x;
            targetViewerDepthRef.current = getApproachProgress(faceScale, neutralFaceScaleRef.current);
            faceDetectedRef.current = true;
            setCameraReady(true);
            statusMessage = "顔位置を追跡中";
            setStatus(statusMessage);
        };

        const handleFaceLost = () => {
            if (verificationModeRef.current) return;
            faceDetectedRef.current = false;
            if (neutralFaceXRef.current === null) {
                calibrationSamples.length = 0;
                calibrationScaleSamples.length = 0;
            }
            statusMessage = cameraDisabledRef.current
                ? "カメラ停止中・ドラッグで操作できます"
                : cameraConnectedRef.current
                    ? neutralFaceXRef.current === null ? "顔を探しています" : "顔を一時的に見失いました・位置を保持中"
                    : "カメラ未接続・ドラッグ操作ができます";
            setCameraReady(false);
            setStatus(statusMessage);
            window.clearTimeout(faceLostTimeoutId);
            faceLostTimeoutId = window.setTimeout(() => {
                if (faceDetectedRef.current || verificationModeRef.current) return;
                targetViewerXRef.current = 0;
                targetViewerDepthRef.current = 0;
            }, 900);
        };

        const socket = io();
        socketRef.current = socket;
        socket.on("connect", () => {
            cameraConnectedRef.current = true;
            latestFrameId = -1;
            if (verificationModeRef.current) {
                setCameraConnected(true);
                statusMessage = "手動検証中・カメラ入力を一時停止";
                setStatus(statusMessage);
                return;
            }
            if (cameraDisabledRef.current) {
                cameraConnectedRef.current = false;
                setCameraConnected(false);
                statusMessage = "カメラ停止中・ドラッグで操作できます";
                setStatus(statusMessage);
                return;
            }
            setCameraConnected(true);
            statusMessage = "顔を探しています";
            setStatus(statusMessage);
        });
        socket.on("disconnect", () => {
            if (cameraRecordingIdRef.current) {
                cameraRecordingIdRef.current = null;
                recordingStoppingRef.current = false;
                screenStreamRef.current?.getTracks().forEach((track) => track.stop());
                screenStreamRef.current = null;
                const recorder = mediaRecorderRef.current;
                if (recorder && recorder.state !== "inactive") recorder.stop();
                setRecording(false);
                setRecordingStopping(false);
                setRecordingError("カメラ接続が切れたためカメラ映像は破棄しました。画面映像は保存されます。");
            }
            cameraConnectedRef.current = false;
            cameraDisabledRef.current = false;
            if (!verificationModeRef.current) {
                faceDetectedRef.current = false;
                targetViewerXRef.current = 0;
                targetViewerDepthRef.current = 0;
            }
            setCameraConnected(false);
            if (!verificationModeRef.current) setCameraReady(false);
            statusMessage = verificationModeRef.current
                ? "手動検証中・カメラ入力を一時停止"
                : "カメラ未接続・ドラッグ操作ができます";
            setStatus(statusMessage);
        });
        socket.on("face_data", handleFaceData);
        socket.on("face_lost", handleFaceLost);
        socket.on("camera_status", ({ status: cameraStatus } = {}) => {
            if (cameraStatus === "starting") statusMessage = "カメラを起動しています";
            else if (cameraStatus === "unavailable") statusMessage = "カメラを利用できません";
            else if (cameraStatus === "disabled") {
                cameraDisabledRef.current = true;
                cameraConnectedRef.current = false;
                faceDetectedRef.current = false;
                targetViewerXRef.current = 0;
                targetViewerDepthRef.current = 0;
                setCameraConnected(false);
                setCameraReady(false);
                statusMessage = "カメラ停止中・ドラッグで操作できます";
            } else if (cameraStatus === "ready" && !faceDetectedRef.current) {
                cameraDisabledRef.current = false;
                statusMessage = "顔を探しています";
            }
            if (verificationModeRef.current) statusMessage = "手動検証中・カメラ入力を一時停止";
            setStatus(statusMessage);
        });

        const handlePointerDown = (event) => {
            if (verificationModeRef.current) return;
            if (event.button !== 0 && event.pointerType === "mouse") return;
            pointerDragRef.current = {
                x: event.clientX,
                y: event.clientY,
                originX: targetViewerXRef.current,
                originDepth: targetViewerDepthRef.current,
            };
            stageHost.classList.add("is-dragging");
            stageHost.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        };
        const handlePointerMove = (event) => {
            if (!pointerDragRef.current) return;
            const changeX = (event.clientX - pointerDragRef.current.x) / Math.max(container.clientWidth, 1);
            const changeY = (event.clientY - pointerDragRef.current.y) / Math.max(container.clientHeight, 1);
            targetViewerXRef.current = clamp(
                pointerDragRef.current.originX + changeX * CONFIG.MAX_VIEWER_X_CM * 2.2,
                -CONFIG.MAX_VIEWER_X_CM,
                CONFIG.MAX_VIEWER_X_CM
            );
            targetViewerDepthRef.current = clamp(pointerDragRef.current.originDepth - changeY * 1.8, 0, 1);
            manualInputUntilRef.current = performance.now() + 1200;
            statusMessage = targetViewerDepthRef.current > 0.05
                ? "前へ進む動きを確認中"
                : "ドラッグで見どころを移動中";
            setStatus(statusMessage);
            setCameraReady(false);
        };
        const handlePointerUp = () => {
            pointerDragRef.current = null;
            stageHost.classList.remove("is-dragging");
        };
        stageHost.addEventListener("pointerdown", handlePointerDown);
        stageHost.addEventListener("pointermove", handlePointerMove);
        stageHost.addEventListener("pointerup", handlePointerUp);
        stageHost.addEventListener("pointercancel", handlePointerUp);

        const resetView = () => {
            targetViewerXRef.current = 0;
            currentViewerXRef.current = 0;
            targetViewerDepthRef.current = 0;
            currentViewerDepthRef.current = 0;
            manualInputUntilRef.current = 0;
            currentStageIndex = 0;
            showcase.reset();
            setActiveStageIndex(0);
            statusMessage = verificationModeRef.current
                ? "手動検証中・カメラ入力を一時停止"
                : cameraDisabledRef.current
                    ? "カメラ停止中・ドラッグで操作できます"
                    : cameraConnectedRef.current ? "顔を探しています" : "カメラ未接続・ドラッグ操作ができます";
            setStatus(statusMessage);
        };
        resetViewRef.current = resetView;
        verificationControlsRef.current = {
            setMode(enabled) {
                verificationModeRef.current = enabled;
                neutralFaceXRef.current = null;
                neutralFaceScaleRef.current = null;
                calibrationSamples.length = 0;
                calibrationScaleSamples.length = 0;
                faceDetectedRef.current = false;
                setCameraReady(false);
                targetViewerXRef.current = 0;
                currentViewerXRef.current = 0;
                targetViewerDepthRef.current = 0;
                currentViewerDepthRef.current = 0;
                statusMessage = enabled
                    ? "手動検証中・カメラ入力を一時停止"
                    : cameraDisabledRef.current
                        ? "カメラ停止中・ドラッグで操作できます"
                        : cameraConnectedRef.current ? "顔を探しています" : "カメラ未接続・ドラッグ操作ができます";
                setStatus(statusMessage);
                setVerificationPosition({ x: 0, depth: 0 });
            },
            setPosition(x, depth) {
                if (!verificationModeRef.current) return;
                targetViewerXRef.current = clamp(x, -CONFIG.MAX_VIEWER_X_CM, CONFIG.MAX_VIEWER_X_CM);
                targetViewerDepthRef.current = clamp(depth, 0, 1);
                statusMessage = "手動検証中・カメラ入力を一時停止";
                setStatus(statusMessage);
            },
            reset() {
                targetViewerXRef.current = 0;
                currentViewerXRef.current = 0;
                targetViewerDepthRef.current = 0;
                currentViewerDepthRef.current = 0;
            },
        };

        const handleKeyDown = (event) => {
            const key = event.key.toLowerCase();
            if (key === "d") {
                setDebugVisible((value) => !value);
            } else if (key === "r") {
                resetView();
            } else if (key === "f") {
                if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
                else document.documentElement.requestFullscreen().catch(() => {});
            } else if (debugVisibleRef.current && ["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(key)) {
                event.preventDefault();
                manualInputUntilRef.current = performance.now() + 5000;
                if (key === "arrowleft") targetViewerXRef.current = clamp(targetViewerXRef.current - 8, -CONFIG.MAX_VIEWER_X_CM, CONFIG.MAX_VIEWER_X_CM);
                else if (key === "arrowright") targetViewerXRef.current = clamp(targetViewerXRef.current + 8, -CONFIG.MAX_VIEWER_X_CM, CONFIG.MAX_VIEWER_X_CM);
                else if (key === "arrowup") targetViewerDepthRef.current = clamp(targetViewerDepthRef.current + 0.12, 0, 1);
                else if (key === "arrowdown") targetViewerDepthRef.current = clamp(targetViewerDepthRef.current - 0.12, 0, 1);
                else {
                    targetViewerXRef.current = 0;
                    targetViewerDepthRef.current = 0;
                }
                statusMessage = targetViewerDepthRef.current > 0.05
                    ? "前へ進む動きを確認中"
                    : "キーボードで見どころを移動中";
                setStatus(statusMessage);
            }
        };
        window.addEventListener("keydown", handleKeyDown);

        const animate = (timeMs) => {
            const elapsedSeconds = Math.min(0.1, Math.max(0, (timeMs - lastFrameTime) / 1000));
            lastFrameTime = timeMs;
            const followAmount = 1 - Math.exp(-elapsedSeconds / CONFIG.VIEW_FOLLOW_SECONDS);
            currentViewerXRef.current += (targetViewerXRef.current - currentViewerXRef.current) * followAmount;
            currentViewerDepthRef.current += (targetViewerDepthRef.current - currentViewerDepthRef.current) * followAmount;
            const cutProgress = getCutProgress(currentViewerDepthRef.current);
            const couponProgress = getCouponRevealProgress(currentViewerXRef.current, currentViewerDepthRef.current);
            showcase.setCutProgress(cutProgress);
            showcase.setViewer(couponProgress);

            const nextStageIndex = resolvePhotoStage(currentViewerXRef.current, currentStageIndex, currentViewerDepthRef.current);
            if (nextStageIndex !== currentStageIndex) {
                currentStageIndex = nextStageIndex;
                showcase.setStage(nextStageIndex);
                setActiveStageIndex(nextStageIndex);
            }

            if (debugVisibleRef.current && timeMs - lastDebugTime > 100) {
                lastDebugTime = timeMs;
                setDebugValues({
                    x: currentViewerXRef.current.toFixed(1),
                    depth: Math.round(currentViewerDepthRef.current * 100) + "%",
                    status: statusMessage,
                });
            }
            if (verificationVisibleRef.current && timeMs - lastVerificationTime > 120) {
                lastVerificationTime = timeMs;
                setVerificationSnapshot({
                    cameraConnected: cameraConnectedRef.current,
                    faceDetected: faceDetectedRef.current,
                    x: currentViewerXRef.current,
                    depth: currentViewerDepthRef.current,
                    cut: cutProgress,
                    coupon: couponProgress,
                    stage: STEAK_AD.stages[currentStageIndex].label,
                    status: statusMessage,
                });
            }
            animationFrameId = requestAnimationFrame(animate);
        };
        animationFrameId = requestAnimationFrame(animate);

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.clearTimeout(faceLostTimeoutId);
            window.removeEventListener("keydown", handleKeyDown);
            stageHost.removeEventListener("pointerdown", handlePointerDown);
            stageHost.removeEventListener("pointermove", handlePointerMove);
            stageHost.removeEventListener("pointerup", handlePointerUp);
            stageHost.removeEventListener("pointercancel", handlePointerUp);
            socket.disconnect();
            if (socketRef.current === socket) socketRef.current = null;
            showcase.dispose();
            if (showcaseRef.current === showcase) showcaseRef.current = null;
            resetViewRef.current = () => {};
            verificationControlsRef.current = { setMode: () => {}, setPosition: () => {}, reset: () => {} };
        };
    }, []);

    const activeStage = STEAK_AD.stages[activeStageIndex];

    return (
        <main className="ad-shell">
            <div id="container" ref={containerRef} role="region" aria-label="視点に合わせてステーキの見どころが変わる写真広告" />
            <div className="campaign-overlay">
                <header className="campaign-header">
                    <div className="brand-lockup">
                        <span className="brand-mark">CH</span>
                        <span className="brand-name">CHAR</span>
                        <span className="brand-divider" />
                        <span className="brand-edition">STEAKHOUSE</span>
                    </div>
                    <div className={cameraReady ? "camera-status is-ready" : "camera-status"} aria-live="polite">
                        <span className="status-light" />
                        <span>{status}</span>
                    </div>
                </header>

                <section className="campaign-copy" aria-live="polite">
                    <div className="stage-copy" key={activeStageIndex}>
                        <p className="campaign-kicker">{activeStage.eyebrow}</p>
                        <h1>
                            {activeStage.title.split("\n").map((line, index) => <span key={index}>{line}</span>)}
                        </h1>
                        <p className="campaign-description">{activeStage.description}</p>
                        <p className="campaign-product">{STEAK_AD.itemName}<span> / {activeStage.label}</span></p>
                    </div>
                </section>

                <footer className="campaign-footer">
                    <div className="stage-track" aria-label={"広告の見どころ: " + activeStage.label}>
                        {STEAK_AD.stages.map((stage, index) => (
                            <div className={index === activeStageIndex ? "stage-marker is-active" : "stage-marker"} key={stage.label}>
                                <span className="stage-rule" />
                                <span>{stage.label}</span>
                            </div>
                        ))}
                    </div>
                    <button
                        className={verificationVisible ? "verification-toggle is-active" : "verification-toggle"}
                        type="button"
                        aria-expanded={verificationVisible}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => setVerificationVisible((value) => !value)}
                    >
                        {verificationVisible ? "検証を閉じる" : "検証"}
                    </button>
                    <span className="photo-credit">コンセプト用写真</span>
                    <button
                        className="reset-view"
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={resetVerification}
                    >
                        最初に戻す
                    </button>
                </footer>

                {debugVisible && (
                    <aside className="debug-panel" aria-live="polite">
                        <p>VIEWER X <strong>{debugValues.x} cm</strong></p>
                        <p>前進 <strong>{debugValues.depth}</strong></p>
                        <p>入力 <strong>{debugValues.status}</strong></p>
                        <p>見どころ <strong>{activeStage.label}</strong></p>
                        <p>追跡 <strong>{cameraConnected ? "接続" : "未接続"}</strong></p>
                    </aside>
                )}
                {verificationVisible && (
                    <aside className="verification-panel" aria-label="広告の動作検証">
                        <div className="verification-heading">
                            <div>
                                <p>広告の進行状況</p>
                                <h2>動作検証</h2>
                            </div>
                            {recording && <span className="recording-indicator">画面・カメラ録画中</span>}
                        </div>
                        <dl className="verification-states">
                            <div>
                                <dt>カメラ</dt>
                                <dd>{verificationSnapshot.cameraConnected ? "接続" : "未接続"}</dd>
                            </div>
                            <div>
                                <dt>顔検出</dt>
                                <dd>{verificationMode ? "手動検証" : verificationSnapshot.faceDetected ? "検出" : "未検出"}</dd>
                            </div>
                            <div>
                                <dt>表示</dt>
                                <dd>{verificationSnapshot.stage}</dd>
                            </div>
                        </dl>
                        <div className="verification-meters">
                            <div>
                                <span>前進</span>
                                <strong>{Math.round(verificationSnapshot.depth * 100)}%</strong>
                            </div>
                            <progress value={verificationSnapshot.depth} max="1" aria-label="前進量" />
                            <div>
                                <span>断面</span>
                                <strong>{Math.round(verificationSnapshot.cut * 100)}%</strong>
                            </div>
                            <progress value={verificationSnapshot.cut} max="1" aria-label="断面の表示進捗" />
                            <div>
                                <span>QR（前進60%から表示）</span>
                                <strong>{Math.round(verificationSnapshot.coupon * 100)}%</strong>
                            </div>
                            <progress value={verificationSnapshot.coupon} max="1" aria-label="QRコードの表示進捗" />
                        </div>
                        <label className="verification-mode">
                            <input
                                type="checkbox"
                                checked={verificationMode}
                                onChange={(event) => handleVerificationMode(event.target.checked)}
                            />
                            手動で動きを再現
                        </label>
                        <label className="verification-range">
                            <span>左右移動 <strong>{verificationPosition.x} cm</strong></span>
                            <input
                                type="range"
                                min={-CONFIG.MAX_VIEWER_X_CM}
                                max={CONFIG.MAX_VIEWER_X_CM}
                                step="1"
                                value={verificationPosition.x}
                                disabled={!verificationMode}
                                onChange={(event) => handleVerificationPosition("x", event.target.value)}
                            />
                        </label>
                        <label className="verification-range">
                            <span>前進 <strong>{Math.round(verificationPosition.depth * 100)}%</strong></span>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                step="1"
                                value={Math.round(verificationPosition.depth * 100)}
                                disabled={!verificationMode}
                                onChange={(event) => handleVerificationPosition("depth", Number(event.target.value) / 100)}
                            />
                        </label>
                        <button className="verification-reset" type="button" onClick={resetVerification}>初期位置に戻す</button>
                        <button
                            className={recording ? "screen-record is-recording" : "screen-record"}
                            type="button"
                            aria-pressed={recording}
                            disabled={recordingStopping}
                            onClick={recording ? stopScreenRecording : startScreenRecording}
                        >
                            {recordingStopping ? "録画を保存中…" : recording ? "画面・カメラ録画を停止して保存" : "画面とカメラの録画を開始"}
                        </button>
                        <p className="recording-note" aria-live="polite">
                            {recordingError || (recording ? "画面はWebM、カメラ映像はAVIで別々に保存します" : "画面共有でこのタブを選ぶと、カメラ映像も同時に記録します")}
                        </p>
                        <p className="verification-current" aria-live="polite">{verificationSnapshot.status}</p>
                    </aside>
                )}
            </div>
        </main>
    );
}
