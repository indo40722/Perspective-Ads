import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import burgerModelUrl from "../assets/models/candidates/juzeone-burger.glb?url";
import { applyOffAxisProjection, viewerCmToWorld } from "./projection.js";
import { CONFIG } from "./config.js";

let scene;
let camera;
let renderer;
let heroGroup;
let burgerModel;
let burgerModelScale = 1;
let burgerModelScaleY = 1;
let rewardGroup;
let rewardGlow;
let burgerLayers = [];
let discoveryLabels = {};
let discoveries = { left: false, right: false };
let finished = false;

const lerp = (current, target, amount) => current + (target - current) * amount;

export function createShowcase(container) {
    let disposed = false;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0a08);

    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        CONFIG.NEAR,
        CONFIG.FAR
    );

    renderer = new THREE.WebGLRenderer({
        alpha: false,
        antialias: true,
        powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    resizeRenderer();
    container.appendChild(renderer.domElement);

    discoveries = { left: false, right: false };
    finished = false;
    createLights();
    buildShowcase(() => disposed);
    window.addEventListener("resize", onWindowResize);

    return {
        setViewer(viewerCm) {
            const viewerWorld = viewerCmToWorld(viewerCm, CONFIG);
            applyOffAxisProjection(camera, viewerWorld, CONFIG);
        },
        setDiscoveries(nextDiscoveries) {
            discoveries = { ...nextDiscoveries };
            updateDiscoveryLabels();
        },
        finishDiscovery() {
            finished = true;
            if (rewardGroup) {
                rewardGroup.visible = true;
            }
        },
        resetDiscovery() {
            discoveries = { left: false, right: false };
            finished = false;
            updateDiscoveryLabels();
            if (rewardGroup) {
                rewardGroup.visible = false;
                rewardGroup.scale.setScalar(0.001);
            }
        },
        render(timeMs, viewerXcm) {
            updateShowcase(viewerXcm);
            renderer.render(scene, camera);
        },
        dispose() {
            disposed = true;
            window.removeEventListener("resize", onWindowResize);
            disposeObjectResources(scene);
            renderer.dispose();
            if (renderer.domElement.parentElement === container) {
                container.removeChild(renderer.domElement);
            }
        },
    };
}

function createLights() {
    scene.add(new THREE.HemisphereLight(0xffe8d2, 0x241914, 0.72));

    const key = new THREE.DirectionalLight(0xffd19c, 1.45);
    key.position.set(-16, 18, 20);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xffefe1, 0.3);
    fill.position.set(18, 4, 14);
    scene.add(fill);

    const rim = new THREE.PointLight(0xc75c38, 0.72, 90);
    rim.position.set(20, 10, -7);
    scene.add(rim);
}

function buildShowcase(isDisposed) {
    createBackdrop();
    createHiddenReward();
    createHeroBurger(isDisposed);
}

function createBackdrop() {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 900;
    const ctx = canvas.getContext("2d");

    const gradient = ctx.createLinearGradient(0, 0, 1600, 900);
    gradient.addColorStop(0, "#17120e");
    gradient.addColorStop(0.48, "#100e0c");
    gradient.addColorStop(1, "#090908");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(239, 222, 198, 0.035)";
    ctx.lineWidth = 1;
    for (let x = 56; x < canvas.width; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 48);
        ctx.lineTo(x, 852);
        ctx.stroke();
    }

    ctx.fillStyle = "#bf6946";
    ctx.fillRect(80, 197, 5, 34);
    ctx.fillStyle = "#eee3d2";
    ctx.textAlign = "left";
    ctx.font = '700 24px "Yu Gothic", sans-serif';
    ctx.fillText("MIDNIGHT BURGER", 104, 225);
    ctx.fillStyle = "#9b8d7c";
    ctx.font = '500 17px "Yu Gothic", sans-serif';
    ctx.fillText("AFTER DARK  /  NO. 01", 104, 249);

    ctx.textAlign = "right";
    ctx.fillStyle = "#c1a27d";
    ctx.font = '600 18px "Yu Gothic", sans-serif';
    ctx.fillText("23:00 — 04:00", 1518, 225);

    ctx.strokeStyle = "rgba(192, 153, 115, 0.42)";
    ctx.beginPath();
    ctx.moveTo(838, 194);
    ctx.lineTo(838, 716);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.fillStyle = "#bf6946";
    ctx.font = '700 19px "Yu Gothic", sans-serif';
    ctx.fillText("LATE NIGHT SERIES  /  LIMITED", 914, 286);

    ctx.fillStyle = "#f2eadc";
    ctx.font = '700 93px Georgia, "Yu Mincho", serif';
    ctx.fillText("MIDNIGHT", 908, 410);
    ctx.fillText("BURGER", 908, 516);

    ctx.fillStyle = "#d5c9b8";
    ctx.font = '600 31px "Yu Gothic", sans-serif';
    ctx.fillText("深夜を、満たす。", 914, 588);

    ctx.strokeStyle = "rgba(239, 222, 198, 0.25)";
    ctx.beginPath();
    ctx.moveTo(914, 640);
    ctx.lineTo(1518, 640);
    ctx.stroke();

    ctx.fillStyle = "#f2eadc";
    ctx.font = '700 70px Georgia, "Yu Mincho", serif';
    ctx.fillText("¥690", 910, 682);
    ctx.fillStyle = "#c1a27d";
    ctx.font = '600 17px "Yu Gothic", sans-serif';
    ctx.fillText("DOUBLE CHEESE  /  MADE AFTER DARK", 1120, 680);

    const extendedCanvas = document.createElement("canvas");
    const edgeWidth = 343;
    extendedCanvas.width = canvas.width + edgeWidth * 2;
    extendedCanvas.height = canvas.height;
    const extendedContext = extendedCanvas.getContext("2d");
    extendedContext.fillStyle = "#0c0a08";
    extendedContext.fillRect(0, 0, extendedCanvas.width, extendedCanvas.height);
    extendedContext.drawImage(canvas, 0, 0, 1, canvas.height, 0, 0, edgeWidth, canvas.height);
    extendedContext.drawImage(canvas, edgeWidth, 0);
    extendedContext.drawImage(
        canvas,
        canvas.width - 1,
        0,
        1,
        canvas.height,
        edgeWidth + canvas.width,
        0,
        edgeWidth,
        canvas.height
    );

    const texture = new THREE.CanvasTexture(extendedCanvas);
    texture.encoding = THREE.sRGBEncoding;

    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(160, 63),
        new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
            toneMapped: false,
        })
    );
    mesh.position.z = CONFIG.BACKDROP_Z;
    scene.add(mesh);
}

