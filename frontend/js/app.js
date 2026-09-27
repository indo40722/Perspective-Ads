// Perspective Ads - Geekten 2026 prototype
// 画面を「窓」として扱うOff-Axis Projection + 報酬探索UX。

const CONFIG = {
    SCREEN_WIDTH_WORLD: 64,
    SCREEN_HEIGHT_WORLD: 36,

    // 実ディスプレイの概算寸法(cm)。最終的には実機に合わせてキャリブレーションする。
    SCREEN_WIDTH_CM: 53.1,
    SCREEN_HEIGHT_CM: 29.9,
    VIEWER_DISTANCE_CM: 60,

    CAMERA_HFOV_DEG: 60,
    CAMERA_VFOV_DEG: 45,

    TRACKING_GAIN_X: 1.0,
    TRACKING_GAIN_Y: 0.6,
    MAX_VIEWER_X_CM: 40,
    MAX_VIEWER_Y_CM: 20,

    NEAR: 0.1,
    FAR: 1000,

    SMOOTHING: 0.16,
    INPUT_DEADZONE: 0.025,

    // この距離だけ左右に動いたら「発見」とする。
    PEEK_THRESHOLD_CM: 12,

    // 広告空間
    BACKDROP_Z: -55,
    BACKDROP_SCALE: 1.72,

    // 手前の「広告カード」。以前の巨大な箱をやめ、小さな平面にする。
    OCCLUDER_X: 10,
    OCCLUDER_Y: 0,
    OCCLUDER_Z: -12,
    OCCLUDER_WIDTH: 10,
    OCCLUDER_HEIGHT: 14,

    // 奥に隠すのはQRそのものではなく「報酬カード」。
    REWARD_X: 13.6,
    REWARD_Y: 0,
    REWARD_Z: -27,
    REWARD_WIDTH: 8,
    REWARD_HEIGHT: 5.8,
};

let scene;
let camera;
let renderer;
let backdropMesh;
let occluderMesh;
let rewardMesh;

let faceDetected = false;
let rewardUnlocked = false;
let targetViewerCm = { x: 0, y: 0, z: CONFIG.VIEWER_DISTANCE_CM };
let currentViewerCm = { x: 0, y: 0, z: CONFIG.VIEWER_DISTANCE_CM };

const statusEl = document.getElementById('status');
const valueXEl = document.getElementById('val-x');
const valueYEl = document.getElementById('val-y');
const valueZEl = document.getElementById('val-z');
const projectionModeEl = document.getElementById('projection-mode');
const debugInfoEl = document.getElementById('debug-info');
const peekHintEl = document.getElementById('peek-hint');
const rewardOverlayEl = document.getElementById('reward-overlay');

const clampDeadzone = (value, deadzone) => {
    if (Math.abs(value) < deadzone) {
        return 0;
    }
    return value;
};

const lerp = (current, target, amount) => current + (target - current) * amount;

