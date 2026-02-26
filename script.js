
/* //////////////////////////////////////// */

// SCENE
scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a0a14, 0.0025);

/* //////////////////////////////////////// */

// CAMERA
camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);
camera.position.z = 1;
camera.rotation.x = 1.16;
camera.rotation.y = -0.12;
camera.rotation.z = 0.27;

/* //////////////////////////////////////// */

// CAMERA VIEW SYSTEM
const cameraViews = {
  sky: {
    position: { x: 0, y: 0, z: 1 },
    rotation: { x: 1.16, y: -0.12, z: 0.27 }
  },
  forward: {
    position: { x: 0, y: 0, z: 100 },
    rotation: { x: 0.25, y: 0, z: 0 }
  },
  street: {
    position: { x: 0, y: 8, z: 0 },
    rotation: { x: 0, y: 0, z: 0 }
  }
};

let cameraView = "sky";
const cameraLerpSpeed = 2.5;
let cameraTransitioning = false;

// For street view free-look
let streetYaw = 0;
let streetPitch = 0;

/* //////////////////////////////////////// */

// RENDERER - antialiased with proper pixel ratio
renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setClearColor(scene.fog.color);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

// Append canvas to the body
document.body.appendChild(renderer.domElement);

/* //////////////////////////////////////// */

// Ambient Light - slightly blue-tinted for a stormy night feel
ambient = new THREE.AmbientLight(0x2a2a40);
scene.add(ambient);

/* //////////////////////////////////////// */

// Directional Light - dim, cool moonlight through clouds
directionalLight = new THREE.DirectionalLight(0xc8d8f0);
directionalLight.position.set(0, 0, 1);
directionalLight.intensity = 0.4;
scene.add(directionalLight);

/* //////////////////////////////////////// */

// Point Light for Lightning - starts dark, will flash white-blue
flash = new THREE.PointLight(0x4070ff, 0, 600, 1.7);
flash.position.set(200, 300, 100);
scene.add(flash);

// Secondary flash for broader sky illumination
flash2 = new THREE.PointLight(0x2040cc, 0, 800, 2.0);
flash2.position.set(-100, 400, -50);
scene.add(flash2);

// Ambient flash light for whole-scene illumination during strikes
ambientFlash = new THREE.AmbientLight(0x4060a0, 0);
scene.add(ambientFlash);

// Lightning state
let flashPower = 0;
let flashDecay = 0.92; // how quickly flash fades
let timeSinceLastFlash = 0;
let nextFlashTime = 3 + Math.random() * 8; // seconds until next flash

/* //////////////////////////////////////// */

// WEB AUDIO API SETUP
let audioCtx = null;
let analyser = null;
let analyserData = null;
let thunderBuffers = []; // pre-loaded AudioBuffers
let audioInitialized = false;

function initAudioContext() {
  if (audioInitialized) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Create analyser node for reading thunder amplitude
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.3;
  analyserData = new Uint8Array(analyser.fftSize);

  // Connect analyser to destination so thunder is audible
  analyser.connect(audioCtx.destination);

  audioInitialized = true;
  console.log("Web Audio API initialized");
}

// Pre-load thunder sounds as AudioBuffers for low-latency playback
async function preloadThunderBuffers() {
  try {
    const response = await fetch("thunder-sounds.json");
    const soundPaths = await response.json();
    console.log("Loading thunder sounds:", soundPaths);

    const loadPromises = soundPaths.map(async (path) => {
      try {
        const resp = await fetch(path);
        const arrayBuffer = await resp.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        return audioBuffer;
      } catch (err) {
        console.warn("Failed to load thunder sound:", path, err);
        return null;
      }
    });

    const buffers = await Promise.all(loadPromises);
    thunderBuffers = buffers.filter((b) => b !== null);
    console.log("Thunder buffers loaded:", thunderBuffers.length);
  } catch (error) {
    console.error("Error loading thunder sounds:", error);
  }
}

/* //////////////////////////////////////// */

// Rain Audio - using standard Audio element (continuous loop)
const rainAudio = new Audio("rain.mp3");
let thunderEnabled = true;

function playRainSound() {
  rainAudio.loop = true;
  rainAudio.volume = 0.5;
  rainAudio
    .play()
    .then(() => {
      console.log("Rain sound is playing");
    })
    .catch((err) => {
      console.error("Rain sound autoplay blocked. Waiting for user interaction.");
      document.body.addEventListener("click", () => {
        rainAudio.play().catch((err) => console.error("Error playing rain sound:", err));
      }, { once: true });
    });
}

