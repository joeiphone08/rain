
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
let flashDecay = 0.92; // how quickly flash fades
let timeSinceLastFlash = 0;
let nextFlashTime = 3 + Math.random() * 8; // seconds until next flash

/* //////////////////////////////////////// */

// Audio Elements
const rainAudio = new Audio("rain.mp3");
let thunderEnabled = true;
let thunderSounds = [];

/* //////////////////////////////////////// */

// Attempt to Play Rain Sound
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
      });
    });
}

/* //////////////////////////////////////// */

// Fetch Thunder Sounds from JSON and Start Playing
async function fetchThunderSounds() {
  try {
    const response = await fetch("thunder-sounds.json");
    thunderSounds = await response.json();
    console.log("Thunder sounds loaded:", thunderSounds);
    playRandomThunder();
  } catch (error) {
    console.error("Error fetching thunder sounds:", error);
  }
}

// Play a Random Thunder Sound
function playRandomThunder() {
  if (!thunderEnabled || thunderSounds.length === 0) return;

  const randomSound = thunderSounds[Math.floor(Math.random() * thunderSounds.length)];
  const thunderAudio = new Audio(randomSound);
  thunderAudio.play().catch((err) => console.error("Error playing thunder sound:", err));

  setTimeout(playRandomThunder, 4000 + Math.random() * 19000);
}

/* //////////////////////////////////////// */

// RAIN SYSTEM - denser, with wind and varied speeds
rainCount = 15000;
cloudParticles = [];
rainGeo = new THREE.Geometry();

// Wind parameters
let windStrength = 0.3;
let windDirection = -0.5; // slight diagonal

for (let i = 0; i < rainCount; i++) {
  rainDrop = new THREE.Vector3(
    Math.random() * 400 - 200,
    Math.random() * 500 - 250,
    Math.random() * 400 - 200
  );
  rainDrop.velocity = 0;
  // Each drop gets its own fall speed multiplier for variation
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

// Function to trigger a lightning strike
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

  // Sometimes do a double-flash (very realistic)
  if (Math.random() > 0.5) {
    setTimeout(() => {
      flashPower = Math.max(flashPower, 150 + Math.random() * 300);
    }, 80 + Math.random() * 120);
  }
}

/* //////////////////////////////////////// */

// Track time for smooth animations
let lastTime = performance.now();

// Render animation on every rendering phase
function render() {
  let now = performance.now();
  let delta = (now - lastTime) / 1000; // seconds
  lastTime = now;

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

  // RainDrop Animation - with wind and varied speed
  rainGeo.vertices.forEach((p) => {
    p.velocity -= (2 + Math.random() * 2) * p.speedFactor;
    p.y += p.velocity;
    // Wind drift
    p.x += windDirection * windStrength;

    if (p.y < -100) {
      p.y = 100 + Math.random() * 50;
      p.x = Math.random() * 400 - 200;
      p.velocity = 0;
    }
  });
  rainGeo.verticesNeedUpdate = true;
  rain.rotation.y += 0.001;

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

// Toggle Thunder Sounds On/Off
toggleButton.addEventListener("click", () => {
  thunderEnabled = !thunderEnabled;
  toggleButton.style.background = thunderEnabled
    ? "rgba(0, 0, 0, 0.8)"
    : "rgba(100, 0, 0, 0.8)";
});

/* //////////////////////////////////////// */

// Fetch thunder sounds, play rain sound, and start the simulation
playRainSound();
fetchThunderSounds();