function init() {
    if (!window.OffAxisProjection) {
        throw new Error('OffAxisProjection helper was not loaded.');
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        CONFIG.NEAR,
        CONFIG.FAR
    );

    renderer = new THREE.WebGLRenderer({
        alpha: false,
        antialias: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    document.getElementById('container').appendChild(renderer.domElement);

    createLights();
    createAdScene();

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', onKeyDown);

    setupSocket();
    animate();

    if (projectionModeEl) {
        projectionModeEl.textContent = 'OFF-AXIS / FIXED-Z';
    }
}

function createLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
    keyLight.position.set(20, 30, 40);
    scene.add(keyLight);
}

function createAdScene() {
    const textureLoader = new THREE.TextureLoader();

    // 広告背景は画面全体を埋める。
    const posterTexture = textureLoader.load('assets/poster.png');
    const backdropGeometry = new THREE.PlaneGeometry(
        CONFIG.SCREEN_WIDTH_WORLD * CONFIG.BACKDROP_SCALE,
        CONFIG.SCREEN_HEIGHT_WORLD * CONFIG.BACKDROP_SCALE
    );
    const backdropMaterial = new THREE.MeshBasicMaterial({
        map: posterTexture,
        side: THREE.DoubleSide,
    });

    backdropMesh = new THREE.Mesh(backdropGeometry, backdropMaterial);
    backdropMesh.position.set(0, 0, CONFIG.BACKDROP_Z);
    scene.add(backdropMesh);

    // 巨大な3D箱は見た目を壊すため廃止。
    // 広告の一部に見える小さなカードを手前に置き、その裏に報酬を隠す。
    const occluderGeometry = new THREE.PlaneGeometry(
        CONFIG.OCCLUDER_WIDTH,
        CONFIG.OCCLUDER_HEIGHT
    );
    const occluderMaterial = new THREE.MeshBasicMaterial({
        map: createAdCardTexture(),
        side: THREE.DoubleSide,
    });

    occluderMesh = new THREE.Mesh(occluderGeometry, occluderMaterial);
    occluderMesh.position.set(
        CONFIG.OCCLUDER_X,
        CONFIG.OCCLUDER_Y,
        CONFIG.OCCLUDER_Z
    );
    scene.add(occluderMesh);

    const rewardGeometry = new THREE.PlaneGeometry(
        CONFIG.REWARD_WIDTH,
        CONFIG.REWARD_HEIGHT
    );
    const rewardMaterial = new THREE.MeshBasicMaterial({
        map: createHiddenRewardTexture(),
        side: THREE.DoubleSide,
        transparent: true,
    });

    rewardMesh = new THREE.Mesh(rewardGeometry, rewardMaterial);
    rewardMesh.position.set(
        CONFIG.REWARD_X,
        CONFIG.REWARD_Y,
        CONFIG.REWARD_Z
    );
    scene.add(rewardMesh);
}

function createAdCardTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 1000;

    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 720, 1000);
    gradient.addColorStop(0, '#10233f');
    gradient.addColorStop(1, '#08111f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#56e0ff';
    ctx.lineWidth = 12;
    ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.font = '700 74px Arial';
    ctx.fillText('SIGNATURE', 70, 150);
    ctx.fillText('BURGER', 70, 235);

    ctx.fillStyle = '#56e0ff';
    ctx.font = '700 34px Arial';
    ctx.fillText('TODAY’S PICK', 72, 315);

    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = '34px Arial';
    ctx.fillText('Fresh. Bold. Made for you.', 72, 410);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 118px Arial';
    ctx.fillText('¥690', 68, 610);

    ctx.fillStyle = '#56e0ff';
    ctx.fillRect(70, 735, 580, 100);

    ctx.fillStyle = '#08111f';
    ctx.font = '700 34px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('LIMITED MENU', 360, 800);

    return new THREE.CanvasTexture(canvas);
}

function createHiddenRewardTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 640;

    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 900, 640);
    gradient.addColorStop(0, '#f8ff70');
    gradient.addColorStop(1, '#36ffd1');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#08111f';
    ctx.textAlign = 'center';
    ctx.font = '700 60px Arial';
    ctx.fillText('SECRET COUPON', 450, 150);

    ctx.font = '900 150px Arial';
    ctx.fillText('20% OFF', 450, 360);

    ctx.font = '700 36px Arial';
    ctx.fillText('YOU FOUND IT!', 450, 485);

    return new THREE.CanvasTexture(canvas);
}

function setupSocket() {
    const socket = io();

    socket.on('connect', () => {
        if (statusEl) {
            statusEl.textContent = 'TRACKING';
        }
    });

    socket.on('disconnect', () => {
        if (statusEl) {
            statusEl.textContent = 'DISCONNECTED';
        }
    });

    socket.on('face_data', (data) => {
        faceDetected = true;

        const filteredFace = {
            ...data,
            x: clampDeadzone(data.x ?? 0, CONFIG.INPUT_DEADZONE),
            y: clampDeadzone(data.y ?? 0, CONFIG.INPUT_DEADZONE),
        };

        targetViewerCm = OffAxisProjection.normalizedFaceToViewerCm(
            filteredFace,
            getProjectionConfig()
        );

        if (statusEl) {
            statusEl.textContent = 'FACE DETECTED';
        }
    });

    socket.on('face_lost', () => {
        faceDetected = false;
        targetViewerCm.x = 0;
        targetViewerCm.y = 0;
        targetViewerCm.z = CONFIG.VIEWER_DISTANCE_CM;

        if (statusEl) {
            statusEl.textContent = 'SEARCHING...';
        }
    });
}