/* //////////////////////////////////////// */

// Play a thunder sound through the Web Audio API analyser
function playThunderThroughAnalyser() {
  if (!thunderEnabled || thunderBuffers.length === 0 || !audioCtx) return;

  const buffer = thunderBuffers[Math.floor(Math.random() * thunderBuffers.length)];
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;

  // Route through analyser so we can read amplitude
  source.connect(analyser);
  source.start(0);
}

/* //////////////////////////////////////// */

// Get peak amplitude from the analyser (0-1 range)
function getThunderAmplitude() {
  if (!analyser || !analyserData) return 0;

  analyser.getByteTimeDomainData(analyserData);

  // Find peak deviation from silence (128)
  let peak = 0;
  for (let i = 0; i < analyserData.length; i++) {
    let deviation = Math.abs(analyserData[i] - 128);
    if (deviation > peak) peak = deviation;
  }

  // Normalize to 0-1
  return peak / 128;
}

/* //////////////////////////////////////// */

// RAIN STREAK TEXTURE - elongated drops via canvas
function createRainStreakTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  // Gradient from transparent to white to transparent (elongated raindrop)
  const gradient = ctx.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, "rgba(200, 215, 230, 0)");
  gradient.addColorStop(0.3, "rgba(200, 215, 230, 0.4)");
  gradient.addColorStop(0.5, "rgba(220, 230, 240, 0.8)");
  gradient.addColorStop(0.7, "rgba(200, 215, 230, 0.4)");
  gradient.addColorStop(1, "rgba(200, 215, 230, 0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 4, 64);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

const rainStreakTexture = createRainStreakTexture();

/* //////////////////////////////////////// */

// RAIN SYSTEM - Two depth-layered systems for parallax
cloudParticles = [];

// Wind parameters - time-varying gusts (layered sine waves)
let windTime = 0;
let windStrength = 0.3;
let windDirection = -0.5;

function getWindGust(t) {
  // Layered sine waves for natural-feeling gusts
  return Math.sin(t * 0.7) * 0.4
       + Math.sin(t * 1.3 + 2.0) * 0.25
       + Math.sin(t * 2.7 + 5.0) * 0.15
       + Math.sin(t * 0.2) * 0.6;
}

// Foreground rain - 4K larger drops, closer to camera
const fgRainCount = 4000;
const fgRainGeo = new THREE.Geometry();

for (let i = 0; i < fgRainCount; i++) {
  let drop = new THREE.Vector3(
    Math.random() * 400 - 200,
    Math.random() * 500 - 250,
    Math.random() * 400 - 200
  );
  drop.velocity = 0;
  drop.speedFactor = 0.8 + Math.random() * 0.6;
  fgRainGeo.vertices.push(drop);
}

const fgRainMaterial = new THREE.PointsMaterial({
  color: 0xc0c8d0,
  size: 1.8,
  transparent: true,
  opacity: 0.7,
  map: rainStreakTexture,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

const fgRain = new THREE.Points(fgRainGeo, fgRainMaterial);
scene.add(fgRain);

// Background rain - 14K smaller drops, further away for depth
const bgRainCount = 14000;
const bgRainGeo = new THREE.Geometry();

for (let i = 0; i < bgRainCount; i++) {
  let drop = new THREE.Vector3(
    Math.random() * 600 - 300,
    Math.random() * 500 - 250,
    Math.random() * 600 - 300
  );
  drop.velocity = 0;
  drop.speedFactor = 0.5 + Math.random() * 0.5;
  bgRainGeo.vertices.push(drop);
}

const bgRainMaterial = new THREE.PointsMaterial({
  color: 0x8090a0,
  size: 0.6,
  transparent: true,
  opacity: 0.4,
  map: rainStreakTexture,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

const bgRain = new THREE.Points(bgRainGeo, bgRainMaterial);
scene.add(bgRain);

// Base opacity values for lightning brightness boost
const fgRainBaseOpacity = 0.7;
const bgRainBaseOpacity = 0.4;

/* //////////////////////////////////////// */

// GROUND SPLASH PARTICLE SYSTEM - 800 pool
const splashPool = [];
const splashCount = 800;
const splashGeo = new THREE.Geometry();
const splashVelocities = [];

for (let i = 0; i < splashCount; i++) {
  let p = new THREE.Vector3(0, -999, 0); // hidden initially
  splashGeo.vertices.push(p);
  splashVelocities.push({ vx: 0, vy: 0, vz: 0, life: 0, active: false });
}

const splashMaterial = new THREE.PointsMaterial({
  color: 0x8899aa,
  size: 0.8,
  transparent: true,
  opacity: 0.6,
  depthWrite: false,
});

const splashMesh = new THREE.Points(splashGeo, splashMaterial);
scene.add(splashMesh);

let nextSplashIndex = 0;

function spawnSplash(x, z) {
  // Spawn a small burst of 2-3 splash particles
  let count = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) {
    let idx = nextSplashIndex;
    nextSplashIndex = (nextSplashIndex + 1) % splashCount;

    let p = splashGeo.vertices[idx];
    let v = splashVelocities[idx];

    // Ground level position
    p.x = x + (Math.random() - 0.5) * 2;
    p.y = -100;
    p.z = z + (Math.random() - 0.5) * 2;

    // Small upward/outward velocity
    v.vx = (Math.random() - 0.5) * 1.5;
    v.vy = 1.5 + Math.random() * 2.5;
    v.vz = (Math.random() - 0.5) * 1.5;
    v.life = 0.3 + Math.random() * 0.3;
    v.active = true;
  }
}

/* //////////////////////////////////////// */

// STREET VIEW 3D ENVIRONMENT
const streetGroup = new THREE.Group();
streetGroup.visible = false;
scene.add(streetGroup);

function buildStreetEnvironment() {
  // Road surface - dark asphalt
  const roadGeo = new THREE.PlaneBufferGeometry(30, 600);
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.y = -0.1;
  streetGroup.add(road);

  // Road center line (dashed yellow)
  for (let z = -290; z < 290; z += 12) {
    const lineGeo = new THREE.PlaneBufferGeometry(0.2, 5);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x998833 });
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.01, z);
    streetGroup.add(line);
  }

  // Sidewalks - slightly raised, lighter concrete
  const sidewalkGeo = new THREE.BoxBufferGeometry(8, 0.3, 600);
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x333338 });

  const leftSidewalk = new THREE.Mesh(sidewalkGeo, sidewalkMat);
  leftSidewalk.position.set(-19, 0, 0);
  streetGroup.add(leftSidewalk);

  const rightSidewalk = new THREE.Mesh(sidewalkGeo, sidewalkMat);
  rightSidewalk.position.set(19, 0, 0);
  streetGroup.add(rightSidewalk);

  // Curbs
  const curbGeo = new THREE.BoxBufferGeometry(0.5, 0.4, 600);
  const curbMat = new THREE.MeshLambertMaterial({ color: 0x444448 });

  const leftCurb = new THREE.Mesh(curbGeo, curbMat);
  leftCurb.position.set(-15, 0.1, 0);
  streetGroup.add(leftCurb);

  const rightCurb = new THREE.Mesh(curbGeo, curbMat);
  rightCurb.position.set(15, 0.1, 0);
  streetGroup.add(rightCurb);

  // Building facades - left side
  const buildingMat = new THREE.MeshLambertMaterial({ color: 0x222228 });
  const buildingMatDark = new THREE.MeshLambertMaterial({ color: 0x1a1a20 });

  for (let z = -280; z < 280; z += 40) {
    let height = 40 + Math.random() * 60;
    let depth = 15 + Math.random() * 10;
    let mat = Math.random() > 0.5 ? buildingMat : buildingMatDark;

    // Left building
    const lGeo = new THREE.BoxBufferGeometry(depth, height, 38);
    const lBuilding = new THREE.Mesh(lGeo, mat);
    lBuilding.position.set(-23 - depth / 2, height / 2, z);
    streetGroup.add(lBuilding);

    // Window lights (sparse, some windows lit yellowish)
    for (let wy = 8; wy < height - 5; wy += 8) {
      for (let wz = -14; wz < 14; wz += 6) {
        if (Math.random() > 0.7) {
          const winGeo = new THREE.PlaneBufferGeometry(1.5, 2.5);
          const winColor = Math.random() > 0.5 ? 0x443311 : 0x332211;
          const winMat = new THREE.MeshBasicMaterial({ color: winColor });
          const win = new THREE.Mesh(winGeo, winMat);
          win.position.set(-23.01, wy, z + wz);
          streetGroup.add(win);
        }
      }
    }

    // Right building
    const rGeo = new THREE.BoxBufferGeometry(depth, height, 38);
    const rBuilding = new THREE.Mesh(rGeo, mat);
    rBuilding.position.set(23 + depth / 2, height / 2, z);
    streetGroup.add(rBuilding);

    // Windows on right side
    for (let wy = 8; wy < height - 5; wy += 8) {
      for (let wz = -14; wz < 14; wz += 6) {
        if (Math.random() > 0.7) {
          const winGeo = new THREE.PlaneBufferGeometry(1.5, 2.5);
          const winColor = Math.random() > 0.5 ? 0x443311 : 0x332211;
          const winMat = new THREE.MeshBasicMaterial({ color: winColor });
          const win = new THREE.Mesh(winGeo, winMat);
          win.position.set(23.01, wy, z + wz);
          win.rotation.y = Math.PI;
          streetGroup.add(win);
        }
      }
    }
  }

  // Street lights - along both sides
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x333333 });

  for (let z = -250; z < 250; z += 50) {
    // Left pole
    const poleGeo = new THREE.CylinderBufferGeometry(0.15, 0.2, 12, 6);
    const leftPole = new THREE.Mesh(poleGeo, poleMat);
    leftPole.position.set(-14, 6, z);
    streetGroup.add(leftPole);

    // Left arm
    const armGeo = new THREE.BoxBufferGeometry(3, 0.15, 0.15);
    const leftArm = new THREE.Mesh(armGeo, poleMat);
    leftArm.position.set(-12.5, 12, z);
    streetGroup.add(leftArm);

    // Left light fixture
    const fixtureGeo = new THREE.BoxBufferGeometry(1.5, 0.3, 0.6);
    const fixtureMat = new THREE.MeshBasicMaterial({ color: 0x776644 });
    const leftFixture = new THREE.Mesh(fixtureGeo, fixtureMat);
    leftFixture.position.set(-11.2, 11.8, z);
    streetGroup.add(leftFixture);

    // Left street light (dim warm point light)
    const leftLight = new THREE.PointLight(0xffcc66, 0.6, 30, 2);
    leftLight.position.set(-11.2, 11.5, z);
    streetGroup.add(leftLight);

    // Right pole
    const rightPole = new THREE.Mesh(poleGeo.clone(), poleMat);
    rightPole.position.set(14, 6, z);
    streetGroup.add(rightPole);

    // Right arm
    const rightArm = new THREE.Mesh(armGeo.clone(), poleMat);
    rightArm.position.set(12.5, 12, z);
    streetGroup.add(rightArm);

    // Right light fixture
    const rightFixture = new THREE.Mesh(fixtureGeo.clone(), fixtureMat);
    rightFixture.position.set(11.2, 11.8, z);
    streetGroup.add(rightFixture);

    // Right street light
    const rightLight = new THREE.PointLight(0xffcc66, 0.6, 30, 2);
    rightLight.position.set(11.2, 11.5, z);
    streetGroup.add(rightLight);
  }

  // Wet road reflective plane (subtle)
  const reflectGeo = new THREE.PlaneBufferGeometry(30, 600);
  const reflectMat = new THREE.MeshLambertMaterial({
    color: 0x111115,
    transparent: true,
    opacity: 0.3,
    emissive: 0x050508,
  });
  const reflectPlane = new THREE.Mesh(reflectGeo, reflectMat);
  reflectPlane.rotation.x = -Math.PI / 2;
  reflectPlane.position.y = 0.05;
  streetGroup.add(reflectPlane);
}

