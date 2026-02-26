
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
let flashDecay = 0.92;

/* //////////////////////////////////////// */

// WEB AUDIO API - for real-time thunder analysis
let audioCtx = null;
let thunderAnalyser = null;
let analyserData = null;
let thunderBuffers = [];
let thunderEnabled = true;
let audioReady = false;

// Initialize AudioContext (requires user gesture on most browsers)
function initAudio() {
  if (audioCtx) return;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Analyser node to read thunder waveform in real-time
  thunderAnalyser = audioCtx.createAnalyser();
  thunderAnalyser.fftSize = 512;
  thunderAnalyser.smoothingTimeConstant = 0.4;
  thunderAnalyser.connect(audioCtx.destination);

  analyserData = new Uint8Array(thunderAnalyser.frequencyBinCount);

  // Connect rain audio through the AudioContext too
  const rainSource = audioCtx.createMediaElementSource(rainAudio);
  rainSource.connect(audioCtx.destination);

  // Load thunder buffers
  loadThunderBuffers();
}

// Pre-load all thunder sounds as AudioBuffers for low-latency playback
async function loadThunderBuffers() {
  try {
    const response = await fetch("thunder-sounds.json");
    const soundPaths = await response.json();
    console.log("Loading thunder sounds:", soundPaths);

    const loadPromises = soundPaths.map(async (path) => {
      const resp = await fetch(path);
      const arrayBuffer = await resp.arrayBuffer();
      return audioCtx.decodeAudioData(arrayBuffer);
    });

    thunderBuffers = await Promise.all(loadPromises);
    audioReady = true;
    console.log(`${thunderBuffers.length} thunder sounds decoded and ready`);

    // Start the thunder cycle
    scheduleNextThunder();
  } catch (error) {
    console.error("Error loading thunder sounds:", error);
  }
}

/* //////////////////////////////////////// */

// THUNDER PLAYBACK - synced to lightning

let nextThunderTimeout = null;

function scheduleNextThunder() {
  if (nextThunderTimeout) clearTimeout(nextThunderTimeout);
  const delay = 6000 + Math.random() * 18000;
  nextThunderTimeout = setTimeout(playThunder, delay);
}

function playThunder() {
  if (!thunderEnabled || !audioReady || thunderBuffers.length === 0) {
    scheduleNextThunder();
    return;
  }

  // Pick a random thunder sound
  const buffer = thunderBuffers[Math.floor(Math.random() * thunderBuffers.length)];

  // 1) VISUAL FLASH FIRST — lightning arrives before sound
  //    Randomize flash position in the sky
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

  // Initial bright flash (the "lightning bolt" moment)
  flashPower = 250 + Math.random() * 350;

  // 2) AUDIO STARTS after a short delay (simulating proximity)
  //    Close strike: ~50ms delay. Distant: ~200ms.
  const soundDelay = 40 + Math.random() * 180;

  setTimeout(() => {
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    // Route through the analyser so we can read the waveform
    source.connect(thunderAnalyser);
    source.start();
  }, soundDelay);

  // Schedule the next thunder
  scheduleNextThunder();
}

// Read real-time thunder amplitude from the analyser
function getThunderAmplitude() {
  if (!thunderAnalyser || !analyserData) return 0;

  thunderAnalyser.getByteTimeDomainData(analyserData);

  // Find peak deviation from silence (128 = silence in unsigned byte domain)
  let peak = 0;
  for (let i = 0; i < analyserData.length; i++) {
    const deviation = Math.abs(analyserData[i] - 128);
    if (deviation > peak) peak = deviation;
  }

  // Normalize to 0–1
  return peak / 128;
}

/* //////////////////////////////////////// */

// Rain Audio (simple HTML5 Audio element, routed through AudioContext later)
const rainAudio = new Audio("rain.mp3");

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
    });
}

// On first user interaction, initialize AudioContext and resume playback
function onFirstInteraction() {
  initAudio();

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  rainAudio.play().catch(() => {});
  document.removeEventListener("click", onFirstInteraction);
  document.removeEventListener("keydown", onFirstInteraction);
}
document.addEventListener("click", onFirstInteraction);
document.addEventListener("keydown", onFirstInteraction);

/* //////////////////////////////////////// */

// RAIN SYSTEM - denser, with wind and varied speeds
rainCount = 15000;
cloudParticles = [];
rainGeo = new THREE.Geometry();

