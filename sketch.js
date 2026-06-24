// ════════════════════════════════════════════════════════
//  SHADOW SAFARI — sketch.js  (fixed: calibration, lag, lighting)
// ════════════════════════════════════════════════════════

let capture;

// Persistent buffers (created ONCE, reused every frame) ──────
let handGraphics;   // white hand silhouette, sized to the real webcam resolution
let darkLayer;      // offscreen darkness layer we punch the torch hole into

let prevFrame;
let stillTimer   = 0;
const STILL_NEEDED = 4000;
let captureReady = false;

let instructionEl;
let captureBtn;

let creatures = [];

let handpose;
let hands = [];

let lightX, lightY;
const LIGHT_RADIUS   = 160;
const FLEE_RADIUS    = 120;
const VISIBLE_RADIUS = 250;

// How fast the torch chases the cursor. Higher = snappier (less perceived lag).
const TORCH_EASE = 0.2;

function setup() {
  let cnv = createCanvas(windowWidth, windowHeight);
  cnv.parent('canvas-container');

  capture = createCapture(VIDEO);
  capture.size(320, 240);
  capture.hide();

  // darkness layer matches the canvas; recreated on resize
  darkLayer = createGraphics(width, height);

  instructionEl = select('#instruction');
  captureBtn    = select('#capture-btn');
  captureBtn.mousePressed(captureCreature);

  pixelDensity(1);

  lightX = width  / 2;
  lightY = height / 2;

  handpose = ml5.handpose(capture, () => {
    console.log('HandPose ready');
  });
  handpose.on('predict', results => {
    hands = results;
  });
}

function draw() {
  background(45, 42, 48);

  lightX = lerp(lightX, mouseX, TORCH_EASE);
  lightY = lerp(lightY, mouseY, TORCH_EASE);

  if (capture.loadedmetadata) {
    processWebcam();
    checkStillness();
  }

  // creatures render onto the MAIN canvas first…
  for (let c of creatures) {
    c.update();
    c.draw();
  }

  // …then the darkness layer is overlaid, so its torch-hole REVEALS them.
  drawDarknessOverlay();

  if (capture.loadedmetadata) drawWebcamPreview();
}

// ────────────────────────────────────────────────────────
//  Hand silhouette — reuses ONE buffer, sized to the real
//  webcam resolution so landmarks map 1:1 (calibration fix),
//  and fills the hand with thick fingers (no thin slivers).
// ────────────────────────────────────────────────────────
function processWebcam() {
  // (re)create the buffer only if the real resolution changed
  if (!handGraphics || handGraphics.width !== capture.width) {
    if (handGraphics) handGraphics.remove();
    handGraphics = createGraphics(capture.width, capture.height);
  }

  handGraphics.clear();              // cheap — no per-frame allocation
  if (hands.length === 0) return;

  // thickness scales with resolution so the silhouette always fits the hand
  const fingerW  = capture.width * 0.075;
  const jointD   = capture.width * 0.07;

  for (let hand of hands) {
    let kp = hand.landmarks;

    // palm
    handGraphics.noStroke();
    handGraphics.fill(255);
    handGraphics.beginShape();
    for (let i of [0, 1, 5, 9, 13, 17]) {
      handGraphics.vertex(kp[i][0], kp[i][1]);
    }
    handGraphics.endShape(CLOSE);

    // fingers as thick, round-capped strokes (instead of closed slivers)
    handGraphics.noFill();
    handGraphics.stroke(255);
    handGraphics.strokeWeight(fingerW);
    handGraphics.strokeCap(ROUND);
    handGraphics.strokeJoin(ROUND);

    let fingers = [
      [0, 1, 2, 3, 4],   // thumb (anchored at wrist)
      [5, 6, 7, 8],      // index
      [9, 10, 11, 12],   // middle
      [13, 14, 15, 16],  // ring
      [17, 18, 19, 20],  // pinky
    ];
    for (let f of fingers) {
      handGraphics.beginShape();
      for (let i of f) handGraphics.vertex(kp[i][0], kp[i][1]);
      handGraphics.endShape();
    }

    // round every joint to bridge palm↔finger gaps and smooth knuckles
    handGraphics.noStroke();
    handGraphics.fill(255);
    for (let i = 0; i < kp.length; i++) {
      handGraphics.circle(kp[i][0], kp[i][1], jointD);
    }
  }
}