buildStreetEnvironment();

/* //////////////////////////////////////// */

// CLOUD SYSTEM - more layers at varied depths for realistic volume
let loader = new THREE.TextureLoader();
loader.load("https://raw.githubusercontent.com/navin-navi/codepen-assets/master/images/smoke.png", function (texture) {
  // Create a few different cloud sizes for variety
  let cloudSizes = [300, 400, 500, 600, 700];

  for (let p = 0; p < 45; p++) {
    let size = cloudSizes[Math.floor(Math.random() * cloudSizes.length)];
    let cloudGeo = new THREE.PlaneBufferGeometry(size, size);
    let cloudMaterial = new THREE.MeshLambertMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });

    let cloud = new THREE.Mesh(cloudGeo, cloudMaterial);

    // Spread clouds across the sky at different heights and depths
    let layer = Math.random();
    let yPos, opacity;

    if (layer < 0.3) {
      // High distant clouds - lighter, more transparent
      yPos = 520 + Math.random() * 80;
      opacity = 0.2 + Math.random() * 0.15;
    } else if (layer < 0.7) {
      // Mid-level clouds - main visible layer
      yPos = 440 + Math.random() * 80;
      opacity = 0.4 + Math.random() * 0.2;
    } else {
      // Low heavy clouds - darker, more opaque
      yPos = 350 + Math.random() * 90;
      opacity = 0.5 + Math.random() * 0.25;
    }

    cloud.position.set(
      Math.random() * 1000 - 500,
      yPos,
      Math.random() * 600 - 600
    );
    cloud.rotation.x = 1.16;
    cloud.rotation.y = -0.12;
    cloud.rotation.z = Math.random() * 2 * Math.PI;
    cloud.material.opacity = opacity;

    // Store base opacity for lightning illumination
    cloud.userData.baseOpacity = opacity;
    // Give each cloud a slightly different rotation speed
    cloud.userData.rotSpeed = 0.0008 + Math.random() * 0.0015;

    cloudParticles.push(cloud);
    scene.add(cloud);
  }
});

