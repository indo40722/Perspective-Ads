// Perspective Ads - Frontend Logic
// Implements the "Peeking" interaction stages for anamorphic illusion

// -----------------------------------------------------------------------------
// 1. Configuration & Global State
// -----------------------------------------------------------------------------
const CONFIG = {
    // Camera settings
    // ① Ad fills more of the screen (Closer camera)
    CAMERA_Z: 45, 
    
    // Parallax Factors - how much the camera moves relative to face movement
    // adjusted for closer camera
    PARALLAX_FACTOR_X: 150, // Much Bigger range to easily see behind
    PARALLAX_FACTOR_Y: 0, // Disable vertical movement (Only Left/Right)
    
    // Smoothing (Lerp) factor
    SMOOTHING: 0.1, 

    // Dimensions (16:9 Image)
    POSTER_WIDTH: 64,
    POSTER_HEIGHT: 36,
    
    // QR Code
    QR_SIZE: 15,
    QR_DEPTH: -40, // Push it further back so it's easier to peek around the edge
    
    // Interaction Stages (Deadzone & Sensitivity)
    STAGE1_DEADZONE: 0.2, // Movement below this (20% of screen) does NOTHING.
    STAGE2_SENSITIVITY: 0.4, // In the middle range, move slowly (0.4x speed).
};

// State
let faceData = { x: 0, y: 0, detected: false };
let targetCamPos = { x: 0, y: 0, z: CONFIG.CAMERA_Z };
let currentCamPos = { x: 0, y: 0, z: CONFIG.CAMERA_Z };

// Three.js Globals
let scene, camera, renderer;
let posterMesh, qrMesh;

// DOM Elements
const hudId = document.getElementById('hud-id');
const hudDist = document.getElementById('hud-dist');
const hudReticle = document.getElementById('reticle');

// -----------------------------------------------------------------------------
// 2. Initialization
// -----------------------------------------------------------------------------
function init() {
    // Setup Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.002);

    // Setup Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = CONFIG.CAMERA_Z;

    // Setup Renderer
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.getElementById('container').appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 2); // Soft white light
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(10, 20, 30);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const spotLight = new THREE.SpotLight(0x00aaff, 1);
    spotLight.position.set(-20, 10, 10);
    scene.add(spotLight);

    // Create World Objects
    createPoster();
    createHiddenContent();
    // createEnvironment(); // Removed for simpler look (Request ②)

    // Background color
    scene.background = new THREE.Color(0x050505); // Very dark gray, almost black
    window.addEventListener('resize', onWindowResize, false);
    
    // Start Loops
    setupSocket();
    animate();
}

// -----------------------------------------------------------------------------
// 3. Object Creation
// -----------------------------------------------------------------------------

function createPoster() {
    // Load local image texture
    const textureLoader = new THREE.TextureLoader();
    // Assuming the user places the image at 'assets/poster.png'
    const texture = textureLoader.load('assets/poster.png'); 

    const geometry = new THREE.PlaneGeometry(CONFIG.POSTER_WIDTH, CONFIG.POSTER_HEIGHT);
    const material = new THREE.MeshStandardMaterial({ 
        map: texture,
        side: THREE.DoubleSide,
        roughness: 0.3, // Glossy paper look
        metalness: 0.1
    });

    posterMesh = new THREE.Mesh(geometry, material);
    posterMesh.position.set(0, 0, 0);
    posterMesh.castShadow = true;
    posterMesh.receiveShadow = true;
    
    // Add a physical frame/border
    const frameGeo = new THREE.BoxGeometry(CONFIG.POSTER_WIDTH + 1, CONFIG.POSTER_HEIGHT + 1, 1);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.z = -0.6; // Slightly behind
    posterMesh.add(frame);

    scene.add(posterMesh);
}

