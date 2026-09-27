// Perspective Ads - Geekten 2026 prototype
// 画面を「窓」として扱うOff-Axis Projection + 広告内レイヤー探索UX。

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

    // 左右へこの程度動けば「報酬発見」。
    PEEK_THRESHOLD_CM: 11,

    // 背景広告
    BACKDROP_Z: -55,
    BACKDROP_SCALE: 1.72,

    // バーガー前景レイヤー。
    // poster.png上のバーガー周辺を切り出し、楕円マスクして手前へ置く。
    FOREGROUND_X: -9.5,
    FOREGROUND_Y: -1.5,
    FOREGROUND_Z: -12,
    FOREGROUND_WIDTH: 24,
    FOREGROUND_HEIGHT: 17.5,

    // 切り出し領域（画像サイズに対する比率 / 左上基準）
    BURGER_CROP_X: 0.245,
    BURGER_CROP_Y: 0.31,
    BURGER_CROP_W: 0.31,
    BURGER_CROP_H: 0.43,

    // バーガーの奥に隠すクーポンカード
    REWARD_X: -4,
    REWARD_Y: -1.0,
    REWARD_Z: -28,
    REWARD_WIDTH: 9.5,
    REWARD_HEIGHT: 6.2,
};

let scene;
let camera;
let renderer;
let backdropMesh;
let foregroundBurgerMesh;
let foregroundShadowMesh;
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
        projectionModeEl.textContent = 'OFF-AXIS / LAYERED AD';
    }
}

function createLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(20, 30, 40);
    scene.add(keyLight);
}

function createAdScene() {
    const textureLoader = new THREE.TextureLoader();

    const posterTexture = textureLoader.load(
        'assets/poster.png',
        (texture) => {
            // 背景と同じ元画像からバーガー部分を切り出すので、
            // 正面では元画像とほぼ重なって見える。
            createForegroundBurger(texture);
        }
    );

    // 背景広告は画面全体を埋める。
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

    createHiddenReward();
}

function createForegroundBurger(posterTexture) {
    const image = posterTexture.image;

    if (!image || !image.width || !image.height) {
        console.warn('poster.png is not ready for foreground extraction.');
        return;
    }

    const cropX = Math.round(image.width * CONFIG.BURGER_CROP_X);
    const cropY = Math.round(image.height * CONFIG.BURGER_CROP_Y);
    const cropW = Math.round(image.width * CONFIG.BURGER_CROP_W);
    const cropH = Math.round(image.height * CONFIG.BURGER_CROP_H);

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 768;

    const ctx = canvas.getContext('2d');

    // 少し横長の楕円でバーガー周辺だけを前景化する。
    // 完全な切り抜きではなく「前景レイヤーのPoC」として自然な範囲を残す。
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(
        canvas.width * 0.50,
        canvas.height * 0.52,
        canvas.width * 0.48,
        canvas.height * 0.42,
        -0.04,
        0,
        Math.PI * 2
    );
    ctx.clip();

    ctx.drawImage(
        image,
        cropX,
        cropY,
        cropW,
        cropH,
        0,
        0,
        canvas.width,
        canvas.height
    );
    ctx.restore();

    // エッジを少し暗くして矩形の切り抜き感を弱める。
    const edge = ctx.createRadialGradient(
        canvas.width * 0.5,
        canvas.height * 0.5,
        canvas.width * 0.20,
        canvas.width * 0.5,
        canvas.height * 0.5,
        canvas.width * 0.58
    );
    edge.addColorStop(0, 'rgba(255,255,255,1)');
    edge.addColorStop(0.78, 'rgba(255,255,255,1)');
    edge.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';

    const burgerTexture = new THREE.CanvasTexture(canvas);
    burgerTexture.minFilter = THREE.LinearFilter;
    burgerTexture.magFilter = THREE.LinearFilter;

    const geometry = new THREE.PlaneGeometry(
        CONFIG.FOREGROUND_WIDTH,
        CONFIG.FOREGROUND_HEIGHT
    );

    const material = new THREE.MeshBasicMaterial({
        map: burgerTexture,
        transparent: true,
        alphaTest: 0.02,
        side: THREE.DoubleSide,
        depthWrite: true,
    });

    foregroundBurgerMesh = new THREE.Mesh(geometry, material);
    foregroundBurgerMesh.position.set(
        CONFIG.FOREGROUND_X,
        CONFIG.FOREGROUND_Y,
        CONFIG.FOREGROUND_Z
    );
    scene.add(foregroundBurgerMesh);

    // バーガーの裏側にごく薄い影を入れて、広告内のレイヤー感を出す。
    const shadowGeometry = new THREE.PlaneGeometry(
        CONFIG.FOREGROUND_WIDTH * 0.90,
        CONFIG.FOREGROUND_HEIGHT * 0.84
    );
    const shadowMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.20,
        depthWrite: false,
    });

    foregroundShadowMesh = new THREE.Mesh(shadowGeometry, shadowMaterial);
    foregroundShadowMesh.position.set(
        CONFIG.FOREGROUND_X + 0.5,
        CONFIG.FOREGROUND_Y - 0.3,
        CONFIG.FOREGROUND_Z - 0.8
    );
    scene.add(foregroundShadowMesh);
}

function createHiddenReward() {
    const geometry = new THREE.PlaneGeometry(
        CONFIG.REWARD_WIDTH,
        CONFIG.REWARD_HEIGHT
    );

    const material = new THREE.MeshBasicMaterial({
        map: createHiddenRewardTexture(),
        side: THREE.DoubleSide,
        transparent: true,
    });

    rewardMesh = new THREE.Mesh(geometry, material);
    rewardMesh.position.set(
        CONFIG.REWARD_X,
        CONFIG.REWARD_Y,
        CONFIG.REWARD_Z
    );
    scene.add(rewardMesh);
}

function createHiddenRewardTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 600;

    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 900, 600);
    gradient.addColorStop(0, '#ffe95c');
    gradient.addColorStop(1, '#38ffd2');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#071321';
    ctx.lineWidth = 22;
    ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

    ctx.fillStyle = '#071321';
    ctx.textAlign = 'center';
    ctx.font = '800 58px Arial';
    ctx.fillText('SECRET COUPON', 450, 130);

    ctx.font = '900 150px Arial';
    ctx.fillText('20% OFF', 450, 335);

    ctx.font = '800 34px Arial';
    ctx.fillText('PEEK FOUND!', 450, 465);

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

    rewardMesh.lookAt(camera.position);

    // 正面ではバーガー前景の裏に隠れ、身体を横へ動かすと端から見える。
    const peekProgress = Math.min(
        1,
        Math.abs(currentViewerCm.x) / CONFIG.PEEK_THRESHOLD_CM
    );

    const targetScale = 1 + peekProgress * 0.08;
    const nextScale = lerp(rewardMesh.scale.x, targetScale, 0.12);
    rewardMesh.scale.set(nextScale, nextScale, nextScale);

    const isPeeking =
        faceDetected &&
        Math.abs(currentViewerCm.x) >= CONFIG.PEEK_THRESHOLD_CM;

    if (peekHintEl && !rewardUnlocked) {
        peekHintEl.style.opacity = String(Math.max(0.25, 1 - peekProgress * 0.55));
    }

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
        peekHintEl.style.opacity = '';
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
        projectionModeEl.textContent = 'OFF-AXIS / LAYERED AD';
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
