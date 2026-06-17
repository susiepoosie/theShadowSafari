// ════════════════════════════════════════════════════════
//  SHADOW SAFARI — sketch.js
//  Phase 2: Creature states + proper flashlight + fleeing
// ════════════════════════════════════════════════════════

let capture;
let thresholdImg;

// Stillness detection
let prevFrame;
let stillTimer   = 0;
const STILL_NEEDED = 2500;
let captureReady = false;

// UI
let instructionEl;
let captureBtn;

// Creatures
let creatures = [];

// ── Lighting state ─────────────────────────────────────
// lightX/Y track where the "threat" is (cursor normally,
// screen-centre during a torch event in Phase 4)
let lightX, lightY;
const LIGHT_RADIUS   = 160;  // px — how far the flashlight reaches
const FLEE_RADIUS    = 220;  // px — creatures start fleeing beyond this
const VISIBLE_RADIUS = 180;  // px — creatures become visible within this

// ── Setup ──────────────────────────────────────────────
function setup() {
  let cnv = createCanvas(windowWidth, windowHeight);
  cnv.parent('canvas-container');

  capture = createCapture(VIDEO);
  capture.size(320, 240);
  capture.hide();

  thresholdImg = createImage(320, 240);

  instructionEl = select('#instruction');
  captureBtn    = select('#capture-btn');
  captureBtn.mousePressed(captureCreature);

  pixelDensity(1);

  // Initialise light to centre of screen
  lightX = width  / 2;
  lightY = height / 2;
}

// ── Main draw loop ─────────────────────────────────────
function draw() {
  background(12, 12, 14);

  // Smoothly follow the mouse — feels more like a real torch
  lightX = lerp(lightX, mouseX, 0.12);
  lightY = lerp(lightY, mouseY, 0.12);

  if (capture.loadedmetadata) {
    processWebcam();
    checkStillness();
  }

  // Draw creatures BEFORE the darkness overlay so they
  // appear lit when inside the flashlight radius
  for (let c of creatures) {
    c.update();
    c.draw();
  }

  // Darkness overlay goes on top — creatures peeking through
  drawDarknessOverlay();

  // Webcam preview sits above everything
  if (capture.loadedmetadata) drawWebcamPreview();
}

// ── Webcam processing ──────────────────────────────────
function processWebcam() {
  capture.loadPixels();
  thresholdImg.loadPixels();

  let total = capture.pixels.length / 4;

  for (let i = 0; i < total; i++) {
    let idx = i * 4;
    let r = capture.pixels[idx];
    let g = capture.pixels[idx + 1];
    let b = capture.pixels[idx + 2];
    let brightness = (r + g + b) / 3;
    let threshold  = 100; // ← adjust for your lighting

    if (brightness < threshold) {
      thresholdImg.pixels[idx]     = 255;
      thresholdImg.pixels[idx + 1] = 255;
      thresholdImg.pixels[idx + 2] = 255;
      thresholdImg.pixels[idx + 3] = 220;
    } else {
      thresholdImg.pixels[idx]     = 0;
      thresholdImg.pixels[idx + 1] = 0;
      thresholdImg.pixels[idx + 2] = 0;
      thresholdImg.pixels[idx + 3] = 0;
    }
  }

  thresholdImg.updatePixels();
}

// ── Darkness overlay with flashlight cut-out ───────────
function drawDarknessOverlay() {
  let ctx = drawingContext;

  // Save state
  ctx.save();

  // Fill entire canvas black
  ctx.fillStyle = 'rgba(10, 10, 12, 0.93)';
  ctx.fillRect(0, 0, width, height);

  // Punch a transparent hole where the flashlight is
  ctx.globalCompositeOperation = 'destination-out';
  let hole = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, LIGHT_RADIUS);
  hole.addColorStop(0,    'rgba(0,0,0,1)');
  hole.addColorStop(0.5,  'rgba(0,0,0,1)');
  hole.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = hole;
  ctx.fillRect(0, 0, width, height);

  // Reset compositing
  ctx.globalCompositeOperation = 'source-over';

  // Warm glow on top
  let glow = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, LIGHT_RADIUS);
  glow.addColorStop(0,    'rgba(255,220,100,0.18)');
  glow.addColorStop(0.4,  'rgba(255,160,40,0.08)');
  glow.addColorStop(0.7,  'rgba(180,80,10,0.03)');
  glow.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.restore();
}