function getProjectionConfig() {
    return {
        screenWidthWorld: CONFIG.SCREEN_WIDTH_WORLD,
        screenHeightWorld: CONFIG.SCREEN_HEIGHT_WORLD,
        screenWidthCm: CONFIG.SCREEN_WIDTH_CM,
        screenHeightCm: CONFIG.SCREEN_HEIGHT_CM,
        viewerDistanceCm: CONFIG.VIEWER_DISTANCE_CM,
        cameraHFovDeg: CONFIG.CAMERA_HFOV_DEG,
        cameraVFovDeg: CONFIG.CAMERA_VFOV_DEG,
        trackingGainX: CONFIG.TRACKING_GAIN_X,
        trackingGainY: CONFIG.TRACKING_GAIN_Y,
        maxViewerXcm: CONFIG.MAX_VIEWER_X_CM,
        maxViewerYcm: CONFIG.MAX_VIEWER_Y_CM,
        near: CONFIG.NEAR,
        far: CONFIG.FAR,
    };
}

function updateViewer() {
    currentViewerCm.x = lerp(
        currentViewerCm.x,
        targetViewerCm.x,
        CONFIG.SMOOTHING
    );
    currentViewerCm.y = lerp(
        currentViewerCm.y,
        targetViewerCm.y,
        CONFIG.SMOOTHING
    );
    currentViewerCm.z = lerp(
        currentViewerCm.z,
        targetViewerCm.z,
        CONFIG.SMOOTHING
    );

    const projectionConfig = getProjectionConfig();
    const viewerWorld = OffAxisProjection.viewerCmToWorld(
        currentViewerCm,
        projectionConfig
    );

    OffAxisProjection.apply(camera, viewerWorld, projectionConfig);
}

function updateRewardPresentation() {
    if (!rewardMesh) {
        return;
    }

    // 奥のカードもユーザー側を向かせて読みやすくする。
    rewardMesh.lookAt(camera.position);

    const isPeeking =
        faceDetected &&
        Math.abs(currentViewerCm.x) >= CONFIG.PEEK_THRESHOLD_CM;

    const targetScale = isPeeking ? 1.08 : 1.0;
    const nextScale = lerp(rewardMesh.scale.x, targetScale, 0.12);
    rewardMesh.scale.set(nextScale, nextScale, nextScale);

    if (isPeeking && !rewardUnlocked) {
        unlockReward();
    }
}

function unlockReward() {
    rewardUnlocked = true;

    if (peekHintEl) {
        peekHintEl.classList.add('is-hidden');
    }

    if (rewardOverlayEl) {
        rewardOverlayEl.classList.add('is-visible');
    }
}

function resetReward() {
    rewardUnlocked = false;

    if (peekHintEl) {
        peekHintEl.classList.remove('is-hidden');
    }

    if (rewardOverlayEl) {
        rewardOverlayEl.classList.remove('is-visible');
    }
}

async function toggleFullscreen() {
    try {
        if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
        } else {
            await document.exitFullscreen();
        }
    } catch (error) {
        console.warn('Fullscreen request failed:', error);
    }
}

function onKeyDown(event) {
    if (event.key === 'f' || event.key === 'F') {
        toggleFullscreen();
    }

    if (event.key === 'd' || event.key === 'D') {
        debugInfoEl?.classList.toggle('is-hidden');
    }

    if (event.key === 'r' || event.key === 'R') {
        resetReward();
    }
}

function updateDebugInfo() {
    if (valueXEl) {
        valueXEl.textContent = currentViewerCm.x.toFixed(1);
    }
    if (valueYEl) {
        valueYEl.textContent = currentViewerCm.y.toFixed(1);
    }
    if (valueZEl) {
        valueZEl.textContent = currentViewerCm.z.toFixed(1);
    }

    if (!faceDetected && projectionModeEl) {
        projectionModeEl.textContent = 'OFF-AXIS / RETURNING';
    } else if (projectionModeEl) {
        projectionModeEl.textContent = 'OFF-AXIS / FIXED-Z';
    }
}

function onWindowResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    updateViewer();
    updateRewardPresentation();
    updateDebugInfo();

    renderer.render(scene, camera);
}

init();