/* //////////////////////////////////////// */

// Lightning screen flash overlay (CSS-based for full-screen effect)
const flashOverlay = document.createElement("div");
flashOverlay.style.position = "fixed";
flashOverlay.style.top = "0";
flashOverlay.style.left = "0";
flashOverlay.style.width = "100vw";
flashOverlay.style.height = "100vh";
flashOverlay.style.pointerEvents = "none";
flashOverlay.style.background = "rgba(180, 200, 255, 0)";
flashOverlay.style.zIndex = "10";
flashOverlay.style.transition = "none";
document.body.appendChild(flashOverlay);

/* //////////////////////////////////////// */

// Function to trigger a lightning strike with audio sync
function triggerLightning() {
  // Random position in the sky
  flash.position.set(
    Math.random() * 400 - 200,
    300 + Math.random() * 200,
    50 + Math.random() * 100
  );
  flash2.position.set(
    flash.position.x + (Math.random() * 200 - 100),
    flash.position.y + Math.random() * 100,
    flash.position.z - 50
  );

  // Initial flash intensity
  flashPower = 200 + Math.random() * 400;

  // Schedule next flash
  nextFlashTime = 4 + Math.random() * 12;
  timeSinceLastFlash = 0;

  // Sometimes do a double-flash (50% chance of a quick re-flash)
  if (Math.random() > 0.5) {
    setTimeout(() => {
      flashPower = Math.max(flashPower, 150 + Math.random() * 300);
    }, 80 + Math.random() * 120);
  }

  // Play thunder audio after a delay (light arrives before sound)
  // Delay: 40-180ms to simulate speed-of-light vs speed-of-sound
  let audioDelay = 40 + Math.random() * 140;
  setTimeout(() => {
    playThunderThroughAnalyser();
  }, audioDelay);
}