// ── Webcam preview ─────────────────────────────────────
function drawWebcamPreview() {
  push();
  let previewW = 200;
  let previewH = 150;
  let x = 20;
  let y = height - previewH - 28;

  translate(x + previewW, y);
  scale(-1, 1);

  tint(255, 30);
  image(capture, 0, 0, previewW, previewH);
  tint(255, 160);
  image(thresholdImg, 0, 0, previewW, previewH);
  pop();

  // Border
  noFill();
  stroke(255, 25);
  strokeWeight(1);
  rect(20, height - previewH - 28, previewW, previewH);

  fill(255, 60);
  noStroke();
  textSize(9);
  textFont('Courier New');
  text('CAPTURE WINDOW', 20, height - 10);
}

// ── Stillness detection ────────────────────────────────
function checkStillness() {
  if (!prevFrame) { prevFrame = capture.get(); return; }

  capture.loadPixels();
  prevFrame.loadPixels();

  let diff = 0;
  let sampleStep = 8;
  let total = (capture.pixels.length / 4) / sampleStep;

  for (let i = 0; i < total; i++) {
    let idx = i * sampleStep * 4;
    diff += (
      abs(capture.pixels[idx]     - prevFrame.pixels[idx]) +
      abs(capture.pixels[idx + 1] - prevFrame.pixels[idx + 1]) +
      abs(capture.pixels[idx + 2] - prevFrame.pixels[idx + 2])
    ) / 3;
  }

  let isStill = (diff / total) < 8;

  if (isStill) {
    stillTimer += deltaTime;
  } else {
    stillTimer   = 0;
    captureReady = false;
    captureBtn.removeClass('ready');
    instructionEl.removeClass('active');
  }

  if (stillTimer >= STILL_NEEDED && !captureReady) {
    captureReady = true;
    captureBtn.addClass('ready');
    instructionEl.addClass('active');
    instructionEl.html('Shadow creature detected — capture it!');
  } else if (!captureReady) {
    let progress = floor((stillTimer / STILL_NEEDED) * 100);
    if (progress > 5) {
      instructionEl.html(`Hold still... ${progress}%`);
      instructionEl.addClass('active');
    } else {
      instructionEl.html('Hold still to capture your shadow creature');
      instructionEl.removeClass('active');
    }
  }

  if (frameCount % 10 === 0) prevFrame = capture.get();
}

// ── Capture ────────────────────────────────────────────
function captureCreature() {
  if (!captureReady) return;

  let snapshot = thresholdImg.get();
  // Spawn at a random position away from the very centre
  let spawnX = random(width  * 0.2, width  * 0.8);
  let spawnY = random(height * 0.2, height * 0.8);
  creatures.push(new Creature(snapshot, spawnX, spawnY));

  captureReady = false;
  stillTimer   = 0;
  captureBtn.removeClass('ready');
  instructionEl.html('Shadow released into the wild…');

  setTimeout(() => {
    instructionEl.html('Hold still to capture your shadow creature');
    instructionEl.removeClass('active');
  }, 2000);
}

// ── Resize ─────────────────────────────────────────────
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// ════════════════════════════════════════════════════════
//  CREATURE CLASS
// ════════════════════════════════════════════════════════
class Creature {
  constructor(img, x, y) {
    this.img     = img;
    this.x       = x;
    this.y       = y;
    this.vx      = random(-0.3, 0.3);
    this.vy      = random(-0.3, 0.3);
    this.w       = 240;
    this.h       = 180;

    // ── State machine ──────────────────────────────────
    // idle        → drifting slowly, nearly invisible
    // illuminated → light is nearby, creature freezes nervously
    // fleeing     → light is close, running toward edge
    // hidden      → reached the edge/darkness, resting
    this.state         = 'idle';
    this.opacity       = 0;       // current rendered opacity (0–255)
    this.targetOpacity = 15;      // what opacity we're lerping toward

    // Noise offset — unique per creature so they don't all move identically
    this.noiseOffset = random(1000);

    // Flee target — where this creature is running to
    this.fleeTargetX = x;
    this.fleeTargetY = y;

    // How long since it last changed state (prevents jitter)
    this.stateTimer = 0;
  }

