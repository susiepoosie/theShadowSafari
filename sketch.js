// ════════════════════════════════════════════════════════
//  SHADOW SAFARI — sketch.js
//  steadier capture · 20-creature cap w/ predation · consume & merge
// ════════════════════════════════════════════════════════

let capture;

let handGraphics;
let darkLayer;
let creatureBuffer;

let prevFrame;
let stillTimer    = 0;
const STILL_NEEDED = 2000;
let armed         = true;

// capture steadiness
const STILL_TOLERANCE = 18;    // px of smoothed movement allowed (was 12)
const STILL_DECAY     = 0.8;   // progress erosion on movement (was 2.0)
const CENTROID_SMOOTH = 0.35;  // low-pass on the wrist centroid
let smoothCentroid = null;

let instructionEl;
let captureBtn;

let creatures = [];
const MAX_CREATURES = 10;
let culling = false;
const CONSUME_MS = 1100;
const MAX_SIZE   = 4.0;
let flashAmount = 0;        // orange screen-flash intensity (0..1), decays each frame

let handpose;
let handMemory = {};
const HAND_MEMORY_MS = 250;
let activeHands = [];

// live screen rect of the centered preview window (read from the DOM slot)
let previewRect = { x: 0, y: 0, w: 200, h: 150 };

let lightX, lightY;
const LIGHT_RADIUS   = 160;
const FLEE_RADIUS    = 120;
const VISIBLE_RADIUS = 250;
const SPOTLIGHT_RADIUS = 95;    // bright core that startles creatures
const STARTLE_MS       = 450;   // squint + tremble duration before fleeing

let cursorMoving    = false;
let lastCursorMoveT = 0;
const CURSOR_MOVE_THRESH  = 1.5;
const CURSOR_MOVE_LINGER  = 180;

const TORCH_EASE   = 0.2;
const TARGET_SIZE  = 200;
const BUF          = 340;

const FIST_EXTENSION = 1.6;
const CURIOUS_CHANCE = 0.15;

const PERSONALITIES = {
  sea: {
    sizeMul: 1.5,
    idleSpeed: 0.25, idleEase: 0.012,
    fleeSpeed: 2.6,  fleeEase: 0.06,
    jolt: 0,         jitter: 0,
    wig: { idle: 0.13, flee: 0.18 }, spd: { idle: 1.6, flee: 3.0 },
    bodyWobble: 0.06, breathe: 0.04, taper: true,
  },
  land: {
    sizeMul: 1.0,
    idleSpeed: 0.5,  idleEase: 0.06,
    fleeSpeed: 4.5,  fleeEase: 0.14,
    jolt: 0.012,     jitter: 0.4,
    wig: { idle: 0.10, flee: 0.16 }, spd: { idle: 3.0, flee: 7.0 },
    bodyWobble: 0.05, breathe: 0.03, taper: false,
  },
  bug: {
    sizeMul: 0.62,
    idleSpeed: 0.9,  idleEase: 0.15,
    fleeSpeed: 6.5,  fleeEase: 0.22,
    jolt: 0.04,      jitter: 1.4,
    wig: { idle: 0.07, flee: 0.12 }, spd: { idle: 7.0, flee: 12.0 },
    bodyWobble: 0.04, breathe: 0.02, taper: false,
  },
};

function setup() {
  let cnv = createCanvas(windowWidth, windowHeight);
  cnv.parent('canvas-container');

  capture = createCapture(VIDEO);
  capture.size(320, 240);
  capture.hide();

  darkLayer      = createGraphics(width, height);
  creatureBuffer = createGraphics(BUF, BUF);

  instructionEl = select('#instruction');
  captureBtn    = select('#capture-btn');
  if (captureBtn) captureBtn.mousePressed(captureCreature);   // guard: button may be absent

  pixelDensity(1);

  lightX = width  / 2;
  lightY = height / 2;

  if (typeof ml5 !== 'undefined' && ml5.handPose) {
    handpose = ml5.handPose({ maxHands: 2, flipped: false }, () => {
      console.log('HandPose ready');
      handpose.detectStart(capture, gotHands);
    });
  } else {
    console.error('ml5 failed to load — check the ml5 <script> tag in index.html');
  }
}