function createHiddenContent() {
    // The Hidden QR Code
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Pseudo-QR Pattern
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "black";
    // Corners
    ctx.fillRect(20, 20, 60, 60);
    ctx.fillRect(176, 20, 60, 60);
    ctx.fillRect(20, 176, 60, 60);
    // Random noise
    for(let i=0; i<50; i++) {
        const x = Math.floor(Math.random() * 10) * 20 + 20;
        const y = Math.floor(Math.random() * 10) * 20 + 20;
        ctx.fillRect(x, y, 15, 15);
    }
    ctx.fillStyle = "red";
    ctx.font = "bold 20px Arial";
    ctx.textAlign = "center";
    ctx.fillText("SECRET COUPON", 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    const geometry = new THREE.PlaneGeometry(CONFIG.QR_SIZE, CONFIG.QR_SIZE);
    const material = new THREE.MeshBasicMaterial({ map: texture });

    qrMesh = new THREE.Mesh(geometry, material);
    // Position it BEHIND the poster
    qrMesh.position.set(0, 0, CONFIG.QR_DEPTH); 
    
    // Add a glowing frame to make it noticeable when found
    const frameGeo = new THREE.BoxGeometry(CONFIG.QR_SIZE + 2, CONFIG.QR_SIZE + 2, 1);
    const frameMat = new THREE.MeshStandardMaterial({ 
        color: 0x00ff00, 
        emissive: 0x00ff00,
        emissiveIntensity: 0.5 
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.z = -1;
    qrMesh.add(frame);

    scene.add(qrMesh);
}

function createEnvironment() {
    // Floor grid to show perspective
    const gridHelper = new THREE.GridHelper(200, 20, 0x444444, 0x222222);
    gridHelper.position.y = -50;
    scene.add(gridHelper);

    // Ceiling grid
    const topGrid = new THREE.GridHelper(200, 20, 0x444444, 0x222222);
    topGrid.position.y = 50;
    scene.add(topGrid);
    
    // Particle system (cyberpunk dust)
    const particlesGeo = new THREE.BufferGeometry();
    const particleCount = 200;
    const posArray = new Float32Array(particleCount * 3);
    
    for(let i=0; i < particleCount * 3; i++) {
        posArray[i] = (Math.random() - 0.5) * 200;
        // Keep particles spread out in Z depth
        posArray[i*3 + 2] = (Math.random() - 0.5) * 100 - 20; 
    }
    
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const material = new THREE.PointsMaterial({
        size: 0.5,
        color: 0x00ffff,
        transparent: true,
        opacity: 0.6
    });
    
    const particlesMesh = new THREE.Points(particlesGeo, material);
    scene.add(particlesMesh);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// -----------------------------------------------------------------------------
// 4. Communication (Socket.IO)
// -----------------------------------------------------------------------------
function setupSocket() {
    const socket = io(); 

    socket.on('connect', () => {
        console.log('Connected to backend');
        if(hudId) {
            hudId.innerText = "CONNECTED";
            hudId.style.color = "#00ff00";
        }
    });

    socket.on('face_data', (data) => {
        // data.x, data.y are normalized (-1 to 1)
        faceData = data;
        faceData.detected = true;
        
        // --- Input Processing for Stages ---
        // Apply deadzone and tiered sensitivity
        
        let x = data.x; // Raw input (-1 to 1)
        let processedX = 0;
        
        const absX = Math.abs(x);
        const signX = Math.sign(x);
        
        // Stage 1: Deadzone (Ignore small movements)
        if (absX < CONFIG.STAGE1_DEADZONE) {
            processedX = 0; // Stay perfectly still like a normal poster
        } 
        // Stage 2 & 3: Progressive Movement
        else {
            // Remap input range [DEADZONE, 1.0] to [0, 1.0] for smooth start
            // processedX = (absX - DEADZONE) / (1 - DEADZONE) * signX;
            // But we want non-linear response to feel "heavy" at first
            
            // Current approach:
            // Just subtract deadzone so it starts from 0 at the edge of deadzone
            let activeX = (absX - CONFIG.STAGE1_DEADZONE); 
            
            // Non-linear curve (Quadratic) to make small movements small, big movements big
            // Square the normalized value (activeX is roughly 0.0 to 0.8)
            // Multiplying by sign restores direction
            
            // Simple ease-in
            processedX = (activeX * activeX) * 2.5 * signX; 
        }

        // Apply Parallax
        targetCamPos.x = processedX * CONFIG.PARALLAX_FACTOR_X; 
        targetCamPos.y = 0; // Disable vertical as requested

        // UI Updates
        updateHUD(data);
    });

    socket.on('face_lost', () => {
        faceData.detected = false;
        if(hudId) {
            hudId.innerText = "SEARCHING...";
            hudId.style.color = "red";
        }
        
        // Return to center slowly
        targetCamPos.x = 0;
        targetCamPos.y = 0;
    });
}

function updateHUD(data) {
    if (!hudReticle) return;

    // Reticle Movement (Inverted CSS translate to follow face)
    const moveX = (data.x) * (window.innerWidth / 2);
    const moveY = (data.y) * (window.innerHeight / 2);
    
    hudReticle.style.transform = `translate(${moveX}px, ${moveY}px)`;
    
    if(hudDist) hudDist.innerText = Math.abs(data.z).toFixed(2);
}

// -----------------------------------------------------------------------------
// 5. Animation Loop
// -----------------------------------------------------------------------------
function animate() {
    requestAnimationFrame(animate);

    // Smoothing (Lerp)
    currentCamPos.x += (targetCamPos.x - currentCamPos.x) * CONFIG.SMOOTHING;
    currentCamPos.y += (targetCamPos.y - currentCamPos.y) * CONFIG.SMOOTHING;
    
    camera.position.x = currentCamPos.x;
    camera.position.y = currentCamPos.y;
    camera.lookAt(0, 0, 0); // Always look at center logic

    // --- Interactive Stage Logic ---
    
    // ③ Feel the perspective change (Ad tilts back)
    // When you move, the ad tilts slightly away to enhance the depth feeling
    if (posterMesh) {
        const tiltIntensity = 0.5; // Stronger tilt
        // Rotate the poster slightly opposite to camera movement to expose the side?
        // Or with it? 
        // User request: "Ad tilts back" (Recedes).
        // Let's make it look at the user slightly but lag behind, or tilt away.
        // Tilting away (e.g. Camera Right -> Poster Rot Y Right) exposes the Back Left corner.
        
        posterMesh.rotation.y = (currentCamPos.x / CONFIG.PARALLAX_FACTOR_X) * tiltIntensity;
        // posterMesh.rotation.x = (currentCamPos.y / CONFIG.PARALLAX_FACTOR_Y) * tiltIntensity; // Disable vertical tilt
    }
    
    // ④ QR Reveal Logic
    // QR is hidden behind the poster.
    // It only becomes visible (and active) when the viewing angle is extreme.
    if (qrMesh) {
        // Calculate viewing angle or just use X position threshold
        // At Z=45, Width=64. Edge is at x=32.
        
        const peekThreshold = 40; // Harder to trigger (Stage 3 only)
        const isPeeking = Math.abs(currentCamPos.x) > peekThreshold;
        
        // Always visible physically (occluded by poster geometry)
        qrMesh.visible = true; 

        if (isPeeking) {
             // STAGE 3: Scanning Mode
             // Stop random rotation and face the user directly for readability!
             qrMesh.lookAt(camera.position);
             qrMesh.scale.set(1.2, 1.2, 1.2);
        } else {
            // STAGE 2: Teasing Mode
            // Reset to flat and spin slowly Z-axis to catch attention
             qrMesh.rotation.set(0, 0, Date.now() * 0.002); 
             qrMesh.scale.set(1, 1, 1);
        }
    }

    renderer.render(scene, camera);
}

// Start
init();
