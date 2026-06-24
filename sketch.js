// ════════════════════════════════════════════════════════
//  SHADOW SAFARI — sketch.js
//  (two hands · hands-free auto-capture · clean preview)
// ════════════════════════════════════════════════════════

let capture;

// Persistent buffers (created ONCE, reused every frame) ──────
let handGraphics;   // white hand silhouette, sized to the real webcam resolution
let darkLayer;      // offscreen darkness layer we punch the torch hole into

let prevFrame;
let stillTimer    = 0;
const STILL_NEEDED = 4000;   // ms of stillness before auto-capture
let armed         = true;    // gates auto-capture; re-arms when hands move

let instructionEl;
let captureBtn;

let creatures = [];

let handpose;
let hands = [];

let lightX, lightY;
const LIGHT_RADIUS   = 160;
const FLEE_RADIUS    = 120;
const VISIBLE_RADIUS = 250;

// How fast the torch chases the cursor. Higher = snappier.
const TORCH_EASE = 0.2;

function setup() {
  let cnv = createCanvas(windowWidth, windowHeight);
  cnv.parent('canvas-container');

  capture = createCapture(VIDEO);
  capture.size(320, 240);
  capture.hide();

  darkLayer = createGraphics(width, height);

  instructionEl = select('#instruction');
  captureBtn    = select('#capture-btn');
  captureBtn.mousePressed(captureCreature);   // optional manual trigger

  pixelDensity(1);

  lightX = width  / 2;
  lightY = height / 2;

  // ml5 1.x: handPose supports up to two hands
  handpose = ml5.handPose({ maxHands: 2, flipped: false }, () => {
    console.log('HandPose ready');
    handpose.detectStart(capture, gotHands);
  });
}

function gotHands(results) {
  hands = results;
}

function draw() {
  background(45, 42, 48);

  lightX = lerp(lightX, mouseX, TORCH_EASE);
  lightY = lerp(lightY, mouseY, TORCH_EASE);

  if (capture.loadedmetadata) {
    processWebcam();
    checkStillness();
  }

  for (let c of creatures) {
    c.update();
    c.draw();
  }

  drawDarknessOverlay();

  if (capture.loadedmetadata) drawWebcamPreview();
}

// ────────────────────────────────────────────────────────
//  Hand silhouette — reuses ONE buffer sized to the real
//  webcam resolution (calibration), loops over EVERY hand
//  (two-hand shapes), thick fingers fill the shape.
// ────────────────────────────────────────────────────────
function processWebcam() {
  if (!handGraphics || handGraphics.width !== capture.width) {
    if (handGraphics) handGraphics.remove();
    handGraphics = createGraphics(capture.width, capture.height);
  }

  handGraphics.clear();
  if (hands.length === 0) return;

  const fingerW = capture.width * 0.075;
  const jointD  = capture.width * 0.07;

  for (let hand of hands) {
    let kp = hand.keypoints;   // ml5 1.x: array of { x, y, name, ... }

    // palm
    handGraphics.noStroke();
    handGraphics.fill(255);
    handGraphics.beginShape();
    for (let i of [0, 1, 5, 9, 13, 17]) {
      handGraphics.vertex(kp[i].x, kp[i].y);
    }
    handGraphics.endShape(CLOSE);

    // fingers as thick, round-capped strokes
    handGraphics.noFill();
    handGraphics.stroke(255);
    handGraphics.strokeWeight(fingerW);
    handGraphics.strokeCap(ROUND);
    handGraphics.strokeJoin(ROUND);

    let fingers = [
      [0, 1, 2, 3, 4],   // thumb
      [5, 6, 7, 8],      // index
      [9, 10, 11, 12],   // middle
      [13, 14, 15, 16],  // ring
      [17, 18, 19, 20],  // pinky
    ];
    for (let f of fingers) {
      handGraphics.beginShape();
      for (let i of f) handGraphics.vertex(kp[i].x, kp[i].y);
      handGraphics.endShape();
    }

    // round every joint to bridge gaps and smooth knuckles
    handGraphics.noStroke();
    handGraphics.fill(255);
    for (let i = 0; i < kp.length; i++) {
      handGraphics.circle(kp[i].x, kp[i].y, jointD);
    }
  }
}

// ────────────────────────────────────────────────────────
//  Darkness on its own layer; hole reveals creatures.
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

  image(darkLayer, 0, 0);

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

// ────────────────────────────────────────────────────────
//  Preview — plain mirrored webcam feed. No filter, no tint,
//  no silhouette overlay.
// ────────────────────────────────────────────────────────
function drawWebcamPreview() {
  let previewW = 200;
  let previewH = 150;
  let x = 20;
  let y = height - previewH - 28;

  push();
  translate(x + previewW, y);
  scale(-1, 1);                       // mirror = normal "selfie" webcam
  image(capture, 0, 0, previewW, previewH);
  pop();

  noFill();
  stroke(255, 60);
  strokeWeight(1);
  rect(x, y, previewW, previewH);

  fill(255, 60);
  noStroke();
  textSize(9);
  textFont('Courier New');
  text('CAPTURE WINDOW', x, height - 10);
}

// ────────────────────────────────────────────────────────
//  Stillness across ALL hands → auto-capture at 100%.
// ────────────────────────────────────────────────────────
function checkStillness() {
  if (hands.length === 0) {
    stillTimer = 0;
    prevFrame  = null;
    armed      = true;
    instructionEl.html('Show your hand(s) to capture a shadow creature');
    instructionEl.removeClass('active');
    return;
  }

  // centroid of every detected wrist
  let cx = 0, cy = 0;
  for (let h of hands) { cx += h.keypoints[0].x; cy += h.keypoints[0].y; }
  cx /= hands.length;
  cy /= hands.length;

  if (!prevFrame) {
    prevFrame = { x: cx, y: cy };
    return;
  }

  let moved   = dist(cx, cy, prevFrame.x, prevFrame.y);
  let isStill = moved < 12;

  if (isStill) {
    stillTimer += deltaTime;
  } else {
    stillTimer = max(0, stillTimer - deltaTime * 2);
    armed = true;                       // movement re-arms the next auto-capture
  }
  prevFrame = { x: cx, y: cy };

  // hands-free trigger
  if (stillTimer >= STILL_NEEDED && armed) {
    captureCreature();
    return;
  }

  // feedback
  let progress = floor((stillTimer / STILL_NEEDED) * 100);
  if (!armed) {
    instructionEl.html('Shadow released — move your hands to make another');
    instructionEl.removeClass('active');
  } else if (progress > 5) {
    instructionEl.html(`Hold still... ${progress}%`);
    instructionEl.addClass('active');
  } else {
    instructionEl.html('Show your hand(s) to capture a shadow creature');
    instructionEl.removeClass('active');
  }
}

function captureCreature() {
  if (!handGraphics || hands.length === 0) return;

  let snapshot = handGraphics.get();
  let spawnX = random(width  * 0.2, width  * 0.8);
  let spawnY = random(height * 0.2, height * 0.8);
  creatures.push(new Creature(snapshot, spawnX, spawnY));

  armed      = false;   // wait for movement before arming again
  stillTimer = 0;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  darkLayer = createGraphics(width, height);
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