// Perspective Ads - Geekten 2026 prototype
// 視点位置に基づくOff-Axis Projectionの初期実装。

const CONFIG = {
    // 仮想スクリーン（Three.jsワールド座標）
    SCREEN_WIDTH_WORLD: 64,
    SCREEN_HEIGHT_WORLD: 36,

    // 実ディスプレイの概算寸法(cm)
    // 使用するモニターに合わせてキャリブレーションする。
    SCREEN_WIDTH_CM: 53.1,
    SCREEN_HEIGHT_CM: 29.9,

    // 現段階ではZ実距離を推定していないため固定距離で扱う。
    VIEWER_DISTANCE_CM: 60,

    // 一般的なWebカメラを仮定した概算FOV。
    CAMERA_HFOV_DEG: 60,
    CAMERA_VFOV_DEG: 45,

    TRACKING_GAIN_X: 1.0,
    TRACKING_GAIN_Y: 0.75,
    MAX_VIEWER_X_CM: 40,
    MAX_VIEWER_Y_CM: 25,

    NEAR: 0.1,
    FAR: 1000,

    // 顔座標の簡易平滑化。
    SMOOTHING: 0.16,
    INPUT_DEADZONE: 0.025,

    // 報酬発見の目安。実際の見え方は3D遮蔽で決まる。
    PEEK_THRESHOLD_CM: 18,

    // 仮想広告空間
    BACKDROP_Z: -55,
    BACKDROP_SCALE: 1.72,
    OCCLUDER_X: 4,
    OCCLUDER_Z: -16,
    OCCLUDER_WIDTH: 26,
    OCCLUDER_HEIGHT: 28,
    OCCLUDER_DEPTH: 8,
    QR_X: 18,
    QR_Y: 0,
    QR_Z: -30,
    QR_SIZE: 10,
};

let scene;
let camera;
let renderer;
let backdropMesh;
let occluderMesh;
let qrMesh;

let faceDetected = false;
let targetViewerCm = { x: 0, y: 0, z: CONFIG.VIEWER_DISTANCE_CM };
let currentViewerCm = { x: 0, y: 0, z: CONFIG.VIEWER_DISTANCE_CM };

const statusEl = document.getElementById('status');
const valueXEl = document.getElementById('val-x');
const valueYEl = document.getElementById('val-y');
const valueZEl = document.getElementById('val-z');
const projectionModeEl = document.getElementById('projection-mode');

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
    scene.background = new THREE.Color(0x050505);

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

    setupSocket();
    animate();

    if (projectionModeEl) {
        projectionModeEl.textContent = 'OFF-AXIS / FIXED-Z';
    }
}

function createLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(20, 30, 40);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const accentLight = new THREE.PointLight(0x55aaff, 0.8, 180);
    accentLight.position.set(-25, 18, 15);
    scene.add(accentLight);
}

function createAdScene() {
    const textureLoader = new THREE.TextureLoader();

    // スクリーンそのものは描画物ではなく「窓」として扱う。
    // 広告画像は画面奥に配置し、頭を動かしたときに空間の奥行きが見えるようにする。
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

    // 手前の遮蔽物。正面ではこの裏にある報酬を見えなくする。
    const occluderGeometry = new THREE.BoxGeometry(
        CONFIG.OCCLUDER_WIDTH,
        CONFIG.OCCLUDER_HEIGHT,
        CONFIG.OCCLUDER_DEPTH
    );
    const occluderMaterial = new THREE.MeshStandardMaterial({
        color: 0x11151c,
        roughness: 0.5,
        metalness: 0.15,
    });

    occluderMesh = new THREE.Mesh(occluderGeometry, occluderMaterial);
    occluderMesh.position.set(CONFIG.OCCLUDER_X, 0, CONFIG.OCCLUDER_Z);
    occluderMesh.castShadow = true;
    occluderMesh.receiveShadow = true;
    scene.add(occluderMesh);

    createReward(textureLoader);

    // 空間の奥行きを認識しやすくする控えめなフレーム。
    const frameGeometry = new THREE.BoxGeometry(
        CONFIG.SCREEN_WIDTH_WORLD + 2,
        CONFIG.SCREEN_HEIGHT_WORLD + 2,
        1
    );
    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0x181818,
        roughness: 0.4,
    });
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    frame.position.set(0, 0, -1.2);
    scene.add(frame);
}

function createReward(textureLoader) {
    const geometry = new THREE.PlaneGeometry(CONFIG.QR_SIZE, CONFIG.QR_SIZE);

    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
    });

    qrMesh = new THREE.Mesh(geometry, material);
    qrMesh.position.set(CONFIG.QR_X, CONFIG.QR_Y, CONFIG.QR_Z);
    scene.add(qrMesh);

    textureLoader.load(
        'assets/qr.png',
        (texture) => {
            qrMesh.material.map = texture;
            qrMesh.material.needsUpdate = true;
        },
        undefined,
        () => {
            // qr.pngが読めない場合でもPoCを止めないためのフォールバック。
            qrMesh.material.map = createFallbackCouponTexture();
            qrMesh.material.needsUpdate = true;
        }
    );

    const glowGeometry = new THREE.BoxGeometry(
        CONFIG.QR_SIZE + 1.2,
        CONFIG.QR_SIZE + 1.2,
        0.8
    );
    const glowMaterial = new THREE.MeshStandardMaterial({
        color: 0x00c853,
        emissive: 0x006b2b,
        emissiveIntensity: 0.8,
        roughness: 0.4,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.z = -0.6;
    qrMesh.add(glow);
}

function createFallbackCouponTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#101010';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SECRET', 256, 210);
    ctx.fillText('COUPON', 256, 280);

    ctx.fillStyle = '#00a844';
    ctx.fillRect(110, 330, 292, 70);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('FOUND!', 256, 376);

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
    if (!qrMesh) {
        return;
    }

    // QRは空間内のビルボードとしてユーザー側を向く。
    qrMesh.lookAt(camera.position);

    const isPeeking = Math.abs(currentViewerCm.x) >= CONFIG.PEEK_THRESHOLD_CM;
    const targetScale = isPeeking ? 1.08 : 1.0;
    const nextScale = lerp(qrMesh.scale.x, targetScale, 0.12);
    qrMesh.scale.set(nextScale, nextScale, nextScale);
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
    // Off-Axis Projectionではaspectから射影を作らず、
    // 毎フレーム実スクリーン寸法からprojection matrixを再計算する。
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
