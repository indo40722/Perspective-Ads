import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import qrCodeUrl from "../assets/qr.png";
import { CONFIG } from "./config.js";
import { normalizedFaceToViewerCm } from "./projection.js";
import { createOneEuroFilter, median, removeDeadzone } from "./tracking.js";
import { createShowcase } from "./showcase.js";

const initialDebugValues = { status: "接続中", x: "0.0", y: "0.0", z: "60.0" };

export default function App() {
    const containerRef = useRef(null);
    const [status, setStatus] = useState("バックエンドへ接続中");
    const [hint, setHint] = useState("カメラを見て、正面で止まってください");
    const [rewardUnlocked, setRewardUnlocked] = useState(false);
    const [debugVisible, setDebugVisible] = useState(false);
    const [debugValues, setDebugValues] = useState(initialDebugValues);
    const statusRef = useRef(status);

    const debugVisibleRef = useRef(false);
    const rewardUnlockedRef = useRef(false);
    const faceDetectedRef = useRef(false);
    const neutralFaceXRef = useRef(null);
    const calibrationSamplesRef = useRef([]);
    const targetViewerXRef = useRef(0);
    const currentViewerXRef = useRef(0);
    const peekHoldStartedAtRef = useRef(null);
    statusRef.current = status;

    useEffect(() => {
        const showcase = createShowcase(containerRef.current);
        const socket = io();
        const filter = createOneEuroFilter({
            minCutoffHz: CONFIG.FILTER_MIN_CUTOFF_HZ,
            speedCoefficient: CONFIG.FILTER_SPEED_COEFFICIENT,
            derivativeCutoffHz: CONFIG.FILTER_DERIVATIVE_CUTOFF_HZ,
        });

        let latestFrameId = -1;
        let previousFrameTimeMs = performance.now();
        let previousDebugTimeMs = 0;
        let animationFrameId = 0;

        const resetReward = () => {
            rewardUnlockedRef.current = false;
            peekHoldStartedAtRef.current = null;
            setRewardUnlocked(false);
        };

        const startCalibration = () => {
            neutralFaceXRef.current = null;
            calibrationSamplesRef.current = [];
            faceDetectedRef.current = false;
            targetViewerXRef.current = 0;
            filter.reset();
            peekHoldStartedAtRef.current = null;
            setStatus("カメラを見て、正面で止まってください");
            setHint("正面位置を調整しています");
        };

        const handleFaceData = (data) => {
            const frameId = Number(data.frame_id);
            if (Number.isFinite(frameId)) {
                if (frameId <= latestFrameId) {
                    return;
                }
                latestFrameId = frameId;
            }

            const rawX = Number(data.x);
            if (!Number.isFinite(rawX)) {
                return;
            }

            if (neutralFaceXRef.current === null) {
                const samples = calibrationSamplesRef.current;
                samples.push(rawX);
                if (samples.length > CONFIG.CALIBRATION_SAMPLE_COUNT) {
                    samples.shift();
                }

                if (samples.length < CONFIG.CALIBRATION_SAMPLE_COUNT) {
                    faceDetectedRef.current = false;
                    setStatus(`正面位置を調整中 ${samples.length}/${CONFIG.CALIBRATION_SAMPLE_COUNT}`);
                    setHint("カメラを見て、正面で止まってください");
                    return;
                }

                const sampleRange = Math.max(...samples) - Math.min(...samples);
                if (sampleRange > CONFIG.CALIBRATION_MAX_RANGE) {
                    faceDetectedRef.current = false;
                    setStatus("顔を止めてください");
                    return;
                }

                neutralFaceXRef.current = median(samples);
                calibrationSamplesRef.current = [];
                filter.reset();
                targetViewerXRef.current = 0;
                faceDetectedRef.current = true;
                setStatus("顔を追跡中");
                setHint("左右に動いて商品を覗いてください");
                return;
            }

            const offsetFromCenter = rawX - neutralFaceXRef.current;
            const deadzoneAdjustedX = removeDeadzone(
                offsetFromCenter,
                CONFIG.INPUT_DEADZONE
            );
            const filteredX = filter.filter(deadzoneAdjustedX, performance.now());
            const viewerPosition = normalizedFaceToViewerCm(
                { x: filteredX },
                CONFIG
            );

            faceDetectedRef.current = true;
            targetViewerXRef.current = viewerPosition.x;
            setStatus("顔を追跡中");
        };

        const handleFaceLost = () => {
            faceDetectedRef.current = false;
            peekHoldStartedAtRef.current = null;

            if (neutralFaceXRef.current === null) {
                calibrationSamplesRef.current = [];
                setHint("カメラを見て、正面で止まってください");
            }

            targetViewerXRef.current = filter.filter(0, performance.now());
            setStatus("顔を探しています");
        };

        const animate = (timeMs) => {
            const elapsedSeconds = Math.min(
                0.1,
                Math.max(0, (timeMs - previousFrameTimeMs) / 1000)
            );
            previousFrameTimeMs = timeMs;

            const followAmount = 1 - Math.exp(-elapsedSeconds / CONFIG.VIEW_FOLLOW_SECONDS);
            currentViewerXRef.current +=
                (targetViewerXRef.current - currentViewerXRef.current) * followAmount;

            const viewerCm = {
                x: currentViewerXRef.current,
                y: 0,
                z: CONFIG.VIEWER_DISTANCE_CM,
            };
            showcase.setViewer(viewerCm);
            showcase.render(timeMs, viewerCm.x);

            const isPeeking =
                faceDetectedRef.current &&
                Math.abs(viewerCm.x) >= CONFIG.PEEK_THRESHOLD_CM;

            if (isPeeking) {
                if (peekHoldStartedAtRef.current === null) {
                    peekHoldStartedAtRef.current = timeMs;
                }
                if (
                    !rewardUnlockedRef.current &&
                    timeMs - peekHoldStartedAtRef.current >= CONFIG.PEEK_HOLD_MS
                ) {
                    rewardUnlockedRef.current = true;
                    setRewardUnlocked(true);
                }
            } else {
                peekHoldStartedAtRef.current = null;
            }

            if (debugVisibleRef.current && timeMs - previousDebugTimeMs >= 120) {
                previousDebugTimeMs = timeMs;
                setDebugValues({
                    status: statusRef.current,
                    x: viewerCm.x.toFixed(1),
                    y: "0.0",
                    z: viewerCm.z.toFixed(1),
                });
            }

            animationFrameId = requestAnimationFrame(animate);
        };

        const handleKeyDown = (event) => {
            const key = event.key.toLowerCase();
            if (key === "f") {
                if (document.fullscreenElement) {
                    document.exitFullscreen().catch(() => {});
                } else {
                    document.documentElement.requestFullscreen().catch(() => {});
                }
            } else if (key === "d") {
                debugVisibleRef.current = !debugVisibleRef.current;
                setDebugVisible(debugVisibleRef.current);
            } else if (key === "r") {
                resetReward();
            } else if (key === "c") {
                startCalibration();
            }
        };

        socket.on("connect", () => {
            latestFrameId = -1;
            setStatus("顔を探しています");
        });
        socket.on("disconnect", () => {
            faceDetectedRef.current = false;
            targetViewerXRef.current = 0;
            peekHoldStartedAtRef.current = null;
            setStatus("バックエンドとの接続が切れました");
        });
        socket.on("face_data", handleFaceData);
        socket.on("face_lost", handleFaceLost);
        window.addEventListener("keydown", handleKeyDown);
        animationFrameId = requestAnimationFrame(animate);

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener("keydown", handleKeyDown);
            socket.disconnect();
            showcase.dispose();
        };
    }, []);

    return (
        <>
            <div id="container" ref={containerRef} />
            <div id="peek-hint" className={rewardUnlocked ? "is-hidden" : ""}>
                ← {hint} →
            </div>
            <div
                id="reward-overlay"
                className={rewardUnlocked ? "is-visible" : ""}
                aria-live="polite"
            >
                <div className="reward-panel">
                    <div className="reward-kicker">クーポンを発見</div>
                    <div className="reward-discount">20% OFF</div>
                    <img src={qrCodeUrl} alt="クーポンのQRコード" />
                    <div className="reward-caption">QRコードを読み取る</div>
                    <div className="reward-reset">Rキーで報酬表示をリセット</div>
                </div>
            </div>
            <div id="debug-info" className={debugVisible ? "" : "is-hidden"}>
                <p>状態: <span id="status">{status || debugValues.status}</span></p>
                <p>視点X (cm): <span id="val-x">{debugValues.x}</span></p>
                <p>視点Y (cm): <span id="val-y">{debugValues.y}</span></p>
                <p>視点Z (cm): <span id="val-z">{debugValues.z}</span></p>
                <p>方式: <span id="projection-mode">左右追跡</span></p>
                <p>F: 全画面 / D: 情報表示 / C: 正面再調整 / R: 報酬リセット</p>
            </div>
        </>
    );
}
