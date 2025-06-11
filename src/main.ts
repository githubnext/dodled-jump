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

// Digital Glitch shader for platform hits
const GlitchShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2() },
    time: { value: 0.0 },
    glitchIntensity: { value: 0.0 },
    digitalNoiseIntensity: { value: 0.0 },
    rgbShiftIntensity: { value: 0.0 },
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
    uniform float time;
    uniform float glitchIntensity;
    uniform float digitalNoiseIntensity;
    uniform float rgbShiftIntensity;
    varying vec2 vUv;
    
    // Random function for glitch effects
    float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }
    
    // Digital block noise
    float digitalNoise(vec2 uv, float scale) {
      vec2 grid = floor(uv * scale);
      return random(grid + time);
    }
    
    void main() {
      vec2 uv = vUv;
      
      // Moderate horizontal glitch lines
      float glitchLine = digitalNoise(vec2(0.0, uv.y), 15.0 + time * 6.0);
      if (glitchLine > 0.8 && glitchIntensity > 0.1) {
        // Moderate horizontal displacement
        uv.x += (random(vec2(uv.y, time)) - 0.5) * glitchIntensity * 0.15;
      }
      
      // Moderate RGB shift
      vec2 redShift = uv + vec2(rgbShiftIntensity * 0.02, 0.0);
      vec2 blueShift = uv - vec2(rgbShiftIntensity * 0.02, 0.0);
      
      float r = texture2D(tDiffuse, redShift).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, blueShift).b;
      
      vec3 color = vec3(r, g, b);
      
      // Moderate digital noise overlay
      if (digitalNoiseIntensity > 0.0) {
        float noise = digitalNoise(uv, 60.0);
        if (noise > 0.9) {
          // Create subtle colored digital noise
          vec3 noiseColor = vec3(
            random(uv + time),
            random(uv + time + 1.0),
            random(uv + time + 2.0)
          );
          color = mix(color, noiseColor, digitalNoiseIntensity * 0.5);
        }
      }
      
      // Moderate datamoshing effect
      if (glitchIntensity > 0.7) {
        float moshLine = digitalNoise(vec2(0.0, uv.y), 8.0);
        if (moshLine > 0.7) {
          vec2 moshUV = uv;
          moshUV.x += sin(uv.y * 25.0 + time * 12.0) * glitchIntensity * 0.08;
          color = mix(color, texture2D(tDiffuse, moshUV).rgb, 0.6);
        }
      }
      
      // Subtle screen tearing effect (only for higher intensities)
      if (glitchIntensity > 1.2) {
        float tearLine = digitalNoise(vec2(0.0, uv.y), 6.0);
        if (tearLine > 0.85) {
          uv.y += (random(vec2(uv.x, time)) - 0.5) * glitchIntensity * 0.05;
          color = texture2D(tDiffuse, uv).rgb;
        }
      }
      
      // Very subtle color channel corruption (only for highest intensities)
      if (glitchIntensity > 1.5) {
        float corruptLine = digitalNoise(vec2(0.0, uv.y), 12.0);
        if (corruptLine > 0.95) {
          // Occasionally swap color channels
          float channelCorrupt = random(vec2(uv.y, time));
          if (channelCorrupt > 0.8) {
            color = color.gbr; // Swap channels
          }
        }
      }
      
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

