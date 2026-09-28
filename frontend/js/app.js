// Perspective Ads - Geekten 2026 prototype
// 既存ポスター画像の切り抜きに依存せず、広告そのものを3D空間として設計する。

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
    TRACKING_GAIN_Y: 0.55,
    MAX_VIEWER_X_CM: 40,
    MAX_VIEWER_Y_CM: 18,

    NEAR: 0.1,
    FAR: 1000,

    SMOOTHING: 0.16,
    INPUT_DEADZONE: 0.025,

    // 左右へ動いてクーポンを発見したとみなす基準。
    PEEK_THRESHOLD_CM: 11,
    PEEK_HOLD_MS: 650,

    // 3D広告内の主要オブジェクト
    HERO_X: -8,
    HERO_Y: -0.5,
    HERO_Z: -14,

    REWARD_X: -8,
    REWARD_Y: -0.5,
    REWARD_Z: -29,

    BACKDROP_Z: -62,
};

let scene;
let camera;
let renderer;
let heroGroup;
let rewardGroup;
let rewardCard;
let rewardGlow;

let faceDetected = false;
let rewardUnlocked = false;
let peekHoldStartedAt = null;

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
    scene.background = new THREE.Color(0x04070f);

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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;

    document.getElementById('container').appendChild(renderer.domElement);

    createLights();
    createShowcase();

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', onKeyDown);

    setupSocket();
    animate();

    if (projectionModeEl) {
        projectionModeEl.textContent = 'OFF-AXIS / 3D SHOWCASE';
    }
}

function createLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.82);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xfff2dd, 1.15);
    key.position.set(-10, 20, 26);
    key.castShadow = true;
    scene.add(key);

    const rim = new THREE.PointLight(0x55dfff, 0.9, 95);
    rim.position.set(-20, 7, 2);
    scene.add(rim);

    const warm = new THREE.PointLight(0xff8c52, 0.65, 80);
    warm.position.set(13, 4, -6);
    scene.add(warm);
}

function createShowcase() {
    createBackdrop();
    createFloorAndPodium();
    createHeroBurger();
    createHiddenReward();
    createDepthAccents();
}

function createBackdrop() {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 900;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 1600, 900);
    gradient.addColorStop(0, '#07101f');
    gradient.addColorStop(0.56, '#101c38');
    gradient.addColorStop(1, '#081126');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 奥行きを感じるための光の帯。
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#38d7ff';
    ctx.translate(250, 420);
    ctx.rotate(-0.24);
    ctx.fillRect(-500, -65, 1900, 130);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#ff7a52';
    ctx.translate(650, 690);
    ctx.rotate(0.20);
    ctx.fillRect(-500, -46, 1800, 92);
    ctx.restore();

    // 右側は広告コピー。商品自体は3Dなので背景には描かない。
    ctx.fillStyle = '#5ae5ff';
    ctx.font = '700 32px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('PERSPECTIVE ADS / DEMO 01', 930, 205);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 108px Arial';
    ctx.fillText('MIDNIGHT', 925, 350);
    ctx.fillText('BURGER', 925, 455);

    ctx.fillStyle = '#b9c9df';
    ctx.font = '500 34px Arial';
    ctx.fillText('SIGNATURE STACK', 930, 530);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 72px Arial';
    ctx.fillText('¥690', 930, 635);

    ctx.fillStyle = '#5ae5ff';
    ctx.font = '700 26px Arial';
    ctx.fillText('MOVE. PEEK. DISCOVER.', 930, 705);

    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;

    const geometry = new THREE.PlaneGeometry(112, 63);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 0, CONFIG.BACKDROP_Z);
    scene.add(mesh);
}

function createFloorAndPodium() {
    const floorGeometry = new THREE.PlaneGeometry(105, 80);
    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0x07101b,
        roughness: 0.78,
        metalness: 0.12,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -12, -27);
    floor.receiveShadow = true;
    scene.add(floor);

    const podiumGeometry = new THREE.CylinderGeometry(10, 11.2, 1.5, 64);
    const podiumMaterial = new THREE.MeshStandardMaterial({
        color: 0x132640,
        roughness: 0.36,
        metalness: 0.62,
    });
    const podium = new THREE.Mesh(podiumGeometry, podiumMaterial);
    podium.position.set(CONFIG.HERO_X, -8.5, -19);
    podium.receiveShadow = true;
    podium.castShadow = true;
    scene.add(podium);

    const ringGeometry = new THREE.TorusGeometry(9.2, 0.17, 12, 96);
    const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x49ddff,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(CONFIG.HERO_X, -7.68, -19);
    scene.add(ring);
}

