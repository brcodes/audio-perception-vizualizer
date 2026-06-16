---
description: "Use when editing, extending, or debugging audio-perception-visualizer (app.js, styles.css, index.html). Defines one explicit visualizer-purpose requirement plus supporting code quality, performance, and security rules for this Web Audio API app."
applyTo: "*.js,*.css,*.html"
---

# Audio Perception Visualizer — Coding Instructions

## 1. Visualizer Purpose/Design Requirement (Only Explicit Requirement)

The only explicit requirement regarding actual visualizer purpose/design is:

**Make a visualizer that faithfully mimics/mathematically analogizes, as closely as possible, the sounds that people hear in a mix when hearing it from directly in front of them, for the engineering purposes of mixing/producing. "Cool" visualization is not as important as replicating heard audio.**

Use this as the decision rule for all visual mapping choices.

---

## 2. Audio Engineering Guidance

- Prefer logarithmic frequency treatment (20 Hz to 20 kHz) for pitch-related analysis unless another approach better serves Section 1.
- Keep FFT and smoothing choices high enough to preserve meaningful mix detail for engineering decisions.
- Preserve true stereo analysis (separate L/R channels) so localization cues are represented accurately.
- Use `AudioContext` only on explicit user gesture (file load or play).
- Revoke `objectUrl` with `URL.revokeObjectURL()` before assigning a new one to avoid memory leaks.

---

## 3. Code Organization & Style

### Module structure (single-file, annotated)
The app is intentionally a single-module static file (`app.js` with `type="module"`). Organize code in this order:
1. **DOM references** — all `getElementById`/`querySelector` calls at top.
2. **Constants** — `DIVISION_EPSILON`, thresholds, `FREQ_COUNT`, `HALF_BIN_RATIO`, MIME set, color stops.
3. **Pure utility functions** — `formatTime`, `interpolateColor`, `computeAlpha`, `hzToIndex`, `getBandEnergy`, `amplitudeToHeightFactor`, `frequencyToWidthFactor`.
4. **Derived data** — `FREQUENCIES`, `BOTTOM_FREQS`, `TOP_FREQS`, `panSmoothed`.
5. **Audio graph setup** — `ensureAudioGraph` (lazy init).
6. **Canvas / draw functions** — `resizeCanvas`, `drawWaveform`, `drawVisualizer`, `animate`.
7. **Playback control** — `startAnimation`, `stopAnimation`, `togglePlayPause`.
8. **Event listeners** — file input, play/pause, seek, sliders, nudge buttons, keyboard, visibility.

### Annotation standard
- Every non-obvious constant or formula gets a single-line comment explaining the _why_ (not the _what_).
- Preserve psychoacoustic rationale comments when they support Section 1 fidelity goals.
- Use JSDoc for exported/public-facing functions only if the project ever splits into modules; not required for single-file closures.

### Naming
- `logT` — log-frequency parameter `[0,1]` over 20 Hz–20 kHz.
- `depth` — drawing-order depth `[0,1]`; 0 = back, 1 = front.
- `energy` — RMS-like scalar `[0,1]` from `getBandEnergy`.
- `panPoint` — integer `[-100, 100]`; negative = left, positive = right.
- `panSmoothed` — smoothed pan state array, length 100, indices match `FREQUENCIES`.

---

## 4. Performance Requirements

- **No per-frame allocations in the hot path** (`animate` → `drawVisualizer` → `drawWaveform`). Reuse typed arrays (`leftData`, `rightData` are `Uint8Array`). Do not create new arrays or objects inside `animate`.
- **Canvas 2D**: use `ctx.save()`/`ctx.restore()` scoped clips. Never reset the entire transform inside a frame.
- **DPR scaling**: `resizeCanvas` multiplies by `window.devicePixelRatio`. Always call `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` after resizing. Draw in CSS pixel coordinates.
- **`requestAnimationFrame` loop**: use a single `rafId` guard. Check `audio.paused` and `isDocumentHidden` before starting. Stop the loop on pause or tab hide.
- **Avoid layout thrash**: read `canvas.clientWidth`/`canvas.clientHeight` at the top of `drawVisualizer` once per frame, not inside the band loop.
- Prefer `quadraticCurveTo` over point-loop waveforms (already implemented). Don't revert to point loops.

---

## 5. Security

- **File validation**: before creating an `objectURL`, verify `file.type` against `MP3_MIME_TYPES` **and** `.mp3` extension. Never load arbitrary binary blobs into the audio element without this check.
- **No `eval`, `innerHTML`, or `document.write`** anywhere. All DOM manipulation via property assignment (`textContent`, `value`, `disabled`).
- **`audio.crossOrigin = 'anonymous'`** is set for CORS compliance. Do not remove it.
- **Object URL lifecycle**: always `URL.revokeObjectURL(objectUrl)` before reassigning. Never expose `objectUrl` beyond the module scope.
- **Input sanitization**: all slider/number-input values read with `parseFloat` and clamped to `[min, max]` before use. Never pass raw user input directly to canvas drawing math.
- **No network requests** from client-side code. This is a fully local/static tool. Do not add fetch calls, CDN script tags, or analytics without explicit approval.
- **CSP-compatible**: no inline event handlers (`onclick=`). All listeners via `addEventListener`.

---

## 6. Extending the Visualization

When adding new visual features:
- Prioritize changes that improve fidelity to Section 1.
- New per-band state (like `panSmoothed`) should be a `Float32Array` of length `FREQ_COUNT` initialized at module load, not allocated per frame.
- New controls go in `.controls` (persistent settings) or `.seekbar` (playback-related); use the existing `makeSliderPair` helper for any new slider+number-input pair.
- Validate behavior against real-world mixes and front-listening expectations.

---

## 7. HTML & CSS Conventions

- Semantic HTML: controls in `<section class="controls">`, seekbar in `<section class="seekbar">`, canvas as `role="img"` with `aria-label`.
- All interactive elements have `aria-label` attributes. Do not add controls without them.
- Visual styling is secondary to Section 1 accuracy.
- `box-sizing: border-box` on `*`. Grid layout on `.app`.
- No external CSS frameworks, no `!important`.