/* //////////////////////////////////////// */

// MOUSE DRAG CONTROLS for Street View (desktop)
let isDragging = false;
let previousMouseX = 0;
let previousMouseY = 0;
const mouseSensitivity = 0.003;

renderer.domElement.addEventListener("mousedown", (e) => {
  if (cameraView !== "street") return;
  isDragging = true;
  previousMouseX = e.clientX;
  previousMouseY = e.clientY;
  renderer.domElement.style.cursor = "grabbing";
});

window.addEventListener("mousemove", (e) => {
  if (!isDragging || cameraView !== "street") return;

  let deltaX = e.clientX - previousMouseX;
  let deltaY = e.clientY - previousMouseY;

  streetYaw -= deltaX * mouseSensitivity;
  streetPitch -= deltaY * mouseSensitivity;

  // Clamp vertical look to avoid flipping
  streetPitch = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, streetPitch));

  previousMouseX = e.clientX;
  previousMouseY = e.clientY;
});

window.addEventListener("mouseup", () => {
  isDragging = false;
  if (cameraView === "street") {
    renderer.domElement.style.cursor = "grab";
  }
});

/* //////////////////////////////////////// */

// GYROSCOPE CONTROLS for Street View (mobile)
let gyroEnabled = false;
let gyroAlpha = 0;
let gyroBeta = 0;
let gyroGamma = 0;
let gyroBaseAlpha = null;
let gyroBaseBeta = null;

