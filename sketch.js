let handpose;
let hands = [];
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
let lightX, lightY;
const LIGHT_RADIUS   = 160;
const FLEE_RADIUS    = 120;
const VISIBLE_RADIUS = 250;

// ── Setup ──────────────────────────────────────────────
function setup() {
  let cnv = createCanvas(windowWidth, windowHeight);
  cnv.parent('canvas-container');

  capture = createCapture(VIDEO);
  capture.size(320, 240);
  capture.hide();

  handpose = ml5.handpose(capture, () => {
    console.log('HandPose ready');
  });
  handpose.on('predict', results => {
    hands = results;
  });

  thresholdImg = createImage(320, 240);

  instructionEl = select('#instruction');
  captureBtn    = select('#capture-btn');
  captureBtn.mousePressed(captureCreature);

  pixelDensity(1);

  lightX = width  / 2;
  lightY = height / 2;
}

// ── Main draw loop ─────────────────────────────────────
function draw() {
  background(45, 42, 48);

  lightX = lerp(lightX, mouseX, 0.12);
  lightY = lerp(lightY, mouseY, 0.12);

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

// ── Webcam processing ──────────────────────────────────
function processWebcam() {
  thresholdImg.loadPixels();

  // Clear to transparent
  for (let i = 0; i < thresholdImg.pixels.length; i += 4) {
    thresholdImg.pixels[i]     = 0;
    thresholdImg.pixels[i + 1] = 0;
    thresholdImg.pixels[i + 2] = 0;
    thresholdImg.pixels[i + 3] = 0;
  }
  thresholdImg.updatePixels();

  if (hands.length === 0) return;

  // Draw filled hand silhouette onto thresholdImg using a graphics buffer
  let g = createGraphics(320, 240);
  g.noStroke();
  g.fill(255);

  for (let hand of hands) {
    let kp = hand.landmarks;

    // Draw filled palm
    g.beginShape();
    // Wrist and base knuckles form the palm outline
    let palmPoints = [0, 1, 5, 9, 13, 17];
    for (let i of palmPoints) {
      g.vertex(kp[i][0], kp[i][1]);
    }
    g.endShape(CLOSE);

    // Draw each finger as a filled shape
    let fingers = [
      [1, 2, 3, 4],       // thumb
      [5, 6, 7, 8],       // index
      [9, 10, 11, 12],    // middle
      [13, 14, 15, 16],   // ring
      [17, 18, 19, 20],   // pinky
    ];

    for (let finger of fingers) {
      g.beginShape();
      for (let i of finger) {
        g.vertex(kp[i][0], kp[i][1]);
      }
      g.endShape(CLOSE);
    }
  }

  // Copy graphics buffer into thresholdImg
  let gImg = g.get();
  gImg.loadPixels();
  thresholdImg.loadPixels();
  for (let i = 0; i < thresholdImg.pixels.length; i += 4) {
    thresholdImg.pixels[i]     = 255;
    thresholdImg.pixels[i + 1] = 255;
    thresholdImg.pixels[i + 2] = 255;
    thresholdImg.pixels[i + 3] = gImg.pixels[i + 3] > 0 ? 220 : 0;
  }
  thresholdImg.updatePixels();
  g.remove();
}

// ── Darkness overlay with flashlight cut-out ───────────
function drawDarknessOverlay() {
  let ctx = drawingContext;

  ctx.save();

  ctx.fillStyle = 'rgba(45, 42, 48, 0.82)';
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = 'destination-out';
  let hole = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, LIGHT_RADIUS);
  hole.addColorStop(0,    'rgba(0,0,0,1)');
  hole.addColorStop(0.5,  'rgba(0,0,0,1)');
  hole.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = hole;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = 'source-over';

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

  drawingContext.filter = 'invert(1)';
  tint(255, 30);
  image(capture, 0, 0, previewW, previewH);
  drawingContext.filter = 'none';
  image(capture, 0, 0, previewW, previewH);
  tint(255, 160);
  image(thresholdImg, 0, 0, previewW, previewH);
  pop();

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
  if (hands.length === 0) {
    stillTimer = 0;
    captureReady = false;
    captureBtn.removeClass('ready');
    instructionEl.html('Show your hand to capture a shadow creature');
    instructionEl.removeClass('active');
    return;
  }

  // Use wrist position (landmark 0) to check for stillness
  let wrist = hands[0].landmarks[0];
  if (!prevFrame) {
    prevFrame = { x: wrist[0], y: wrist[1] };
    return;
  }

  let moved = dist(wrist[0], wrist[1], prevFrame.x, prevFrame.y);
  let isStill = moved < 4;

  if (isStill) {
    stillTimer += deltaTime;
  } else {
    stillTimer = 0;
    captureReady = false;
    captureBtn.removeClass('ready');
    instructionEl.removeClass('active');
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

// ── Capture ────────────────────────────────────────────
function captureCreature() {
  if (!captureReady) return;

  let snapshot = thresholdImg.get();
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
        let n  = noise(this.x * 0.002 + this.noiseOffset,
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