function createHeroBurger(isDisposed) {
    heroGroup = new THREE.Group();
    heroGroup.position.set(CONFIG.HERO_X, CONFIG.HERO_Y, CONFIG.HERO_Z);
    scene.add(heroGroup);

    burgerModel = null;
    burgerModelScale = 1;
    burgerModelScaleY = 1;
    burgerLayers = [];
    discoveryLabels = {};

    const loader = new GLTFLoader();
    loader.load(
        burgerModelUrl,
        (gltf) => {
            if (isDisposed()) {
                disposeObjectResources(gltf.scene);
                return;
            }

            const modelScene = gltf.scene;
            modelScene.updateMatrixWorld(true);
            const layersByName = new Map();
            const meshNames = [];
            const staticMeshes = [];
            const burgerBounds = new THREE.Box3();
            modelScene.traverse((object) => {
                if (!object.isMesh) {
                    return;
                }

                meshNames.push({ name: object.name, nodeName: object.userData.name });
                const layerName = [object.userData.name, object.name]
                    .map(getBurgerLayerName)
                    .find(Boolean);
                if (layerName) {
                    let layer = layersByName.get(layerName);
                    if (!layer) {
                        layer = { name: layerName, meshes: [], bounds: new THREE.Box3() };
                        layersByName.set(layerName, layer);
                    }
                    layer.meshes.push(object);
                    const meshBounds = new THREE.Box3().setFromObject(object);
                    layer.bounds.union(meshBounds);
                    burgerBounds.union(meshBounds);
                } else {
                    staticMeshes.push(object);
                }

                const materials = Array.isArray(object.material)
                    ? object.material
                    : [object.material];
                for (const material of materials) {
                    if (material?.map) {
                        material.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
                    }
                }
            });

            const hasSixLayers = layersByName.size === 6;
            if (!hasSixLayers) {
                console.warn(
                    "バーガーの具材レイヤーを6種類識別できませんでした。",
                    [...layersByName.keys()],
                    meshNames.slice(0, 12)
                );
            }

            const bounds = hasSixLayers
                ? burgerBounds
                : new THREE.Box3().setFromObject(modelScene);
            const size = bounds.getSize(new THREE.Vector3());
            const center = bounds.getCenter(new THREE.Vector3());
            const scale = Math.min(27 / size.x, 25 / (size.y * 1.22));
            const scaleY = scale * 1.22;

            if (!Number.isFinite(scale) || scale <= 0) {
                console.error("バーガーモデルの寸法を読み取れませんでした。");
                return;
            }

            if (hasSixLayers) {
                for (const mesh of staticMeshes) {
                    mesh.visible = false;
                }
            }

            const layers = hasSixLayers
                ? Array.from(layersByName.values(), (source) => {
                const layer = new THREE.Group();
                const worldCenter = source.bounds.getCenter(new THREE.Vector3());
                layer.name = source.name;
                layer.position.copy(modelScene.worldToLocal(worldCenter.clone()));
                layer.userData.basePosition = layer.position.clone();
                layer.userData.baseRotationZ = layer.rotation.z;
                layer.userData.layerRatio = (worldCenter.y - center.y) / size.y;
                modelScene.add(layer);
                modelScene.updateMatrixWorld(true);
                for (const mesh of source.meshes) {
                    layer.attach(mesh);
                }
                return layer;
            })
                : [];
            layers.sort((a, b) => a.userData.layerRatio - b.userData.layerRatio);
            layers.forEach((layer, index) => {
                layer.userData.centeredIndex = index - (layers.length - 1) / 2;
            });

            burgerModelScale = scale;
            burgerModelScaleY = scaleY;
            burgerModel = new THREE.Group();
            burgerModel.scale.set(scale, scaleY, scale);
            burgerModel.position.set(
                -center.x * scale,
                -center.y * scaleY,
                -center.z * scale
            );
            burgerModel.rotation.y = -0.12;
            burgerModel.add(modelScene);
            heroGroup.add(burgerModel);
            burgerLayers = layers;

            discoveryLabels = {
                left: createDiscoveryLabel(
                    "01 / 炭火焼き",
                    "肉汁を閉じ込めた、二層の厚み。",
                    -6.5,
                    -13.1
                ),
                right: createDiscoveryLabel(
                    "02 / 熟成チェダー",
                    "熱でほどける、深いコク。",
                    6.5,
                    -13.1
                ),
            };
            updateDiscoveryLabels();
        },
        undefined,
        (error) => {
            if (!isDisposed()) {
                console.error("バーガーモデルを読み込めませんでした。", error);
            }
        }
    );
}

