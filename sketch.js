// ════════════════════════════════════════════════════════
//  SHADOW SAFARI — sketch.js
//  two-hand memory · darkening-capture preview · living creatures
// ════════════════════════════════════════════════════════

let capture;

let handGraphics;   // live white silhouette (preview), sized to webcam resolution
let darkLayer;      // offscreen darkness layer for the torch hole
let creatureBuffer; // shared scratch buffer to flatten each animated creature

let prevFrame;
let stillTimer    = 0;
const STILL_NEEDED = 4000;   // ms of stillness before auto-capture
let armed         = true;

let instructionEl;
let captureBtn;

let creatures = [];

let handpose;
let handMemory = {};            // remembered hands keyed by handedness
const HAND_MEMORY_MS = 250;     // how long a dropped hand lingers
let activeHands = [];           // fresh + recently-remembered hands, this frame

let lightX, lightY;
const LIGHT_RADIUS   = 160;
const FLEE_RADIUS    = 120;
const VISIBLE_RADIUS = 250;

const TORCH_EASE   = 0.2;
const TARGET_SIZE  = 200;   // on-canvas size a captured hand is scaled to
const BUF          = 340;   // creatureBuffer dimensions

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
  captureBtn.mousePressed(captureCreature);

  pixelDensity(1);

  lightX = width  / 2;
  lightY = height / 2;

  // ml5 1.x — two hands. Try runtime: "tfjs" if touching hands still merge.
  handpose = ml5.handPose({ maxHands: 2, flipped: false }, () => {
    console.log('HandPose ready');
    handpose.detectStart(capture, gotHands);
  });
}

function gotHands(results) {
  let now = millis();
  let used = {};
  for (let i = 0; i < results.length; i++) {
    let h = results[i];
    let key = h.handedness || ('h' + i);
    if (used[key]) key += i;          // don't collapse two same-labelled hands
    used[key] = true;
    handMemory[key] = { keypoints: h.keypoints, t: now };
  }
}

// fresh + recently-seen hands, with stale entries pruned and duplicates removed
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