// CRT + RGB separation shader for retro effect
const CRTShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2() },
    time: { value: 0.0 },
    aberrationStrength: { value: 0.003 },
    scanlineIntensity: { value: 0.6 }, // Increased from 0.4 for more visible scanlines
    vignetteStrength: { value: 0.3 },
    noiseIntensity: { value: 0.08 },
    curvature: { value: 0.15 },
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
    uniform float time;
    uniform float aberrationStrength;
    uniform float scanlineIntensity;
    uniform float vignetteStrength;
    uniform float noiseIntensity;
    uniform float curvature;
    varying vec2 vUv;
    
    // Random function for noise
    float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }
    
    // CRT barrel distortion
    vec2 barrelDistortion(vec2 coord, float amount) {
      vec2 cc = coord - 0.5;
      float dist = dot(cc, cc);
      return coord + cc * dist * amount;
    }
    
    void main() {
      vec2 uv = vUv;
      
      // Apply barrel distortion for CRT curvature
      uv = barrelDistortion(uv, curvature);
      
      // Clamp to avoid sampling outside texture
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
      
      // RGB chromatic aberration
      float r = texture2D(tDiffuse, uv + vec2(aberrationStrength, 0.0)).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - vec2(aberrationStrength, 0.0)).b;
      
      vec3 color = vec3(r, g, b);
      
      // Enhanced scanlines with movement
      float scanlineFreq = resolution.y * 0.5; // Adjust frequency based on resolution
      float scanlineOffset = time * 2.0; // Slow scrolling scanlines
      float scanline = sin((uv.y * scanlineFreq + scanlineOffset) * 3.14159);
      scanline = smoothstep(0.0, 1.0, scanline * 0.5 + 0.5);
      
      // Add alternating scanline intensity for more authentic CRT look
      float alternatingScanline = sin(uv.y * scanlineFreq * 2.0) * 0.5 + 0.5;
      scanline = mix(scanline, alternatingScanline, 0.3);
      
      color *= 1.0 - scanlineIntensity + scanlineIntensity * scanline;
      
      // Vignette effect
      vec2 vignetteUV = uv * (1.0 - uv.yx);
      float vignette = vignetteUV.x * vignetteUV.y * 15.0;
      vignette = pow(vignette, vignetteStrength);
      color *= vignette;
      
      // TV noise
      float noise = random(uv + time * 0.1) * noiseIntensity;
      color += noise;
      
      // Subtle color boost for retro feel
      color = pow(color, vec3(0.9));
      color *= 1.1;
      
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

// Add pixelation pass
const pixelPass = new ShaderPass(PixelShader);
pixelPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
composer.addPass(pixelPass);

// Add glitch shader pass for platform hits
const glitchPass = new ShaderPass(GlitchShader);
glitchPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
composer.addPass(glitchPass);

