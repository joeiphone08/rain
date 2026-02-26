
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

// Camera view modes: "sky" (looking up) and "forward" (standing, looking ahead)
let cameraView = "sky";
const cameraViews = {
  sky: { px: 0, py: 0, pz: 1, rx: 1.16, ry: -0.12, rz: 0.27 },
  forward: { px: 0, py: 0, pz: 100, rx: 0.25, ry: 0, rz: 0 },
};
let cameraTarget = cameraViews.sky;
const cameraLerpSpeed = 2.5; // how fast the transition is

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

// RAIN STREAK TEXTURE — generated via canvas for elongated raindrop look
function createRainTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  // Vertical gradient streak: bright center tapering to transparent ends
  const gradient = ctx.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, "rgba(200, 215, 230, 0)");
  gradient.addColorStop(0.15, "rgba(200, 215, 230, 0.2)");
  gradient.addColorStop(0.4, "rgba(220, 230, 245, 0.8)");
  gradient.addColorStop(0.5, "rgba(235, 240, 255, 1.0)");
  gradient.addColorStop(0.6, "rgba(220, 230, 245, 0.8)");
  gradient.addColorStop(0.85, "rgba(200, 215, 230, 0.2)");
  gradient.addColorStop(1, "rgba(200, 215, 230, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 4, 64);

  const tex = new THREE.Texture(canvas);
  tex.needsUpdate = true;
  return tex;
}

const rainTexture = createRainTexture();

// Splash texture — small bright dot with soft falloff
function createSplashTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "rgba(220, 230, 255, 1.0)");
  gradient.addColorStop(0.3, "rgba(200, 215, 240, 0.6)");
  gradient.addColorStop(0.7, "rgba(180, 200, 230, 0.15)");
  gradient.addColorStop(1, "rgba(180, 200, 230, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);

  const tex = new THREE.Texture(canvas);
  tex.needsUpdate = true;
  return tex;
}

const splashTexture = createSplashTexture();

/* //////////////////////////////////////// */

// RAIN SYSTEM — two depth layers for parallax realism
cloudParticles = [];

// Wind parameters — gusts vary over time
let windBase = -0.4;
let windGust = 0;
let windTime = 0;

// --- Foreground rain: larger, brighter, fewer drops, closer to camera ---
const fgRainCount = 4000;
const fgRainGeo = new THREE.Geometry();

for (let i = 0; i < fgRainCount; i++) {
  let drop = new THREE.Vector3(
    Math.random() * 400 - 200,
    Math.random() * 500 - 250,
    Math.random() * 200 - 50 // closer z-range
  );
  drop.velocity = -(3 + Math.random() * 2); // start at near-terminal velocity
  drop.speedFactor = 0.8 + Math.random() * 0.4;
  drop.terminalVel = -(5 + Math.random() * 3);
  fgRainGeo.vertices.push(drop);
}

const fgRainMaterial = new THREE.PointsMaterial({
  map: rainTexture,
  color: 0xd0d8e8,
  size: 1.8,
  transparent: true,
  opacity: 0.6,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true,
});

const fgRain = new THREE.Points(fgRainGeo, fgRainMaterial);
scene.add(fgRain);

// --- Background rain: smaller, dimmer, denser, farther away ---
const bgRainCount = 14000;
const bgRainGeo = new THREE.Geometry();

for (let i = 0; i < bgRainCount; i++) {
  let drop = new THREE.Vector3(
    Math.random() * 600 - 300,
    Math.random() * 500 - 250,
    Math.random() * 400 - 300 // deeper z-range
  );
  drop.velocity = -(2 + Math.random() * 1.5);
  drop.speedFactor = 0.5 + Math.random() * 0.6;
  drop.terminalVel = -(4 + Math.random() * 2);
  bgRainGeo.vertices.push(drop);
}

const bgRainMaterial = new THREE.PointsMaterial({
  map: rainTexture,
  color: 0x90a0b8,
  size: 0.9,
  transparent: true,
  opacity: 0.35,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true,
});

const bgRain = new THREE.Points(bgRainGeo, bgRainMaterial);
scene.add(bgRain);

// --- Ground splash particles ---
const splashCount = 800;
const splashGeo = new THREE.Geometry();

for (let i = 0; i < splashCount; i++) {
  let splash = new THREE.Vector3(
    Math.random() * 400 - 200,
    -100 + Math.random() * 5, // ground level
    Math.random() * 400 - 200
  );
  splash.life = 0; // 0 = inactive
  splash.maxLife = 0.15 + Math.random() * 0.15; // ~150-300ms lifespan
  splashGeo.vertices.push(splash);
}

const splashMaterial = new THREE.PointsMaterial({
  map: splashTexture,
  color: 0xb0c0d8,
  size: 1.5,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true,
});

const splashes = new THREE.Points(splashGeo, splashMaterial);
scene.add(splashes);

// Base opacity/color for lightning flash effect on rain
const fgRainBaseOpacity = 0.6;
const bgRainBaseOpacity = 0.35;

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

// Spawn a splash at ground level when a raindrop hits
let splashIndex = 0;
function spawnSplash(x, z) {
  // Only spawn some splashes (not every drop, for performance)
  if (Math.random() > 0.08) return;
  let p = splashGeo.vertices[splashIndex];
  p.x = x + (Math.random() * 4 - 2);
  p.y = -98 + Math.random() * 3;
  p.z = z + (Math.random() * 4 - 2);
  p.life = p.maxLife;
  splashIndex = (splashIndex + 1) % splashCount;
}

