import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import qrCodeUrl from "../assets/qr.png";
import { CONFIG } from "./config.js";
import { createDiscoveryTracker } from "./discovery.js";
import { normalizedFaceToViewerCm } from "./projection.js";
import { createOneEuroFilter, median, removeDeadzone } from "./tracking.js";
import { createShowcase } from "./showcase.js";

const initialDebugValues = { status: "接続中", x: "0.0", y: "0.0", z: "60.0" };
const emptyDiscoveries = { left: false, right: false };
const discoveryDetails = {
    left: { number: "01", name: "炭火焼きパティ", detail: "肉汁を閉じ込めた、二層の厚み。" },
    right: { number: "02", name: "熟成チェダー", detail: "熱でほどける、深いコク。" },
};

export default function App() {
    const containerRef = useRef(null);
    const [status, setStatus] = useState("バックエンドへ接続中");
    const [calibrated, setCalibrated] = useState(false);
    const [discoveries, setDiscoveries] = useState(emptyDiscoveries);
    const [lastDiscovery, setLastDiscovery] = useState(null);
    const [interaction, setInteraction] = useState({ activeSide: null, progress: 0 });
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
    const manualInputUntilRef = useRef(0);
    statusRef.current = status;

    const discoveryCount = Number(discoveries.left) + Number(discoveries.right);
    const allIngredientsFound = discoveryCount === 2;
    const instruction = !calibrated
        ? status
        : rewardUnlocked
            ? "深夜のバーガー、完成。"
            : allIngredientsFound
                ? "正面へ戻して、層を組み上げる"
                : discoveryCount > 0
                    ? "反対側の具材も引き出す"
                    : "左右から覗いて、具材を引き出す";

    useEffect(() => {
        const showcase = createShowcase(containerRef.current);
        const discoveryTracker = createDiscoveryTracker(CONFIG);
        const socket = io();
        const filter = createOneEuroFilter({
            minCutoffHz: CONFIG.FILTER_MIN_CUTOFF_HZ,
            speedCoefficient: CONFIG.FILTER_SPEED_COEFFICIENT,
            derivativeCutoffHz: CONFIG.FILTER_DERIVATIVE_CUTOFF_HZ,
        });

        let latestFrameId = -1;
        let previousFrameTimeMs = performance.now();
        let previousDebugTimeMs = 0;
        let previousInteractionTimeMs = 0;
        let previousInteractionSide = null;
        let previousInteractionProgress = 0;
        let animationFrameId = 0;

        const resetExperience = () => {
            discoveryTracker.reset();
            showcase.resetDiscovery();
            manualInputUntilRef.current = 0;
            rewardUnlockedRef.current = false;
            setDiscoveries({ ...emptyDiscoveries });
            setLastDiscovery(null);
            setInteraction({ activeSide: null, progress: 0 });
            setRewardUnlocked(false);
        };

        const startCalibration = () => {
            resetExperience();
            neutralFaceXRef.current = null;
            calibrationSamplesRef.current = [];
            faceDetectedRef.current = false;
            targetViewerXRef.current = 0;
            filter.reset();
            setCalibrated(false);
            setStatus("正面で静止して位置を調整");
        };

        const handleFaceData = (data) => {
            if (performance.now() < manualInputUntilRef.current) {
                return;
            }

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
                setCalibrated(true);
                setStatus("顔を追跡中");
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
            if (performance.now() < manualInputUntilRef.current) {
                return;
            }

            faceDetectedRef.current = false;

            if (neutralFaceXRef.current === null) {
                calibrationSamplesRef.current = [];
            }

            targetViewerXRef.current = filter.filter(0, performance.now());
            setStatus("顔を探しています");
        };

        const handleCameraStatus = ({ status: cameraStatus } = {}) => {
            if (cameraStatus === "starting") {
                setStatus("カメラを起動しています");
            } else if (cameraStatus === "unavailable") {
                setStatus("カメラを開けません。権限と他アプリの使用状況を確認してください");
            } else if (cameraStatus === "ready" && !faceDetectedRef.current) {
                setStatus("顔を探しています");
            }
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

            const progress = discoveryTracker.update(
                viewerCm.x,
                faceDetectedRef.current,
                timeMs
            );

            if (progress.event === "left-found" || progress.event === "right-found") {
                const side = progress.event === "left-found" ? "left" : "right";
                setDiscoveries(progress.discovered);
                setLastDiscovery(side);
                showcase.setDiscoveries(progress.discovered);
            } else if (progress.event === "completed" && !rewardUnlockedRef.current) {
                rewardUnlockedRef.current = true;
                showcase.finishDiscovery();
                setRewardUnlocked(true);
            }

            if (
                progress.activeSide !== previousInteractionSide ||
                Math.abs(progress.progress - previousInteractionProgress) >= 0.06 ||
                timeMs - previousInteractionTimeMs >= 100
            ) {
                previousInteractionSide = progress.activeSide;
                previousInteractionProgress = progress.progress;
                previousInteractionTimeMs = timeMs;
                setInteraction({
                    activeSide: progress.activeSide,
                    progress: progress.progress,
                });
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
                resetExperience();
            } else if (key === "c") {
                startCalibration();
            } else if (debugVisibleRef.current && ["arrowleft", "arrowright", " "].includes(key)) {
                event.preventDefault();
                manualInputUntilRef.current = performance.now() + 30000;
                faceDetectedRef.current = true;
                setCalibrated(true);
                targetViewerXRef.current = key === "arrowleft"
                    ? -CONFIG.DISCOVERY_SIDE_THRESHOLD_CM - 4
                    : key === "arrowright"
                        ? CONFIG.DISCOVERY_SIDE_THRESHOLD_CM + 4
                        : 0;
                setStatus("キーボードで動作を確認中");
            }
        };

        socket.on("connect", () => {
            latestFrameId = -1;
            setStatus("顔を探しています");
        });
        socket.on("disconnect", () => {
            faceDetectedRef.current = false;
            targetViewerXRef.current = 0;
            setStatus("バックエンドとの接続が切れました");
        });
        socket.on("face_data", handleFaceData);
        socket.on("face_lost", handleFaceLost);
        socket.on("camera_status", handleCameraStatus);
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
            <section
                id="discovery-hud"
                className={rewardUnlocked ? "is-hidden" : ""}
                aria-live="polite"
            >
                <div className="discovery-heading">
                    <div>
                        <span className="discovery-eyebrow">MIDNIGHT / SECRET RECIPE</span>
                        <p className="discovery-instruction">{instruction}</p>
                    </div>
                    <div className="discovery-count" aria-label={`${discoveryCount}/2 発見`}>
                        <strong>{discoveryCount}</strong><span>/ 2</span>
                    </div>
                </div>
                <div className="discovery-steps">
                    {Object.entries(discoveryDetails).map(([side, detail]) => {
                        const found = discoveries[side];
                        const active = interaction.activeSide === side;
                        const holding = active && interaction.progress > 0;
                        return (
                            <div
                                key={side}
                                className={`discovery-step${found ? " is-found" : ""}${active ? " is-active" : ""}`}
                            >
                                <span className="discovery-number">{detail.number}</span>
                                <span className="discovery-name">
                                    <span className="discovery-direction">{side === "left" ? "左" : "右"}から覗く</span>
                                    <strong>{detail.name}</strong>
                                </span>
                                <span className="discovery-state">{found ? "発見" : holding ? "発見中" : "未発見"}</span>
                                <span
                                    className="discovery-meter"
                                    aria-hidden="true"
                                    style={{ transform: `scaleX(${active ? interaction.progress : found ? 1 : 0})` }}
                                />
                            </div>
                        );
                    })}
                </div>
                {lastDiscovery && !allIngredientsFound && (
                    <p className="discovery-reveal" key={lastDiscovery}>
                        <span>発見 {discoveryDetails[lastDiscovery].number}</span>
                        {discoveryDetails[lastDiscovery].detail}
                    </p>
                )}
                {allIngredientsFound && (
                    <>
                        <p className="discovery-reveal is-complete">
                            <span>RECIPE COMPLETE</span>
                            正面に戻って、最後の仕上げを。
                        </p>
                        <div className="discovery-finish-meter" aria-hidden="true">
                            <span style={{ transform: `scaleX(${interaction.activeSide === "center" ? interaction.progress : 0})` }} />
                        </div>
                    </>
                )}
            </section>
            <div
                id="reward-overlay"
                className={rewardUnlocked ? "is-visible" : ""}
                aria-live="polite"
            >
                <div className="reward-panel">
                    <div className="reward-kicker">MIDNIGHT BURGER · 特典</div>
                    <p className="reward-summary">2つの味を見つけたあなたへ</p>
                    <div className="reward-discount">20% OFF</div>
                    <img src={qrCodeUrl} alt="クーポンのQRコード" />
                    <div className="reward-caption">次回のご注文にご利用ください</div>
                    <div className="reward-reset">Rキーでもう一度、味を探す</div>
                </div>
            </div>
            <div id="debug-info" className={debugVisible ? "" : "is-hidden"}>
                <p>状態: <span id="status">{status || debugValues.status}</span></p>
                <p>視点X (cm): <span id="val-x">{debugValues.x}</span></p>
                <p>視点Y (cm): <span id="val-y">{debugValues.y}</span></p>
                <p>視点Z (cm): <span id="val-z">{debugValues.z}</span></p>
                <p>方式: <span id="projection-mode">左右追跡</span></p>
                <p>F: 全画面 / D: 情報表示 / C: 正面再調整 / R: 最初から</p>
                <p>確認用: ← → で味を探す / Space で正面へ戻る</p>
            </div>
        </>
    );
}