function gotHands(results) {
  let now = millis();
  let used = {};
  for (let i = 0; i < results.length; i++) {
    let h = results[i];
    let key = h.handedness || ('h' + i);
    if (used[key]) key += i;
    used[key] = true;
    handMemory[key] = { keypoints: h.keypoints, t: now };
  }
}

function getActiveHands() {
  let now = millis();
  let out = [];
  for (let key in handMemory) {
    let m = handMemory[key];
    if (now - m.t >= HAND_MEMORY_MS) { delete handMemory[key]; continue; }
    let w = m.keypoints[0];
    let dup = out.some(o => dist(o.keypoints[0].x, o.keypoints[0].y, w.x, w.y) < 30);
    if (!dup) out.push(m);
  }
  return out;
}

function classifyHands(hands) {
  if (hands.length >= 2) return 'sea';
  let kp = hands[0].keypoints;
  let palmLen = dist(kp[0].x, kp[0].y, kp[9].x, kp[9].y) || 1;
  let tips = [8, 12, 16, 20];
  let ext = 0;
  for (let t of tips) ext += dist(kp[t].x, kp[t].y, kp[0].x, kp[0].y) / palmLen;
  ext /= tips.length;
  return ext < FIST_EXTENSION ? 'bug' : 'land';
}

// predation bookkeeping: roles, catch detection, removals, culling flag
function manageCreatures() {
  creatures = creatures.filter(c => !c.removeFlag);

  if (!culling && creatures.length >= MAX_CREATURES) { culling = true; flashAmount = 1.0; }
  if (culling && creatures.length <= 1) culling = false;

  for (let c of creatures) { c.hunt = null; c.predator = null; }

  if (!culling) return;

  instructionEl.html('Population control — the cull has begun');
  instructionEl.removeClass('active');

  // each creature targets the nearest strictly-smaller creature
  for (let c of creatures) {
    if (c.state === 'consuming' || c.state === 'eaten') continue;
    let bestPrey = null, bestD = Infinity, bestThreat = null, bestTD = Infinity;
    for (let o of creatures) {
      if (o === c || o.state === 'eaten' || o.state === 'consuming') continue;
      let dd = dist(c.x, c.y, o.x, o.y);
      if (o.size < c.size - 0.01 && dd < bestD)  { bestD = dd;  bestPrey = o; }
      if (o.size > c.size + 0.01 && dd < bestTD) { bestTD = dd; bestThreat = o; }
    }
    c.hunt = bestPrey;
    c.predator = bestThreat;
  }

  // catch → begin consuming
  for (let c of creatures) {
    if (c.state === 'consuming' || c.state === 'eaten') continue;
    let prey = c.hunt;
    if (prey && prey.state !== 'eaten' && prey.state !== 'consuming') {
      let eatDist = (c.size + prey.size) * 55;
      if (dist(c.x, c.y, prey.x, prey.y) < eatDist) {
        c.state = 'consuming';
        c.prey = prey;
        c.consumeT = 0;
        prey.state = 'eaten';
        prey.eatenBy = c;
        flashAmount = max(flashAmount, 0.45);   // pulse on each kill
      }
    }
  }
}