// Track time for smooth animations
let lastTime = performance.now();

// Render animation on every rendering phase
function render() {
  let now = performance.now();
  let delta = (now - lastTime) / 1000; // seconds
  lastTime = now;

  // Smooth camera transition between views
  let lerpAmt = 1 - Math.exp(-cameraLerpSpeed * delta);
  camera.position.x += (cameraTarget.px - camera.position.x) * lerpAmt;
  camera.position.y += (cameraTarget.py - camera.position.y) * lerpAmt;
  camera.position.z += (cameraTarget.pz - camera.position.z) * lerpAmt;
  camera.rotation.x += (cameraTarget.rx - camera.rotation.x) * lerpAmt;
  camera.rotation.y += (cameraTarget.ry - camera.rotation.y) * lerpAmt;
  camera.rotation.z += (cameraTarget.rz - camera.rotation.z) * lerpAmt;

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

  // Time-varying wind gusts
  windTime += delta;
  windGust = Math.sin(windTime * 0.7) * 0.3 + Math.sin(windTime * 1.9) * 0.15 + Math.sin(windTime * 0.3) * 0.5;
  let currentWind = windBase + windGust * 0.4;

  // Foreground rain animation
  fgRainGeo.vertices.forEach((p) => {
    // Gravity-based acceleration with terminal velocity cap
    p.velocity -= 0.15 * p.speedFactor;
    if (p.velocity < p.terminalVel) p.velocity = p.terminalVel;
    p.y += p.velocity;
    p.x += currentWind * 0.6;

    if (p.y < -100) {
      // Spawn a splash at impact point (only in forward view)
      if (cameraView === "forward") spawnSplash(p.x, p.z);
      p.y = 100 + Math.random() * 100;
      p.x = Math.random() * 400 - 200;
      p.velocity = -(2 + Math.random() * 1.5);
    }
  });
  fgRainGeo.verticesNeedUpdate = true;

  // Background rain animation
  bgRainGeo.vertices.forEach((p) => {
    p.velocity -= 0.1 * p.speedFactor;
    if (p.velocity < p.terminalVel) p.velocity = p.terminalVel;
    p.y += p.velocity;
    p.x += currentWind * 0.35; // less wind effect at distance

    if (p.y < -100) {
      p.y = 100 + Math.random() * 100;
      p.x = Math.random() * 600 - 300;
      p.velocity = -(1.5 + Math.random() * 1);
    }
  });
  bgRainGeo.verticesNeedUpdate = true;

  // Splash particle lifecycle
  splashGeo.vertices.forEach((p) => {
    if (p.life > 0) {
      p.life -= delta;
      if (p.life <= 0) {
        p.life = 0;
        p.y = -200; // hide off-screen
      } else {
        // Expand outward slightly as splash fades
        p.y += delta * 8;
      }
    }
  });
  splashGeo.verticesNeedUpdate = true;
  // Splash opacity pulsed based on active splashes
  let activeSplashes = splashGeo.vertices.filter((p) => p.life > 0).length;
  splashMaterial.opacity = activeSplashes > 0 ? 0.5 : 0;

  fgRain.rotation.y += 0.0008;
  bgRain.rotation.y += 0.0004;

  // Read thunder amplitude from analyser and boost flash accordingly
  let amplitude = getThunderAmplitude();
  if (amplitude > 0.05) {
    // Map amplitude to flash power — loud cracks = bright flashes, rumbles = subtle flickers
    let amplitudeBoost = amplitude * 500;
    flashPower = Math.max(flashPower, amplitudeBoost);
  }

  // Lightning flash decay + rain brightening
  if (flashPower > 0.5) {
    flash.intensity = flashPower * 0.15;
    flash.power = flashPower;
    flash2.intensity = flashPower * 0.08;
    flash2.power = flashPower * 0.6;
    ambientFlash.intensity = flashPower * 0.003;

    // Rain brightens during lightning — drops become visible streaks
    let rainBoost = Math.min(flashPower / 400, 1.0);
    fgRainMaterial.opacity = fgRainBaseOpacity + rainBoost * 0.4;
    bgRainMaterial.opacity = bgRainBaseOpacity + rainBoost * 0.3;

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

    // Smoothly return rain to base opacity
    fgRainMaterial.opacity += (fgRainBaseOpacity - fgRainMaterial.opacity) * 0.08;
    bgRainMaterial.opacity += (bgRainBaseOpacity - bgRainMaterial.opacity) * 0.08;
  }

  // Lightning timing
  timeSinceLastFlash += delta;
  if (timeSinceLastFlash > nextFlashTime) {
    triggerLightning();
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

// Add Thunder Toggle Button
const toggleButton = document.createElement("button");
toggleButton.textContent = "\u26A1";
toggleButton.style.position = "fixed";
toggleButton.style.bottom = "10px";
toggleButton.style.left = "10px";
toggleButton.style.zIndex = "1000";
toggleButton.style.background = "rgba(0, 0, 0, 0.8)";
toggleButton.style.color = "#fff";
toggleButton.style.border = "none";
toggleButton.style.borderRadius = "50%";
toggleButton.style.padding = "10px";
toggleButton.style.cursor = "pointer";
toggleButton.title = "Toggle Thunder Sounds";
document.body.appendChild(toggleButton);

// Toggle Thunder Sounds On/Off
toggleButton.addEventListener("click", () => {
  thunderEnabled = !thunderEnabled;
  toggleButton.style.background = thunderEnabled
    ? "rgba(0, 0, 0, 0.8)"
    : "rgba(100, 0, 0, 0.8)";
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