// ────────────────────────────────────────────────────────
//  Darkness — built on its OWN layer, hole punched there,
//  then overlaid. The hole reveals creatures instead of
//  erasing them (lighting fix). Warm glow added on top.
// ────────────────────────────────────────────────────────
function drawDarknessOverlay() {
  let dctx = darkLayer.drawingContext;

  darkLayer.clear();
  dctx.save();

  dctx.fillStyle = 'rgba(45, 42, 48, 0.82)';
  dctx.fillRect(0, 0, width, height);

  dctx.globalCompositeOperation = 'destination-out';
  let hole = dctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, LIGHT_RADIUS);
  hole.addColorStop(0,   'rgba(0,0,0,1)');
  hole.addColorStop(0.6, 'rgba(0,0,0,1)');
  hole.addColorStop(1,   'rgba(0,0,0,0)');
  dctx.fillStyle = hole;
  dctx.fillRect(0, 0, width, height);

  dctx.restore();

  // overlay darkness onto the scene — hole = lit creatures show through
  image(darkLayer, 0, 0);

  // warm amber glow, painted on the main canvas above everything
  let ctx = drawingContext;
  ctx.save();
  let glow = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, LIGHT_RADIUS);
  glow.addColorStop(0,   'rgba(255,220,100,0.15)');
  glow.addColorStop(0.4, 'rgba(255,160,40,0.07)');
  glow.addColorStop(0.7, 'rgba(180,80,10,0.03)');
  glow.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawWebcamPreview() {
  push();
  let previewW = 200;
  let previewH = 150;
  let x = 20;
  let y = height - previewH - 28;

  translate(x + previewW, y);
  scale(-1, 1);

  fill(20, 20, 22);
  noStroke();
  rect(0, 0, previewW, previewH);

  drawingContext.filter = 'invert(1)';
  tint(255, 80);
  image(capture, 0, 0, previewW, previewH);
  drawingContext.filter = 'none';

  tint(255, 255);
  if (handGraphics) image(handGraphics, 0, 0, previewW, previewH);

  pop();

  noFill();
  stroke(255, 60);
  strokeWeight(1);
  rect(20, height - previewH - 28, previewW, previewH);

  fill(255, 60);
  noStroke();
  textSize(9);
  textFont('Courier New');
  text('CAPTURE WINDOW', 20, height - 10);
}

function checkStillness() {
  if (hands.length === 0) {
    stillTimer = 0;
    captureReady = false;
    captureBtn.removeClass('ready');
    instructionEl.html('Show your hand to capture a shadow creature');
    instructionEl.removeClass('active');
    return;
  }

  let wrist = hands[0].landmarks[0];
  if (!prevFrame) {
    prevFrame = { x: wrist[0], y: wrist[1] };
    return;
  }

  let moved = dist(wrist[0], wrist[1], prevFrame.x, prevFrame.y);
  let isStill = moved < 12;

  if (isStill) {
    stillTimer += deltaTime;
  } else {
    stillTimer = max(0, stillTimer - deltaTime * 2);
    if (stillTimer === 0) {
      captureReady = false;
      captureBtn.removeClass('ready');
      instructionEl.removeClass('active');
    }
  }

  prevFrame = { x: wrist[0], y: wrist[1] };

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
      instructionEl.html('Show your hand to capture a shadow creature');
      instructionEl.removeClass('active');
    }
  }
}

function captureCreature() {
  if (!captureReady || !handGraphics) return;

  let snapshot = handGraphics.get();
  let spawnX = random(width  * 0.2, width  * 0.8);
  let spawnY = random(height * 0.2, height * 0.8);
  creatures.push(new Creature(snapshot, spawnX, spawnY));

  captureReady = false;
  stillTimer   = 0;
  captureBtn.removeClass('ready');
  instructionEl.html('Shadow released into the wild…');

  setTimeout(() => {
    instructionEl.html('Show your hand to capture a shadow creature');
    instructionEl.removeClass('active');
  }, 2000);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  darkLayer = createGraphics(width, height);   // keep darkness layer in sync
}