// Add CRT shader pass for retro RGB effects
const crtPass = new ShaderPass(CRTShader);
crtPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
composer.addPass(crtPass);

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
    spinning: false,
    spinAxis: new THREE.Vector3(),
    spinProgress: 0,
    spinSpeed: 0.015, // Speed of the spin animation - much slower for a controlled trick effect
  },
  world: {
    offset: 0, // How much the world has moved down
    targetOffset: 0, // Target world offset for smooth following
    smoothing: 0.05,
  },
  glitch: {
    active: false,
    intensity: 0,
    digitalNoise: 0,
    rgbShift: 0,
    duration: 0,
    maxDuration: 0.35, // Slightly shorter - 350ms
  },
  platforms: [] as Array<{
    position: { x: number; y: number };
    size: { width: number; height: number };
    mesh: THREE.Mesh;
    colorIndex: number; // Store the color index for explosion matching
  }>,
  explosions: [] as Array<{
    particles: THREE.Points;
    velocities: Float32Array;
    life: number;
    maxLife: number;
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

// Create explosion particle system
function createExplosion(x: number, y: number, platformColor: number) {
  const explosionParticleCount = 12; // Reduced for more subtle effect
  const explosionGeometry = new THREE.BufferGeometry();
  const explosionPositions = new Float32Array(explosionParticleCount * 3);
  const explosionColors = new Float32Array(explosionParticleCount * 3);
  const explosionVelocities = new Float32Array(explosionParticleCount * 3);

  // Get RGB values from the platform color
  const color = new THREE.Color(platformColor);

  for (let i = 0; i < explosionParticleCount; i++) {
    const i3 = i * 3;

    // Start all particles at collision point
    explosionPositions[i3] = x;
    explosionPositions[i3 + 1] = y;
    explosionPositions[i3 + 2] = 0;

    // Smaller, more subtle velocities
    const angle =
      (i / explosionParticleCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4; // Less spread
    const speed = 0.08 + Math.random() * 0.1; // Slower, more subtle particles
    explosionVelocities[i3] = Math.cos(angle) * speed;
    explosionVelocities[i3 + 1] = Math.sin(angle) * speed + 0.05; // Less upward bias
    explosionVelocities[i3 + 2] = (Math.random() - 0.5) * 0.04; // Less z movement

    // Use platform color with subtle brightness variation
    const brightness = 0.8 + Math.random() * 0.2;
    explosionColors[i3] = color.r * brightness;
    explosionColors[i3 + 1] = color.g * brightness;
    explosionColors[i3 + 2] = color.b * brightness;
  }

  explosionGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(explosionPositions, 3)
  );
  explosionGeometry.setAttribute(
    "color",
    new THREE.BufferAttribute(explosionColors, 3)
  );

  const explosionMaterial = new THREE.PointsMaterial({
    size: 0.2, // Much smaller, more subtle particles
    vertexColors: true,
    transparent: true,
    opacity: 0.8, // Slightly transparent for subtlety
    blending: THREE.AdditiveBlending,
  });

  const explosionParticles = new THREE.Points(
    explosionGeometry,
    explosionMaterial
  );
  scene.add(explosionParticles);

  // Add to explosion tracking
  gameState.explosions.push({
    particles: explosionParticles,
    velocities: explosionVelocities,
    life: 0,
    maxLife: 0.8, // Shorter lifetime for more subtle effect
  });
}

// Trigger glitch effect
function triggerGlitch() {
  gameState.glitch.active = true;
  gameState.glitch.duration = 0;
  gameState.glitch.intensity = 1.0 + Math.random() * 0.8; // More reasonable 1.0-1.8
  gameState.glitch.digitalNoise = 0.4 + Math.random() * 0.3; // Toned down digital noise
  gameState.glitch.rgbShift = 1.0 + Math.random() * 0.8; // More reasonable RGB shift
}

// Create initial platforms
function createPlatform(x: number, y: number) {
  // Use platform count to cycle through colors
  const colorIndex = gameState.platforms.length;

  const platform = {
    position: { x, y },
    size: { width: 3, height: 0.3 },
    mesh: new THREE.Mesh(platformGeometry, createPlatformMaterial(colorIndex)),
    colorIndex: colorIndex, // Store the color index for explosion matching
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

      // Create explosion at collision point
      const explosionX = playerX;
      const explosionY = platformTop; // Right at the platform surface
      const platformColor =
        platformColors[platform.colorIndex % platformColors.length];
      createExplosion(explosionX, explosionY, platformColor);

      // Trigger glitch effect on platform hit
      triggerGlitch();

      // Start spin effect with random axis (only 20% chance)
      if (Math.random() < 0.2) {
        gameState.player.spinning = true;
        gameState.player.spinProgress = 0;

        // Generate a random spin axis (normalized)
        gameState.player.spinAxis
          .set(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
          )
          .normalize();
      }

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

  // Reset onGround flag for next frame
  gameState.player.onGround = false;

  // Update copilot model position
  copilotModel.position.x = gameState.player.position.x;
  copilotModel.position.y = gameState.player.position.y;

  // Handle spinning animation
  if (gameState.player.spinning) {
    gameState.player.spinProgress += gameState.player.spinSpeed;

    // Apply easing function for smooth spin animation
    // Using smoothstep for ease-in-out effect: 3t² - 2t³
    const t = Math.min(gameState.player.spinProgress, 1);
    const easedProgress = t * t * (3 - 2 * t);

    // Create rotation around the random axis with easing
    const spinAngle = easedProgress * Math.PI * 2; // Full 360 degree spin with easing

    // Apply rotation around the random axis
    copilotModel.setRotationFromAxisAngle(gameState.player.spinAxis, spinAngle);

    // Stop spinning after one full rotation
    if (gameState.player.spinProgress >= 1) {
      gameState.player.spinning = false;
      gameState.player.spinProgress = 0;
      // Reset rotation to identity
      copilotModel.rotation.set(0, 0, 0);
    }
  } else {
    // Make the head face the direction of movement (only when not spinning)
    if (Math.abs(gameState.player.velocity.x) > 0.01) {
      // Smoothly rotate the head based on movement direction - increased rotation for more dramatic effect
      const targetRotationY = gameState.player.velocity.x > 0 ? 0.8 : -0.8;
      copilotModel.rotation.y +=
        (targetRotationY - copilotModel.rotation.y) * 0.1;
    } else {
      // Return to center when not moving horizontally
      copilotModel.rotation.y += (0 - copilotModel.rotation.y) * 0.1;
    }

    // Reset X rotation and add subtle bobbing based on vertical velocity
    copilotModel.rotation.x = 0;
    const bobbingOffset = Math.sin(Date.now() * 0.005) * 0.05;
    copilotModel.rotation.z = gameState.player.velocity.y * 0.5 + bobbingOffset;
  }

  // Animate particles for depth and motion
  particleTime += 0.016; // roughly 60fps
  const positions = particles.geometry.attributes.position
    .array as Float32Array;

  // Fixed camera position (camera doesn't move)
  const cameraCurrentX = 0; // Camera stays at origin
  const cameraY = 0; // Camera stays at origin

  // Dynamically calculate particle spread based on camera's current FOV and aspect
  const distanceToParticlePlane = 10;
  const halfVisibleHeight =
    Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
    distanceToParticlePlane;
  const halfVisibleWidth = halfVisibleHeight * camera.aspect;

  const particleSpreadX = halfVisibleWidth * 1.5; // Increased horizontal spread
  const particleSpreadY = halfVisibleHeight * 2; // Increased vertical spread
  const particleSpreadZ = 10;

  // Calculate downward particle movement based on player's upward velocity
  const baseDownwardSpeed = 0; // Base speed particles move down
  const velocityMultiplier = Math.max(0, gameState.player.velocity.y); // Extra speed based on upward velocity
  const totalDownwardSpeed = baseDownwardSpeed + velocityMultiplier;

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

    // Move particles downward to create illusion of upward motion
    pY -= totalDownwardSpeed;

    // Respawn particles that fall below the visible area at the TOP
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

  // Update glitch effect
  if (gameState.glitch.active) {
    gameState.glitch.duration += 0.016; // roughly 60fps
    
    // Calculate decay progress (0 = start, 1 = end)
    const progress = gameState.glitch.duration / gameState.glitch.maxDuration;
    
    if (progress >= 1) {
      // Glitch effect finished
      gameState.glitch.active = false;
      glitchPass.uniforms.glitchIntensity.value = 0;
      glitchPass.uniforms.digitalNoiseIntensity.value = 0;
      glitchPass.uniforms.rgbShiftIntensity.value = 0;
    } else {
      // Apply smooth easing with subtle flickering
      let easeOut = 1 - Math.pow(progress, 1.8); // Smooth falloff
      
      // Add subtle flickering to the decay for some chaos but not too much
      const flicker = Math.sin(progress * 20.0) * 0.1 + 0.9; // Oscillation between 0.8-1.0
      easeOut *= flicker;
      
      glitchPass.uniforms.glitchIntensity.value = gameState.glitch.intensity * easeOut;
      glitchPass.uniforms.digitalNoiseIntensity.value = gameState.glitch.digitalNoise * easeOut;
      glitchPass.uniforms.rgbShiftIntensity.value = gameState.glitch.rgbShift * easeOut;
    }
  }

  // Update explosions
  for (let i = gameState.explosions.length - 1; i >= 0; i--) {
    const explosion = gameState.explosions[i];
    explosion.life += 0.016; // roughly 60fps

    const positions = explosion.particles.geometry.attributes.position
      .array as Float32Array;
    const velocities = explosion.velocities;
    const material = explosion.particles.material as THREE.PointsMaterial;

    // Update particle positions and apply gravity/drag
    for (let j = 0; j < positions.length; j += 3) {
      // Apply velocity
      positions[j] += velocities[j]; // x
      positions[j + 1] += velocities[j + 1]; // y
      positions[j + 2] += velocities[j + 2]; // z

      // Apply drag and gravity
      velocities[j] *= 0.98; // x drag
      velocities[j + 1] *= 0.98; // y drag
      velocities[j + 1] -= 0.003; // gravity
      velocities[j + 2] *= 0.98; // z drag
    }

    explosion.particles.geometry.attributes.position.needsUpdate = true;

    // Fade out over time
    const fadeProgress = explosion.life / explosion.maxLife;
    material.opacity = Math.max(0, 1 - fadeProgress);
    material.size = 0.3 * (1 - fadeProgress * 0.5); // Shrink particles

    // Remove expired explosions
    if (explosion.life >= explosion.maxLife) {
      scene.remove(explosion.particles);
      explosion.particles.geometry.dispose();
      if (explosion.particles.material instanceof THREE.Material) {
        explosion.particles.material.dispose();
      }
      gameState.explosions.splice(i, 1);
    }
  }

  // Smooth world offset follow - move world down as player goes up
  gameState.world.targetOffset = -gameState.player.position.y;
  gameState.world.offset +=
    (gameState.world.targetOffset - gameState.world.offset) *
    gameState.world.smoothing;

  // Update all platform positions based on world offset
  gameState.platforms.forEach((platform) => {
    platform.mesh.position.y = platform.position.y + gameState.world.offset;
  });

  // Update explosion particles positions with world offset
  gameState.explosions.forEach((explosion) => {
    explosion.particles.position.y = gameState.world.offset;
  });

  // Update copilot model position with world offset
  if (copilotModel) {
    copilotModel.position.x = gameState.player.position.x;
    copilotModel.position.y =
      gameState.player.position.y + gameState.world.offset;
  }

  // Add subtle parallax effect based on player movement
  // No longer need to move camera, but we can add subtle screen shake or other effects here if desired

  // Generate more platforms as needed
  if (gameState.player.position.y > gameState.nextPlatformY - 20) {
    generatePlatforms();
  }

  // Remove platforms that are too far below (relative to player position)
  gameState.platforms = gameState.platforms.filter((platform) => {
    if (platform.position.y < gameState.player.position.y - 15) {
      scene.remove(platform.mesh);
      return false;
    }
    return true;
  });

  // Update score display
  scoreElement.textContent = `Score: ${gameState.score}`;

  // Game over check (fell too far below screen) - now relative to world position
  if (gameState.player.position.y + gameState.world.offset < -10) {
    // Reset game
    gameState.player.position.x = 0;
    gameState.player.position.y = 0;
    gameState.player.velocity.x = 0;
    gameState.player.velocity.y = 0;
    gameState.player.spinning = false;
    gameState.player.spinProgress = 0;
    gameState.score = 0;
    gameState.world.offset = 0;
    gameState.world.targetOffset = 0;

    // Clear platforms and regenerate
    gameState.platforms.forEach((platform) => scene.remove(platform.mesh));
    gameState.platforms = [];
    gameState.nextPlatformY = 2;
    createPlatform(0, -2);
    generatePlatforms();

    // Clear explosions
    gameState.explosions.forEach((explosion) => {
      scene.remove(explosion.particles);
      explosion.particles.geometry.dispose();
      if (explosion.particles.material instanceof THREE.Material) {
        explosion.particles.material.dispose();
      }
    });
    gameState.explosions = [];

    // Reset particle positions around the reset world position
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
scoreElement.style.fontFamily = "'DepartureMono', 'Courier New', monospace";
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
instructionsElement.style.fontFamily =
  "'DepartureMono', 'Courier New', monospace";
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

  // Update CRT shader time uniform for animated effects
  crtPass.uniforms.time.value = Date.now() * 0.001;
  
  // Update glitch shader time uniform
  glitchPass.uniforms.time.value = Date.now() * 0.001;

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
  glitchPass.uniforms.resolution.value.set(
    window.innerWidth,
    window.innerHeight
  );
  crtPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
});