function createHeroBurger() {
    heroGroup = new THREE.Group();
    heroGroup.position.set(CONFIG.HERO_X, CONFIG.HERO_Y, CONFIG.HERO_Z);
    heroGroup.rotation.y = -0.08;
    scene.add(heroGroup);

    const bunMaterial = new THREE.MeshStandardMaterial({
        color: 0xd98c3f,
        roughness: 0.56,
        metalness: 0.02,
    });
    const bunHighlightMaterial = new THREE.MeshStandardMaterial({
        color: 0xf2b35f,
        roughness: 0.48,
    });
    const pattyMaterial = new THREE.MeshStandardMaterial({
        color: 0x3a1f18,
        roughness: 0.72,
    });
    const cheeseMaterial = new THREE.MeshStandardMaterial({
        color: 0xffcc3e,
        roughness: 0.42,
    });
    const tomatoMaterial = new THREE.MeshStandardMaterial({
        color: 0xd94a3f,
        roughness: 0.56,
    });
    const lettuceMaterial = new THREE.MeshStandardMaterial({
        color: 0x5dbd4e,
        roughness: 0.7,
    });

    // 下バンズ
    const bottomBun = new THREE.Mesh(
        new THREE.CylinderGeometry(6.7, 7.0, 1.7, 64),
        bunMaterial
    );
    bottomBun.position.y = -3.45;
    bottomBun.castShadow = true;
    bottomBun.receiveShadow = true;
    heroGroup.add(bottomBun);

    // パティ
    const patty = new THREE.Mesh(
        new THREE.CylinderGeometry(6.25, 6.5, 1.45, 64),
        pattyMaterial
    );
    patty.position.y = -1.9;
    patty.castShadow = true;
    heroGroup.add(patty);

    // チーズ。正方形を少し回して角を出す。
    const cheese = new THREE.Mesh(
        new THREE.BoxGeometry(10.8, 0.32, 10.8),
        cheeseMaterial
    );
    cheese.position.y = -0.92;
    cheese.rotation.y = Math.PI / 4;
    cheese.castShadow = true;
    heroGroup.add(cheese);

    // トマト
    const tomato = new THREE.Mesh(
        new THREE.CylinderGeometry(5.9, 5.9, 0.46, 64),
        tomatoMaterial
    );
    tomato.position.y = -0.28;
    heroGroup.add(tomato);

    // レタス
    const lettuce = new THREE.Mesh(
        new THREE.TorusGeometry(5.75, 0.52, 16, 96),
        lettuceMaterial
    );
    lettuce.rotation.x = Math.PI / 2;
    lettuce.position.y = 0.48;
    lettuce.scale.z = 0.82;
    heroGroup.add(lettuce);

    // 上バンズ
    const topBun = new THREE.Mesh(
        new THREE.SphereGeometry(
            7.0,
            64,
            32,
            0,
            Math.PI * 2,
            0,
            Math.PI / 2
        ),
        bunHighlightMaterial
    );
    topBun.scale.y = 0.56;
    topBun.position.y = 1.05;
    topBun.castShadow = true;
    heroGroup.add(topBun);

    createSesameSeeds(heroGroup);

    // 商品名プレート
    const labelTexture = createLabelTexture('SIGNATURE STACK', 'DOUBLE CHEESE / ¥690');
    const label = new THREE.Mesh(
        new THREE.PlaneGeometry(15, 3.7),
        new THREE.MeshBasicMaterial({
            map: labelTexture,
            transparent: true,
            side: THREE.DoubleSide,
        })
    );
    label.position.set(0, -6.8, 0.4);
    heroGroup.add(label);
}

function createSesameSeeds(group) {
    const material = new THREE.MeshStandardMaterial({
        color: 0xffe6ad,
        roughness: 0.7,
    });

    const points = [
        [-3.1, 4.6, 1.3, -0.35],
        [-1.3, 5.1, 2.1, 0.25],
        [0.9, 5.0, 2.25, -0.15],
        [3.0, 4.45, 1.4, 0.32],
        [-2.2, 4.1, 3.1, 0.18],
        [2.1, 4.0, 3.0, -0.28],
        [0.1, 5.25, 0.8, 0.45],
    ];

    for (const [x, y, z, rotationZ] of points) {
        const seed = new THREE.Mesh(
            new THREE.SphereGeometry(0.24, 12, 8),
            material
        );
        seed.scale.set(1.7, 0.55, 0.75);
        seed.position.set(x, y, z);
        seed.rotation.z = rotationZ;
        group.add(seed);
    }
}