class Creature {
  constructor(img, x, y) {
    this.img     = img;
    this.x       = x;
    this.y       = y;
    this.vx      = random(-0.3, 0.3);
    this.vy      = random(-0.3, 0.3);
    this.w       = 240;
    this.h       = 180;

    this.state         = 'idle';
    this.opacity       = 0;
    this.targetOpacity = 180;

    this.noiseOffset = random(1000);

    this.fleeTargetX = x;
    this.fleeTargetY = y;

    this.stateTimer = 0;
  }

  update() {
    this.stateTimer += deltaTime;

    let d = dist(lightX, lightY, this.x, this.y);

    if (d < FLEE_RADIUS) {
      if (this.state !== 'fleeing') {
        this.state = 'fleeing';
        this.stateTimer = 0;
        this.chooseFleeDest();
      }
    } else if (d < VISIBLE_RADIUS) {
      if (this.state !== 'illuminated' && this.state !== 'fleeing') {
        this.state = 'illuminated';
        this.stateTimer = 0;
      }
    } else {
      if (this.state === 'fleeing' && this.stateTimer > 1200) {
        this.state = 'hidden';
        this.stateTimer = 0;
      } else if (this.state === 'illuminated') {
        this.state = 'idle';
      } else if (this.state === 'hidden' && this.stateTimer > 1500) {
        this.state = 'idle';
        this.stateTimer = 0;
      }
    }

    switch (this.state) {
      case 'idle':
        let n = noise(this.x * 0.002 + this.noiseOffset,
                      this.y * 0.002,
                      frameCount * 0.0008);
        let angle = n * TWO_PI * 2;
        this.vx = lerp(this.vx, cos(angle) * 0.4, 0.02);
        this.vy = lerp(this.vy, sin(angle) * 0.4, 0.02);
        this.targetOpacity = 180;
        break;

      case 'illuminated':
        this.vx = lerp(this.vx, random(-0.15, 0.15), 0.1);
        this.vy = lerp(this.vy, random(-0.15, 0.15), 0.1);
        this.targetOpacity = 200;
        break;

      case 'fleeing':
        let fx  = this.fleeTargetX - this.x;
        let fy  = this.fleeTargetY - this.y;
        let mag = sqrt(fx * fx + fy * fy);
        if (mag > 1) {
          this.vx = lerp(this.vx, (fx / mag) * 4.5, 0.12);
          this.vy = lerp(this.vy, (fy / mag) * 4.5, 0.12);
        }
        this.targetOpacity = this.stateTimer < 400 ? 220 : 160;
        break;

      case 'hidden':
        this.vx = lerp(this.vx, 0, 0.05);
        this.vy = lerp(this.vy, 0, 0.05);
        this.targetOpacity = 120;
        break;
    }

    this.x += this.vx;
    this.y += this.vy;

    let margin = 120;
    if (this.x < margin)         this.vx += 0.4;
    if (this.x > width - margin) this.vx -= 0.4;
    if (this.y < margin)         this.vy += 0.4;
    if (this.y > height - margin) this.vy -= 0.4;

    this.opacity = lerp(this.opacity, this.targetOpacity, 0.04);
  }

  chooseFleeDest() {
    let edges = [
      { x: random(width  * 0.05, width  * 0.2),  y: this.y },
      { x: random(width  * 0.8,  width  * 0.95), y: this.y },
      { x: this.x, y: random(height * 0.05, height * 0.2)  },
      { x: this.x, y: random(height * 0.8,  height * 0.95) },
    ];

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

    drawingContext.globalCompositeOperation = 'multiply';

    let d = dist(lightX, lightY, this.x, this.y);
    let litAmount = d < VISIBLE_RADIUS ? map(d, 0, VISIBLE_RADIUS, 1, 0) : 0;
    let brightness = lerp(60, 120, litAmount);
    tint(brightness, brightness, brightness, this.opacity);

    image(this.img, 0, 0, this.w, this.h);

    drawingContext.globalCompositeOperation = 'source-over';
    pop();
  }
}