function draw() {
  background(45, 42, 48);

  lightX = lerp(lightX, mouseX, TORCH_EASE);
  lightY = lerp(lightY, mouseY, TORCH_EASE);

  if (capture.loadedmetadata) {
    activeHands = getActiveHands();
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

// live silhouette for the preview, built from every active hand
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

// plain mirrored webcam + a dark capture-shadow that deepens with stillness
function drawWebcamPreview() {
  let previewW = 200;
  let previewH = 150;
  let x = 20;
  let y = height - previewH - 28;

  push();
  translate(x + previewW, y);
  scale(-1, 1);
  image(capture, 0, 0, previewW, previewH);

  // capture darkens onto the hands as you hold still
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
  text('CAPTURE WINDOW', x, height - 10);
}

function checkStillness() {
  if (activeHands.length === 0) {
    stillTimer = 0;
    prevFrame  = null;
    armed      = true;
    instructionEl.html('Show your hand(s) to capture a shadow creature');
    instructionEl.removeClass('active');
    return;
  }

  let cx = 0, cy = 0;
  for (let h of activeHands) { cx += h.keypoints[0].x; cy += h.keypoints[0].y; }
  cx /= activeHands.length;
  cy /= activeHands.length;

  if (!prevFrame) { prevFrame = { x: cx, y: cy }; return; }

  let moved   = dist(cx, cy, prevFrame.x, prevFrame.y);
  let isStill = moved < 12;

  if (isStill) {
    stillTimer += deltaTime;
  } else {
    stillTimer = max(0, stillTimer - deltaTime * 2);
    armed = true;
  }
  prevFrame = { x: cx, y: cy };

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

// capture now stores JOINTS (not a bitmap) so the creature can be re-posed
function captureCreature() {
  if (activeHands.length === 0) return;

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

  let spawnX = random(width  * 0.2, width  * 0.8);
  let spawnY = random(height * 0.2, height * 0.8);
  creatures.push(new Creature(localHands, fingerW, spawnX, spawnY));

  armed      = false;
  stillTimer = 0;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  darkLayer = createGraphics(width, height);
}

class Creature {
  constructor(handsLocal, fingerW, x, y) {
    this.hands   = handsLocal;   // arrays of 21 {x,y} in centered creature-space
    this.fingerW = fingerW;

    this.x  = x;
    this.y  = y;
    this.vx = random(-0.3, 0.3);
    this.vy = random(-0.3, 0.3);

    this.state         = 'idle';
    this.opacity       = 0;
    this.targetOpacity = 180;

    this.noiseOffset = random(1000);
    this.phase       = random(TWO_PI);   // unique animation phase

    this.fleeTargetX = x;
    this.fleeTargetY = y;
    this.stateTimer  = 0;
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
        let nz = noise(this.x * 0.002 + this.noiseOffset,
                       this.y * 0.002,
                       frameCount * 0.0008);
        let angle = nz * TWO_PI * 2;
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
    if (this.x < margin)          this.vx += 0.4;
    if (this.x > width - margin)  this.vx -= 0.4;
    if (this.y < margin)          this.vy += 0.4;
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
      let dd = dist(this.x, this.y, e.x, e.y);
      if (dd < nearDist) { nearDist = dd; nearest = e; }
    }
    this.fleeTargetX = nearest.x;
    this.fleeTargetY = nearest.y;
  }

  // re-pose fingers as kinematic chains: base fixed, sway grows toward the tip
  animatedHand(hand, t, wig, spd) {
    let out = hand.map(p => ({ x: p.x, y: p.y }));
    const fingers = [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
    for (let fi = 0; fi < fingers.length; fi++) {
      let chain = fingers[fi];
      for (let j = 1; j < chain.length; j++) {
        let cur = chain[j], prev = chain[j - 1];
        let segX = hand[cur].x - hand[prev].x;
        let segY = hand[cur].y - hand[prev].y;
        let ang  = wig * j * sin(t * spd + this.phase + fi * 1.1 + j * 0.6);
        let ca = cos(ang), sa = sin(ang);
        out[cur].x = out[prev].x + (segX * ca - segY * sa);
        out[cur].y = out[prev].y + (segX * sa + segY * ca);
      }
    }
    return out;
  }

  drawSilhouette(g, pts) {
    // rounded palm body
    g.noStroke();
    g.fill(255);
    let mcx = (pts[0].x + pts[9].x) / 2;
    let mcy = (pts[0].y + pts[9].y) / 2;
    let pwid = dist(pts[5].x, pts[5].y, pts[17].x, pts[17].y);
    g.ellipse(mcx, mcy, pwid * 1.15, pwid * 1.25);

    // palm polygon
    g.beginShape();
    for (let i of [0, 1, 5, 9, 13, 17]) g.vertex(pts[i].x, pts[i].y);
    g.endShape(CLOSE);

    // fingers as thick limbs
    g.noFill();
    g.stroke(255);
    g.strokeWeight(this.fingerW);
    g.strokeCap(ROUND);
    g.strokeJoin(ROUND);
    const fingers = [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
    for (let f of fingers) {
      g.beginShape();
      for (let i of f) g.vertex(pts[i].x, pts[i].y);
      g.endShape();
    }
  }

  draw() {
    let t = millis() * 0.001;

    // sway amplitude + speed react to state → liveliness
    let wig = 0.08, spd = 2.2;
    if (this.state === 'fleeing')          { wig = 0.16; spd = 6.0; }
    else if (this.state === 'illuminated') { wig = 0.11; spd = 3.2; }
    else if (this.state === 'hidden')      { wig = 0.05; spd = 1.4; }

    // flatten the animated silhouette into the shared buffer
    creatureBuffer.clear();
    creatureBuffer.push();
    creatureBuffer.translate(BUF / 2, BUF / 2);
    creatureBuffer.scale(1 + 0.03 * sin(t * 1.3 + this.phase));   // breathing
    creatureBuffer.rotate(0.05 * sin(t * 0.8 + this.phase));      // body wobble
    for (let hand of this.hands) {
      this.drawSilhouette(creatureBuffer, this.animatedHand(hand, t, wig, spd));
    }
    creatureBuffer.pop();

    // blit as a dark, torch-brightened silhouette
    push();
    translate(this.x, this.y);
    imageMode(CENTER);
    drawingContext.globalCompositeOperation = 'multiply';

    let d = dist(lightX, lightY, this.x, this.y);
    let litAmount = d < VISIBLE_RADIUS ? map(d, 0, VISIBLE_RADIUS, 1, 0) : 0;
    let brightness = lerp(60, 120, litAmount);
    tint(brightness, brightness, brightness, this.opacity);

    image(creatureBuffer, 0, 0);

    drawingContext.globalCompositeOperation = 'source-over';
    pop();
  }
}