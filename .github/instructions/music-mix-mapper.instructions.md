---
description: "Use when editing, extending, or debugging music-mix-mapper (app.js, styles.css, index.html). Covers the circular visualization mapping model, audio engineering conventions, code organization standards, performance requirements, and security rules for this Web Audio API app."
applyTo: "*.js,*.css,*.html"
---

# Music Mix Mapper — Coding Instructions

## 1. Visualization Mapping Model (Non-Negotiable)

These mappings define the _semantic contract_ of the tool. Never break them.

### Axes
| Visual dimension | Audio property | Implementation note |
|---|---|---|
| **L ↔ R (horizontal)** | Stereo **pan** | Derived from absolute L–R energy difference (`(R-L)/scale`), **not** relative ratio `(R-L)/(R+L)`. Adding equal energy to both channels must not shift pan. |
| **Horizontal width** | **Waveform width**, pitch-correlated | `frequencyToWidthFactor(logT)`: wider at low frequencies (0.08 @ 20 Hz), narrower at high (0.04 @ 20 kHz). Low-freq content appears blobby; high-freq content appears spiky. Width gets a slight level boost. |
| **Top ↔ Bottom (vertical)** | **Amplitude** (amp-correlated) | Waveforms grow outward from the horizontal equator. Taller = louder. `amplitudeToHeightFactor(energy)` — piecewise: typical energy (~0.45) maps to ~70% of radius; peaks reach ~97%. |
| **Top vs. Bottom half** | **Pitch gate** | Bottom semicircle = sub-bass through ~632 Hz (indices 0–49, 20 Hz–632 Hz). Top semicircle = ~655 Hz through 20 kHz (indices 50–99). The split is at the log-geometric midpoint of 20 Hz–20 kHz. |
| **Color (hue)** | **Pitch-correlated** | `interpolateColor(logT)` — `COLOR_STOPS` are anchored to log-frequency `t ∈ [0,1]`. Reds/sub-bass at the bottom; violets/air at the top. Never remap colors to anything other than log-frequency position. |

### Z-order / depth (opacity cue)
- Bands are drawn back-to-front within each semicircle so the frequency band closest to the equator is painted last (most prominent).
- `computeAlpha(depth)` controls per-band opacity. `depth=0` → back; `depth=1` → front. Preserve this convention in any new rendering code.

---

## 2. Audio Engineering Domain Conventions

- **Frequency scale is always logarithmic** (20 Hz–20 kHz, `logT = i/(N-1)`, `hz = 20 * 1000^logT`). Never use linear frequency spacing.
- **FFT size**: `8192` per channel. `smoothingTimeConstant = 0.8`. Do not reduce these without explicit justification — they directly affect frequency resolution and temporal smoothing perceptible to trained ears.
- **Band energy** uses constant-Q half-bin ratio (`HALF_BIN_RATIO = 1000^(0.5/(N-1))`). Each band spans `[hz/ratio, hz*ratio]`.
- **Pan smoothing**: `panSmoothed` persists across frames. Active bands: EMA weight 0.15 new / 0.85 old. Silent bands (`energy < 0.02`): decay factor 0.92 toward center. Preserve temporal stability — jarring pan jumps ruin mix-checking utility.
- **Channel splitter**: always use `AudioContext.createChannelSplitter(2)` for true L/R separation. Never mono-sum and re-derive stereo.
- Use `AudioContext` only on explicit user gesture (file load or play). Do not create it eagerly — browsers block it.
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
- Psychoacoustic rationale (e.g., why low freqs are wider, why absolute pan is used) must be preserved in comments; do not remove them when editing.
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

When adding new visual features, preserve all mapping invariants in §1:
- New parameters mapped to visual properties must follow the same psychoacoustic logic (log-frequency for anything pitch-related, amplitude for size/brightness, L-R for position).
- New per-band state (like `panSmoothed`) should be a `Float32Array` of length `FREQ_COUNT` initialized at module load, not allocated per frame.
- New controls go in `.controls` (persistent settings) or `.seekbar` (playback-related); use the existing `makeSliderPair` helper for any new slider+number-input pair.
- Any new frequency-to-visual mapping must be validated against real-world mixes: a centered kick drum at 60 Hz should appear at the bottom-center; a hard-panned hi-hat at 10 kHz should appear top-right or top-left.

---

## 7. HTML & CSS Conventions

- Semantic HTML: controls in `<section class="controls">`, seekbar in `<section class="seekbar">`, canvas as `role="img"` with `aria-label`.
- All interactive elements have `aria-label` attributes. Do not add controls without them.
- Dark color scheme: background `#101316`, panel `#1a2129`, borders `#2f3944`. Stick to this palette.
- `box-sizing: border-box` on `*`. Grid layout on `.app`.
- No external CSS frameworks, no `!important`.
