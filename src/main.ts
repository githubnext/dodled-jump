import "./style.css";

// Three.js imports
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

// Set up the scene
const scene = new THREE.Scene();

// Create atmospheric space background
function createSpaceBackground() {
  // Create background geometry - a large sphere that encompasses the scene
  const backgroundGeometry = new THREE.SphereGeometry(500, 32, 16);

  // Create gradient material for nebula-like space atmosphere
  const backgroundMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0.0 },
      resolution: {
        value: new THREE.Vector2(window.innerWidth, window.innerHeight),
      },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPosition;
      
      void main() {
        vUv = uv;
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec2 resolution;
      varying vec2 vUv;
      varying vec3 vPosition;
      
      // Noise function for atmospheric effects
      float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
      }
      
      float noise(vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);
        float a = random(i);
        float b = random(i + vec2(1.0, 0.0));
        float c = random(i + vec2(0.0, 1.0));
        float d = random(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }
      
      void main() {
        vec2 uv = vUv;
        
        // Create vertical gradient from dark purple/blue at bottom to deep space at top
        float gradientFactor = smoothstep(0.0, 1.0, uv.y);
        
        // Base colors for space atmosphere
        vec3 deepSpace = vec3(0.02, 0.02, 0.08); // Very dark blue
        vec3 nebulaPurple = vec3(0.12, 0.04, 0.15); // Dark purple
        vec3 nebulaBlue = vec3(0.08, 0.12, 0.25); // Dark blue
        
        // Create base gradient
        vec3 baseColor = mix(nebulaPurple, deepSpace, gradientFactor);
        
        // Add subtle noise for atmospheric variation
        float noiseScale1 = 3.0;
        float noiseScale2 = 8.0;
        float n1 = noise(uv * noiseScale1 + time * 0.02);
        float n2 = noise(uv * noiseScale2 + time * 0.015);
        
        // Combine noise layers
        float atmosphericNoise = n1 * 0.6 + n2 * 0.4;
        
        // Create subtle color variations
        vec3 colorVariation = mix(baseColor, nebulaBlue, atmosphericNoise * 0.3);
        
        // Add very subtle brightness variation
        colorVariation *= 0.8 + atmosphericNoise * 0.4;
        
        // Add some distant "stars" - very sparse
        float starNoise = noise(uv * 200.0);
        if (starNoise > 0.98) {
          colorVariation += vec3(0.3, 0.3, 0.4) * (starNoise - 0.98) * 50.0;
        }
        
        gl_FragColor = vec4(colorVariation, 1.0);
      }
    `,
    side: THREE.BackSide, // Render on the inside of the sphere
    depthWrite: false,
    depthTest: false,
  });

  const backgroundMesh = new THREE.Mesh(backgroundGeometry, backgroundMaterial);

  // Make sure background renders first
  backgroundMesh.renderOrder = -1;

  return backgroundMesh;
}

// Create and add the space background
const spaceBackground = createSpaceBackground();
scene.add(spaceBackground);

// Calculate responsive field of view based on screen size
function getResponsiveFOV(): number {
  const minFOV = 60; // Current desktop FOV
  const maxFOV = 100; // Wider view for small screens to fit more content
  const minWidth = 320; // Minimum expected screen width
  const maxWidth = 1200; // Width at which we reach min FOV
  
  const screenWidth = Math.min(window.innerWidth, window.innerHeight * 1.5);
  const fov = minFOV + (maxFOV - minFOV) * 
    Math.min(1, Math.max(0, (maxWidth - screenWidth) / (maxWidth - minWidth)));
  
  return fov;
}

// Calculate responsive camera positions based on screen size
function getResponsiveCameraPositions() {
  const minIntroZ = 3.0; // Current desktop intro position
  const maxIntroZ = 4.0; // Further back for mobile
  const minGameZ = 10.0; // Current desktop game position
  const maxGameZ = 13.0; // Further back for mobile
  const minWidth = 320;
  const maxWidth = 1200;
  
  const screenWidth = Math.min(window.innerWidth, window.innerHeight * 1.5);
  const t = Math.min(1, Math.max(0, (maxWidth - screenWidth) / (maxWidth - minWidth)));
  
  return {
    introZ: minIntroZ + (maxIntroZ - minIntroZ) * t,
    gameZ: minGameZ + (maxGameZ - minGameZ) * t
  };
}

// Camera state for intro/game transitions
const cameraPositions = getResponsiveCameraPositions();

// Set up the camera with responsive FOV
const camera = new THREE.PerspectiveCamera(
  getResponsiveFOV(), // Responsive FOV for better mobile scaling
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 0, cameraPositions.gameZ); // Responsive camera position
const cameraState = {
  introPosition: { x: 0, y: 0, z: cameraPositions.introZ }, // Responsive intro position
  gamePosition: { x: 0, y: 0, z: cameraPositions.gameZ }, // Responsive game position
  animating: false,
  animationProgress: 0,
  animationDuration: 0.6, // 0.6 seconds for much more snappy camera animation
};

// Set initial camera position to intro position
camera.position.set(
  cameraState.introPosition.x,
  cameraState.introPosition.y,
  cameraState.introPosition.z
);

// Set up the renderer
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setSize(window.innerWidth, window.innerHeight);
// Remove the solid background color - we'll use a gradient background instead

// Set up post-processing
const composer = new EffectComposer(renderer);

// Add the main render pass
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Calculate responsive pixel size based on screen size
function getResponsivePixelSize(): number {
  const minPixelSize = 2.0; // Smaller pixels for mobile
  const maxPixelSize = 8.0; // Current desktop pixel size
  const minWidth = 320; // Minimum expected screen width
  const maxWidth = 1200; // Width at which we reach max pixel size
  
  const screenWidth = Math.min(window.innerWidth, window.innerHeight * 1.5);
  const pixelSize = minPixelSize + (maxPixelSize - minPixelSize) * 
    Math.min(1, Math.max(0, (screenWidth - minWidth) / (maxWidth - minWidth)));
  
  return pixelSize;
}

// Calculate responsive scanline size based on screen size
function getResponsiveScanlineSize(): number {
  const minScanlineSize = 2; // Thinner scanlines for mobile
  const maxScanlineSize = 5; // Current desktop scanline size
  const minWidth = 320; // Minimum expected screen width
  const maxWidth = 1200; // Width at which we reach max scanline size
  
  const screenWidth = Math.min(window.innerWidth, window.innerHeight * 1.5);
  const scanlineSize = minScanlineSize + (maxScanlineSize - minScanlineSize) * 
    Math.min(1, Math.max(0, (screenWidth - minWidth) / (maxWidth - minWidth)));
  
  return Math.round(scanlineSize);
}

// Custom pixelation shader
const PixelShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2() },
    pixelSize: { value: getResponsivePixelSize() }, // Responsive pixel size
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

// CRT shader for RGB chromatic aberration, vignette, noise, and barrel distortion
// (scanlines are now handled by CSS overlay)
const CRTShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2() },
    time: { value: 0.0 },
    aberrationStrength: { value: 0.003 },

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
      

      color *= 0.8;
      
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
      
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

// Add pixelation pass
const pixelPass = new ShaderPass(PixelShader);
pixelPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
composer.addPass(pixelPass);

// Add subtle bloom effect after pixelation for glowing elements
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.8, // Strength - more visible bloom
  1.2, // Radius - wider spread
  0.3 // Threshold - lower threshold so more elements bloom
);
composer.addPass(bloomPass);

// Add glitch shader pass for platform hits
const glitchPass = new ShaderPass(GlitchShader);
glitchPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
composer.addPass(glitchPass);

// Add CRT shader pass for RGB aberration, vignette, noise, and barrel distortion
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

// Add CRT scanlines overlay
const crtOverlay = document.createElement("div");
crtOverlay.className = "crt-overlay";
document.body.appendChild(crtOverlay);

// Function to update scanline size responsively
function updateScanlineSize() {
  const scanlineSize = getResponsiveScanlineSize();
  if (crtOverlay) {
    crtOverlay.style.backgroundSize = `100% ${scanlineSize}px`;
  }
}

// Apply initial scanline size
updateScanlineSize();

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

// Audio setup for sound effects and background music
let audioContext: AudioContext | null = null;
let isAudioInitialized = false;
let backgroundMusic: AudioBufferSourceNode | null = null;
let musicBuffer: AudioBuffer | null = null;
let musicGainNode: GainNode | null = null;
let isMuted = false;
let musicFadeTimeout: number | null = null; // Track fade timeout for cleanup

// Load and decode the background music
async function loadBackgroundMusic() {
  if (!audioContext) return;

  try {
    const response = await fetch("/8-bit-game-loop.wav");
    const arrayBuffer = await response.arrayBuffer();
    musicBuffer = await audioContext.decodeAudioData(arrayBuffer);
  } catch (error) {
    console.error("Error loading background music:", error);
  }
}

// Start playing background music
function startBackgroundMusic() {
  if (!audioContext || !musicBuffer || backgroundMusic) return;

  try {
    // Clear any pending fade timeout
    if (musicFadeTimeout) {
      clearTimeout(musicFadeTimeout);
      musicFadeTimeout = null;
    }

    // Create gain node for volume control (recreate each time)
    musicGainNode = audioContext.createGain();
    // Start at 0 volume for fade in
    musicGainNode.gain.setValueAtTime(0, audioContext.currentTime);
    musicGainNode.connect(audioContext.destination);

    // Create and configure the audio source
    backgroundMusic = audioContext.createBufferSource();
    backgroundMusic.buffer = musicBuffer;
    backgroundMusic.loop = true; // Enable seamless looping
    backgroundMusic.connect(musicGainNode);

    // Handle when the music ends (shouldn't happen with loop, but just in case)
    backgroundMusic.onended = () => {
      backgroundMusic = null;
      musicGainNode = null;
      // Restart the music after a brief delay if game is still running
      if (gameState.gameStarted || gameState.introAnimation.active) {
        setTimeout(startBackgroundMusic, 100);
      }
    };

    // Start playing
    backgroundMusic.start(0);

    // Fade in over 1.2 seconds to target volume
    const targetVolume = isMuted ? 0 : 0.3;
    musicGainNode.gain.linearRampToValueAtTime(
      targetVolume,
      audioContext.currentTime + 1.2
    );
  } catch (error) {
    console.error("Error starting background music:", error);
  }
}

// Stop background music
function stopBackgroundMusic() {
  if (!backgroundMusic || !musicGainNode || !audioContext) return;

  try {
    // Clear any pending fade timeout
    if (musicFadeTimeout) {
      clearTimeout(musicFadeTimeout);
      musicFadeTimeout = null;
    }

    // Fade out over 0.6 seconds
    const currentGain = musicGainNode.gain.value;
    musicGainNode.gain.cancelScheduledValues(audioContext.currentTime);
    musicGainNode.gain.setValueAtTime(currentGain, audioContext.currentTime);
    musicGainNode.gain.linearRampToValueAtTime(
      0,
      audioContext.currentTime + 0.6
    );

    // Stop and cleanup after fade completes
    musicFadeTimeout = setTimeout(() => {
      if (backgroundMusic) {
        try {
          backgroundMusic.stop();
          backgroundMusic.disconnect();
          backgroundMusic = null;
        } catch (error) {
          console.error("Error stopping background music:", error);
        }
      }

      // Also disconnect and cleanup the gain node
      if (musicGainNode) {
        try {
          musicGainNode.disconnect();
          musicGainNode = null;
        } catch (error) {
          console.error("Error disconnecting music gain node:", error);
        }
      }

      musicFadeTimeout = null;
    }, 600); // Wait for fade to complete
  } catch (error) {
    console.error("Error fading out background music:", error);
  }
}

// Toggle mute state
function toggleMute() {
  isMuted = !isMuted;

  if (musicGainNode && audioContext) {
    // Clear any pending scheduled changes
    musicGainNode.gain.cancelScheduledValues(audioContext.currentTime);

    // Get current volume to start fade from
    const currentGain = musicGainNode.gain.value;
    musicGainNode.gain.setValueAtTime(currentGain, audioContext.currentTime);

    if (isMuted) {
      // Fade to 0 over 0.3 seconds
      musicGainNode.gain.linearRampToValueAtTime(
        0,
        audioContext.currentTime + 0.3
      );
    } else {
      // Fade to 0.3 over 0.3 seconds
      musicGainNode.gain.linearRampToValueAtTime(
        0.3,
        audioContext.currentTime + 0.3
      );
    }
  }

  // Update mute button text
  if (muteButtonElement) {
    muteButtonElement.textContent = isMuted ? "SOUND OFF" : "SOUND ON";
  }
}

// Initialize audio context (must be done after user interaction)
async function initializeAudio() {
  if (!isAudioInitialized) {
    try {
      audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      isAudioInitialized = true;

      // Load music immediately but don't start playing
      await loadBackgroundMusic();
    } catch (error) {
      console.warn("Web Audio API not supported:", error);
    }
  }
}

// Create jump sound effect with variance
function createJumpSound() {
  if (!audioContext || !isAudioInitialized || isMuted) return;

  try {
    // Create oscillator for the main tone
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    // Connect audio nodes
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Add variance to frequencies - random variation of ±15%
    const baseFreq1 = 200 + (Math.random() - 0.5) * 60; // 170-230Hz
    const baseFreq2 = 400 + (Math.random() - 0.5) * 120; // 340-460Hz
    const baseFreq3 = 300 + (Math.random() - 0.5) * 90; // 255-345Hz

    // Set up the jump sound - ascending frequency sweep with variance
    oscillator.frequency.setValueAtTime(baseFreq1, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      baseFreq2,
      audioContext.currentTime + 0.1
    );
    oscillator.frequency.exponentialRampToValueAtTime(
      baseFreq3,
      audioContext.currentTime + 0.2
    );

    // Randomly vary the waveform for more variety
    const waveforms = ["triangle", "sine", "square"];
    oscillator.type = waveforms[
      Math.floor(Math.random() * waveforms.length)
    ] as OscillatorType;

    // Add slight timing variance
    const duration = 0.2 + Math.random() * 0.1; // 0.2-0.3 seconds
    const attackTime = 0.015 + Math.random() * 0.01; // 0.015-0.025 seconds

    // Volume envelope with variance
    const peakVolume = 0.25 + Math.random() * 0.1; // 0.25-0.35
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(
      peakVolume,
      audioContext.currentTime + attackTime
    );
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + duration
    );

    // Play the sound
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
  } catch (error) {
    console.warn("Error creating jump sound:", error);
  }
}

// Create a falling/game over sound effect
function createFallSound() {
  if (!audioContext || !isAudioInitialized || isMuted) return;

  try {
    // Create oscillator for falling sound - descending pitch
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const filterNode = audioContext.createBiquadFilter();

    // Connect audio nodes
    oscillator.connect(gainNode);
    gainNode.connect(filterNode);
    filterNode.connect(audioContext.destination);

    // Set up the falling sound - descending frequency sweep
    oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      100,
      audioContext.currentTime + 0.5
    );

    // Use sawtooth wave for more dramatic effect
    oscillator.type = "sawtooth";

    // Low-pass filter to make it less harsh
    filterNode.type = "lowpass";
    filterNode.frequency.setValueAtTime(1000, audioContext.currentTime);
    filterNode.frequency.exponentialRampToValueAtTime(
      200,
      audioContext.currentTime + 0.5
    );

    // Volume envelope - quick attack, slow decay
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(
      0.15,
      audioContext.currentTime + 0.05
    );
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + 0.5
    );

    // Play the sound
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (error) {
    console.warn("Error creating fall sound:", error);
  }
}

// Create a higher pitched sound for successful landings/combos with variance
function createLandingSound(pitch: number = 1) {
  if (!audioContext || !isAudioInitialized || isMuted) return;

  try {
    // Create two oscillators for a richer sound
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const filterNode = audioContext.createBiquadFilter();

    // Connect audio nodes
    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(filterNode);
    filterNode.connect(audioContext.destination);

    // Add variance to base frequencies - ±10% variation
    const baseFreq = (300 + (Math.random() - 0.5) * 60) * pitch; // 270-330Hz * pitch
    const harmonic = 1.4 + Math.random() * 0.2; // 1.4-1.6 harmonic ratio (was fixed at 1.5)

    osc1.frequency.setValueAtTime(baseFreq, audioContext.currentTime);
    osc2.frequency.setValueAtTime(
      baseFreq * harmonic,
      audioContext.currentTime
    );

    // Add variance to frequency sweep
    const sweep1End = baseFreq * (0.65 + Math.random() * 0.1); // 0.65-0.75
    const sweep2End = baseFreq * (1.15 + Math.random() * 0.1); // 1.15-1.25

    // Brief frequency sweep for landing impact with variance
    osc1.frequency.exponentialRampToValueAtTime(
      sweep1End,
      audioContext.currentTime + 0.1
    );
    osc2.frequency.exponentialRampToValueAtTime(
      sweep2End,
      audioContext.currentTime + 0.1
    );

    // Randomly vary waveforms
    const waveforms1 = ["sawtooth", "triangle", "square"];
    const waveforms2 = ["triangle", "sine", "sawtooth"];
    osc1.type = waveforms1[
      Math.floor(Math.random() * waveforms1.length)
    ] as OscillatorType;
    osc2.type = waveforms2[
      Math.floor(Math.random() * waveforms2.length)
    ] as OscillatorType;

    // Low-pass filter with variance
    const filterFreq = 1800 + Math.random() * 400; // 1800-2200Hz
    filterNode.type = "lowpass";
    filterNode.frequency.setValueAtTime(filterFreq, audioContext.currentTime);
    filterNode.frequency.exponentialRampToValueAtTime(
      filterFreq * 0.4,
      audioContext.currentTime + 0.15
    );

    // Volume envelope with slight variance
    const peakVolume = 0.18 + Math.random() * 0.04; // 0.18-0.22
    const duration = 0.13 + Math.random() * 0.04; // 0.13-0.17 seconds

    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(
      peakVolume,
      audioContext.currentTime + 0.01
    );
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + duration
    );

    // Play the sound
    osc1.start(audioContext.currentTime);
    osc2.start(audioContext.currentTime);
    osc1.stop(audioContext.currentTime + duration);
    osc2.stop(audioContext.currentTime + duration);
  } catch (error) {
    console.warn("Error creating landing sound:", error);
  }
}

// ===========================================
// CURSOR MANAGEMENT
// ===========================================

function hideCursor() {
  document.body.style.cursor = "none";
}

function showCursor() {
  document.body.style.cursor = "default";
}

function updateCursorVisibility() {
  // Hide cursor when game is active (during intro animation or actual gameplay)
  // Show cursor when game is inactive (start screen)
  if (gameState.gameStarted || gameState.introAnimation.active) {
    hideCursor();
  } else {
    showCursor();
  }
}

// ===========================================
// BACKSPIN LOGIC - Reusable functions for spin effects
// ===========================================

// Start a backspin effect with random axis
function startBackspin() {
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

  // Play a higher pitched sound for trick landing
  createJumpSound();
}

// Update backspin animation (call this in the game loop)
function updateBackspin() {
  if (!gameState.player.spinning || !copilotModel) return;

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
}

// ===========================================
// GAME CONFIGURATION - Easy to change flags
// ===========================================
const ENABLE_CUBE_FALLING = true; // Set to false to disable falling cube behavior

// Game state variables
const gameState = {
  baseGravity: -0.006, // Base gravity for more floaty feel
  jumpVelocity: 0.25, // Slightly lower jump velocity for more natural arc
  doubleJumpVelocity: 0.22, // Slightly less powerful than initial jump
  moveSpeed: 0.15,
  gameStarted: false, // Track if the game has started
  introAnimation: {
    active: false,
    progress: 0,
    duration: 0.6, // 0.6 seconds for much more snappy camera animation
    delay: 0.2, // 200ms delay before drop starts (reduced from 500ms)
    delayProgress: 0, // Track delay progress
  },
  player: {
    velocity: { x: 0, y: 0 },
    position: { x: 0, y: 0 },
    radius: 0.5, // For collision detection
    onGround: false,
    spinning: false,
    spinAxis: new THREE.Vector3(),
    spinProgress: 0,
    spinSpeed: 0.015, // Speed of the spin animation - much slower for a controlled trick effect
    doubleJumpAvailable: false, // Track if double jump is available
    hasDoubleJumped: false, // Track if already used double jump in current air time
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
    cubes: Array<{
      mesh: THREE.Mesh;
      position: { x: number; y: number };
      isHit: boolean; // Track if this cube has been hit by the player
      falling: boolean; // Track if this cube is falling
      fallVelocity: number; // Falling velocity for this cube
    }>;
    platformIndex: number; // Platform creation index for consistent behavior
    // Movement properties for difficulty progression
    movement: {
      enabled: boolean;
      direction: number; // -1 for left, 1 for right
      speed: number;
      range: number; // How far it moves from center
      centerX: number; // Original center position
    };
  }>,
  explosions: [] as Array<{
    particles: THREE.Points;
    velocities: Float32Array;
    life: number;
    maxLife: number;
  }>,
  nextPlatformY: 2,
  score: 0,
  highScore: 0,
  keys: {
    left: false,
    right: false,
    up: false,
  },
};

// High score management functions
function loadHighScore(): number {
  try {
    const saved = localStorage.getItem("lgtm-2025-highscore");
    return saved ? parseInt(saved, 10) : 0;
  } catch (error) {
    console.warn("Could not load high score from localStorage:", error);
    return 0;
  }
}

function saveHighScore(score: number): void {
  try {
    localStorage.setItem("lgtm-2025-highscore", score.toString());
  } catch (error) {
    console.warn("Could not save high score to localStorage:", error);
  }
}

function updateHighScore(currentScore: number): boolean {
  if (currentScore > gameState.highScore) {
    gameState.highScore = currentScore;
    saveHighScore(currentScore);
    return true; // New high score achieved
  }
  return false;
}

// Initialize high score from localStorage
gameState.highScore = loadHighScore();

// Difficulty progression functions
function getDifficultyMovementChance(): number {
  // Start with moving platforms after score 5
  if (gameState.score < 5) return 0;

  // Much more gradual progression with lower starting values
  const score = gameState.score;

  if (score <= 10) {
    // Score 5-10: 12% to 20% (roughly 1 in 8 to 1 in 5)
    const t = (score - 5) / (10 - 5);
    return 0.12 + t * (0.2 - 0.12);
  } else if (score <= 25) {
    // Score 10-25: 20% to 35% (roughly 1 in 5 to 1 in 3)
    const t = (score - 10) / (25 - 10);
    return 0.2 + t * (0.35 - 0.2);
  } else if (score <= 50) {
    // Score 25-50: 35% to 55% (roughly 1 in 3 to 1 in 2)
    const t = (score - 25) / (50 - 25);
    return 0.35 + t * (0.55 - 0.35);
  } else if (score <= 75) {
    // Score 50-75: 55% to 70%
    const t = (score - 50) / (75 - 50);
    return 0.55 + t * (0.7 - 0.55);
  } else {
    // Score 75+: cap at 80% (still leave some non-moving platforms)
    return 0.8;
  }
}

function getDifficultyMovementSpeed(): number {
  // Start with very slow movement after score 5
  if (gameState.score < 5) return 0;

  // Much slower progression starting very slow
  const score = gameState.score;

  if (score <= 15) {
    // Score 5-15: very slow movement (0.003 to 0.008)
    const t = (score - 5) / (15 - 5);
    return 0.003 + t * (0.008 - 0.003);
  } else if (score <= 35) {
    // Score 15-35: slow to medium (0.008 to 0.015)
    const t = (score - 15) / (35 - 15);
    return 0.008 + t * (0.015 - 0.008);
  } else if (score <= 60) {
    // Score 35-60: medium to fast (0.015 to 0.025)
    const t = (score - 35) / (60 - 35);
    return 0.015 + t * (0.025 - 0.015);
  } else {
    // Score 60+: cap at moderate speed (not too crazy)
    return 0.025;
  }
}

function getDifficultyPlatformSpacing(): number {
  // More gradual spacing increase with lower maximum
  // At score 0: 3.5 spacing (easy)
  // At score 15: 3.8 spacing
  // At score 30: 4.0 spacing
  // At score 50+: 4.2 spacing (cap - more reasonable)
  const score = gameState.score;

  if (score <= 15) {
    // Score 0-15: 3.5 to 3.8
    const t = score / 15;
    return 3.5 + t * (3.8 - 3.5);
  } else if (score <= 30) {
    // Score 15-30: 3.8 to 4.0
    const t = (score - 15) / (30 - 15);
    return 3.8 + t * (4.0 - 3.8);
  } else if (score <= 50) {
    // Score 30-50: 4.0 to 4.2
    const t = (score - 30) / (50 - 30);
    return 4.0 + t * (4.2 - 4.0);
  } else {
    // Score 50+: cap at 4.2 (reduced from 4.6)
    return 4.2;
  }
}



function getDifficultyPlatformCubeCount(): number {
  // Gradually blend cube counts using probability-based selection
  // More natural transition from mostly 4 cubes to mostly 3, then mostly 2, then some 1
  const score = gameState.score;
  const random = Math.random();

  if (score <= 10) {
    // Score 0-10: Mostly 4 cubes (80%), some 3 cubes (20%)
    const chance4 = 0.8 - (score / 10) * 0.3; // 80% to 50%
    
    if (random < chance4) return 4;
    else return 3;
  } else if (score <= 25) {
    // Score 10-25: Mix of 4 and 3, trending toward 3
    const t = (score - 10) / (25 - 10);
    const chance4 = 0.5 - t * 0.4; // 50% to 10%
    
    if (random < chance4) return 4;
    else return 3;
  } else if (score <= 40) {
    // Score 25-40: Mostly 3 cubes, some 2 cubes starting to appear
    const t = (score - 25) / (40 - 25);
    const chance3 = 0.9 - t * 0.4; // 90% to 50%
    
    if (random < chance3) return 3;
    else return 2;
  } else if (score <= 60) {
    // Score 40-60: Mix of 3 and 2, trending toward 2
    const t = (score - 40) / (60 - 40);
    const chance3 = 0.5 - t * 0.4; // 50% to 10%
    
    if (random < chance3) return 3;
    else return 2;
  } else if (score <= 80) {
    // Score 60-80: Mostly 2 cubes, some 1 cube starting to appear
    const t = (score - 60) / (80 - 60);
    const chance2 = 0.9 - t * 0.4; // 90% to 50%
    
    if (random < chance2) return 2;
    else return 1;
  } else {
    // Score 80+: Mix of 2 and 1, trending toward 1 (extreme difficulty)
    const t = Math.min(1, (score - 80) / 40); // Cap progression at score 120
    const chance2 = 0.5 - t * 0.3; // 50% to 20%
    
    if (random < chance2) return 2;
    else return 1;
  }
}

function getDifficultyGravity(): number {
  // Slightly reduce gravity as score increases to make timing more precise
  // At score 0: -0.006 gravity (base)
  // At score 30: -0.0055 gravity
  // At score 60+: -0.005 gravity (cap - still playable)
  const gravityReduction = Math.min(0.001, (gameState.score / 60) * 0.001);
  return gameState.baseGravity + gravityReduction; // Adding because baseGravity is negative
}

// Platform geometry will be created dynamically based on difficulty
// Made platforms deeper for 3D effect - width will vary based on score

// Create platform materials - gray for unlit cubes, green for hit cubes
function createGrayCubeMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xd8c0d8, // Medium gray with stronger pinkish/purple tint
    roughness: 0.05,
    metalness: 0.0,
    emissive: 0xd8c0d8,
    emissiveIntensity: 0.3, // Medium brightness - between 0.2 and 0.4
  });
}

function createGreenCubeMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x00ff00, // Bright green
    roughness: 0.05,
    metalness: 0.0,
    emissive: 0x00ff00,
    emissiveIntensity: 0.6, // Glowing effect
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
  gameState.glitch.intensity = 0.8 + Math.random() * 0.6; // Balanced at 0.8-1.4
  gameState.glitch.digitalNoise = 0.3 + Math.random() * 0.25; // Balanced digital noise 0.3-0.55
  gameState.glitch.rgbShift = 0.8 + Math.random() * 0.6; // Balanced RGB shift 0.8-1.4
}

// Create initial platforms
function createPlatform(x: number, y: number) {
  // Get current difficulty-based properties
  const movementSpeed = getDifficultyMovementSpeed();
  const cubeCount = getDifficultyPlatformCubeCount();
  
  // Calculate full viewport width for movement range
  const viewportHalfWidth =
    camera.aspect *
    Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
    camera.position.z;
  const movementRange = viewportHalfWidth * 2;

  // Each cube is 1x1x1 unit
  const cubeSize = 1;
  const cubeSpacing = 1.1; // Smaller gap between cubes
  const platformWidth = cubeCount * cubeSpacing;

  // Movement range is already calculated as full viewport width in getDifficultyMovementRange()
  // Runtime bounds checking in updateGame() will handle keeping platforms on screen

  // Use global counter for consistent indexing across all platforms ever created
  const platformIndex = globalPlatformCounter++;

  // Create individual cubes
  const cubes = [];
  const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);

  for (let i = 0; i < cubeCount; i++) {
    // Calculate cube position (centered around the platform x position)
    const cubeX = x + (i - (cubeCount - 1) / 2) * cubeSpacing;
    const cubeY = y;

    const cubeMesh = new THREE.Mesh(cubeGeometry, createGrayCubeMaterial());
    cubeMesh.position.set(cubeX, cubeY, 0);

    // Add slight random rotation to cubes for more 3D variety
    cubeMesh.rotation.z = (Math.random() - 0.5) * 0.1;
    cubeMesh.rotation.x = (Math.random() - 0.5) * 0.05;

    scene.add(cubeMesh);

    cubes.push({
      mesh: cubeMesh,
      position: { x: cubeX, y: cubeY },
      isHit: false,
      falling: false,
      fallVelocity: 0,
    });
  }

  const platform = {
    position: { x, y },
    size: { width: platformWidth, height: cubeSize },
    cubes: cubes,
    platformIndex: platformIndex, // Store platform creation index for consistent behavior
    movement: {
      enabled: false, // Will be determined dynamically
      direction: platformIndex % 2 === 0 ? 1 : -1, // Alternate directions based on index
      speed: movementSpeed,
      range: movementRange,
      centerX: x, // Store original center position
    },
  };

  gameState.platforms.push(platform);
  return platform;
}

// Platform spawning management
let globalPlatformCounter = 0; // Global counter for consistent indexing

// Create starting platform
createPlatform(0, -2);

// Generate platforms dynamically as needed
function generatePlatforms() {
  // Only generate a few platforms ahead, not 50 at once
  while (gameState.platforms.length < 15) {
    // Reduced from 50 to 15
    // Calculate viewport bounds for platform placement
    const viewportHalfWidth =
      camera.aspect *
      Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
      camera.position.z;
    const x = (Math.random() - 0.5) * (viewportHalfWidth * 1.8);
    createPlatform(x, gameState.nextPlatformY);
    // Use dynamic spacing that increases with difficulty
    const currentSpacing = getDifficultyPlatformSpacing();
    gameState.nextPlatformY += currentSpacing;
  }
}

// Collision detection
function checkPlatformCollision() {
  if (gameState.player.velocity.y > 0) return; // Only check when falling

  for (const platform of gameState.platforms) {
    const playerX = gameState.player.position.x;
    const playerY = gameState.player.position.y;
    const playerRadius = gameState.player.radius;

    // Check collision with individual cubes
    for (const cube of platform.cubes) {
      const cubeLeft = cube.position.x - 0.5; // cube is 1x1 unit
      const cubeRight = cube.position.x + 0.5;
      const cubeTop = cube.position.y + 0.5;
      const cubeBottom = cube.position.y - 0.5;

      // Check if player is above the cube and within x bounds
      if (
        playerX + playerRadius > cubeLeft &&
        playerX - playerRadius < cubeRight &&
        playerY - playerRadius <= cubeTop &&
        playerY - playerRadius >= cubeBottom
      ) {
        // Initialize audio on first interaction if needed
        if (!isAudioInitialized) {
          initializeAudio();
        }

        // Player lands on cube - turn it green if not already hit
        if (!cube.isHit) {
          cube.isHit = true;
          cube.mesh.material = createGreenCubeMaterial();

          // Start falling behavior (if enabled)
          if (ENABLE_CUBE_FALLING) {
            cube.falling = true;
            cube.fallVelocity = 0; // Start with no initial velocity
          }

          // Increment score for each new cube hit
          gameState.score++;
          // Check for new high score
          updateHighScore(gameState.score);
        }

        gameState.player.velocity.y = gameState.jumpVelocity;
        gameState.player.onGround = true;
        gameState.player.position.y = cubeTop + playerRadius;

        // Reset double jump availability
        gameState.player.doubleJumpAvailable = true;
        gameState.player.hasDoubleJumped = false;

        // Calculate pitch based on score for progression feeling - much slower progression
        const pitchMultiplier = 1 + gameState.score * 0.005; // Changed from 0.02 to 0.005 - 4x slower

        // Play landing sound with pitch variation
        createLandingSound(pitchMultiplier);

        // Create explosion at collision point
        const explosionX = playerX;
        const explosionY = cubeTop; // Right at the cube surface
        const explosionColor = 0x00ff00; // Green for all cubes now
        createExplosion(explosionX, explosionY, explosionColor);

        // Trigger glitch effect on platform hit
        triggerGlitch();

        // Start spin effect with random axis (only 20% chance) - play special sound
        if (Math.random() < 0.2) {
          startBackspin();
        }

        return; // Exit after hitting any cube
      }
    }
  }
}

// Start the game with intro animation
function startGame() {
  if (gameState.gameStarted) return;

  gameState.introAnimation.active = true;
  gameState.introAnimation.progress = 0;
  gameState.introAnimation.delayProgress = 0; // Reset delay progress

  // Hide cursor when game starts
  updateCursorVisibility();

  // Initialize player position at center and zero velocity (will start falling after delay)
  gameState.player.position.x = 0;
  gameState.player.position.y = 0;
  gameState.player.velocity.x = 0;
  gameState.player.velocity.y = 0; // Start with zero velocity, gravity will take over after delay

  // Start camera animation
  cameraState.animating = true;
  cameraState.animationProgress = 0;

  // Initialize audio on game start
  if (!isAudioInitialized) {
    initializeAudio();
  }

  // Start music when game begins
  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume().then(() => {
      startBackgroundMusic();
    });
  } else if (audioContext && musicBuffer) {
    startBackgroundMusic();
  }

  // Play a special sound for the intro animation
  createJumpSound(); // This will create a nice sound effect for the start
}

// Keyboard controls
const keys: { [key: string]: boolean } = {};
const keyPressed: { [key: string]: boolean } = {}; // Track if key was just pressed this frame

function handleKeyDown(event: KeyboardEvent) {
  // Track key press (only true on first press, not continuous hold)
  keyPressed[event.code] = !keys[event.code];
  keys[event.code] = true;

  // Handle space key for starting the game (only when game not started)
  if (event.code === "Space" && !gameState.gameStarted) {
    startGame();
    return;
  }

  // Only handle movement keys if game has started
  if (!gameState.gameStarted) return;

  switch (event.code) {
    case "ArrowLeft":
    case "KeyA":
      gameState.keys.left = true;
      break;
    case "ArrowRight":
    case "KeyD":
      gameState.keys.right = true;
      break;
    case "ArrowUp":
    case "KeyW":
    case "Space":
      gameState.keys.up = true;
      break;
  }
}

function handleKeyUp(event: KeyboardEvent) {
  keys[event.code] = false;
  keyPressed[event.code] = false;

  // Only handle movement keys if game has started
  if (!gameState.gameStarted) return;

  switch (event.code) {
    case "ArrowLeft":
    case "KeyA":
      gameState.keys.left = false;
      break;
    case "ArrowRight":
    case "KeyD":
      gameState.keys.right = false;
      break;
    case "ArrowUp":
    case "KeyW":
    case "Space":
      gameState.keys.up = false;
      break;
  }
}

window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);

// Mouse tracking for cursor following when game isn't active
const mouse = new THREE.Vector2();
let mouseWorldPosition = new THREE.Vector3();

// Update mouse position and convert to world coordinates
function updateMousePosition(event: MouseEvent) {
  // Normalize mouse coordinates to [-1, 1] range
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  // Convert to world position using the camera
  const vector = new THREE.Vector3(mouse.x, mouse.y, 0.5);
  vector.unproject(camera);

  // Calculate world position at the copilot's Z plane (z = 0)
  const direction = vector.sub(camera.position).normalize();
  const distance = -camera.position.z / direction.z;
  mouseWorldPosition = camera.position
    .clone()
    .add(direction.multiplyScalar(distance));
}

// Add mouse move event listener
window.addEventListener("mousemove", updateMousePosition);

// Update game logic including score display
function updateGame() {
  if (!copilotModel) return;

  // Animate particles for depth and motion - ALWAYS animate stars regardless of game state
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
  const totalDownwardSpeed = gameState.gameStarted
    ? Math.max(0, gameState.player.velocity.y)
    : 0; // Only use velocity when game is active

  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    let pX = positions[i3];
    let pY = positions[i3 + 1];
    let pZ = positions[i3 + 2];

    // More varied floating motion with prime number multipliers to avoid synchronization
    const phaseX = particleTime * 0.7 + i * 2.31; // Prime-based offset
    const phaseY = particleTime * 0.5 + i * 1.73; // Different prime-based offset
    const phaseZ = particleTime * 0.9 + i * 3.17; // Another prime-based offset

    // Different speeds and amplitudes for each particle based on index
    const speedX = 0.001 + (i % 7) * 0.0003; // Varying X drift speed
    const speedY = 0.0005 + (i % 5) * 0.0002; // Varying Y float speed
    const speedZ = 0.0008 + (i % 11) * 0.0001; // Varying Z sway speed

    pX += Math.sin(phaseX) * speedX;
    pY += Math.cos(phaseY) * speedY;
    pZ += Math.sin(phaseZ) * speedZ;

    // Move particles downward to create illusion of upward motion
    pY -= totalDownwardSpeed;

    // Respawn particles that fall below the visible area at the TOP with more randomness
    if (pY < cameraY - particleSpreadY) {
      // More varied respawn pattern to prevent clustering
      pY = cameraY + particleSpreadY + Math.random() * 10; // Larger random spawn range
      pX = cameraCurrentX + (Math.random() - 0.5) * particleSpreadX * 2.2; // Wider respawn area
      pZ = (Math.random() - 0.5) * particleSpreadZ * 2; // Wider Z respawn
    }

    // Handle horizontal wrapping (like the player) with some randomness
    if (pX > cameraCurrentX + particleSpreadX) {
      pX = cameraCurrentX - particleSpreadX + Math.random() * 2; // Add small random offset
    } else if (pX < cameraCurrentX - particleSpreadX) {
      pX = cameraCurrentX + particleSpreadX - Math.random() * 2; // Add small random offset
    }

    // Handle Z-axis bounds with randomness
    if (pZ < -particleSpreadZ) {
      pZ = particleSpreadZ - Math.random() * 2;
    } else if (pZ > particleSpreadZ) {
      pZ = -particleSpreadZ + Math.random() * 2;
    }

    positions[i3] = pX;
    positions[i3 + 1] = pY;
    positions[i3 + 2] = pZ;
  }

  particles.geometry.attributes.position.needsUpdate = true;

  // Handle camera animation
  if (cameraState.animating) {
    cameraState.animationProgress += 0.016 / cameraState.animationDuration;

    if (cameraState.animationProgress >= 1) {
      // Camera animation complete
      cameraState.animating = false;
      camera.position.set(
        cameraState.gamePosition.x,
        cameraState.gamePosition.y,
        cameraState.gamePosition.z
      );
    } else {
      // Animate camera zoom out
      const t = cameraState.animationProgress;
      // Use easeInOutCubic for smooth camera movement (starts slow, speeds up, then slows down)
      const easedT = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      camera.position.x =
        cameraState.introPosition.x +
        (cameraState.gamePosition.x - cameraState.introPosition.x) * easedT;
      camera.position.y =
        cameraState.introPosition.y +
        (cameraState.gamePosition.y - cameraState.introPosition.y) * easedT;
      camera.position.z =
        cameraState.introPosition.z +
        (cameraState.gamePosition.z - cameraState.introPosition.z) * easedT;
    }
  }

  // Handle intro animation
  if (gameState.introAnimation.active) {
    // Handle delay period first
    if (
      gameState.introAnimation.delayProgress < gameState.introAnimation.delay
    ) {
      gameState.introAnimation.delayProgress += 0.016; // roughly 60fps

      // Keep model centered and still during delay
      copilotModel.position.set(0, 0, 0);
      copilotModel.rotation.set(0, 0, 0);

      return; // Don't do anything else during delay
    }

    // After delay, apply gravity to player
    gameState.player.velocity.y += getDifficultyGravity();
    gameState.player.position.y += gameState.player.velocity.y;

    // Update copilot model position to match player
    copilotModel.position.x = gameState.player.position.x;
    copilotModel.position.y = gameState.player.position.y;

    // Check if animation should end (either time-based or when player hits platform)
    gameState.introAnimation.progress +=
      0.016 / gameState.introAnimation.duration;

    if (gameState.introAnimation.progress >= 1) {
      // Animation complete, start the game
      gameState.introAnimation.active = false;
      gameState.gameStarted = true;
    }

    // Check platform collisions during intro to end animation early
    if (gameState.player.velocity.y <= 0) {
      // Only check when falling
      for (const platform of gameState.platforms) {
        const playerX = gameState.player.position.x;
        const playerY = gameState.player.position.y;
        const playerRadius = gameState.player.radius;

        // Check collision with individual cubes (same logic as main game)
        for (const cube of platform.cubes) {
          const cubeLeft = cube.position.x - 0.5; // cube is 1x1 unit
          const cubeRight = cube.position.x + 0.5;
          const cubeTop = cube.position.y + 0.5;
          const cubeBottom = cube.position.y - 0.5;

          // Check if player is above the cube and within x bounds
          if (
            playerX + playerRadius > cubeLeft &&
            playerX - playerRadius < cubeRight &&
            playerY - playerRadius <= cubeTop &&
            playerY - playerRadius >= cubeBottom
          ) {
            // Initialize audio on first interaction if needed
            if (!isAudioInitialized) {
              initializeAudio();
            }

            // Player lands on cube - turn it green if not already hit and count score
            if (!cube.isHit) {
              cube.isHit = true;
              cube.mesh.material = createGreenCubeMaterial();

              // Start falling behavior (if enabled)
              if (ENABLE_CUBE_FALLING) {
                cube.falling = true;
                cube.fallVelocity = 0; // Start with no initial velocity
              }

              // Increment score for each new cube hit
              gameState.score++;
              // Check for new high score
              updateHighScore(gameState.score);
            }

            // Hit platform - end intro and start game
            gameState.introAnimation.active = false;
            gameState.gameStarted = true;
            gameState.player.position.y = cubeTop + playerRadius;
            gameState.player.velocity.y = gameState.jumpVelocity;

            // Reset double jump availability
            gameState.player.doubleJumpAvailable = true;
            gameState.player.hasDoubleJumped = false;

            // Play landing sound
            createLandingSound(1);

            // Create explosion at collision point
            const explosionX = playerX;
            const explosionY = cubeTop; // Right at the cube surface
            const explosionColor = 0x00ff00; // Green for all cubes now
            createExplosion(explosionX, explosionY, explosionColor);

            // Trigger glitch effect on platform hit
            triggerGlitch();

            return; // Exit after hitting any cube
          }
        }
      }
    }

    return; // Don't run normal game logic during intro
  }

  // Only run game logic if the game has started
  if (!gameState.gameStarted) {
    // Keep model centered when game hasn't started, but make it look at cursor
    if (copilotModel) {
      copilotModel.position.set(0, 0, 0);

      // Make the copilot head look at the cursor position with distance-based intensity
      const headPosition = copilotModel.position.clone();
      const direction = mouseWorldPosition.clone().sub(headPosition);
      const distance = direction.length();

      // Calculate base rotation angles to look at the mouse
      const baseRotationY = Math.atan2(direction.x, direction.z);
      const baseRotationX = -Math.atan2(
        direction.y,
        Math.sqrt(direction.x * direction.x + direction.z * direction.z)
      );

      // Create distance-based intensity that starts very subtle and grows gradually
      const minDistance = 0.5; // Start applying effect from this distance
      const maxDistance = 4.0; // Full effect at this distance
      const normalizedDistance = Math.max(
        0,
        Math.min(1, (distance - minDistance) / (maxDistance - minDistance))
      );

      // Use a smooth curve for more natural scaling (ease-out)
      const intensityMultiplier =
        normalizedDistance * normalizedDistance * (3 - 2 * normalizedDistance);

      // Apply intensity multiplier to rotations
      const targetRotationY = baseRotationY * intensityMultiplier;
      const targetRotationX = baseRotationX * intensityMultiplier;

      // Limit rotation angles for more natural head movement
      const clampedRotationY = Math.max(-0.8, Math.min(0.8, targetRotationY));
      const clampedRotationX = Math.max(-0.3, Math.min(0.3, targetRotationX));

      // Smoothly interpolate to the target rotation for natural movement
      const lerpSpeed = 0.08;
      copilotModel.rotation.y +=
        (clampedRotationY - copilotModel.rotation.y) * lerpSpeed;
      copilotModel.rotation.x +=
        (clampedRotationX - copilotModel.rotation.x) * lerpSpeed;

      // Keep Z rotation at 0 for upright head position
      copilotModel.rotation.z = 0;
    }
    return;
  }

  // Handle horizontal movement
  if (gameState.keys.left) {
    gameState.player.velocity.x = -gameState.moveSpeed;
  } else if (gameState.keys.right) {
    gameState.player.velocity.x = gameState.moveSpeed;
  } else {
    gameState.player.velocity.x *= 0.9; // Friction
  }

  // Handle double jump input (only on key press, not hold)
  if (
    (keyPressed["ArrowUp"] || keyPressed["KeyW"] || keyPressed["Space"]) &&
    gameState.player.doubleJumpAvailable &&
    !gameState.player.hasDoubleJumped
  ) {
    // Perform double jump
    gameState.player.velocity.y = gameState.doubleJumpVelocity;
    gameState.player.hasDoubleJumped = true;
    gameState.player.doubleJumpAvailable = false;

    // Trigger backflip animation on double jump
    startBackspin();
  }

  // Apply gravity (with difficulty scaling)
  gameState.player.velocity.y += getDifficultyGravity();

  // Update player position
  gameState.player.position.x += gameState.player.velocity.x;
  gameState.player.position.y += gameState.player.velocity.y;

  // Screen wrapping for horizontal movement - use actual viewport bounds
  const viewportHalfWidth =
    camera.aspect *
    Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
    camera.position.z;
  if (gameState.player.position.x > viewportHalfWidth) {
    gameState.player.position.x = -viewportHalfWidth;
  } else if (gameState.player.position.x < -viewportHalfWidth) {
    gameState.player.position.x = viewportHalfWidth;
  }

  // Check platform collisions
  checkPlatformCollision();

  // Reset onGround flag for next frame
  gameState.player.onGround = false;

  // Update copilot model position
  copilotModel.position.x = gameState.player.position.x;
  copilotModel.position.y = gameState.player.position.y;

  // Handle spinning animation
  updateBackspin();

  // Handle non-spinning model animation
  if (!gameState.player.spinning) {
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

      glitchPass.uniforms.glitchIntensity.value =
        gameState.glitch.intensity * easeOut;
      glitchPass.uniforms.digitalNoiseIntensity.value =
        gameState.glitch.digitalNoise * easeOut;
      glitchPass.uniforms.rgbShiftIntensity.value =
        gameState.glitch.rgbShift * easeOut;
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
    // Update world offset position for all cubes
    platform.cubes.forEach((cube) => {
      // Handle falling behavior for hit cubes (if enabled)
      if (ENABLE_CUBE_FALLING && cube.falling) {
        cube.fallVelocity += getDifficultyGravity(); // Apply gravity
        cube.position.y += cube.fallVelocity; // Update cube position
      }

      cube.mesh.position.y = cube.position.y + gameState.world.offset;
    });

    // NEW MOVEMENT LOGIC: Better distribution pattern
    if (gameState.score >= 5) {
      const movementChance = getDifficultyMovementChance();

      // Use a hash-like function to create better distribution
      // This will spread moving platforms more evenly instead of clustering them
      const hash = (platform.platformIndex * 2654435761) % 1000; // Large prime for good distribution
      const shouldMove = hash < movementChance * 1000;
      platform.movement.enabled = shouldMove;

      // Update movement speed based on current difficulty
      platform.movement.speed = getDifficultyMovementSpeed();
    } else {
      platform.movement.enabled = false;
    }

    // Handle platform movement (side to side)
    if (platform.movement.enabled) {
      // Calculate viewport bounds to keep platforms visible
      const viewportHalfWidth =
        camera.aspect *
        Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
        camera.position.z;

      // Calculate platform half-width for bounds checking
      const platformHalfWidth = platform.size.width / 2;
      const maxX = viewportHalfWidth - platformHalfWidth;
      const minX = -viewportHalfWidth + platformHalfWidth;

      // Update platform position based on movement
      platform.position.x +=
        platform.movement.direction * platform.movement.speed;

      // Check viewport bounds first - this takes priority over movement range
      if (platform.position.x > maxX) {
        platform.position.x = maxX;
        platform.movement.direction = -1; // Reverse direction
      } else if (platform.position.x < minX) {
        platform.position.x = minX;
        platform.movement.direction = 1; // Reverse direction
      } else {
        // Only check movement range if we're within viewport bounds
        const distanceFromCenter = Math.abs(
          platform.position.x - platform.movement.centerX
        );
        if (distanceFromCenter >= platform.movement.range) {
          // Reverse direction
          platform.movement.direction *= -1;
          // Clamp position to exact range to prevent drift
          platform.position.x =
            platform.movement.centerX +
            platform.movement.direction * -1 * platform.movement.range;

          // Double-check that the clamped position is still within viewport bounds
          if (platform.position.x > maxX) {
            platform.position.x = maxX;
            platform.movement.direction = -1;
          } else if (platform.position.x < minX) {
            platform.position.x = minX;
            platform.movement.direction = 1;
          }
        }
      }

      // Update cube positions
      platform.cubes.forEach((cube, index) => {
        const cubeOffset = (index - (platform.cubes.length - 1) / 2) * 1.1; // Use same spacing
        cube.position.x = platform.position.x + cubeOffset;
        cube.mesh.position.x = cube.position.x;
      });
    } else {
      // Update cube mesh positions even when not moving
      platform.cubes.forEach((cube) => {
        cube.mesh.position.x = cube.position.x;
      });
    }
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



  // Generate more platforms as needed
  if (gameState.player.position.y > gameState.nextPlatformY - 20) {
    generatePlatforms();
  }

  // Remove platforms that are too far below (relative to player position)
  gameState.platforms = gameState.platforms.filter((platform) => {
    if (platform.position.y < gameState.player.position.y - 15) {
      // Remove all cubes from the scene
      platform.cubes.forEach((cube) => scene.remove(cube.mesh));
      return false;
    }
    return true;
  });

  // Update score display
  scoreElement.textContent = `SCORE ${gameState.score}`;



  // Update high score display
  highScoreElement.textContent = `BEST ${gameState.highScore}`;

  // Game over check (fell too far below screen) - now relative to world position
  if (gameState.player.position.y + gameState.world.offset < -10) {
    // Play fall sound effect
    createFallSound();

    // Stop background music when game ends
    stopBackgroundMusic();

    // Reset game state
    gameState.gameStarted = false;
    gameState.introAnimation.active = false;
    gameState.introAnimation.progress = 0;
    gameState.introAnimation.delayProgress = 0; // Reset delay progress

    // Show cursor when game ends
    updateCursorVisibility();
    gameState.player.position.x = 0;
    gameState.player.position.y = 0;
    gameState.player.velocity.x = 0;
    gameState.player.velocity.y = 0;
    gameState.player.spinning = false;
    gameState.player.spinProgress = 0;
    gameState.player.doubleJumpAvailable = false;
    gameState.player.hasDoubleJumped = false;
    gameState.score = 0;
    gameState.world.offset = 0;
    gameState.world.targetOffset = 0;

    // Reset camera to intro position
    cameraState.animating = false;
    cameraState.animationProgress = 0;
    camera.position.set(
      cameraState.introPosition.x,
      cameraState.introPosition.y,
      cameraState.introPosition.z
    );

    // Clear platforms and regenerate
    gameState.platforms.forEach((platform) => {
      platform.cubes.forEach((cube) => scene.remove(cube.mesh));
    });
    gameState.platforms = [];
    gameState.nextPlatformY = 2;
    globalPlatformCounter = 0; // Reset the global counter
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



    // Reset particle positions around the reset world position with better distribution
    const positions = particles.geometry.attributes.position
      .array as Float32Array;
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;

      // Use the same stratified sampling approach as initial setup for consistent distribution
      const gridSize = Math.ceil(Math.sqrt(particleCount));
      const gridX = i % gridSize;
      const gridY = Math.floor(i / gridSize);

      const cellWidth = 80 / gridSize;
      const cellHeight = 160 / gridSize;

      positions[i3] = gridX * cellWidth + Math.random() * cellWidth - 40; // x - even distribution
      positions[i3 + 1] = gridY * cellHeight + Math.random() * cellHeight - 80; // y - even distribution
      positions[i3 + 2] = (Math.random() - 0.5) * 30; // z - wider depth spread
    }
    particles.geometry.attributes.position.needsUpdate = true;
  }

  // Show/hide start prompt based on game state (always check this)
  if (gameState.gameStarted || gameState.introAnimation.active) {
    startPromptElement.style.display = "none";
  } else {
    startPromptElement.style.display = "block";
  }

  // Update cursor visibility based on game state
  updateCursorVisibility();

  // Reset key pressed states for next frame
  Object.keys(keyPressed).forEach((key) => {
    keyPressed[key] = false;
  });
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

  // More even distribution using stratified sampling for better coverage
  // Divide space into a grid and place particles randomly within each cell
  const gridSize = Math.ceil(Math.sqrt(particleCount));
  const gridX = i % gridSize;
  const gridY = Math.floor(i / gridSize);

  // Calculate cell size for even coverage
  const cellWidth = 80 / gridSize; // Total width 80 divided by grid
  const cellHeight = 160 / gridSize; // Total height 160 divided by grid

  // Random position within the assigned cell, then offset to center around camera
  particlePositions[i3] = gridX * cellWidth + Math.random() * cellWidth - 40; // x - centered around 0
  particlePositions[i3 + 1] =
    gridY * cellHeight + Math.random() * cellHeight - 80; // y - centered around 0
  particlePositions[i3 + 2] = (Math.random() - 0.5) * 30; // z - wider depth spread

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

// Calculate responsive particle size
function getResponsiveParticleSize(): number {
  const minSize = 0.08; // Smaller particles for mobile
  const maxSize = 0.15; // Current desktop size
  const minWidth = 320;
  const maxWidth = 1200;
  
  const screenWidth = Math.min(window.innerWidth, window.innerHeight * 1.5);
  const size = minSize + (maxSize - minSize) * 
    Math.min(1, Math.max(0, (screenWidth - minWidth) / (maxWidth - minWidth)));
  
  return size;
}

const particleMaterial = new THREE.PointsMaterial({
  size: getResponsiveParticleSize(), // Responsive particle size
  vertexColors: true,
  transparent: true,
  opacity: 0.9, // Higher opacity for brighter stars
  blending: THREE.AdditiveBlending,
});

const particles = new THREE.Points(particleGeometry, particleMaterial);
scene.add(particles);

// Particle animation variables
let particleTime = 0;

// Set up DRACO loader for GLB model compression
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(
  "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
);
loader.setDRACOLoader(dracoLoader);

loader.load(
  new URL("/copilot.glb", import.meta.url).href,
  (gltf) => {
    copilotModel = gltf.scene;

    // GitHub Copilot colors - updated per user specifications
    const copilotColors = {
      // Main body/head - lighter pink closer to purple
      mainBody: 0xda70d6, // Orchid - lighter pink/purple for head
      bodyHighlight: 0xe6a8e6, // Light orchid for highlights
      bodyBase: 0xda70d6, // Orchid - goggle frame matches head
      goggleGlass: 0x0a0a0a, // Dark like screen glass
      ears: 0xc65cc6, // Slightly darker orchid for ears

      // Face should be dark (screen), eyes should be bright blue
      faceArea: 0x0a0a0a, // Very dark/black for screen
      eyeSockets: 0x00bfff, // Bright blue for eyes
      eyeDetails: 0x87ceeb, // Lighter blue for eye details

      // Goggle and accent areas
      noseAccent: 0x0a0a0a, // Dark for accent areas
      highlights: 0x00bfff, // Bright blue highlights

      // Additional variations for different parts
      purpleLight: 0xe6a8e6, // Light orchid variations
      purpleMid: 0xda70d6, // Orchid
      purpleDark: 0xc65cc6, // Darker orchid
      blueAccent: 0x00bfff, // Bright blue accent
    };

    // Array of colors to cycle through for different mesh parts
    const colorArray = [
      copilotColors.mainBody, // Primary body color
      copilotColors.bodyHighlight, // Bright highlights
      copilotColors.faceArea, // Dark face area
      copilotColors.eyeSockets, // Light blue eyes
      copilotColors.bodyBase, // Base/shadow areas
      copilotColors.highlights, // Light blue details
      copilotColors.purpleLight, // Light purple variations
      copilotColors.eyeDetails, // Light blue eye details
      copilotColors.purpleMid, // Medium purple areas
      copilotColors.blueAccent, // Teal accents
      copilotColors.purpleDark, // Dark purple areas
    ];

    // Apply colors with some logic based on mesh names if available
    let meshIndex = 0;
    copilotModel.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        let selectedColor;

        // Try to match colors based on mesh names if they exist
        const meshName = child.name.toLowerCase();

        if (meshName.includes("eye") || meshName.includes("socket")) {
          selectedColor = copilotColors.eyeSockets; // Bright blue for eyes
        } else if (meshName.includes("face") || meshName.includes("screen")) {
          selectedColor = copilotColors.faceArea; // Dark/black for screen
        } else if (meshName.includes("glass") || meshName.includes("lens")) {
          selectedColor = copilotColors.goggleGlass; // Dark like screen glass
        } else if (meshName.includes("goggle") || meshName.includes("frame")) {
          selectedColor = copilotColors.bodyBase; // Orchid - goggle frame matches head
        } else if (meshName.includes("ear")) {
          selectedColor = copilotColors.ears; // Slightly darker orchid for ears
        } else if (meshName.includes("head") || meshName.includes("body")) {
          selectedColor = copilotColors.mainBody; // Orchid for head
        } else if (meshName.includes("nose") || meshName.includes("mouth")) {
          selectedColor = copilotColors.noseAccent; // Dark for accent areas
        } else if (
          meshName.includes("highlight") ||
          meshName.includes("light")
        ) {
          selectedColor = copilotColors.bodyHighlight; // Light orchid highlights
        } else if (meshName.includes("base") || meshName.includes("dark")) {
          selectedColor = copilotColors.purpleDark; // Darker orchid
        } else {
          // Use array cycling for unnamed or generic parts
          selectedColor = colorArray[meshIndex % colorArray.length];
        }

        child.material = new THREE.MeshBasicMaterial({
          color: selectedColor,
        });

        meshIndex++;
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

    // Set initial player position - center for the start screen
    gameState.player.position.x = 0;
    gameState.player.position.y = 0;
    copilotModel.position.set(0, 0, 0);

    scene.add(copilotModel);
  },
  undefined, // No progress callback needed
  (error) => {
    console.error("Error loading GLB model:", error);
  }
);



// Add UI for score display
const scoreElement = document.createElement("div");
scoreElement.style.position = "fixed";
scoreElement.style.color = "#00ff40";
scoreElement.style.fontFamily = "'DepartureMono', 'Courier New', monospace";
scoreElement.style.zIndex = "1000";
scoreElement.style.textShadow =
  "0 0 10px #00ff40, 0 0 20px #00ff40, 0 0 40px #00ff40, 0 0 80px #00ff40";
scoreElement.textContent = "SCORE 0";
document.body.appendChild(scoreElement);

// Add UI for high score display
const highScoreElement = document.createElement("div");
highScoreElement.style.position = "fixed";
highScoreElement.style.color = "#00ff40";
highScoreElement.style.fontFamily = "'DepartureMono', 'Courier New', monospace";
highScoreElement.style.zIndex = "1000";
highScoreElement.style.textShadow =
  "0 0 10px #00ff40, 0 0 20px #00ff40, 0 0 40px #00ff40, 0 0 80px #00ff40";
highScoreElement.textContent = `BEST ${gameState.highScore}`;
document.body.appendChild(highScoreElement);

// Add UI for mute button
const muteButtonElement = document.createElement("div");
muteButtonElement.style.position = "fixed";
muteButtonElement.style.color = "#00ff40";
muteButtonElement.style.fontFamily =
  "'DepartureMono', 'Courier New', monospace";
muteButtonElement.style.zIndex = "1000";
muteButtonElement.style.cursor = "pointer";
muteButtonElement.style.textShadow =
  "0 0 10px #00ff40, 0 0 20px #00ff40, 0 0 40px #00ff40, 0 0 80px #00ff40";
muteButtonElement.style.userSelect = "none"; // Prevent text selection
muteButtonElement.style.webkitUserSelect = "none"; // Safari
muteButtonElement.style.touchAction = "manipulation"; // Improve touch responsiveness
muteButtonElement.textContent = isMuted ? "SOUND OFF" : "SOUND ON";

muteButtonElement.addEventListener("click", toggleMute);
muteButtonElement.addEventListener("touchstart", (e) => {
  e.stopPropagation(); // Prevent game touch handling
  e.preventDefault();
  toggleMute();
}, { passive: false });

document.body.appendChild(muteButtonElement);

// Add UI for LGTM 2025 text
const lgtmElement = document.createElement("div");
lgtmElement.style.position = "fixed";
lgtmElement.style.color = "#00ff40";
lgtmElement.style.fontFamily = "'DepartureMono', 'Courier New', monospace";
lgtmElement.style.zIndex = "1000";
lgtmElement.style.textShadow =
  "0 0 10px #00ff40, 0 0 20px #00ff40, 0 0 40px #00ff40, 0 0 80px #00ff40";
lgtmElement.textContent = "LGTM 2025";
document.body.appendChild(lgtmElement);

// Add UI for start game prompt
const startPromptElement = document.createElement("div");
startPromptElement.style.position = "fixed";
startPromptElement.style.bottom = "25%";
startPromptElement.style.left = "50%";
startPromptElement.style.transform = "translateX(-50%)";
startPromptElement.style.width = "100%";

startPromptElement.style.color = "#00ff40";
startPromptElement.style.fontFamily =
  "'DepartureMono', 'Courier New', monospace";
startPromptElement.style.zIndex = "1000";
startPromptElement.style.textAlign = "center";
startPromptElement.style.cursor = "pointer";
startPromptElement.style.textShadow =
  "0 0 10px #00ff40, 0 0 20px #00ff40, 0 0 40px #00ff40, 0 0 80px #00ff40";
// Update text based on device type
const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
  ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
startPromptElement.innerHTML = isMobileDevice ? "TAP AND HOLD TO PLAY" : "PRESS SPACE TO START";
startPromptElement.addEventListener("click", () => {
  if (!gameState.gameStarted) {
    startGame();
  }
});
document.body.appendChild(startPromptElement);



// Ensure proper mobile viewport configuration
function setupMobileViewport() {
  // Add or update viewport meta tag for mobile optimization
  let viewportMeta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement;
  
  if (!viewportMeta) {
    viewportMeta = document.createElement('meta');
    viewportMeta.name = 'viewport';
    document.head.appendChild(viewportMeta);
  }
  
  // Set mobile-optimized viewport settings
  viewportMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, shrink-to-fit=no';
  
  // Prevent double-tap zoom on mobile
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
  document.addEventListener('gestureend', (e) => e.preventDefault());
}

// Setup mobile viewport
setupMobileViewport();

// Apply initial responsive styling
updateResponsiveUI();

// Initialize audio immediately on page load
initializeAudio();

// Set initial cursor visibility
updateCursorVisibility();

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  // Update game logic
  updateGame();

  // Update space background animation
  const backgroundMaterial = spaceBackground.material as THREE.ShaderMaterial;
  backgroundMaterial.uniforms.time.value = Date.now() * 0.001;

  // Update CRT shader time uniform for animated noise
  crtPass.uniforms.time.value = Date.now() * 0.001;

  // Update glitch shader time uniform
  glitchPass.uniforms.time.value = Date.now() * 0.001;

  // Render with post-processing instead of direct renderer
  composer.render();
}
animate();

// Handle resizing
window.addEventListener("resize", () => {
  // Update camera with responsive FOV
  camera.fov = getResponsiveFOV();
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Update post-processing resolution
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
  pixelPass.uniforms.resolution.value.set(
    window.innerWidth,
    window.innerHeight
  );
  
  // Update responsive pixel size
  pixelPass.uniforms.pixelSize.value = getResponsivePixelSize();
  
  // Update responsive camera positions
  const newCameraPositions = getResponsiveCameraPositions();
  cameraState.introPosition.z = newCameraPositions.introZ;
  cameraState.gamePosition.z = newCameraPositions.gameZ;
  
  // Update particle size
  particles.material.size = getResponsiveParticleSize();
  
  glitchPass.uniforms.resolution.value.set(
    window.innerWidth,
    window.innerHeight
  );
  crtPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
  
  // Update responsive UI on resize (including orientation changes)
  updateResponsiveUI();
});

// ===========================================
// RESPONSIVE UI UTILITIES
// ===========================================

// Calculate responsive font size based on screen size
function getResponsiveFontSize(): number {
  const minSize = 16; // Minimum font size
  const maxSize = 40; // Maximum font size (current desktop size)
  const minWidth = 320; // Minimum expected screen width
  const maxWidth = 1200; // Width at which we reach max font size
  
  const screenWidth = Math.min(window.innerWidth, window.innerHeight * 1.5); // Consider both portrait and landscape
  const fontSize = minSize + (maxSize - minSize) * 
    Math.min(1, Math.max(0, (screenWidth - minWidth) / (maxWidth - minWidth)));
  
  return Math.round(fontSize);
}

// Calculate responsive spacing based on screen size
function getResponsiveSpacing(): number {
  const minSpacing = 15; // Minimum spacing
  const maxSpacing = 70; // Maximum spacing (current desktop)
  const minWidth = 320;
  const maxWidth = 1200;
  
  const screenWidth = Math.min(window.innerWidth, window.innerHeight * 1.5);
  const spacing = minSpacing + (maxSpacing - minSpacing) * 
    Math.min(1, Math.max(0, (screenWidth - minWidth) / (maxWidth - minWidth)));
  
  return Math.round(spacing);
}

// Update all UI element styles to be responsive
function updateResponsiveUI() {
  const fontSize = getResponsiveFontSize();
  const spacing = getResponsiveSpacing();
  const fontSizeStyle = `${fontSize}px`;
  
  // Update all text elements
  [scoreElement, highScoreElement, muteButtonElement, lgtmElement, startPromptElement].forEach(element => {
    if (element) {
      element.style.fontSize = fontSizeStyle;
    }
  });
  

  
  // Update positioning
  if (scoreElement) {
    scoreElement.style.top = `${spacing * 0.8}px`;
    scoreElement.style.right = `${spacing}px`;
  }
  
  if (highScoreElement) {
    highScoreElement.style.top = `${spacing * 0.8}px`;
    highScoreElement.style.left = `${spacing}px`;
  }
  
  if (muteButtonElement) {
    muteButtonElement.style.bottom = `${spacing * 0.8}px`;
    muteButtonElement.style.left = `${spacing}px`;
  }
  
  if (lgtmElement) {
    lgtmElement.style.bottom = `${spacing * 0.8}px`;
    lgtmElement.style.right = `${spacing}px`;
  }
  
  // Update scanline size
  updateScanlineSize();
}

// ===========================================
// TOUCH CONTROLS FOR MOBILE
// ===========================================

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let isTouching = false;
let lastTouchX = 0;
let lastTouchY = 0;
let hasTriggeredDoubleJump = false; // Track if double jump was triggered in this touch session
let touchMoveThreshold = 1; // Minimum distance for movement recognition (more sensitive)
let hasMoved = false; // Track if finger has moved significantly



// Touch control handlers
function handleTouchStart(event: TouchEvent) {
  event.preventDefault();
  if (event.touches.length > 0) {
    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
    lastTouchX = touch.clientX;
    lastTouchY = touch.clientY;
    isTouching = true;
    hasTriggeredDoubleJump = false; // Reset double jump flag
    hasMoved = false; // Reset movement tracking
    
    // Handle game start on touch
    if (!gameState.gameStarted && !gameState.introAnimation.active) {
      startGame();
      return;
    }
    
    // Don't trigger jump immediately - wait to see if it's a tap or drag
  }
}

function handleTouchMove(event: TouchEvent) {
  event.preventDefault();
  if (!isTouching || event.touches.length === 0 || !gameState.gameStarted) return;
  
  const touch = event.touches[0];
  const currentX = touch.clientX;
  const currentY = touch.clientY;
  
  // Calculate movement from last touch position (for continuous movement)
  const deltaX = currentX - lastTouchX;
  const deltaY = lastTouchY - currentY; // Inverted Y (up is positive)
  
  // Calculate total movement from start (for tap detection)
  const totalDeltaX = Math.abs(currentX - touchStartX);
  const totalDeltaY = Math.abs(currentY - touchStartY);
  const totalMovement = Math.sqrt(totalDeltaX * totalDeltaX + totalDeltaY * totalDeltaY);
  
  // Track if significant movement has occurred (for tap detection)
  if (totalMovement > 15) {
    hasMoved = true;
  }
  
  // Clear previous movement keys
  gameState.keys.left = false;
  gameState.keys.right = false;
  
  // Horizontal movement based on current drag direction
  if (Math.abs(deltaX) > touchMoveThreshold) {
    if (deltaX < 0) {
      gameState.keys.left = true; // Moving left
    } else {
      gameState.keys.right = true; // Moving right
    }
  }
  
  // Check for upward flick (fast upward movement)
  const currentTime = Date.now();
  const timeDelta = currentTime - touchStartTime;
  const upwardFlickY = touchStartY - currentY; // Upward movement from start
  
  // Detect upward flick: fast upward movement in short time
  if (upwardFlickY > 30 && timeDelta < 200 && !hasTriggeredDoubleJump) {
    // Check if double jump is available
    if (gameState.player.doubleJumpAvailable && !gameState.player.hasDoubleJumped) {
      gameState.keys.up = true;
      hasTriggeredDoubleJump = true; // Prevent multiple double jumps in one touch session
      
      // Small delay to register the jump, then clear the key
      setTimeout(() => {
        gameState.keys.up = false;
      }, 50);
    }
  }
  
  // Update last touch position for next frame
  lastTouchX = currentX;
  lastTouchY = currentY;
}

function handleTouchEnd(event: TouchEvent) {
  event.preventDefault();
  
  // Check for tap (quick touch without much movement) for jump/double jump
  if (gameState.gameStarted && !hasTriggeredDoubleJump && !hasMoved) {
    const touchDuration = Date.now() - touchStartTime;
    
    // If it was a quick tap (under 300ms) and no significant movement
    if (touchDuration < 300) {
      // Trigger the jump key press - let the game logic decide if it's regular or double jump
      gameState.keys.up = true;
      keyPressed["Space"] = true; // This triggers the double jump logic in updateGame()
      setTimeout(() => {
        gameState.keys.up = false;
      }, 50);
    }
  }
  
  isTouching = false;
  hasTriggeredDoubleJump = false;
  hasMoved = false;
  
  // Clear movement keys
  gameState.keys.left = false;
  gameState.keys.right = false;
  gameState.keys.up = false;
}

// Add touch event listeners
window.addEventListener('touchstart', handleTouchStart, { passive: false });
window.addEventListener('touchmove', handleTouchMove, { passive: false });
window.addEventListener('touchend', handleTouchEnd, { passive: false });