function handleDeviceOrientation(event) {
  if (cameraView !== "street" || !gyroEnabled) return;

  // Set baseline on first reading
  if (gyroBaseAlpha === null) {
    gyroBaseAlpha = event.alpha || 0;
    gyroBaseBeta = event.beta || 0;
  }

  gyroAlpha = event.alpha || 0;
  gyroBeta = event.beta || 0;
  gyroGamma = event.gamma || 0;
}

function requestGyroPermission() {
  if (typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function") {
    // iOS 13+ requires permission
    DeviceOrientationEvent.requestPermission()
      .then((response) => {
        if (response === "granted") {
          gyroEnabled = true;
          window.addEventListener("deviceorientation", handleDeviceOrientation);
        }
      })
      .catch(console.error);
  } else if ("DeviceOrientationEvent" in window) {
    // Android and older iOS - just listen
    gyroEnabled = true;
    window.addEventListener("deviceorientation", handleDeviceOrientation);
  }
}

// Detect if touch device
const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

// Touch drag fallback for mobile (in addition to gyro)
let touchStartX = 0;
let touchStartY = 0;
let isTouchDragging = false;

renderer.domElement.addEventListener("touchstart", (e) => {
  if (cameraView !== "street") return;
  if (e.touches.length === 1) {
    isTouchDragging = true;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }
}, { passive: true });

renderer.domElement.addEventListener("touchmove", (e) => {
  if (!isTouchDragging || cameraView !== "street") return;
  let touch = e.touches[0];
  let deltaX = touch.clientX - touchStartX;
  let deltaY = touch.clientY - touchStartY;

  streetYaw -= deltaX * mouseSensitivity;
  streetPitch -= deltaY * mouseSensitivity;
  streetPitch = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, streetPitch));

  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}, { passive: true });

renderer.domElement.addEventListener("touchend", () => {
  isTouchDragging = false;
}, { passive: true });

/* //////////////////////////////////////// */

// CAMERA LERP HELPER
function lerpValue(current, target, speed, delta) {
  let t = 1 - Math.exp(-speed * delta);
  return current + (target - current) * t;
}

/* //////////////////////////////////////// */

// Track time for smooth animations
let lastTime = performance.now();

