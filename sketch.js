// ════════════════════════════════════════════════════════
//  SHADOW SAFARI — sketch.js
//  Phase 1: Webcam feed + threshold silhouette
// ════════════════════════════════════════════════════════

let capture;          // webcam feed
let thresholdImg;     // processed silhouette image

// Stillness detection
let prevFrame;        // last frame's pixel data for comparison
let stillTimer = 0;   // how long the user has been still (milliseconds)
const STILL_NEEDED = 2500; // ms they need to hold still before capture is ready
let captureReady = false;

// UI elements
let instructionEl;
let captureBtn;

// Creatures array — populated in later phases
let creatures = [];

// ── Setup ──────────────────────────────────────────────
function setup() {
  // Create canvas and attach to our container div
  let cnv = createCanvas(windowWidth, windowHeight);
  cnv.parent('canvas-container');

  // Webcam capture (hidden — we'll draw it manually)
  capture = createCapture(VIDEO);
  capture.size(320, 240);
  capture.hide();

  // Blank image for threshold output
  thresholdImg = createImage(320, 240);

  // Grab UI elements
  instructionEl = select('#instruction');
  captureBtn    = select('#capture-btn');

  // Button triggers capture
  captureBtn.mousePressed(captureCreature);

  pixelDensity(1); // keeps pixel math simple on retina screens
}

// ── Main draw loop ─────────────────────────────────────
function draw() {
  // Dark background — not pure black, just slightly grey so
  // the landscape can have depth later
  background(12, 12, 14);

  // Only process once webcam is actually loaded
  if (capture.loadedmetadata) {
    processWebcam();
    drawWebcamPreview();
    checkStillness();
  }

  // Draw any released creatures
  for (let c of creatures) {
    c.update();
    c.draw();
  }

  // Light overlay from cursor (Phase 4 — placeholder for now)
  drawCursorLight();
}

// ── Webcam processing ──────────────────────────────────
function processWebcam() {
  // Load webcam pixels into memory so we can read/write them
  capture.loadPixels();
  thresholdImg.loadPixels();

  let total = capture.pixels.length / 4; // each pixel = 4 values: R,G,B,A

  for (let i = 0; i < total; i++) {
    let idx = i * 4;

    let r = capture.pixels[idx];
    let g = capture.pixels[idx + 1];
    let b = capture.pixels[idx + 2];

    // Brightness: average of R, G, B (0–255)
    let brightness = (r + g + b) / 3;

    // THRESHOLD: if pixel is dark enough, treat it as "shadow"
    // Adjust this value (80) depending on your lighting conditions
    // Lower = only very dark pixels become shadow
    // Higher = more of the image becomes shadow
    let threshold = 80;

    if (brightness < threshold) {
      // Shadow pixel — white in our silhouette
      thresholdImg.pixels[idx]     = 255;
      thresholdImg.pixels[idx + 1] = 255;
      thresholdImg.pixels[idx + 2] = 255;
      thresholdImg.pixels[idx + 3] = 220; // slight transparency
    } else {
      // Bright pixel — transparent (not part of shadow)
      thresholdImg.pixels[idx]     = 0;
      thresholdImg.pixels[idx + 1] = 0;
      thresholdImg.pixels[idx + 2] = 0;
      thresholdImg.pixels[idx + 3] = 0;
    }
  }

  thresholdImg.updatePixels();
}

// ── Draw the webcam preview (mirrored, bottom-left) ────
function drawWebcamPreview() {
  push();

  // Position: bottom-left corner
  let previewW = 240;
  let previewH = 180;
  let x = 20;
  let y = height - previewH - 20;

  // Mirror the image so it feels like a mirror
  translate(x + previewW, y);
  scale(-1, 1);

  // Raw webcam (dim)
  tint(255, 40);
  image(capture, 0, 0, previewW, previewH);

  // Silhouette overlay
  tint(255, 180);
  image(thresholdImg, 0, 0, previewW, previewH);

  pop();

  // Label
  fill(255, 80);
  noStroke();
  textSize(9);
  textFont('Courier New');
  text('CAPTURE WINDOW', 20, height - 8);
}