function draw() {
  background(45, 42, 48);

  lightX = lerp(lightX, mouseX, TORCH_EASE);
  lightY = lerp(lightY, mouseY, TORCH_EASE);

  let cs = dist(mouseX, mouseY, pmouseX, pmouseY);
  if (cs > CURSOR_MOVE_THRESH) lastCursorMoveT = millis();
  cursorMoving = (millis() - lastCursorMoveT) < CURSOR_MOVE_LINGER;

  // track the centered preview slot so the canvas preview & spawns line up
  let slot = document.getElementById('preview-slot');
  if (slot) {
    let r = slot.getBoundingClientRect();
    previewRect = { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  if (capture.loadedmetadata) {
    activeHands = getActiveHands();
    processWebcam();
    checkStillness();
  }

  manageCreatures();

  for (let c of creatures) {
    c.update();
    c.draw();
  }

  drawDarknessOverlay();

  drawFlash();

  if (capture.loadedmetadata) drawWebcamPreview();

  drawHUD();
}

function processWebcam() {
  if (!handGraphics || handGraphics.width !== capture.width) {
    if (handGraphics) handGraphics.remove();
    handGraphics = createGraphics(capture.width, capture.height);
  }

  handGraphics.clear();
  if (activeHands.length === 0) return;

  const fingerW = capture.width * 0.075;
  const jointD  = capture.width * 0.07;

  for (let hand of activeHands) {
    let kp = hand.keypoints;

    handGraphics.noStroke();
    handGraphics.fill(255);
    handGraphics.beginShape();
    for (let i of [0, 1, 5, 9, 13, 17]) handGraphics.vertex(kp[i].x, kp[i].y);
    handGraphics.endShape(CLOSE);

    handGraphics.noFill();
    handGraphics.stroke(255);
    handGraphics.strokeWeight(fingerW);
    handGraphics.strokeCap(ROUND);
    handGraphics.strokeJoin(ROUND);

    let fingers = [[0,1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
    for (let f of fingers) {
      handGraphics.beginShape();
      for (let i of f) handGraphics.vertex(kp[i].x, kp[i].y);
      handGraphics.endShape();
    }

    handGraphics.noStroke();
    handGraphics.fill(255);
    for (let i = 0; i < kp.length; i++) handGraphics.circle(kp[i].x, kp[i].y, jointD);
  }
}

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

function drawWebcamPreview() {
  let x = previewRect.x, y = previewRect.y;
  let previewW = previewRect.w, previewH = previewRect.h;

  push();
  translate(x + previewW, y);
  scale(-1, 1);
  image(capture, 0, 0, previewW, previewH);

  let prog = constrain(stillTimer / STILL_NEEDED, 0, 1);
  if (handGraphics && prog > 0.02) {
    tint(18, 16, 22, prog * 235);
    image(handGraphics, 0, 0, previewW, previewH);
  }
  pop();

  noFill();
  stroke(255, 60);
  strokeWeight(1);
  rect(x, y, previewW, previewH);

  fill(255, 60);
  noStroke();
  textSize(9);
  textFont('Courier New');
  textAlign(CENTER, TOP);
  text('CAPTURE WINDOW', x + previewW / 2, y + previewH + 8);
}

// orange screen flash — punched on cull start and on each kill, fades fast
function drawFlash() {
  if (flashAmount > 0.01) {
    push();
    noStroke();
    fill(255, 130, 30, flashAmount * 150);
    rect(0, 0, width, height);
    pop();
  }
  flashAmount *= 0.90;
  if (flashAmount < 0.01) flashAmount = 0;
}

// top-center: always-on population counter + ecosystem status label
function drawHUD() {
  push();
  textAlign(CENTER, TOP);
  textFont('Courier New');
  noStroke();

  // line 1 — count, always visible
  let f = constrain(creatures.length / MAX_CREATURES, 0, 1);
  textSize(12);
  fill(255, lerp(255, 150, f), lerp(255, 60, f), 210);
  text(`CREATURES  ${creatures.length} / ${MAX_CREATURES}`, width / 2, 16);

  // line 2 — status
  textSize(15);
  let label, col;
  if (culling) {
    let pulse = 0.6 + 0.4 * sin(millis() * 0.006);
    label = 'POPULATION CONTROL';
    col = color(255, 140, 40, 180 * pulse + 50);
  } else {
    let n = creatures.length;
    if (n <= 3) {
      label = 'NICE';
      col = color(120, 210, 140, 215);
    } else if (n <= 7) {
      label = 'OKAY';
      col = color(235, 200, 90, 220);
    } else {
      label = 'UHOH';
      let p = 0.6 + 0.4 * sin(millis() * 0.008);
      col = color(255, 110, 40, 200 * p + 40);
    }
  }
  fill(col);
  text(label, width / 2, 40);
  pop();
}

function checkStillness() {
  if (culling) {
    stillTimer = 0;
    armed = false;
    smoothCentroid = null;
    prevFrame = null;
    return;
  }

  if (activeHands.length === 0) {
    stillTimer = 0;
    prevFrame  = null;
    smoothCentroid = null;
    armed      = true;
    instructionEl.html('Show your hand(s) to capture a shadow creature');
    instructionEl.removeClass('active');
    return;
  }

  let cx = 0, cy = 0;
  for (let h of activeHands) { cx += h.keypoints[0].x; cy += h.keypoints[0].y; }
  cx /= activeHands.length;
  cy /= activeHands.length;

  // low-pass the centroid so tremors don't register as motion
  if (!smoothCentroid) smoothCentroid = { x: cx, y: cy };
  else {
    smoothCentroid.x = lerp(smoothCentroid.x, cx, CENTROID_SMOOTH);
    smoothCentroid.y = lerp(smoothCentroid.y, cy, CENTROID_SMOOTH);
  }

  if (!prevFrame) { prevFrame = { x: smoothCentroid.x, y: smoothCentroid.y }; return; }

  let moved   = dist(smoothCentroid.x, smoothCentroid.y, prevFrame.x, prevFrame.y);
  let isStill = moved < STILL_TOLERANCE;

  if (isStill) {
    stillTimer += deltaTime;
  } else {
    stillTimer = max(0, stillTimer - deltaTime * STILL_DECAY);
    armed = true;
  }
  prevFrame = { x: smoothCentroid.x, y: smoothCentroid.y };

  if (stillTimer >= STILL_NEEDED && armed) {
    captureCreature();
    return;
  }

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
  if (activeHands.length === 0) return;
  if (culling || creatures.length >= MAX_CREATURES) {
    armed = false;
    stillTimer = 0;
    return;
  }

  let type = classifyHands(activeHands);
  let allHands = activeHands.map(h => h.keypoints.map(k => ({ x: k.x, y: k.y })));

  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, sx = 0, sy = 0, n = 0;
  for (let hand of allHands) for (let p of hand) {
    minX = min(minX, p.x); maxX = max(maxX, p.x);
    minY = min(minY, p.y); maxY = max(maxY, p.y);
    sx += p.x; sy += p.y; n++;
  }
  let cx = sx / n, cy = sy / n;
  let scl = constrain(TARGET_SIZE / max(maxX - minX, maxY - minY, 1), 0.5, 4);

  let localHands = allHands.map(hand =>
    hand.map(p => ({ x: (p.x - cx) * scl, y: (p.y - cy) * scl }))
  );

  let palmW   = dist(allHands[0][5].x, allHands[0][5].y,
                     allHands[0][17].x, allHands[0][17].y) * scl;
  let fingerW = constrain(palmW * 0.32, 10, 60);

  // spawn on top of the preview window, then crawl outward into the screen
  let spawnX = previewRect.x + previewRect.w / 2;
  let spawnY = previewRect.y + previewRect.h / 2;
  let creature = new Creature(localHands, fingerW, spawnX, spawnY, type);
  let outAng = random(TWO_PI);
  creature.heading = outAng;
  creature.vx = cos(outAng) * 1.5;
  creature.vy = sin(outAng) * 1.5;
  creatures.push(creature);

  armed      = false;
  stillTimer = 0;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  darkLayer = createGraphics(width, height);
}

class Creature {
  constructor(handsLocal, fingerW, x, y, type) {
    this.hands   = handsLocal;
    this.fingerW = fingerW;
    this.type    = type;
    this.p       = PERSONALITIES[type];

    this.curious = random() < CURIOUS_CHANCE;

    // slight size-jitter guarantees no two creatures are ever exactly equal,
    // so predation always resolves down to a single survivor
    this.size     = this.p.sizeMul * random(0.95, 1.05);
    this.drawSize = this.size;

    this.x  = x;
    this.y  = y;
    this.vx = random(-0.3, 0.3);
    this.vy = random(-0.3, 0.3);

    this.state         = 'idle';
    this.opacity       = 0;
    this.targetOpacity = 180;
    this.limbFast      = false;
    this.eyeOpen       = 1;        // 1 = wide circle, ~0.12 = squint

    this.heading    = random(TWO_PI);
    this.wanderSeed = random(1000);
    this.phase      = random(TWO_PI);

    this.fleeTargetX = x;
    this.fleeTargetY = y;
    this.stateTimer  = 0;

    // predation
    this.hunt = null;
    this.predator = null;
    this.prey = null;
    this.eatenBy = null;
    this.consumeT = 0;
    this.eatenScale = 1;
    this.removeFlag = false;

    this.setupEyes();
  }

  setupEyes() {
    let h = this.hands[0];
    let p0 = h[0], p9 = h[9], p5 = h[5], p17 = h[17];
    let fa = atan2(p9.y - p0.y, p9.x - p0.x);
    let pw = dist(p5.x, p5.y, p17.x, p17.y) || 30;

    this.forwardAngle = fa;
    this.eyeCx    = p9.x + cos(fa) * pw * 0.15;
    this.eyeCy    = p9.y + sin(fa) * pw * 0.15;
    this.eyeSep   = pw * 0.5;
    this.eyeDiam  = pw * 0.26;     // wide-open circle size; squints to a slit
  }

  edgeSteer() {
    let m = 130;
    if (this.x < m || this.x > width - m || this.y < m || this.y > height - m) {
      let toC = atan2(height / 2 - this.y, width / 2 - this.x);
      let diff = atan2(sin(toC - this.heading), cos(toC - this.heading));
      this.heading += diff * 0.08;
    }
  }

  update() {
    let P = this.p;
    this.stateTimer += deltaTime;
    this.limbFast = false;

    // ── consuming: hold prey, wrap, then absorb & grow ──
    if (this.state === 'consuming') {
      this.consumeT += deltaTime;
      this.vx = lerp(this.vx, 0, 0.2);
      this.vy = lerp(this.vy, 0, 0.2);
      this.x += this.vx; this.y += this.vy;
      this.opacity  = lerp(this.opacity, 220, 0.06);
      this.drawSize = lerp(this.drawSize, this.size, 0.1);
      if (this.consumeT >= CONSUME_MS) {
        if (this.prey) {
          this.size = min(MAX_SIZE,
            sqrt(this.size * this.size + this.prey.size * this.prey.size));
          this.prey.removeFlag = true;
          this.prey = null;
        }
        this.state = 'idle';
        this.stateTimer = 0;
      }
      return;
    }

    // ── eaten: pulled into predator, shrink & fade ──
    if (this.state === 'eaten') {
      if (this.eatenBy) {
        this.x = lerp(this.x, this.eatenBy.x, 0.15);
        this.y = lerp(this.y, this.eatenBy.y, 0.15);
      }
      this.eatenScale = lerp(this.eatenScale, 0.08, 0.08);
      this.opacity    = lerp(this.opacity, 0, 0.07);
      this.drawSize   = lerp(this.drawSize, this.size, 0.1);
      return;
    }

    if (culling) {
      // predation movement
      let threat = this.predator;
      let threatened = threat &&
        dist(this.x, this.y, threat.x, threat.y) < threat.drawSize * 130;

      if (threatened) {
        let ax = this.x - threat.x, ay = this.y - threat.y;
        let mg = sqrt(ax * ax + ay * ay) || 1;
        this.vx = lerp(this.vx, (ax / mg) * P.fleeSpeed, 0.12);
        this.vy = lerp(this.vy, (ay / mg) * P.fleeSpeed, 0.12);
        this.targetOpacity = 190;
        this.limbFast = true;
      } else if (this.hunt) {
        let ax = this.hunt.x - this.x, ay = this.hunt.y - this.y;
        let mg = sqrt(ax * ax + ay * ay) || 1;
        let hs = this.hunt.p.fleeSpeed * 1.2 + 0.6;   // always out-pace the prey
        this.vx = lerp(this.vx, (ax / mg) * hs, 0.08);
        this.vy = lerp(this.vy, (ay / mg) * hs, 0.08);
        this.targetOpacity = 205;
        this.limbFast = true;
      } else {
        this.heading += (noise(this.wanderSeed, frameCount * 0.01) - 0.5) * 0.4;
        this.vx = lerp(this.vx, cos(this.heading) * P.idleSpeed, P.idleEase);
        this.vy = lerp(this.vy, sin(this.heading) * P.idleSpeed, P.idleEase);
        this.targetOpacity = 180;
      }
      this.edgeSteer();

    } else {
      // ── normal cursor-driven behavior ──
      let d = dist(lightX, lightY, this.x, this.y);

      // spotlight core startles them: squint + tremble, then flee
      if (d < SPOTLIGHT_RADIUS && this.state !== 'fleeing' && this.state !== 'startled') {
        this.state = 'startled';
        this.stateTimer = 0;
      }

      if (this.state === 'startled') {
        this.vx = lerp(this.vx, 0, 0.3);
        this.vy = lerp(this.vy, 0, 0.3);
        this.targetOpacity = 215;
        if (this.stateTimer > STARTLE_MS) {
          this.state = 'fleeing';
          this.stateTimer = 0;
          this.chooseFleeDest();
        }

      } else {
        if (this.state === 'fleeing' && !cursorMoving && this.stateTimer > 200) {
          this.state = 'idle';
          this.stateTimer = 0;
        }

        if (d < FLEE_RADIUS && cursorMoving) {
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

        if (this.state === 'fleeing') {
          let fx = this.fleeTargetX - this.x;
          let fy = this.fleeTargetY - this.y;
          let mag = sqrt(fx * fx + fy * fy);
          if (mag > 1) {
            this.vx = lerp(this.vx, (fx / mag) * P.fleeSpeed, P.fleeEase);
            this.vy = lerp(this.vy, (fy / mag) * P.fleeSpeed, P.fleeEase);
          }
          this.targetOpacity = this.stateTimer < 400 ? 220 : 160;

        } else if (this.state === 'hidden') {
          this.vx = lerp(this.vx, 0, 0.05);
          this.vy = lerp(this.vy, 0, 0.05);
          this.targetOpacity = 120;

        } else {
          if (this.curious) {
            let ax = lightX - this.x, ay = lightY - this.y;
            let mg = sqrt(ax * ax + ay * ay);
            if (mg > 40) {
              this.vx = lerp(this.vx, (ax / mg) * P.idleSpeed * 1.1, P.idleEase * 1.6);
              this.vy = lerp(this.vy, (ay / mg) * P.idleSpeed * 1.1, P.idleEase * 1.6);
            } else {
              this.vx = lerp(this.vx, 0, 0.08);
              this.vy = lerp(this.vy, 0, 0.08);
            }
          } else {
            this.heading += (noise(this.wanderSeed, frameCount * 0.01) - 0.5) * 0.4;
            this.vx = lerp(this.vx, cos(this.heading) * P.idleSpeed, P.idleEase);
            this.vy = lerp(this.vy, sin(this.heading) * P.idleSpeed, P.idleEase);
          }
          this.edgeSteer();
          this.targetOpacity = (this.state === 'illuminated') ? 200 : 180;
        }

        if (this.state !== 'fleeing' && P.jolt > 0 && random() < P.jolt) {
          let a = random(TWO_PI);
          let kick = P.idleSpeed * random(5, 11);
          this.vx += cos(a) * kick;
          this.vy += sin(a) * kick;
        }
      }
    }

    // ── common integration ──
    this.x += this.vx;
    this.y += this.vy;

    let hard = 40;
    this.x = constrain(this.x, hard, width  - hard);
    this.y = constrain(this.y, hard, height - hard);

    this.opacity  = lerp(this.opacity, this.targetOpacity, 0.04);
    this.drawSize = lerp(this.drawSize, this.size, 0.08);

    let eyeTarget = 1;                                  // wide circle by default
    if (this.state === 'startled')      eyeTarget = 0.12;   // squint in the spotlight
    else if (this.state === 'fleeing')  eyeTarget = 0.45;   // half-shut while running
    this.eyeOpen = lerp(this.eyeOpen, eyeTarget, 0.25);
  }

  chooseFleeDest() {
    // sample a grid of open points and pick the one furthest from the mouse
    let best = null, bestD = -1;
    let cols = 4, rows = 3, mx = 80;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        let px = map(i, 0, cols - 1, mx, width  - mx);
        let py = map(j, 0, rows - 1, mx, height - mx);
        let dd = dist(px, py, mouseX, mouseY);
        if (dd > bestD) { bestD = dd; best = { x: px, y: py }; }
      }
    }
    // jitter so creatures don't all stack on the exact same cell
    this.fleeTargetX = best.x + random(-60, 60);
    this.fleeTargetY = best.y + random(-60, 60);
  }

  // wrap: 0..1 curls fingers inward to grasp prey during consumption
  animatedHand(hand, t, wig, spd, wrap) {
    let out = hand.map(p => ({ x: p.x, y: p.y }));
    const fingers = [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
    for (let fi = 0; fi < fingers.length; fi++) {
      let chain = fingers[fi];
      for (let j = 1; j < chain.length; j++) {
        let cur = chain[j], prev = chain[j - 1];
        let segX = hand[cur].x - hand[prev].x;
        let segY = hand[cur].y - hand[prev].y;
        let ang  = wig * j * sin(t * spd + this.phase + fi * 1.1 + j * 0.6)
                 + wrap * 0.6 * j;                       // inward grasp curl
        let ca = cos(ang), sa = sin(ang);
        out[cur].x = out[prev].x + (segX * ca - segY * sa);
        out[cur].y = out[prev].y + (segX * sa + segY * ca);
      }
    }
    return out;
  }

  drawFinger(g, pts, chain) {
    if (this.p.taper) {
      let n = chain.length;
      g.noStroke();
      for (let j = 1; j < n; j++) {
        let a = pts[chain[j - 1]], b = pts[chain[j]];
        let wA = lerp(this.fingerW, this.fingerW * 0.18, (j - 1) / (n - 1));
        let wB = lerp(this.fingerW, this.fingerW * 0.18,  j      / (n - 1));
        g.stroke(255);
        g.strokeWeight((wA + wB) / 2);
        g.line(a.x, a.y, b.x, b.y);
        g.noStroke();
        g.fill(255);
        g.circle(b.x, b.y, wB);
      }
    } else {
      g.noFill();
      g.stroke(255);
      g.strokeWeight(this.fingerW);
      g.beginShape();
      for (let i of chain) g.vertex(pts[i].x, pts[i].y);
      g.endShape();
    }
  }

  drawSilhouette(g, pts) {
    g.strokeCap(ROUND);
    g.strokeJoin(ROUND);

    g.noStroke();
    g.fill(255);
    let mcx = (pts[0].x + pts[9].x) / 2;
    let mcy = (pts[0].y + pts[9].y) / 2;
    let pwid = dist(pts[5].x, pts[5].y, pts[17].x, pts[17].y);
    g.ellipse(mcx, mcy, pwid * 1.15, pwid * 1.25);

    g.beginShape();
    for (let i of [0, 1, 5, 9, 13, 17]) g.vertex(pts[i].x, pts[i].y);
    g.endShape(CLOSE);

    const fingers = [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
    for (let f of fingers) this.drawFinger(g, pts, f);
  }

  drawEyes() {
    let h = this.eyeDiam * max(0.10, this.eyeOpen);   // flatten to squint
    push();
    translate(this.eyeCx, this.eyeCy);
    rotate(this.forwardAngle);
    noStroke();
    fill(238, 232, 242, this.opacity);
    ellipse(0, -this.eyeSep / 2, this.eyeDiam, h);
    ellipse(0,  this.eyeSep / 2, this.eyeDiam, h);
    pop();
  }

  draw() {
    let t = millis() * 0.001;
    let P = this.p;

    let wrap = (this.state === 'consuming')
      ? constrain(this.consumeT / CONSUME_MS, 0, 1) : 0;

    let wig = P.wig.idle, spd = P.spd.idle;
    if (this.state === 'fleeing' || this.limbFast) { wig = P.wig.flee; spd = P.spd.flee; }
    else if (this.state === 'hidden')              { wig *= 0.6;       spd *= 0.7; }

    creatureBuffer.clear();
    creatureBuffer.push();
    creatureBuffer.translate(BUF / 2, BUF / 2);
    for (let hand of this.hands) {
      this.drawSilhouette(creatureBuffer, this.animatedHand(hand, t, wig, spd, wrap));
    }
    creatureBuffer.pop();

    let jx = P.jitter ? random(-P.jitter, P.jitter) : 0;
    let jy = P.jitter ? random(-P.jitter, P.jitter) : 0;
    let breath = 1 + P.breathe * sin(t * 1.3 + this.phase);
    let wob    = P.bodyWobble * sin(t * 0.8 + this.phase);
    let escale = (this.state === 'eaten') ? this.eatenScale : 1;

    // body trembles while caught in the spotlight
    if (this.state === 'startled') {
      let tr = 4 * this.drawSize;
      jx += random(-tr, tr);
      jy += random(-tr, tr);
      wob += random(-0.06, 0.06);
    }

    push();
    translate(this.x + jx, this.y + jy);
    scale(this.drawSize * escale);
    scale(breath);
    rotate(wob);

    imageMode(CENTER);
    drawingContext.globalCompositeOperation = 'multiply';
    let d = dist(lightX, lightY, this.x, this.y);
    let litAmount = d < VISIBLE_RADIUS ? map(d, 0, VISIBLE_RADIUS, 1, 0) : 0;
    let brightness = lerp(60, 120, litAmount);
    tint(brightness, brightness, brightness, this.opacity);
    image(creatureBuffer, 0, 0);

    drawingContext.globalCompositeOperation = 'source-over';
    noTint();
    this.drawEyes();

    pop();
  }
}