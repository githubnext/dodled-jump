import "./style.css";

// Three.js imports
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

// Set up the scene
const scene = new THREE.Scene();

// Set up the camera
const camera = new THREE.PerspectiveCamera(
  60, // Reduced FOV for more perspective depth
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 0, 10); // Moved camera back for better perspective

// Set up the renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x222222); // Set a nice background color

// Set up post-processing
const composer = new EffectComposer(renderer);

// Add the main render pass
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Custom pixelation shader
const PixelShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2() },
    pixelSize: { value: 8.0 }, // Reduced from 12.0 for finer pixelation
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float pixelSize;
    varying vec2 vUv;
    
    void main() {
      vec2 dxy = pixelSize / resolution;
      vec2 coord = dxy * floor(vUv / dxy);
      gl_FragColor = texture2D(tDiffuse, coord);
    }
  `,
};

// Add pixelation pass
const pixelPass = new ShaderPass(PixelShader);
pixelPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
composer.addPass(pixelPass);

const appElement = document.querySelector<HTMLDivElement>("#app");
if (appElement) {
  appElement.innerHTML = ""; // Clear existing content
  appElement.appendChild(renderer.domElement);
} else {
  console.error("Could not find #app element");
  document.body.appendChild(renderer.domElement); // Fallback to body
}

// Add lighting for platform shading
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3); // Soft ambient light
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 10, 5);
scene.add(directionalLight);

// Add a second light from a different angle for better platform illumination
const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
directionalLight2.position.set(-5, -5, 5);
scene.add(directionalLight2);

// Load the GLB model
const loader = new GLTFLoader();
let copilotModel: THREE.Group | null = null;

// Game state variables
const gameState = {
  gravity: -0.006, // Reduced gravity for more floaty feel
  jumpVelocity: 0.25, // Slightly lower jump velocity for more natural arc
  moveSpeed: 0.15,
  player: {
    velocity: { x: 0, y: 0 },
    position: { x: 0, y: 0 },
    radius: 0.5, // For collision detection
    onGround: false,
  },
  camera: {
    targetY: 0,
    smoothing: 0.05,
  },
  platforms: [] as Array<{
    position: { x: number; y: number };
    size: { width: number; height: number };
    mesh: THREE.Mesh;
  }>,
  nextPlatformY: 2,
  platformSpacing: 3.5, // Increased from 2.5 for more spacing
  score: 0,
  keys: {
    left: false,
    right: false,
  },
};

// Platform geometry and material with shading
const platformGeometry = new THREE.BoxGeometry(3, 0.3, 1); // Made platforms deeper for 3D effect

// Fun, bright colors for platforms - more saturated and vibrant
const platformColors = [
  0xffff00, // Bright yellow
  0xff00ff, // Magenta
  0x00ffff, // Cyan
  0xff0000, // Pure red
  0x00ff00, // Pure green
  0x0000ff, // Pure blue
  0xff8000, // Bright orange
  0x8000ff, // Purple
  0xff0080, // Hot pink
  0x80ff00, // Lime
  0x0080ff, // Sky blue
  0xff4080, // Rose
];

// Create platform material function to get different colors
function createPlatformMaterial(colorIndex: number) {
  const color = platformColors[colorIndex % platformColors.length];
  return new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.1, // Very smooth for maximum color pop
    metalness: 0.0, // No metallic properties for pure color
    emissive: color,
    emissiveIntensity: 0.4, // Much higher emission for super bright colors
  });
}

// Create initial platforms
function createPlatform(x: number, y: number) {
  // Use platform count to cycle through colors
  const colorIndex = gameState.platforms.length;

  const platform = {
    position: { x, y },
    size: { width: 3, height: 0.3 },
    mesh: new THREE.Mesh(platformGeometry, createPlatformMaterial(colorIndex)),
  };

  platform.mesh.position.set(x, y, 0);
  // Add slight random rotation to platforms for more 3D variety
  platform.mesh.rotation.z = (Math.random() - 0.5) * 0.1;
  platform.mesh.rotation.x = (Math.random() - 0.5) * 0.05;
  scene.add(platform.mesh);
  gameState.platforms.push(platform);

  return platform;
}

// Create starting platform
createPlatform(0, -2);

// Generate more platforms
function generatePlatforms() {
  while (gameState.platforms.length < 50) {
    const x = (Math.random() - 0.5) * 8; // Random x position within bounds
    createPlatform(x, gameState.nextPlatformY);
    gameState.nextPlatformY += gameState.platformSpacing;
  }
}

// Collision detection
function checkPlatformCollision() {
  if (gameState.player.velocity.y > 0) return; // Only check when falling

  for (const platform of gameState.platforms) {
    const playerX = gameState.player.position.x;
    const playerY = gameState.player.position.y;
    const playerRadius = gameState.player.radius;

    // Simple AABB collision detection
    const platformLeft = platform.position.x - platform.size.width / 2;
    const platformRight = platform.position.x + platform.size.width / 2;
    const platformTop = platform.position.y + platform.size.height / 2;
    const platformBottom = platform.position.y - platform.size.height / 2;

    // Check if player is above the platform and within x bounds
    if (
      playerX + playerRadius > platformLeft &&
      playerX - playerRadius < platformRight &&
      playerY - playerRadius <= platformTop &&
      playerY - playerRadius >= platformBottom
    ) {
      // Player lands on platform
      gameState.player.velocity.y = gameState.jumpVelocity;
      gameState.player.onGround = true;
      gameState.player.position.y = platformTop + playerRadius;

      // Update score based on height
      const currentScore = Math.floor(
        Math.max(0, gameState.player.position.y) / 2
      );
      if (currentScore > gameState.score) {
        gameState.score = currentScore;
      }

      break;
    }
  }
}

// Keyboard controls
const keys: { [key: string]: boolean } = {};

function handleKeyDown(event: KeyboardEvent) {
  keys[event.code] = true;

  switch (event.code) {
    case "ArrowLeft":
    case "KeyA":
      gameState.keys.left = true;
      break;
    case "ArrowRight":
    case "KeyD":
      gameState.keys.right = true;
      break;
  }
}

function handleKeyUp(event: KeyboardEvent) {
  keys[event.code] = false;

  switch (event.code) {
    case "ArrowLeft":
    case "KeyA":
      gameState.keys.left = false;
      break;
    case "ArrowRight":
    case "KeyD":
      gameState.keys.right = false;
      break;
  }
}

window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);

// Update game logic including score display
function updateGame() {
  if (!copilotModel) return;

  // Handle horizontal movement
  if (gameState.keys.left) {
    gameState.player.velocity.x = -gameState.moveSpeed;
  } else if (gameState.keys.right) {
    gameState.player.velocity.x = gameState.moveSpeed;
  } else {
    gameState.player.velocity.x *= 0.9; // Friction
  }

  // Apply gravity
  gameState.player.velocity.y += gameState.gravity;

  // Update player position
  gameState.player.position.x += gameState.player.velocity.x;
  gameState.player.position.y += gameState.player.velocity.y;

  // Screen wrapping for horizontal movement
  if (gameState.player.position.x > 6) {
    gameState.player.position.x = -6;
  } else if (gameState.player.position.x < -6) {
    gameState.player.position.x = 6;
  }

  // Check platform collisions
  checkPlatformCollision();

  // Update copilot model position
  copilotModel.position.x = gameState.player.position.x;
  copilotModel.position.y = gameState.player.position.y;

  // Make the head face the direction of movement
  if (Math.abs(gameState.player.velocity.x) > 0.01) {
    // Smoothly rotate the head based on movement direction
    const targetRotationY = gameState.player.velocity.x > 0 ? -0.3 : 0.3;
    copilotModel.rotation.y +=
      (targetRotationY - copilotModel.rotation.y) * 0.1;
  } else {
    // Return to center when not moving horizontally
    copilotModel.rotation.y += (0 - copilotModel.rotation.y) * 0.1;
  }

  // Add subtle bobbing based on vertical velocity for more natural feel
  const bobbingOffset = Math.sin(Date.now() * 0.005) * 0.05;
  copilotModel.rotation.z = gameState.player.velocity.y * 0.5 + bobbingOffset;

  // Animate particles for depth and motion
  particleTime += 0.016; // roughly 60fps
  const positions = particles.geometry.attributes.position
    .array as Float32Array;

  const cameraCurrentX = camera.position.x;
  const cameraY = camera.position.y;

  // Dynamically calculate particle spread based on camera's current FOV and aspect
  const distanceToParticlePlane = 10;
  const halfVisibleHeight =
    Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
    distanceToParticlePlane;
  const halfVisibleWidth = halfVisibleHeight * camera.aspect;

  const particleSpreadX = halfVisibleWidth * 1.5; // Increased horizontal spread
  const particleSpreadY = halfVisibleHeight * 2; // Increased vertical spread
  const particleSpreadZ = 10;

  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    let pX = positions[i3];
    let pY = positions[i3 + 1];
    let pZ = positions[i3 + 2];

    // Gentle floating motion with unique phases per particle
    const phaseX = particleTime + i * 0.1;
    const phaseY = particleTime + i * 0.05;
    const phaseZ = particleTime + i * 0.08;

    pX += Math.sin(phaseX) * 0.002; // x drift
    pY += Math.cos(phaseY) * 0.001; // y float
    pZ += Math.sin(phaseZ) * 0.0015; // z sway

    // Add downward drift to create sense of upward movement
    pY -= 0.01; // Constant downward drift

    // Only respawn particles that fall below the visible area at the TOP
    if (pY < cameraY - particleSpreadY) {
      // Respawn at top with random X and Z positions
      pY = cameraY + particleSpreadY + Math.random() * 5; // Spawn above visible area
      pX = cameraCurrentX + (Math.random() - 0.5) * particleSpreadX * 2;
      pZ = (Math.random() - 0.5) * particleSpreadZ * 2;
    }

    // Handle horizontal wrapping (like the player)
    if (pX > cameraCurrentX + particleSpreadX) {
      pX = cameraCurrentX - particleSpreadX;
    } else if (pX < cameraCurrentX - particleSpreadX) {
      pX = cameraCurrentX + particleSpreadX;
    }

    // Handle Z-axis bounds
    if (pZ < -particleSpreadZ) {
      pZ = particleSpreadZ;
    } else if (pZ > particleSpreadZ) {
      pZ = -particleSpreadZ;
    }

    positions[i3] = pX;
    positions[i3 + 1] = pY;
    positions[i3 + 2] = pZ;
  }

  particles.geometry.attributes.position.needsUpdate = true;

  // Smooth camera follow
  gameState.camera.targetY = gameState.player.position.y;
  camera.position.y +=
    (gameState.camera.targetY - camera.position.y) * gameState.camera.smoothing;

  // Add subtle parallax effect based on player movement
  camera.position.x += gameState.player.velocity.x * 0.3;

  // Generate more platforms as needed
  if (gameState.player.position.y > gameState.nextPlatformY - 20) {
    generatePlatforms();
  }

  // Remove platforms that are too far below
  gameState.platforms = gameState.platforms.filter((platform) => {
    if (platform.position.y < camera.position.y - 15) {
      scene.remove(platform.mesh);
      return false;
    }
    return true;
  });

  // Update score display
  scoreElement.textContent = `Score: ${gameState.score}`;

  // Game over check (fell too far below screen)
  if (gameState.player.position.y < camera.position.y - 10) {
    // Reset game
    gameState.player.position.x = 0;
    gameState.player.position.y = 0;
    gameState.player.velocity.x = 0;
    gameState.player.velocity.y = 0;
    gameState.score = 0;
    camera.position.y = 0;
    gameState.camera.targetY = 0;

    // Clear platforms and regenerate
    gameState.platforms.forEach((platform) => scene.remove(platform.mesh));
    gameState.platforms = [];
    gameState.nextPlatformY = 2;
    createPlatform(0, -2);
    generatePlatforms();

    // Reset particle positions around the reset camera position
    const positions = particles.geometry.attributes.position
      .array as Float32Array;
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 40; // x - wider spread
      positions[i3 + 1] = (Math.random() - 0.5) * 80 - 40; // y around starting position
      positions[i3 + 2] = (Math.random() - 0.5) * 15; // z - consistent with recycling range
    }
    particles.geometry.attributes.position.needsUpdate = true;
  }
}

// Generate initial platforms
generatePlatforms();

// Create ambient particle system for depth and motion (star-like particles)
const particleCount = 200; // Increased back to 200 for better coverage
const particleGeometry = new THREE.BufferGeometry();
const particlePositions = new Float32Array(particleCount * 3); // Declare once here
const particleColorsArray = new Float32Array(particleCount * 3); // White star colors

// Initialize particles
for (let i = 0; i < particleCount; i++) {
  const i3 = i * 3;

  // Random positions spread around the scene, initially around camera
  particlePositions[i3] = (Math.random() - 0.5) * 40; // x - even wider spread
  particlePositions[i3 + 1] = Math.random() * 80 - 40; // y - larger vertical spread around starting position
  particlePositions[i3 + 2] = (Math.random() - 0.5) * 15; // z - consistent with recycling range

  // Set all particles to white with slight brightness variation for star-like effect
  const brightness = 0.8 + Math.random() * 0.2; // Random brightness between 0.8 and 1.0
  particleColorsArray[i3] = brightness; // R
  particleColorsArray[i3 + 1] = brightness; // G  
  particleColorsArray[i3 + 2] = brightness; // B
}

particleGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(particlePositions, 3)
);
particleGeometry.setAttribute(
  "color",
  new THREE.BufferAttribute(particleColorsArray, 3)
);

const particleMaterial = new THREE.PointsMaterial({
  size: 0.15, // Slightly larger for better star visibility
  vertexColors: true,
  transparent: true,
  opacity: 0.9, // Higher opacity for brighter stars
  blending: THREE.AdditiveBlending,
});

const particles = new THREE.Points(particleGeometry, particleMaterial);
scene.add(particles);

// Particle animation variables
let particleTime = 0;

// Set up DRACO loader (even though we don't need it, Three.js expects it)
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(
  "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
);
loader.setDRACOLoader(dracoLoader);

loader.load(
  "/copilot.glb",
  (gltf) => {
    copilotModel = gltf.scene;

    // Array of brand colors to assign to different parts
    const colors = [
      0xc4ff00, // Bright lime green (main background)
      0x9aff00, // Lime green (lighter variant)
      0x7fff00, // Chartreuse green
      0x32cd32, // Lime green (darker variant)
      0xff69b4, // Hot pink (from pixel art character)
      0xff1493, // Deep pink
      0xff6347, // Tomato red
      0x000000, // Black (from text)
      0xffffff, // White (from pixel art character)
      0x2f2f2f, // Dark gray
      0xadff2f, // Green yellow
      0x98fb98, // Pale green
    ];

    // Apply MeshBasicMaterial with different colors to each child
    let colorIndex = 0;
    copilotModel.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const color = colors[colorIndex % colors.length];
        child.material = new THREE.MeshBasicMaterial({
          color: color,
        });
        colorIndex++;
      }
    });

    // Center the model
    const box = new THREE.Box3().setFromObject(copilotModel);
    const center = box.getCenter(new THREE.Vector3());
    copilotModel.position.sub(center);

    // Scale the model to fit nicely in view
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 1.5 / maxDim; // Made slightly smaller for the game
    copilotModel.scale.setScalar(scale);

    // Set initial player position
    gameState.player.position.x = 0;
    gameState.player.position.y = 0;
    copilotModel.position.set(0, 0, 0);

    scene.add(copilotModel);
    console.log("Copilot model loaded successfully!");
    console.log(`Applied colors to ${colorIndex} mesh children`);
  },
  (progress) => {
    console.log(
      "Loading progress:",
      (progress.loaded / progress.total) * 100 + "%"
    );
  },
  (error) => {
    console.error("Error loading GLB model:", error);
  }
);

// OrbitControls - disable for game mode
// const controls = new OrbitControls(camera, renderer.domElement);

// Remove old mouse interaction code since we're now a jumping game
// const raycaster = new THREE.Raycaster();
// const mouse = new THREE.Vector2();

// Add UI for score display
const scoreElement = document.createElement("div");
scoreElement.style.position = "fixed";
scoreElement.style.top = "20px";
scoreElement.style.left = "20px";
scoreElement.style.color = "#c4ff00";
scoreElement.style.fontSize = "24px";
scoreElement.style.fontFamily = "monospace";
scoreElement.style.zIndex = "1000";
scoreElement.style.textShadow = "2px 2px 4px rgba(0,0,0,0.8)";
scoreElement.textContent = "Score: 0";
document.body.appendChild(scoreElement);

// Add instructions
const instructionsElement = document.createElement("div");
instructionsElement.style.position = "fixed";
instructionsElement.style.bottom = "20px";
instructionsElement.style.left = "20px";
instructionsElement.style.color = "#c4ff00";
instructionsElement.style.fontSize = "16px";
instructionsElement.style.fontFamily = "monospace";
instructionsElement.style.zIndex = "1000";
instructionsElement.style.textShadow = "2px 2px 4px rgba(0,0,0,0.8)";
instructionsElement.innerHTML =
  "Use ← → arrow keys or A/D to move<br>Jump on platforms to go higher!";
document.body.appendChild(instructionsElement);

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  // Update game logic
  updateGame();

  // Render with post-processing instead of direct renderer
  composer.render();
}
animate();

// Handle resizing
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Update post-processing resolution
  composer.setSize(window.innerWidth, window.innerHeight);
  pixelPass.uniforms.resolution.value.set(
    window.innerWidth,
    window.innerHeight
  );
});