// Wind parameters
let windStrength = 0.3;
let windDirection = -0.5;

for (let i = 0; i < rainCount; i++) {
  rainDrop = new THREE.Vector3(
    Math.random() * 400 - 200,
    Math.random() * 500 - 250,
    Math.random() * 400 - 200
  );
  rainDrop.velocity = 0;
  rainDrop.speedFactor = 0.6 + Math.random() * 0.8;
  rainGeo.vertices.push(rainDrop);
}

rainMaterial = new THREE.PointsMaterial({
  color: 0xc0c8d0,
  size: 0.15,
  transparent: true,
  opacity: 0.7,
});

rain = new THREE.Points(rainGeo, rainMaterial);
scene.add(rain);

/* //////////////////////////////////////// */

// CLOUD SYSTEM - more layers at varied depths for realistic volume
let loader = new THREE.TextureLoader();
loader.load("https://raw.githubusercontent.com/navin-navi/codepen-assets/master/images/smoke.png", function (texture) {
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

    let layer = Math.random();
    let yPos, opacity;

    if (layer < 0.3) {
      yPos = 520 + Math.random() * 80;
      opacity = 0.2 + Math.random() * 0.15;
    } else if (layer < 0.7) {
      yPos = 440 + Math.random() * 80;
      opacity = 0.4 + Math.random() * 0.2;
    } else {
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

    cloud.userData.baseOpacity = opacity;
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

// Track time for smooth animations
let lastTime = performance.now();

// Render animation on every rendering phase
function render() {
  let now = performance.now();
  let delta = (now - lastTime) / 1000;
  lastTime = now;

  // --- AUDIO-DRIVEN LIGHTNING ---
  // Read thunder amplitude and boost flashPower when audio peaks
  const thunderAmp = getThunderAmplitude();

  if (thunderAmp > 0.08) {
    // Map the audio amplitude to flash intensity
    // Higher amplitude = brighter flash, matching cracks and rumbles
    const audioPower = thunderAmp * thunderAmp * 800;
    flashPower = Math.max(flashPower, audioPower);
  }

  // --- CLOUD ANIMATION ---
  cloudParticles.forEach((p) => {
    p.rotation.z -= p.userData.rotSpeed || 0.002;

    if (flashPower > 50) {
      let boost = Math.min(flashPower / 600, 0.4);
      p.material.opacity = Math.min(p.userData.baseOpacity + boost, 0.95);
    } else {
      p.material.opacity += (p.userData.baseOpacity - p.material.opacity) * 0.05;
    }
  });

  // --- RAIN ANIMATION ---
  rainGeo.vertices.forEach((p) => {
    p.velocity -= (2 + Math.random() * 2) * p.speedFactor;
    p.y += p.velocity;
    p.x += windDirection * windStrength;

    if (p.y < -100) {
      p.y = 100 + Math.random() * 50;
      p.x = Math.random() * 400 - 200;
      p.velocity = 0;
    }
  });
  rainGeo.verticesNeedUpdate = true;
  rain.rotation.y += 0.001;

  // --- LIGHTNING FLASH RENDERING ---
  if (flashPower > 0.5) {
    flash.intensity = flashPower * 0.15;
    flash.power = flashPower;
    flash2.intensity = flashPower * 0.08;
    flash2.power = flashPower * 0.6;
    ambientFlash.intensity = flashPower * 0.003;

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

function resizeRendererToFullscreen() {
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;
  renderer.setSize(screenWidth, screenHeight);
  camera.aspect = screenWidth / screenHeight;
  camera.updateProjectionMatrix();
}

function resizeRendererToWindow() {
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  renderer.setSize(windowWidth, windowHeight);
  camera.aspect = windowWidth / windowHeight;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resizeRendererToWindow);

/* //////////////////////////////////////// */

// Add Thunder Toggle Button
const toggleButton = document.createElement("button");
toggleButton.textContent = "⚡";
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

toggleButton.addEventListener("click", () => {
  thunderEnabled = !thunderEnabled;
  toggleButton.style.background = thunderEnabled
    ? "rgba(0, 0, 0, 0.8)"
    : "rgba(100, 0, 0, 0.8)";
});

/* //////////////////////////////////////// */

// Start the simulation
playRainSound();
