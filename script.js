
/* //////////////////////////////////////// */

// SCENE
scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x11111f, 0.002);

/* //////////////////////////////////////// */

// CAMERA
camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);
camera.position.z = 1;
camera.rotation.x = 1.16;
camera.rotation.y = -0.12;
camera.rotation.z = 0.27;

/* //////////////////////////////////////// */

// RENDERER
renderer = new THREE.WebGLRenderer();
renderer.setClearColor(scene.fog.color);
renderer.setSize(window.innerWidth, window.innerHeight);

// Append canvas to the body
document.body.appendChild(renderer.domElement);

/* //////////////////////////////////////// */

// Ambient Light
ambient = new THREE.AmbientLight(0x555555);
scene.add(ambient);

/* //////////////////////////////////////// */

// Directional Light
directionalLight = new THREE.DirectionalLight(0xffeedd);
directionalLight.position.set(0, 0, 1);
scene.add(directionalLight);

/* //////////////////////////////////////// */

// Point Light for Lightning
flash = new THREE.PointLight(0x062d89, 30, 500, 1.7);
flash.position.set(200, 300, 100);
scene.add(flash);

/* //////////////////////////////////////// */

// Audio Elements
const rainAudio = new Audio("rain.mp3");
let thunderEnabled = true; // To track if thunder is enabled
let thunderSounds = [];

/* //////////////////////////////////////// */

// Attempt to Play Rain Sound
function playRainSound() {
  rainAudio.loop = true;
  rainAudio.volume = 0.5; // Adjust volume as needed
  rainAudio
    .play()
    .then(() => {
      console.log("Rain sound is playing");
    })
    .catch((err) => {
      console.error("Rain sound autoplay blocked. Waiting for user interaction.");
      // If autoplay fails, fallback to a user interaction
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

    // Start playing random thunder sounds
    playRandomThunder();
  } catch (error) {
    console.error("Error fetching thunder sounds:", error);
  }
}

// Play a Random Thunder Sound
function playRandomThunder() {
  if (!thunderEnabled || thunderSounds.length === 0) return;

  // Pick a random sound
  const randomSound = thunderSounds[Math.floor(Math.random() * thunderSounds.length)];
  const thunderAudio = new Audio(randomSound);

  // Play the sound
  thunderAudio.play().catch((err) => console.error("Error playing thunder sound:", err));

  // Schedule the next thunder sound between 4-23 seconds
  setTimeout(playRandomThunder, 4000 + Math.random() * 19000);
}

/* //////////////////////////////////////// */

// Rain Drop Texture
rainCount = 9500;
cloudParticles = [];
rainGeo = new THREE.Geometry();
for (let i = 0; i < rainCount; i++) {
  rainDrop = new THREE.Vector3(
    Math.random() * 400 - 200,
    Math.random() * 500 - 250,
    Math.random() * 400 - 200
  );
  rainDrop.velocity = {};
  rainDrop.velocity = 0;
  rainGeo.vertices.push(rainDrop);
}

rainMaterial = new THREE.PointsMaterial({
  color: 0xaaaaaa,
  size: 0.1,
  transparent: true,
});

rain = new THREE.Points(rainGeo, rainMaterial);
scene.add(rain);

/* //////////////////////////////////////// */

// Smoke Texture Loader
let loader = new THREE.TextureLoader();
loader.load("https://raw.githubusercontent.com/navin-navi/codepen-assets/master/images/smoke.png", function (texture) {
  cloudGeo = new THREE.PlaneBufferGeometry(500, 500);
  cloudMaterial = new THREE.MeshLambertMaterial({
    map: texture,
    transparent: true,
  });

  for (let p = 0; p < 25; p++) {
    let cloud = new THREE.Mesh(cloudGeo, cloudMaterial);
    cloud.position.set(
      Math.random() * 800 - 400,
      500,
      Math.random() * 500 - 500
    );
    cloud.rotation.x = 1.16;
    cloud.rotation.y = -0.12;
    cloud.rotation.z = Math.random() * 2 * Math.PI;
    cloud.material.opacity = 0.55;
    cloudParticles.push(cloud);
    scene.add(cloud);
  }
});

/* //////////////////////////////////////// */

// Function to simulate lightning
function simulateLightning() {
  if (Math.random() > 0.96 || flash.power > 100) {
    flash.position.set(
      Math.random() * 400 - 200,
      300 + Math.random() * 200,
      100
    );
    flash.power = 50 + Math.random() * 500;
  }
}

/* //////////////////////////////////////// */

// Render animation on every rendering phase
function render() {
  renderer.render(scene, camera);
  requestAnimationFrame(render);

  // Cloud Rotation Animation
  cloudParticles.forEach((p) => {
    p.rotation.z -= 0.002;
  });

  // RainDrop Animation
  rainGeo.vertices.forEach((p) => {
    p.velocity -= 3 * Math.random() * 1;
    p.y += p.velocity;
    if (p.y < -100) {
      p.y = 100;
      p.velocity = 0;
    }
  });
  rainGeo.verticesNeedUpdate = true;
  rain.rotation.y += 0.002;

  // Lightning Simulation
  simulateLightning();
}

render();

/* //////////////////////////////////////// */

// Enable Fullscreen on Double-Click
document.addEventListener("dblclick", () => {
  if (!document.fullscreenElement) {
    document.body.requestFullscreen().then(() => {
      // Update renderer and camera to match the new fullscreen size
      resizeRendererToFullscreen();
    }).catch((err) => {
      console.error(`Error attempting to enable fullscreen mode: ${err.message}`);
    });
  } else {
    document.exitFullscreen().then(() => {
      // Update renderer and camera to match the window size when exiting fullscreen
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
