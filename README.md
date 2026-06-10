# theShadowSafari
Enter the realm where shadows are no longer a part of our world, we're undercover visitors to theirs.
> *Shadows are wild animals. They cannot be caught — physics makes it impossible. They are ephemeral beings that exist in a parallel world we have no access to. This project tries to make it possible.*

**Shadow Safari** is an interactive browser-based artwork built with p5.js, JavaScript, HTML and CSS. Using only a webcam, visitors can capture their own shadow creature and release it into a shared ecosystem — a dark, living world populated by the silhouettes of everyone who came before them.

---

## Experience

1. **Position yourself** in front of your webcam
2. **Hold a pose** — arms out, hands raised, any shape you like
3. **Hold still** for a few seconds until your shadow creature is detected
4. Press **CAPTURE** to release it into the shadow world
5. **Move your cursor** across the screen to cast a flashlight — creatures will scatter from the light
6. **Shine a phone torch** at your screen — the sudden brightness triggers a panic, sending all creatures fleeing toward the darkness at the edges

Creatures only exist for the duration of the session. Refreshing the page empties the world. Every visit starts from nothing.

---

## Concept

The piece explores the idea of shadows as autonomous beings — entities that exist just outside our reach, defined entirely by the physics of light. In the real world, a shadow cannot be held. It has no substance. It disappears the moment you try to isolate it.

This project inverts that logic. Here, you *can* capture a shadow. But the act of capturing it changes it — it becomes something else, something that moves and drifts and responds to the world around it. And crucially, it still fears the light.

The interaction with light is the emotional core of the piece. The cursor flashlight and phone torch mechanic reframe illumination as a *threat* rather than a comfort — reversing the usual relationship between light, visibility, and safety.

---

## Tools & Techniques

| Tool | Role |
|------|------|
| [p5.js](https://p5js.org) | Canvas rendering, webcam input, animation loop |
| [ml5.js](https://ml5js.org) | BodySegmentation + HandPose experimentation |
| TensorFlow.js | Underlying ML engine (via ml5.js) |
| HTML / CSS | Interface and layout |
| GitHub Pages | Hosting and exhibition deployment |

### Technical approaches explored

- **Pixel thresholding** — raw brightness comparison to extract silhouettes from webcam feed
- **Frame differencing** — comparing sequential frames to detect stillness
- **Perlin noise** — organic, non-repeating movement for creature drift
- **Brightness spike detection** — averaging webcam pixel luminance to detect sudden light (phone torch)
- **ml5.js BodySegmentation** — neural-network body isolation as an alternative capture method
- **ml5.js HandPose** — skeletal hand landmark tracking for procedural creature generation

---

## Project Structure

```
shadow-safari/
├── index.html       # Entry point
├── style.css        # Layout and UI styling
├── sketch.js        # Main p5.js sketch — all core logic
└── README.md
```

---

## Running Locally

Webcam access requires a secure context. Do not open `index.html` directly in a browser.

Instead, use [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) in VS Code:

1. Install the Live Server extension
2. Right-click `index.html` → **Open with Live Server**
3. Allow camera access when prompted

---

## Development Phases

- [x] Phase 1 — Webcam input, threshold silhouette, stillness detection, basic creature release
- [ ] Phase 2 — Creature behaviour states (idle / illuminated / fleeing / hidden)
- [ ] Phase 3 — Cursor flashlight and darkness overlay
- [ ] Phase 4 — Webcam brightness spike detection (torch event)
- [ ] Phase 5 — ml5.js BodySegmentation + HandPose experimentation
- [ ] Phase 6 — Landscape, atmosphere, sound, polish

---

## Live Exhibition

[shadow-safari on GitHub Pages →](https://YOUR-USERNAME.github.io/shadow-safari)

---

*Created as part of an interactive media project brief exploring ephemeral digital entities, computer vision, and the poetics of light.*
