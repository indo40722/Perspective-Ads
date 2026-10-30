import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import QRCode from "qrcode";
import { requestCouponApi } from "./couponApi.js";
import { createShowcase } from "./photoShowcase.js";
import { createAdJourneyTracker, getDetailAtViewer } from "./adJourney.js";
import { resolvePhotoStage, getApproachProgress, getCutProgress } from "./photoInteraction.js";
import { createCouponUrl } from "./couponUrl.js";
import { readOfflineCampaignSnapshot, savePublishedCampaignOffline } from "./offlineCampaign.js";
import { supabaseConfigured } from "./lib/supabase.js";
import { STEAK_AD } from "./steakAd.js";
import { CONFIG } from "./config.js";
import { normalizedFaceToViewerCm } from "./projection.js";
import { createOneEuroFilter, median, removeDeadzone } from "./tracking.js";
import { createBrowserFaceTracker } from "./browserFaceTracker.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const browserTrackingEnabled = import.meta.env.VITE_FACE_TRACKING_SOURCE === "browser";

const createDemoToken = () => {
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export default function App() {
    const containerRef = useRef(null);
    const showcaseRef = useRef(null);
    const [campaign, setCampaign] = useState(STEAK_AD);
    const campaignRef = useRef(STEAK_AD);
    campaignRef.current = campaign;
    const offlineCampaignRef = useRef(false);
    const cloudCacheKeyRef = useRef("");
    const campaignSessionsRef = useRef(new Map());
    const rewardDrawsRef = useRef(new Map());
    const journeyTrackerRef = useRef(null);
    if (!journeyTrackerRef.current) journeyTrackerRef.current = createAdJourneyTracker(CONFIG);
    const [journeyState, setJourneyState] = useState(() => journeyTrackerRef.current.snapshot());
    const [cameraConnected, setCameraConnected] = useState(false);
    const [, setCameraReady] = useState(false);
    const [activeStageIndex, setActiveStageIndex] = useState(0);
    const couponQrMapRef = useRef({});
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
        journey: "見どころ未発見",
        stage: "全体",
        status: "カメラ未接続",
    });
    const [recording, setRecording] = useState(false);
    const [recordingStopping, setRecordingStopping] = useState(false);
    const [recordingError, setRecordingError] = useState("");
    const [browserCameraControlsVisible, setBrowserCameraControlsVisible] = useState(true);
    const [browserCameraBusy, setBrowserCameraBusy] = useState(false);
    const [browserCameraError, setBrowserCameraError] = useState("");
    const [browserCameraDevices, setBrowserCameraDevices] = useState([]);
    const [browserCameraDeviceId, setBrowserCameraDeviceId] = useState("");
    const [status, setStatus] = useState("カメラ未接続・ドラッグ操作ができます");
    const debugVisibleRef = useRef(false);
    const verificationVisibleRef = useRef(false);
    const verificationControlsRef = useRef({ setMode: () => {}, setPosition: () => {}, reset: () => {} });
    const mediaRecorderRef = useRef(null);
    const screenStreamRef = useRef(null);
    const recordingChunksRef = useRef([]);
    const browserCameraRecorderRef = useRef(null);
    const browserCameraChunksRef = useRef([]);
    const browserCameraControlsRef = useRef({ start: async () => {}, stop: () => {}, getStream: () => null });
    const browserCameraControlsVisibleBeforeRecordingRef = useRef(null);
    const recordingStateRef = useRef(false);
    const socketRef = useRef(null);
    const cameraRecordingIdRef = useRef(null);
    const recordingFilenameBaseRef = useRef("");
    const recordingStoppingRef = useRef(false);
    const resetViewRef = useRef(() => {});
    debugVisibleRef.current = debugVisible;
    verificationVisibleRef.current = verificationVisible;
    recordingStateRef.current = recording;
    const sessionIdForCampaign = (campaignId) => {
        if (!campaignSessionsRef.current.has(campaignId)) {
            const storageKey = `perspective-ads-${campaignId}-session`;
            let sessionId = null;
            try {
                sessionId = window.sessionStorage.getItem(storageKey);
            } catch {
                sessionId = null;
            }
            if (!sessionId) {
                sessionId = createDemoToken();
                try {
                    window.sessionStorage.setItem(storageKey, sessionId);
                } catch {
                    sessionId = createDemoToken();
                }
            }
            campaignSessionsRef.current.set(campaignId, sessionId);
        }
        return campaignSessionsRef.current.get(campaignId);
    };

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
        const browserCameraRecorder = browserCameraRecorderRef.current;
        if (!recorder && !recordingId && !browserCameraRecorder) return;

        recordingStoppingRef.current = true;
        setRecordingStopping(true);
        let screenStopped = Promise.resolve();
        if (recorder && recorder.state !== "inactive") {
            screenStopped = new Promise((resolve) => recorder.addEventListener("stop", resolve, { once: true }));
            recorder.stop();
        }
        let cameraStopped = Promise.resolve();
        if (browserCameraRecorder && browserCameraRecorder.state !== "inactive") {
            cameraStopped = new Promise((resolve) => browserCameraRecorder.addEventListener("stop", resolve, { once: true }));
            browserCameraRecorder.stop();
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
            await Promise.all([screenStopped, cameraStopped]);
            screenStreamRef.current?.getTracks().forEach((track) => track.stop());
            screenStreamRef.current = null;
            mediaRecorderRef.current = null;
            browserCameraRecorderRef.current = null;
            setRecording(false);
            recordingStateRef.current = false;
            setRecordingStopping(false);
            recordingStoppingRef.current = false;
            if (browserCameraControlsVisibleBeforeRecordingRef.current !== null) {
                setBrowserCameraControlsVisible(browserCameraControlsVisibleBeforeRecordingRef.current);
                browserCameraControlsVisibleBeforeRecordingRef.current = null;
            }
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
        let browserCameraRecorder;
        let recordingId;
        try {
            if (browserTrackingEnabled && !browserCameraControlsRef.current.getStream()) {
                throw new Error("画面とカメラを録画するには、先にカメラを起動してください");
            }
            browserCameraControlsVisibleBeforeRecordingRef.current = browserCameraControlsVisible;
            setBrowserCameraControlsVisible(false);
            stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            const socketId = socketRef.current?.id;
            if (!browserTrackingEnabled && !socketId) throw new Error("カメラに接続してから録画を開始してください");
            resetVerification();
            verificationControlsRef.current.prepareForRecording?.();
            await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
            const mimeType = typeof MediaRecorder.isTypeSupported === "function"
                ? ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type))
                : undefined;
            recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            if (browserTrackingEnabled) {
                const cameraStream = browserCameraControlsRef.current.getStream();
                browserCameraRecorder = new MediaRecorder(cameraStream, mimeType ? { mimeType } : undefined);
                browserCameraRecorderRef.current = browserCameraRecorder;
                browserCameraChunksRef.current = [];
                recordingFilenameBaseRef.current = `perspective-${new Date().toISOString().replace(/[:.]/g, "-")}`;
                browserCameraRecorder.addEventListener("dataavailable", (event) => {
                    if (event.data.size > 0) browserCameraChunksRef.current.push(event.data);
                });
                browserCameraRecorder.addEventListener("stop", () => {
                    const blob = new Blob(browserCameraChunksRef.current, { type: browserCameraRecorder.mimeType || "video/webm" });
                    downloadRecording(blob, `${recordingFilenameBaseRef.current}-camera.webm`);
                }, { once: true });
                browserCameraRecorder.start(1000);
            } else {
                const started = await cameraRecordingRequest("/api/camera-recording/start", socketId);
                recordingId = started.body.recording_id;
                cameraRecordingIdRef.current = recordingId;
                recordingFilenameBaseRef.current = started.body.filename_base;
            }
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
            recordingStateRef.current = true;
        } catch (error) {
            if (recordingId) {
                const socketId = socketRef.current?.id;
                if (socketId) await cameraRecordingRequest(`/api/camera-recording/${recordingId}/cancel`, socketId).catch(() => {});
            }
            if (browserCameraRecorder && browserCameraRecorder.state !== "inactive") browserCameraRecorder.stop();
            stream?.getTracks().forEach((track) => track.stop());
            screenStreamRef.current = null;
            mediaRecorderRef.current = null;
            browserCameraRecorderRef.current = null;
            cameraRecordingIdRef.current = null;
            setRecording(false);
            recordingStateRef.current = false;
            if (browserCameraControlsVisibleBeforeRecordingRef.current !== null) {
                setBrowserCameraControlsVisible(browserCameraControlsVisibleBeforeRecordingRef.current);
                browserCameraControlsVisibleBeforeRecordingRef.current = null;
            }
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
        const applyCampaign = (nextCampaign, isOffline) => {
            if (cancelled || !nextCampaign?.id) return;
            const cacheKey = `${nextCampaign.id}:${nextCampaign.updatedAt || ""}`;
            if (!isOffline && supabaseConfigured && cloudCacheKeyRef.current !== cacheKey) {
                cloudCacheKeyRef.current = cacheKey;
                savePublishedCampaignOffline(nextCampaign).catch(() => {
                    window.setTimeout(() => {
                        if (cloudCacheKeyRef.current === cacheKey) cloudCacheKeyRef.current = "";
                    }, 30000);
                });
            }
            const current = campaignRef.current;
            if (
                current.id === nextCampaign.id
                && current.updatedAt === nextCampaign.updatedAt
                && offlineCampaignRef.current === isOffline
            ) return;
            offlineCampaignRef.current = isOffline;
            resetViewRef.current();
            setActiveStageIndex(0);
            setCampaign(nextCampaign);
        };
        const refreshActiveCampaign = async () => {
            try {
                const activeCampaign = await requestCouponApi("/api/campaigns/active");
                if (activeCampaign?.id) {
                    applyCampaign(activeCampaign, false);
                    return;
                }
            } catch {
                // 通信できない場合は、端末へ保存した公開広告を確認する。
            }

            try {
                const snapshot = await readOfflineCampaignSnapshot();
                applyCampaign(snapshot?.campaign, true);
            } catch {
                // 保存済み広告がない場合は、初期表示の広告を保つ。
            }
        };
        refreshActiveCampaign();
        const intervalId = window.setInterval(refreshActiveCampaign, 5000);
        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, []);

    useEffect(() => {
        showcaseRef.current?.setProduct(campaign);
    }, [campaign]);

    useEffect(() => {
        let cancelled = false;
        const qrOptions = {
            errorCorrectionLevel: "Q",
            margin: 2,
            width: 420,
            color: { dark: "#142019", light: "#fffdf7" },
        };
        const customUrl = campaign.reward?.qrUrl?.trim();
        const detailImage = campaign.reward?.qrMode === "image" ? campaign.reward?.qrImage : "";
        showcaseRef.current?.setProduct(campaign);
        Promise.all(["grill", "cut"].map(async (detailId) => {
            const url = customUrl || createCouponUrl(
                import.meta.env.VITE_COUPON_URL,
                window.location.href,
                campaign.id,
                detailId
            );
            const dataUrl = detailImage || await QRCode.toDataURL(url, qrOptions);
            return [detailId, { url, dataUrl }];
        })).then((entries) => {
            if (!cancelled) couponQrMapRef.current = Object.fromEntries(entries);
        }).catch(() => {
            if (!cancelled) couponQrMapRef.current = { failed: true };
        });

        return () => {
            cancelled = true;
        };
    }, [campaign]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return undefined;

        const showcase = createShowcase(container, campaignRef.current);
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
        let cutStageTransitionedAt = null;
        let lastJourneyUiKey = "";
        const drawReward = () => {
            const campaignId = campaignRef.current.id;
            const sessionId = sessionIdForCampaign(campaignId);
            const drawState = rewardDrawsRef.current.get(campaignId) || { pending: false, result: null };
            rewardDrawsRef.current.set(campaignId, drawState);
            if (drawState.pending || drawState.result !== null) return;
            drawState.pending = true;
            requestCouponApi("/api/campaigns/reward-draw", {
                method: "POST",
                body: { campaignId, sessionId },
            }).then((result) => {
                drawState.result = Boolean(result.won);
            }).catch(() => {
                const chancePercent = Number(campaignRef.current.reward?.chancePercent ?? 100);
                drawState.result = Math.random() * 100 < chancePercent;
            }).finally(() => {
                drawState.pending = false;
            });
        };
        const createJourneyEventIds = () => ({
            grill: createDemoToken(),
            cut: createDemoToken(),
        });
        let journeyEventIds = createJourneyEventIds();

        const recordJourneyEvent = (eventId, eventType, detailId) => {
            requestCouponApi("/api/coupons/events", {
                method: "POST",
                body: {
                    campaignId: campaignRef.current.id,
                    sessionId: sessionIdForCampaign(campaignRef.current.id),
                    eventId,
                    eventType,
                    detailId,
                },
            }).catch(() => {});
        };

        const targetViewerXRef = { current: 0 };
        const currentViewerXRef = { current: 0 };
        const targetViewerDepthRef = { current: 0 };
        const currentViewerDepthRef = { current: 0 };
        const neutralFaceXRef = { current: null };
        const neutralFaceScaleRef = { current: null };
        const recentFaceXSamples = [];
        const recentFaceScaleSamples = [];
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
            recentFaceXSamples.push(rawX);
            if (recentFaceXSamples.length > CONFIG.CALIBRATION_SAMPLE_COUNT) recentFaceXSamples.shift();
            if (Number.isFinite(faceScale) && faceScale > 0) {
                recentFaceScaleSamples.push(faceScale);
                if (recentFaceScaleSamples.length > 5) recentFaceScaleSamples.shift();
            }
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
            targetViewerDepthRef.current = getApproachProgress(
                median(recentFaceScaleSamples),
                neutralFaceScaleRef.current,
                CONFIG.APPROACH_FACE_SIZE_START_RATIO,
                CONFIG.APPROACH_FACE_SIZE_FULL_RATIO,
            );
            faceDetectedRef.current = true;
            setCameraReady(true);
            statusMessage = "顔位置を追跡中";
            setStatus(statusMessage);
        };

        const handleFaceLost = () => {
            if (verificationModeRef.current) return;
            faceDetectedRef.current = false;
            recentFaceXSamples.length = 0;
            recentFaceScaleSamples.length = 0;
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

        const socket = browserTrackingEnabled ? null : io();
        socketRef.current = socket;
        socket?.on("connect", () => {
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
        socket?.on("disconnect", () => {
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
            recentFaceXSamples.length = 0;
            recentFaceScaleSamples.length = 0;
            calibrationSamples.length = 0;
            calibrationScaleSamples.length = 0;
            if (!verificationModeRef.current) {
                faceDetectedRef.current = false;
                neutralFaceXRef.current = null;
                neutralFaceScaleRef.current = null;
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
        socket?.on("face_data", handleFaceData);
        socket?.on("face_lost", handleFaceLost);
        socket?.on("camera_status", ({ status: cameraStatus } = {}) => {
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

        let browserTracker = null;
        if (browserTrackingEnabled) {
            const wasmRoot = new URL("./assets/mediapipe/wasm/", document.baseURI).href;
            const modelUrl = new URL("./assets/mediapipe/blaze_face_full_range.tflite", document.baseURI).href;
            browserTracker = createBrowserFaceTracker({
                wasmRoot,
                modelUrl,
                onFace: handleFaceData,
                onFaceLost: handleFaceLost,
                onStatus: (cameraStatus, message) => {
                    if (cameraStatus === "ready") {
                        cameraConnectedRef.current = true;
                        cameraDisabledRef.current = false;
                        setCameraConnected(true);
                        if (!faceDetectedRef.current) setStatus("顔を探しています");
                    } else if (cameraStatus === "starting") {
                        setStatus("カメラを起動しています");
                    } else if (cameraStatus === "stopped") {
                        cameraConnectedRef.current = false;
                        faceDetectedRef.current = false;
                        setCameraConnected(false);
                        setCameraReady(false);
                        setStatus("カメラ停止中・ドラッグで操作できます");
                    } else if (cameraStatus === "error") {
                        setBrowserCameraError(message || "顔検出を開始できませんでした");
                    }
                },
            });
            browserCameraControlsRef.current = {
                start: async (deviceId) => {
                    setBrowserCameraBusy(true);
                    setBrowserCameraError("");
                    try {
                        const stream = await browserTracker.start({ deviceId });
                        const devices = (await navigator.mediaDevices.enumerateDevices())
                            .filter((device) => device.kind === "videoinput");
                        setBrowserCameraDevices(devices);
                        setBrowserCameraDeviceId(stream.getVideoTracks()[0]?.getSettings().deviceId || deviceId || "");
                    } catch (error) {
                        const message = error?.name === "NotAllowedError"
                            ? "カメラの使用を許可してください"
                            : error?.name === "NotFoundError"
                                ? "利用できるカメラが見つかりません"
                                : error?.name === "NotReadableError"
                                    ? "他のアプリがカメラを使用中です"
                                    : error?.message || "カメラを起動できませんでした";
                        setBrowserCameraError(message);
                        cameraConnectedRef.current = false;
                        setCameraConnected(false);
                        setStatus(message);
                    } finally {
                        setBrowserCameraBusy(false);
                    }
                },
                stop: () => browserTracker.stop(),
                getStream: () => browserTracker.getStream(),
            };
        }

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
            cutStageTransitionedAt = null;
            journeyEventIds = createJourneyEventIds();
            const resetJourney = journeyTrackerRef.current.reset();
            setJourneyState(resetJourney);
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
                recentFaceXSamples.length = 0;
                recentFaceScaleSamples.length = 0;
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
            prepareForRecording() {
                if (verificationModeRef.current) return;
                const canRecenterOnCurrentFace = faceDetectedRef.current
                    && recentFaceXSamples.length > 0
                    && recentFaceScaleSamples.length > 0;
                neutralFaceXRef.current = canRecenterOnCurrentFace ? median(recentFaceXSamples) : null;
                neutralFaceScaleRef.current = canRecenterOnCurrentFace ? median(recentFaceScaleSamples) : null;
                calibrationSamples.length = 0;
                calibrationScaleSamples.length = 0;
                filter.reset();
                targetViewerXRef.current = 0;
                currentViewerXRef.current = 0;
                targetViewerDepthRef.current = 0;
                currentViewerDepthRef.current = 0;
                setCameraReady(canRecenterOnCurrentFace);
                statusMessage = canRecenterOnCurrentFace ? "顔位置を追跡中" : "録画開始位置を調整しています";
                setStatus(statusMessage);
            },
        };

        const handleKeyDown = (event) => {
            const key = event.key.toLowerCase();
            const activeTag = document.activeElement?.tagName;
            const isEditing = ["INPUT", "TEXTAREA", "SELECT"].includes(activeTag) || document.activeElement?.isContentEditable;
            if (key === "c" && !isEditing && !recordingStateRef.current) {
                setBrowserCameraControlsVisible((value) => !value);
            } else if (key === "d") {
                setDebugVisible((value) => !value);
            } else if (key === "v") {
                setVerificationVisible((value) => !value);
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
            const journey = journeyTrackerRef.current.update(
                currentViewerXRef.current,
                currentViewerDepthRef.current,
                faceDetectedRef.current || verificationModeRef.current || Boolean(pointerDragRef.current) || timeMs < manualInputUntilRef.current,
                timeMs
            );
            const journeyUiKey = `${journey.phase}:${journey.foundDetail ?? ""}`;
            if (journeyUiKey !== lastJourneyUiKey) {
                lastJourneyUiKey = journeyUiKey;
                setJourneyState(journey);
            }
            if (journey.event === "detail-found-grill") {
                recordJourneyEvent(journeyEventIds.grill, "detail_found", "grill");
                drawReward();
            } else if (journey.event === "detail-found-cut") {
                recordJourneyEvent(journeyEventIds.cut, "detail_found", "cut");
                drawReward();
            }

            const rewardDrawState = rewardDrawsRef.current.get(campaignRef.current.id);
            const rewardWon = journey.phase === "revealed" && rewardDrawState?.result === true;

            let nextStageIndex = resolvePhotoStage(
                currentViewerXRef.current,
                currentStageIndex,
                currentViewerDepthRef.current,
                7,
                4.5,
                CONFIG.DETAIL_APPROACH_THRESHOLD,
                CONFIG.DETAIL_APPROACH_EXIT_THRESHOLD,
            );
            if (journey.phase === "revealed") {
                nextStageIndex = rewardWon || journey.foundDetail === "cut" ? 2 : 1;
            }

            if (nextStageIndex !== currentStageIndex) {
                currentStageIndex = nextStageIndex;
                if (nextStageIndex === 2) cutStageTransitionedAt = timeMs;
                else cutStageTransitionedAt = null;
                showcase.setStage(nextStageIndex);
                setActiveStageIndex(nextStageIndex);
            }

            const rewardRevealed = rewardWon
                && currentStageIndex === 2
                && cutStageTransitionedAt !== null
                && timeMs - cutStageTransitionedAt >= CONFIG.COUPON_AFTER_CUT_HOLD_MS;

            const cutProgress = rewardWon || (journey.phase === "revealed" && journey.foundDetail === "cut")
                ? 1
                : getCutProgress(
                    currentViewerDepthRef.current,
                    CONFIG.CUT_REVEAL_START_PROGRESS,
                    CONFIG.CUT_REVEAL_COMPLETE_PROGRESS,
                );
            const couponProgress = rewardRevealed ? 1 : 0;
            const rewardDetail = rewardWon
                ? "cut"
                : journey.foundDetail ?? getDetailAtViewer(
                    currentViewerXRef.current,
                    currentViewerDepthRef.current,
                    CONFIG
                );
            const rewardQr = rewardDetail ? couponQrMapRef.current[rewardDetail] : null;
            showcase.setCutProgress(cutProgress);
            showcase.setRewardReveal({
                progress: journey.phase === "revealed" ? 1 : journey.progress,
                viewerX: currentViewerXRef.current,
                forwardProgress: currentViewerDepthRef.current,
                url: rewardQr?.url ?? "",
                dataUrl: rewardQr?.dataUrl ?? "",
                detail: rewardDetail ?? "",
                interactive: rewardRevealed,
                failed: Boolean(couponQrMapRef.current.failed),
            });
            showcase.setGazeProgress(journey.progress);

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
                    journey: journey.foundDetail ? `${journey.foundDetail === "grill" ? "焼き目" : "断面"}を発見` : "見どころ未発見",
                    stage: campaignRef.current.stages[currentStageIndex].label,
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
            browserTracker?.stop({ notify: false });
            browserCameraControlsRef.current = { start: async () => {}, stop: () => {}, getStream: () => null };
            socket?.disconnect();
            if (socketRef.current === socket) socketRef.current = null;
            showcase.dispose();
            if (showcaseRef.current === showcase) showcaseRef.current = null;
            resetViewRef.current = () => {};
            verificationControlsRef.current = { setMode: () => {}, setPosition: () => {}, reset: () => {} };
        };
    }, []);

    const activeStage = campaign.stages[activeStageIndex];
    const titleForDisplay = campaign.id === "leather-tote"
        ? activeStage.title.replace("、", "、\n")
        : activeStage.title;
    return (
        <main className={`ad-shell${recording ? " is-recording" : ""}`} data-campaign-id={campaign.id} style={{ "--ad-background": campaign.theme?.background || "#24160f", "--campaign-accent": campaign.theme?.accent || "#d8ae73", "--campaign-text": campaign.theme?.text || "#f6eee3" }}>
            <div id="container" ref={containerRef} role="region" aria-label={`視点に合わせて${campaign.itemName}の見どころが変わる写真広告`} />
            <div className="campaign-overlay">
                <section className="campaign-copy" aria-live="polite">
                    <div className="stage-copy" key={activeStageIndex}>
                        <div className="campaign-copy-part campaign-copy-brand">
                            {campaign.itemNameImage
                                ? <img src={campaign.itemNameImage} alt={campaign.itemName} />
                                : <span className="campaign-text-brand">{campaign.itemName}</span>}
                        </div>
                        <h1 className="campaign-copy-part campaign-copy-headline">
                            {activeStage.headlineMode === "image" && activeStage.headlineImage
                                ? <><span className="screen-reader-copy">{activeStage.title.replace("\n", "")}</span><img src={activeStage.headlineImage} alt="" /></>
                                : <span className="campaign-text-headline">{titleForDisplay}</span>}
                        </h1>
                        <div className="campaign-copy-part campaign-copy-support">
                            {activeStage.supportMode === "image" && activeStage.supportImage
                                ? <img src={activeStage.supportImage} alt={`${activeStage.description} ${activeStage.instruction}`} />
                                : <span className="campaign-text-support"><span>{activeStage.description}</span><span>{activeStage.instruction}</span></span>}
                        </div>
                    </div>
                </section>

                {browserTrackingEnabled && browserCameraControlsVisible && (
                    <aside className="browser-camera-control" aria-label="ブラウザーのカメラ設定">
                        <div className="browser-camera-control-heading">
                            <span>カメラ設定</span>
                            <button
                                className="browser-camera-hide"
                                type="button"
                                aria-keyshortcuts="C"
                                onClick={() => setBrowserCameraControlsVisible(false)}
                            >
                                撮影表示（Cで戻す）
                            </button>
                        </div>
                        <button
                            type="button"
                            aria-pressed={cameraConnected}
                            disabled={browserCameraBusy || (cameraConnected && recording)}
                            onClick={() => cameraConnected
                                ? browserCameraControlsRef.current.stop()
                                : browserCameraControlsRef.current.start(browserCameraDeviceId)}
                        >
                            {browserCameraBusy ? "カメラ準備中…" : cameraConnected ? "カメラを停止" : "カメラを起動"}
                        </button>
                        {browserCameraDevices.length > 1 && (
                            <select
                                aria-label="追跡に使うカメラ"
                                value={browserCameraDeviceId}
                                disabled={browserCameraBusy || recording}
                                onChange={async (event) => {
                                    const deviceId = event.target.value;
                                    setBrowserCameraDeviceId(deviceId);
                                    if (cameraConnected) {
                                        browserCameraControlsRef.current.stop();
                                        await browserCameraControlsRef.current.start(deviceId);
                                    }
                                }}
                            >
                                {browserCameraDevices.map((device, index) => (
                                    <option key={device.deviceId} value={device.deviceId}>
                                        {device.label || `カメラ ${index + 1}`}
                                    </option>
                                ))}
                            </select>
                        )}
                        <p aria-live="polite">
                            {browserCameraError || "顔の位置だけを端末内で処理します。映像は送信しません。"}
                        </p>
                    </aside>
                )}

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
                            <div>
                                <dt>体験</dt>
                                <dd>{verificationSnapshot.journey}</dd>
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
                                <span>見どころ発見</span>
                                <strong>{journeyState.foundDetail ? "完了" : "未発見"}</strong>
                            </div>
                            <progress value={journeyState.foundDetail ? 1 : 0} max="1" aria-label="見どころ発見" />
                            <div>
                                <span>QR（見どころ発見後）</span>
                                <strong>{Math.round(verificationSnapshot.coupon * 100)}%</strong>
                            </div>
                            <progress value={verificationSnapshot.coupon} max="1" aria-label="見どころ発見後のQR表示" />
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
                            {recordingError || (recording
                                ? browserTrackingEnabled ? "画面とカメラをWebMで別々に保存しています" : "画面はWebM、カメラ映像はAVIで別々に保存します"
                                : "録画開始時に広告体験を初期化してから記録します")}
                        </p>
                        <p className="verification-current" aria-live="polite">{verificationSnapshot.status}</p>
                    </aside>
                )}
            </div>
        </main>
    );
}