// ── Stillness detection ────────────────────────────────
function checkStillness() {
  // We compare current frame to the previous frame.
  // If very little has changed, the user is holding still.

  if (!prevFrame) {
    // First frame — just store it and move on
    prevFrame = capture.get();
    return;
  }

  capture.loadPixels();
  prevFrame.loadPixels();

  let diff = 0;
  let sampleStep = 8; // check every 8th pixel for speed
  let total = (capture.pixels.length / 4) / sampleStep;

  for (let i = 0; i < total; i++) {
    let idx = i * sampleStep * 4;
    let dr = abs(capture.pixels[idx]     - prevFrame.pixels[idx]);
    let dg = abs(capture.pixels[idx + 1] - prevFrame.pixels[idx + 1]);
    let db = abs(capture.pixels[idx + 2] - prevFrame.pixels[idx + 2]);
    diff += (dr + dg + db) / 3;
  }

  let avgDiff = diff / total;

  // avgDiff below ~8 means very little movement
  let isStill = avgDiff < 8;

  if (isStill) {
    stillTimer += deltaTime; // deltaTime = ms since last frame (p5 built-in)
  } else {
    stillTimer = 0;
    captureReady = false;
    captureBtn.removeClass('ready');
    instructionEl.removeClass('active');
  }

  // Has the user been still long enough?
  if (stillTimer >= STILL_NEEDED && !captureReady) {
    captureReady = true;
    captureBtn.addClass('ready');
    instructionEl.addClass('active');
    instructionEl.html('Shadow creature detected — capture it!');
  } else if (!captureReady) {
    // Show countdown progress
    let progress = floor((stillTimer / STILL_NEEDED) * 100);
    if (progress > 5) {
      instructionEl.html(`Hold still... ${progress}%`);
      instructionEl.addClass('active');
    } else {
      instructionEl.html('Hold still to capture your shadow creature');
      instructionEl.removeClass('active');
    }
  }

  // Update prevFrame every 10 frames (not every frame — too expensive)
  if (frameCount % 10 === 0) {
    prevFrame = capture.get();
  }
}

// ── Capture a creature ─────────────────────────────────
function captureCreature() {
  if (!captureReady) return;

  // Snapshot the current silhouette
  let snapshot = thresholdImg.get(); // copies the image

  // Place it roughly in the centre of the canvas
  let creature = new Creature(snapshot, width / 2, height / 2);
  creatures.push(creature);

  // Reset state
  captureReady = false;
  stillTimer = 0;
  captureBtn.removeClass('ready');
  instructionEl.html('Shadow released into the wild');

  // Brief message then reset
  setTimeout(() => {
    instructionEl.html('Hold still to capture your shadow creature');
    instructionEl.removeClass('active');
  }, 2000);
}

// ── Cursor light overlay ───────────────────────────────
function drawCursorLight() {
  // Draw a radial "darkness" mask with a hole at the cursor.
  // Everything outside the radius is very dark.
  // Phase 4 will make creatures react to this.

  let lightRadius = 140;

  // Radial gradient from transparent (at cursor) to dark (outside)
  for (let r = lightRadius; r > 0; r -= 4) {
    let alpha = map(r, 0, lightRadius, 0, 200);
    fill(12, 12, 14, alpha / lightRadius * r);
    noStroke();
    ellipse(mouseX, mouseY, r * 2, r * 2);
  }

  // Darken everything outside the light radius
  // We do this by drawing a dark rectangle with a transparent hole
  // (simple version — Phase 4 will refine this)
  noStroke();
  fill(12, 12, 14, 180);
  rect(0, 0, width, height);

  // Cut out the light circle — draw lighter circle on top
  let g = drawingContext; // access the raw Canvas 2D context
  g.save();
  g.globalCompositeOperation = 'destination-out';
  // (This is an advanced technique — for now just show a simple glow)
  g.restore();

  // Simple glow circle instead
  noFill();
  for (let i = 3; i > 0; i--) {
    stroke(255, 255, 255, 8 * i);
    strokeWeight(2);
    ellipse(mouseX, mouseY, lightRadius * 2 * i / 3, lightRadius * 2 * i / 3);
  }
}

// ── Creature class ─────────────────────────────────────
// Placeholder — will be expanded significantly in Phase 3
class Creature {
  constructor(img, x, y) {
    this.img     = img;
    this.x       = x;
    this.y       = y;
    this.vx      = random(-0.4, 0.4); // slow drift
    this.vy      = random(-0.4, 0.4);
    this.opacity = 0;                  // fade in
    this.w       = 240;
    this.h       = 180;
    this.state   = 'idle';            // idle | fleeing | hidden
  }

  update() {
    // Drift slowly using Perlin noise
    let n = noise(this.x * 0.002, this.y * 0.002, frameCount * 0.001);
    this.vx += map(n, 0, 1, -0.05, 0.05);
    this.vy += map(n, 0, 1, -0.05, 0.05);

    // Cap speed
    this.vx = constrain(this.vx, -0.8, 0.8);
    this.vy = constrain(this.vy, -0.8, 0.8);

    this.x += this.vx;
    this.y += this.vy;

    // Keep within canvas
    this.x = constrain(this.x, 0, width);
    this.y = constrain(this.y, 0, height);

    // Fade in
    this.opacity = min(this.opacity + 1, 60); // max opacity 60/255 — ghostly
  }

  draw() {
    push();
    // Mirror so creatures don't all face the same way
    translate(this.x, this.y);
    imageMode(CENTER);
    tint(255, this.opacity);
    image(this.img, 0, 0, this.w, this.h);
    pop();
  }
}

// ── Resize canvas when window changes ─────────────────
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
