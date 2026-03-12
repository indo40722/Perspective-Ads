// --- 設定 ---
const SOCKET_URL = "http://localhost:8000";

// --- グローバル変数 ---
let camera, scene, renderer;
let cube, plane;
let targetX = 0, targetY = 0;
let currentX = 0, currentY = 0;

// --- 初期化 ---
function init() {
    // シーン作成
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    // カメラ作成
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    // レンダラー作成
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('container').appendChild(renderer.domElement);

    // --- コンテンツ作成 ---
    
    // 1. 真ん中の箱（広告の主役）
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    // 複数のマテリアルで面ごとに色を変える
    const materials = [
        new THREE.MeshBasicMaterial({ color: 0xff0000 }), // 右
        new THREE.MeshBasicMaterial({ color: 0x00ff00 }), // 左
        new THREE.MeshBasicMaterial({ color: 0x0000ff }), // 上
        new THREE.MeshBasicMaterial({ color: 0xffff00 }), // 下
        new THREE.MeshBasicMaterial({ color: 0xff00ff }), // 前
        new THREE.MeshBasicMaterial({ color: 0x00ffff })  // 後
    ];
    cube = new THREE.Mesh(geometry, materials);
    scene.add(cube);

    // 2. 背景のグリッド（奥行き感を強調するため）
    const gridHelper = new THREE.GridHelper(20, 20);
    gridHelper.position.y = -2;
    scene.add(gridHelper);
    
    // 3. 遠景の壁（パララックス比較用）
    const planeGeo = new THREE.PlaneGeometry(20, 10);
    const planeMat = new THREE.MeshBasicMaterial({ color: 0x444444, side: THREE.DoubleSide });
    plane = new THREE.Mesh(planeGeo, planeMat);
    plane.position.z = -5;
    scene.add(plane);

    // ライト
    const light = new THREE.PointLight(0xffffff, 1, 100);
    light.position.set(5, 5, 5);
    scene.add(light);
    const ambientLight = new THREE.AmbientLight(0x404040); 
    scene.add(ambientLight);

    // ウィンドウリサイズ対応
    window.addEventListener('resize', onWindowResize, false);

    // アニメーション開始
    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- アニメーションループ ---
function animate() {
    requestAnimationFrame(animate);

    // カメラ位置のスムージング（補間）
    // targetX, targetY は Socket.IO から更新される
    // 慣性をつけて滑らかに動かす
    currentX += (targetX - currentX) * 0.1;
    currentY += (targetY - currentY) * 0.1;

    // パララックス効果の適用
    // ユーザーが右(正)に動いたら、カメラも右(正)に動かすことで、
    // 画面内のオブジェクトの左側面が見えるようになる（＝窓を覗き込む感覚）
    // 係数 (Scale Factor) は調整が必要
    camera.position.x = currentX * 5; 
    camera.position.y = currentY * 3;
    
    // 常に中心（0,0,0）を見る
    camera.lookAt(0, 0, 0);

    // オブジェクト自体も少し回転させるとより効果的
    // cube.rotation.x += 0.01;
    // cube.rotation.y += 0.01;

    renderer.render(scene, camera);
}

// --- Socket.IO 通信 ---
const socket = io(SOCKET_URL, {
    transports: ['websocket'] 
});

const statusEl = document.getElementById('status');
const valXEl = document.getElementById('val-x');
const valYEl = document.getElementById('val-y');
const valZEl = document.getElementById('val-z');

socket.on('connect', () => {
    statusEl.innerHTML = "Connected";
    statusEl.style.color = "lime";
});

socket.on('disconnect', () => {
    statusEl.innerHTML = "Disconnected";
    statusEl.style.color = "red";
});

socket.on('face_data', (data) => {
    // data: {x, y, z, ...}
    // x, y は正規化された値 (-1.0 ~ 1.0)
    
    // 受信した値をターゲットに設定
    // カメラのミラーリング等を考慮して符号を反転させるか決める
    // ここではそのまま代入し、動きが逆ならマイナスをつける
    targetX = -data.x; // 左右反転
    targetY = -data.y; // 上下反転（カメラ座標系による）

    // デバッグ表示更新
    valXEl.innerText = data.x.toFixed(3);
    valYEl.innerText = data.y.toFixed(3);
    valZEl.innerText = data.z.toFixed(3);
});

// 開始
init();