  update() {
    this.stateTimer += deltaTime;

    let d = dist(lightX, lightY, this.x, this.y);

    // ── State transitions ───────────────────────────────
    if (d < FLEE_RADIUS) {
      // Light is very close — flee
      if (this.state !== 'fleeing') {
        this.state = 'fleeing';
        this.stateTimer = 0;
        this.chooseFleeDest();
      }
    } else if (d < VISIBLE_RADIUS) {
      // Light is nearby but not threatening — freeze nervously
      if (this.state !== 'illuminated' && this.state !== 'fleeing') {
        this.state = 'illuminated';
        this.stateTimer = 0;
      }
    } else {
      // Safe in darkness
      if (this.state === 'fleeing' && this.stateTimer > 1200) {
        // Only settle after 1.2s of fleeing (don't snap back immediately)
        this.state = 'hidden';
        this.stateTimer = 0;
      } else if (this.state === 'illuminated') {
        this.state = 'idle';
      } else if (this.state === 'hidden' && this.stateTimer > 3000) {
        // After hiding for 3s, resume gentle drifting
        this.state = 'idle';
        this.stateTimer = 0;
      }
    }

    // ── Movement per state ──────────────────────────────
    switch (this.state) {

      case 'idle':
        // Slow organic drift via Perlin noise
        let n  = noise(this.x * 0.002 + this.noiseOffset,
                       this.y * 0.002,
                       frameCount * 0.0008);
        let angle = n * TWO_PI * 2;
        this.vx = lerp(this.vx, cos(angle) * 0.4, 0.02);
        this.vy = lerp(this.vy, sin(angle) * 0.4, 0.02);
        this.targetOpacity = 18;
        break;

      case 'illuminated':
        // Nearly stopped — nervous trembling
        this.vx = lerp(this.vx, random(-0.15, 0.15), 0.1);
        this.vy = lerp(this.vy, random(-0.15, 0.15), 0.1);
        // Slightly more visible when caught in the light
        this.targetOpacity = 55;
        break;

      case 'fleeing':
        // Accelerate toward flee destination
        let fx  = this.fleeTargetX - this.x;
        let fy  = this.fleeTargetY - this.y;
        let mag = sqrt(fx * fx + fy * fy);
        if (mag > 1) {
          this.vx = lerp(this.vx, (fx / mag) * 3.5, 0.08);
          this.vy = lerp(this.vy, (fy / mag) * 3.5, 0.08);
        }
        // Briefly more visible (panic flash) then fades
        this.targetOpacity = this.stateTimer < 400 ? 70 : 20;
        break;

      case 'hidden':
        // Slow right down — lurking at edges
        this.vx = lerp(this.vx, 0, 0.05);
        this.vy = lerp(this.vy, 0, 0.05);
        this.targetOpacity = 8;
        break;
    }

    // Apply velocity
    this.x += this.vx;
    this.y += this.vy;

    // Soft boundary — nudge back gently rather than hard-clamping
    let margin = 60;
    if (this.x < margin)        this.vx += 0.15;
    if (this.x > width - margin) this.vx -= 0.15;
    if (this.y < margin)        this.vy += 0.15;
    if (this.y > height - margin) this.vy -= 0.15;

    // Smooth opacity transition
    this.opacity = lerp(this.opacity, this.targetOpacity, 0.04);
  }

  // Pick a flee destination near the screen edge
  chooseFleeDest() {
    // Find the nearest edge and flee toward it
    let edges = [
      { x: random(0,   width * 0.15),  y: this.y },              // left
      { x: random(width * 0.85, width), y: this.y },              // right
      { x: this.x, y: random(0,   height * 0.15) },               // top
      { x: this.x, y: random(height * 0.85, height) },            // bottom
    ];

    // Pick the closest edge direction
    let nearest = edges[0];
    let nearDist = dist(this.x, this.y, nearest.x, nearest.y);
    for (let e of edges) {
      let d = dist(this.x, this.y, e.x, e.y);
      if (d < nearDist) { nearDist = d; nearest = e; }
    }

    this.fleeTargetX = nearest.x;
    this.fleeTargetY = nearest.y;
  }

  draw() {
    push();
    translate(this.x, this.y);
    imageMode(CENTER);

    // Creatures near the light get a subtle blue-grey tint
    // (simulates light falling on them)
    let d = dist(lightX, lightY, this.x, this.y);
    if (d < VISIBLE_RADIUS) {
      let litAmount = map(d, 0, VISIBLE_RADIUS, 180, 0);
      tint(200, 210, 230, this.opacity + litAmount * 0.4);
    } else {
      tint(255, 255, 255, this.opacity);
    }

    image(this.img, 0, 0, this.w, this.h);
    pop();
  }
}