// Render animation on every rendering phase
function render() {
  let now = performance.now();
  let delta = (now - lastTime) / 1000; // seconds
  lastTime = now;

  // Update wind gusts
  windTime += delta;
  let gustValue = getWindGust(windTime);
  windStrength = 0.3 + gustValue * 0.3;

  // Cloud Rotation Animation - each at its own speed
  cloudParticles.forEach((p) => {
    p.rotation.z -= p.userData.rotSpeed || 0.002;

    // During lightning, briefly brighten clouds
    if (flashPower > 50) {
      let boost = Math.min(flashPower / 600, 0.4);
      p.material.opacity = Math.min(p.userData.baseOpacity + boost, 0.95);
    } else {
      // Smoothly return to base opacity
      p.material.opacity += (p.userData.baseOpacity - p.material.opacity) * 0.05;
    }
  });

  // Rain brightness boost during lightning
  if (flashPower > 50) {
    let rainBoost = Math.min(flashPower / 400, 0.3);
    fgRainMaterial.opacity = Math.min(fgRainBaseOpacity + rainBoost, 1.0);
    bgRainMaterial.opacity = Math.min(bgRainBaseOpacity + rainBoost * 0.5, 0.8);
  } else {
    fgRainMaterial.opacity += (fgRainBaseOpacity - fgRainMaterial.opacity) * 0.05;
    bgRainMaterial.opacity += (bgRainBaseOpacity - bgRainMaterial.opacity) * 0.05;
  }

  // Foreground rain animation
  fgRainGeo.vertices.forEach((p) => {
    p.velocity -= (2.5 + Math.random() * 2) * p.speedFactor;
    p.y += p.velocity;
    p.x += windDirection * windStrength * 1.2;

    if (p.y < -100) {
      // Spawn splash on ground impact (only in forward/street views)
      if (cameraView !== "sky" && Math.random() < 0.15) {
        spawnSplash(p.x, p.z);
      }
      p.y = 200 + Math.random() * 100;
      p.x = Math.random() * 400 - 200;
      p.velocity = 0;
    }
  });
  fgRainGeo.verticesNeedUpdate = true;

  // Background rain animation
  bgRainGeo.vertices.forEach((p) => {
    p.velocity -= (1.8 + Math.random() * 1.5) * p.speedFactor;
    p.y += p.velocity;
    p.x += windDirection * windStrength * 0.6;

    if (p.y < -100) {
      p.y = 200 + Math.random() * 100;
      p.x = Math.random() * 600 - 300;
      p.velocity = 0;
    }
  });
  bgRainGeo.verticesNeedUpdate = true;

  // Splash particle update
  for (let i = 0; i < splashCount; i++) {
    let v = splashVelocities[i];
    if (!v.active) continue;

    let p = splashGeo.vertices[i];
    v.life -= delta;

    if (v.life <= 0) {
      v.active = false;
      p.y = -999;
      continue;
    }

    p.x += v.vx * delta * 10;
    p.y += v.vy * delta * 10;
    p.z += v.vz * delta * 10;
    v.vy -= 15 * delta; // gravity
  }
  splashGeo.verticesNeedUpdate = true;

  // Show/hide splashes based on view
  splashMesh.visible = (cameraView !== "sky");

  // Read thunder amplitude from analyser and boost flash accordingly
  let amplitude = getThunderAmplitude();
  if (amplitude > 0.05) {
    let amplitudeBoost = amplitude * 500;
    flashPower = Math.max(flashPower, amplitudeBoost);
  }

  // Lightning flash decay
  if (flashPower > 0.5) {
    flash.intensity = flashPower * 0.15;
    flash.power = flashPower;
    flash2.intensity = flashPower * 0.08;
    flash2.power = flashPower * 0.6;
    ambientFlash.intensity = flashPower * 0.003;

    // Screen overlay flash
    let overlayAlpha = Math.min(flashPower / 1500, 0.12);
    flashOverlay.style.background = `rgba(180, 200, 255, ${overlayAlpha})`;

    flashPower *= flashDecay;
  } else {
    flash.intensity = 0;
    flash.power = 0;
    flash2.intensity = 0;
    flash2.power = 0;
    ambientFlash.intensity = 0;
    flashOverlay.style.background = "rgba(180, 200, 255, 0)";
  }

  // Lightning timing
  timeSinceLastFlash += delta;
  if (timeSinceLastFlash > nextFlashTime) {
    triggerLightning();
  }

  // CAMERA TRANSITIONS
  if (cameraView === "street") {
    // Street view: position lerps to street pos, rotation is free-look
    let target = cameraViews.street;
    camera.position.x = lerpValue(camera.position.x, target.position.x, cameraLerpSpeed, delta);
    camera.position.y = lerpValue(camera.position.y, target.position.y, cameraLerpSpeed, delta);
    camera.position.z = lerpValue(camera.position.z, target.position.z, cameraLerpSpeed, delta);

    // Apply gyro on mobile
    if (gyroEnabled && isTouchDevice && gyroBaseAlpha !== null) {
      let yawOffset = ((gyroAlpha - gyroBaseAlpha) * Math.PI) / 180;
      let pitchOffset = ((gyroBeta - gyroBaseBeta) * Math.PI) / 180;
      pitchOffset = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, pitchOffset));

      camera.rotation.order = "YXZ";
      camera.rotation.y = streetYaw - yawOffset;
      camera.rotation.x = streetPitch - pitchOffset;
      camera.rotation.z = 0;
    } else {
      // Desktop: use mouse drag yaw/pitch
      camera.rotation.order = "YXZ";
      camera.rotation.y = lerpValue(camera.rotation.y, streetYaw, 8, delta);
      camera.rotation.x = lerpValue(camera.rotation.x, streetPitch, 8, delta);
      camera.rotation.z = lerpValue(camera.rotation.z, 0, 8, delta);
    }

    // Show street environment
    streetGroup.visible = true;

  } else {
    // Sky or Forward view: lerp to target position and rotation
    let target = cameraViews[cameraView];

    camera.position.x = lerpValue(camera.position.x, target.position.x, cameraLerpSpeed, delta);
    camera.position.y = lerpValue(camera.position.y, target.position.y, cameraLerpSpeed, delta);
    camera.position.z = lerpValue(camera.position.z, target.position.z, cameraLerpSpeed, delta);

    camera.rotation.x = lerpValue(camera.rotation.x, target.rotation.x, cameraLerpSpeed, delta);
    camera.rotation.y = lerpValue(camera.rotation.y, target.rotation.y, cameraLerpSpeed, delta);
    camera.rotation.z = lerpValue(camera.rotation.z, target.rotation.z, cameraLerpSpeed, delta);

    // Hide street environment
    streetGroup.visible = false;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

render();

/* //////////////////////////////////////// */

// Enable Fullscreen on Double-Click
document.addEventListener("dblclick", () => {
  if (!document.fullscreenElement) {
    document.body.requestFullscreen().then(() => {
      resizeRendererToFullscreen();
    }).catch((err) => {
      console.error(`Error attempting to enable fullscreen mode: ${err.message}`);
    });
  } else {
    document.exitFullscreen().then(() => {
      resizeRendererToWindow();
    });
  }
});

// Resize renderer and camera when entering fullscreen
function resizeRendererToFullscreen() {
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;

  renderer.setSize(screenWidth, screenHeight);
  camera.aspect = screenWidth / screenHeight;
  camera.updateProjectionMatrix();
}

// Resize renderer and camera when exiting fullscreen
function resizeRendererToWindow() {
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  renderer.setSize(windowWidth, windowHeight);
  camera.aspect = windowWidth / windowHeight;
  camera.updateProjectionMatrix();
}

// Ensure resizing works for general window resize events
window.addEventListener("resize", resizeRendererToWindow);


/* //////////////////////////////////////// */

// UI BUTTONS CONTAINER
const buttonContainer = document.createElement("div");
buttonContainer.style.position = "fixed";
buttonContainer.style.bottom = "10px";
buttonContainer.style.left = "10px";
buttonContainer.style.zIndex = "1000";
buttonContainer.style.display = "flex";
buttonContainer.style.gap = "8px";
document.body.appendChild(buttonContainer);

// Shared button style
function styleButton(btn) {
  btn.style.background = "rgba(0, 0, 0, 0.8)";
  btn.style.color = "#fff";
  btn.style.border = "none";
  btn.style.borderRadius = "50%";
  btn.style.width = "40px";
  btn.style.height = "40px";
  btn.style.padding = "0";
  btn.style.cursor = "pointer";
  btn.style.fontSize = "18px";
  btn.style.display = "flex";
  btn.style.alignItems = "center";
  btn.style.justifyContent = "center";
  btn.style.userSelect = "none";
  btn.style.webkitUserSelect = "none";
}

// Thunder Toggle Button
const toggleButton = document.createElement("button");
toggleButton.textContent = "\u26A1";
toggleButton.title = "Toggle Thunder Sounds";
styleButton(toggleButton);
buttonContainer.appendChild(toggleButton);

// Toggle Thunder Sounds On/Off
toggleButton.addEventListener("click", () => {
  thunderEnabled = !thunderEnabled;
  toggleButton.style.background = thunderEnabled
    ? "rgba(0, 0, 0, 0.8)"
    : "rgba(100, 0, 0, 0.8)";
});

// Camera View Toggle Button
const viewLabels = { sky: "\u2601", forward: "\u{1F327}", street: "\u{1F3D9}" };
const viewNames = ["sky", "forward", "street"];
let viewIndex = 0;

const viewButton = document.createElement("button");
viewButton.textContent = viewLabels.sky;
viewButton.title = "Camera: Sky View";
styleButton(viewButton);
buttonContainer.appendChild(viewButton);

viewButton.addEventListener("click", () => {
  viewIndex = (viewIndex + 1) % viewNames.length;
  let newView = viewNames[viewIndex];
  cameraView = newView;
  viewButton.textContent = viewLabels[newView];

  let titleMap = { sky: "Camera: Sky View", forward: "Camera: Forward View", street: "Camera: Street View" };
  viewButton.title = titleMap[newView];

  // Reset street look direction when entering street view
  if (newView === "street") {
    streetYaw = 0;
    streetPitch = 0;
    camera.rotation.order = "YXZ";
    renderer.domElement.style.cursor = "grab";

    // Request gyro on mobile (needs user gesture)
    if (isTouchDevice && !gyroEnabled) {
      requestGyroPermission();
    }
  } else {
    renderer.domElement.style.cursor = "default";
    // Reset gyro baseline for next street entry
    gyroBaseAlpha = null;
    gyroBaseBeta = null;
  }
});

/* //////////////////////////////////////// */

// Initialize audio on first user interaction (required by browsers)
function startAudio() {
  initAudioContext();
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  playRainSound();
  preloadThunderBuffers();
}

// Try to start immediately, fall back to click
document.addEventListener("click", function onFirstClick() {
  startAudio();
  document.removeEventListener("click", onFirstClick);
}, { once: true });

// Also try on page load (will work if autoplay policy allows)
try {
  startAudio();
} catch (e) {
  console.log("Audio autoplay blocked, waiting for user interaction");
}