function createLabelTexture(title, subtitle) {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(4, 11, 23, 0.80)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#4ce1ff';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = '900 78px Arial';
    ctx.fillText(title, 600, 125);

    ctx.fillStyle = '#72e8ff';
    ctx.font = '700 34px Arial';
    ctx.fillText(subtitle, 600, 205);

    return new THREE.CanvasTexture(canvas);
}

function createHiddenReward() {
    rewardGroup = new THREE.Group();
    rewardGroup.position.set(
        CONFIG.REWARD_X,
        CONFIG.REWARD_Y,
        CONFIG.REWARD_Z
    );
    scene.add(rewardGroup);

    const cardTexture = createRewardTexture();
    const cardMaterial = new THREE.MeshBasicMaterial({
        map: cardTexture,
        side: THREE.DoubleSide,
    });

    rewardCard = new THREE.Mesh(
        new THREE.PlaneGeometry(9.8, 6.3),
        cardMaterial
    );
    rewardGroup.add(rewardCard);

    const frame = new THREE.Mesh(
        new THREE.BoxGeometry(10.5, 7.0, 0.55),
        new THREE.MeshStandardMaterial({
            color: 0x28e7c8,
            emissive: 0x0d715f,
            emissiveIntensity: 0.7,
            roughness: 0.35,
        })
    );
    frame.position.z = -0.5;
    rewardGroup.add(frame);

    rewardGlow = new THREE.PointLight(0x38ffd4, 0.2, 32);
    rewardGlow.position.set(0, 0, 2);
    rewardGroup.add(rewardGlow);
}

function createRewardTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 1000, 640);
    gradient.addColorStop(0, '#efff7a');
    gradient.addColorStop(1, '#38ffd4');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#071321';
    ctx.textAlign = 'center';
    ctx.font = '800 64px Arial';
    ctx.fillText('SECRET COUPON', 500, 140);

    ctx.font = '900 174px Arial';
    ctx.fillText('20% OFF', 500, 370);

    ctx.font = '800 38px Arial';
    ctx.fillText('YOU FOUND IT', 500, 505);

    return new THREE.CanvasTexture(canvas);
}

function createDepthAccents() {
    const materialA = new THREE.MeshBasicMaterial({
        color: 0x31dfff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
    });
    const materialB = new THREE.MeshBasicMaterial({
        color: 0xff795d,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
    });

    const leftBar = new THREE.Mesh(
        new THREE.BoxGeometry(2.5, 30, 2.5),
        materialA
    );
    leftBar.position.set(-28, 0, -38);
    leftBar.rotation.z = -0.16;
    scene.add(leftBar);

    const rightBar = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 26, 2.0),
        materialB
    );
    rightBar.position.set(27, 1, -46);
    rightBar.rotation.z = 0.16;
    scene.add(rightBar);
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
        peekHoldStartedAt = null;

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

function updateShowcase(timeMs) {
    if (heroGroup) {
        // 商品は回転させず、広告空間そのものの視差を体験させる。
        heroGroup.position.y =
            CONFIG.HERO_Y + Math.sin(timeMs * 0.0012) * 0.12;
    }

    if (!rewardGroup) {
        return;
    }

    const peekProgress = Math.min(
        1,
        Math.abs(currentViewerCm.x) / CONFIG.PEEK_THRESHOLD_CM
    );

    if (rewardGlow) {
        rewardGlow.intensity = 0.15 + peekProgress * 1.2;
    }

    const targetScale = 1 + peekProgress * 0.06;
    const nextScale = lerp(rewardGroup.scale.x, targetScale, 0.12);
    rewardGroup.scale.set(nextScale, nextScale, nextScale);

    if (peekHintEl && !rewardUnlocked) {
        peekHintEl.style.opacity = String(
            Math.max(0.28, 1 - peekProgress * 0.58)
        );
    }

    const isPeeking =
        faceDetected &&
        Math.abs(currentViewerCm.x) >= CONFIG.PEEK_THRESHOLD_CM;

    if (isPeeking) {
        if (peekHoldStartedAt === null) {
            peekHoldStartedAt = performance.now();
        }

        if (
            !rewardUnlocked &&
            performance.now() - peekHoldStartedAt >= CONFIG.PEEK_HOLD_MS
        ) {
            unlockReward();
        }
    } else {
        peekHoldStartedAt = null;
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
    peekHoldStartedAt = null;

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
        projectionModeEl.textContent = 'OFF-AXIS / 3D SHOWCASE';
    }
}

function onWindowResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate(timeMs = 0) {
    requestAnimationFrame(animate);

    updateViewer();
    updateShowcase(timeMs);
    updateDebugInfo();

    renderer.render(scene, camera);
}

init();