function getBurgerLayerName(name) {
    if (/^(bun_down|burger lower toasted bun|lower bun exposed soft crumb)(?:_|$)/i.test(name)) {
        return "lower-bun";
    }
    if (/^(domed upper sesame bun|seated sesame seed|bun|sesame)(?:_|$)/i.test(name)) {
        return "upper-bun";
    }
    if (/^(burger tomato slice|tomat(?:_\d+)?)(?:_|$)/i.test(name)) {
        return "tomato";
    }
    if (/^(ruffled lettuce layer|salat)(?:_|$)/i.test(name)) {
        return "lettuce";
    }
    if (/^(finite draped cheese square|cheese)(?:_|$)/i.test(name)) {
        return "cheese";
    }
    if (/^(irregular browned beef patty|cutlet)(?:_|$)/i.test(name)) {
        return "patty";
    }
    return null;
}

function createDiscoveryLabel(heading, detail, x, y) {
    const canvas = document.createElement("canvas");
    canvas.width = 820;
    canvas.height = 220;
    const context = canvas.getContext("2d");

    context.fillStyle = "rgba(19, 14, 11, 0.94)";
    context.beginPath();
    context.roundRect(2, 2, 816, 216, 8);
    context.fill();
    context.fillStyle = "#c66c4b";
    context.fillRect(2, 2, 8, 216);
    context.textAlign = "left";
    context.fillStyle = "#d59a75";
    context.font = '700 42px "Yu Gothic", sans-serif';
    context.fillText(heading, 38, 82);
    context.fillStyle = "#f2eadc";
    context.font = '600 46px "Yu Gothic", sans-serif';
    context.fillText(detail, 38, 160);

    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    const label = new THREE.Mesh(
        new THREE.PlaneGeometry(12.5, 3.2),
        new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false,
        })
    );
    label.position.set(x, y, 8);
    label.scale.setScalar(0.001);
    label.renderOrder = 20;
    label.visible = false;
    heroGroup.add(label);
    return label;
}

function updateDiscoveryLabels() {
    for (const [side, label] of Object.entries(discoveryLabels)) {
        if (!label) {
            continue;
        }
        if (discoveries[side]) {
            label.visible = true;
        } else {
            label.visible = false;
            label.scale.setScalar(0.001);
            label.material.opacity = 0;
        }
    }
}

function createHiddenReward() {
    rewardGroup = new THREE.Group();
    rewardGroup.position.set(
        CONFIG.REWARD_X,
        CONFIG.REWARD_Y,
        CONFIG.REWARD_Z
    );
    rewardGroup.visible = false;
    rewardGroup.scale.setScalar(0.001);
    scene.add(rewardGroup);

    const frame = new THREE.Mesh(
        new THREE.BoxGeometry(10.8, 7.3, 0.55),
        new THREE.MeshStandardMaterial({
            color: 0xa96a43,
            metalness: 0.62,
            roughness: 0.36,
            emissive: 0x241007,
            emissiveIntensity: 0.16,
        })
    );
    frame.position.z = -0.42;
    rewardGroup.add(frame);

    const card = new THREE.Mesh(
        new THREE.PlaneGeometry(10.2, 6.7),
        new THREE.MeshBasicMaterial({
            map: createRewardTexture(),
            side: THREE.DoubleSide,
            toneMapped: false,
        })
    );
    card.position.z = -0.05;
    rewardGroup.add(card);

    rewardGlow = new THREE.PointLight(0xd17a4d, 0, 26);
    rewardGlow.position.z = 1.2;
    rewardGroup.add(rewardGlow);
}

function createRewardTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 780;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#eee4d4";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#a84f35";
    ctx.fillRect(0, 0, 18, canvas.height);

    ctx.fillStyle = "#6b4a37";
    ctx.textAlign = "left";
    ctx.font = '700 40px "Yu Gothic", sans-serif';
    ctx.fillText("MIDNIGHT BURGER  /  REWARD", 78, 112);

    ctx.fillStyle = "#1a1713";
    ctx.textAlign = "center";
    ctx.font = '700 164px Georgia, "Yu Mincho", serif';
    ctx.fillText("20% OFF", 610, 360);

    ctx.strokeStyle = "rgba(53, 42, 32, 0.3)";
    ctx.beginPath();
    ctx.moveTo(120, 430);
    ctx.lineTo(1100, 430);
    ctx.stroke();

    ctx.fillStyle = "#3f352b";
    ctx.font = '600 42px "Yu Gothic", sans-serif';
    ctx.fillText("次回のご注文に", 610, 520);

    ctx.fillStyle = "#a84f35";
    ctx.font = '700 35px "Yu Gothic", sans-serif';
    ctx.fillText("NIGHT20", 610, 640);

    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    return texture;
}

function updateShowcase(viewerXcm) {
    if (heroGroup) {
        const finishedScale = finished ? 1.025 : 1;
        const scale = lerp(heroGroup.scale.x, finishedScale, 0.045);
        heroGroup.scale.setScalar(scale);
    }

    updateBurgerParts(viewerXcm);
    for (const label of Object.values(discoveryLabels)) {
        if (label?.visible) {
            const scale = lerp(label.scale.x, 1, 0.13);
            label.scale.setScalar(scale);
            label.material.opacity = lerp(label.material.opacity, 1, 0.13);
        }
    }

    if (rewardGroup?.visible) {
        const nextScale = lerp(rewardGroup.scale.x, 1, 0.085);
        rewardGroup.scale.setScalar(nextScale);
        if (rewardGlow) {
            rewardGlow.intensity = lerp(rewardGlow.intensity, 0.82, 0.08);
        }
    }
}

function updateBurgerParts(viewerXcm) {
    if (!burgerLayers.length || !burgerModel) {
        return;
    }

    const discoveryStart = CONFIG.DISCOVERY_CENTER_THRESHOLD_CM;
    const discoveryEnd = CONFIG.DISCOVERY_SIDE_THRESHOLD_CM;
    const rawAmount = Math.min(
        1,
        Math.max(0, (Math.abs(viewerXcm) - discoveryStart) / (discoveryEnd - discoveryStart))
    );
    const amount = rawAmount * rawAmount * (3 - 2 * rawAmount);
    const lateralDirection = viewerXcm < 0 ? 1 : -1;

    for (const part of burgerLayers) {
        const centeredIndex = part.userData.centeredIndex;
        const basePosition = part.userData.basePosition;
        const depthOffset = centeredIndex * 0.9 * amount / burgerModelScale;
        const verticalOffset = centeredIndex * 3 * amount / burgerModelScaleY;
        const lateralOffset = lateralDirection * centeredIndex * 1.1 * amount / burgerModelScale;

        part.position.x = lerp(part.position.x, basePosition.x + lateralOffset, 0.14);
        part.position.y = lerp(part.position.y, basePosition.y + verticalOffset, 0.14);
        part.position.z = lerp(part.position.z, basePosition.z + depthOffset, 0.14);
        part.rotation.z = lerp(
            part.rotation.z,
            part.userData.baseRotationZ + centeredIndex * lateralDirection * 0.05 * amount,
            0.14
        );
    }
}

function disposeObjectResources(root) {
    root.traverse((object) => {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
        for (const material of materials) {
            if (!material) {
                continue;
            }
            for (const value of Object.values(material)) {
                if (value?.isTexture) {
                    value.dispose();
                }
            }
            material.dispose();
        }
    });
}

function onWindowResize() {
    resizeRenderer();
}

function resizeRenderer() {
    const targetAspect = CONFIG.SCREEN_WIDTH_WORLD / CONFIG.SCREEN_HEIGHT_WORLD;
    let width = window.innerWidth;
    let height = window.innerHeight;

    if (width / height > targetAspect) {
        width = height * targetAspect;
    } else {
        height = width / targetAspect;
    }

    renderer.setSize(Math.floor(width), Math.floor(height));
}
