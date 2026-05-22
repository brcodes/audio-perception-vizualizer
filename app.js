const canvas = document.getElementById('vizCanvas');
const fileInput = document.getElementById('fileInput');
const playPauseBtn = document.getElementById('playPauseBtn');
const seekSlider = document.getElementById('seekSlider');
const currentTimeEl = document.getElementById('currentTime');
const totalTimeEl = document.getElementById('totalTime');
const panScaleSlider = document.getElementById('panScaleSlider');
const panScaleValueEl = document.getElementById('panScaleValue');
const opacityCurvatureSlider = document.getElementById('opacityCurvatureSlider');
const opacityCurvatureValueEl = document.getElementById('opacityCurvatureValue');
const minAlphaSlider = document.getElementById('minAlphaSlider');
const minAlphaValueEl = document.getElementById('minAlphaValue');
const maxAlphaSlider = document.getElementById('maxAlphaSlider');
const maxAlphaValueEl = document.getElementById('maxAlphaValue');
const bassSmoothingSlider = document.getElementById('bassSmoothingSlider');
const bassSmoothingValueEl = document.getElementById('bassSmoothingValue');
const trebleSmoothingSlider = document.getElementById('trebleSmoothingSlider');
const trebleSmoothingValueEl = document.getElementById('trebleSmoothingValue');
const ctx = canvas.getContext('2d');

const DIVISION_EPSILON = 1e-6;
const TYPICAL_ENERGY_THRESHOLD = 0.45;
const TYPICAL_HEIGHT_FACTOR = 0.7;
const PEAK_HEIGHT_FACTOR = 0.97;

const FREQ_COUNT = 100;
// Half-bin ratio for constant-Q narrow bands: ±half a log-bin around each center frequency
const HALF_BIN_RATIO = Math.pow(1000, 0.5 / (FREQ_COUNT - 1));

const MP3_MIME_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/x-mp3', 'audio/mpeg3', 'audio/x-mpeg-3']);
const ZERO_FREQUENCY_DATA = new Uint8Array(1);

// Existing bin colors anchored to their log-frequency positions (logT = 0–1 over 20Hz–20kHz)
const COLOR_STOPS = [
  { t: 0,      r: 88,  g: 0,   b: 0   },
  { t: 0.0794, r: 88,  g: 0,   b: 0   },
  { t: 0.2624, r: 255, g: 46,  b: 0   },
  { t: 0.4160, r: 255, g: 140, b: 0   },
  { t: 0.5663, r: 255, g: 235, b: 0   },
  { t: 0.7169, r: 102, g: 204, b: 0   },
  { t: 0.7964, r: 0,   g: 204, b: 221 },
  { t: 0.9129, r: 75,  g: 46,  b: 255 },
  { t: 1,      r: 75,  g: 46,  b: 255 },
];

// Compute per-band alpha from drawing depth (0=back, 1=front) and the three opacity sliders.
// Curvature e > 0: steep drop at back, flattens toward front.
// Curvature e < 0: flat at back, steep drop toward front.
// e = 0: linear.
function computeAlpha(depth) {
  const e = Number(opacityCurvatureSlider.value);
  const minA = Number(minAlphaSlider.value);
  const maxA = Number(maxAlphaSlider.value);
  let t;
  if (e > 0) {
    t = 1 - Math.pow(depth, e);      // steep at front
  } else if (e < 0) {
    t = Math.pow(1 - depth, -e);     // steep at back
  } else {
    t = 1 - depth;                   // linear
  }
  return minA + (maxA - minA) * t;
}

function interpolateColor(t) {
  let i = 0;
  while (i < COLOR_STOPS.length - 2 && COLOR_STOPS[i + 1].t <= t) i += 1;
  const a = COLOR_STOPS[i];
  const b = COLOR_STOPS[i + 1];
  const frac = (t - a.t) / (b.t - a.t);
  return {
    r: Math.round(a.r + frac * (b.r - a.r)),
    g: Math.round(a.g + frac * (b.g - a.g)),
    b: Math.round(a.b + frac * (b.b - a.b)),
  };
}

// 100 log-spaced frequencies from 20Hz (logT=0) to 20kHz (logT=1).
// Geometric midpoint ~632Hz falls at index 49/50 — bottom half shows 20–632Hz, top shows 632–20kHz.
const FREQUENCIES = Array.from({ length: FREQ_COUNT }, (_, i) => {
  const logT = i / (FREQ_COUNT - 1);
  const hz = 20 * Math.pow(1000, logT);
  const rgb = interpolateColor(logT);
  // Depth in drawing order: 0 = drawn first (back), 1 = drawn last (front).
  // Bottom half (i<50): drawn 0→49, so front = i=49  → depth = i/49
  // Top half   (i≥50): drawn 99→50, so front = i=50  → depth = (99-i)/49
  const depth = i < 50 ? i / 49 : (99 - i) / 49;
  return { hz, logT, rgb, depth };
});

// Bottom semicircle: indices 0–49 (lower 50, 20Hz–~611Hz)
const BOTTOM_FREQS = FREQUENCIES.slice(0, 50);
// Top semicircle: indices 50–99 (upper 50, ~655Hz–20kHz)
const TOP_FREQS = FREQUENCIES.slice(50);

const audio = new Audio();
audio.crossOrigin = 'anonymous';
audio.preload = 'auto';

let objectUrl;
let rafId;
let audioContext;
let sourceNode;
let splitter;
let analyserLeft;
let analyserRight;
let leftData;
let rightData;
let isDocumentHidden = false;
let isScrubbing = false;
let wasPlaying = false;

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function ensureAudioGraph() {
  if (audioContext) return;
  audioContext = new AudioContext();
  sourceNode = audioContext.createMediaElementSource(audio);
  splitter = audioContext.createChannelSplitter(2);
  analyserLeft = audioContext.createAnalyser();
  analyserRight = audioContext.createAnalyser();
  analyserLeft.fftSize = 8192;
  analyserRight.fftSize = 8192;
  // Set to 0 so per-band EMA (bandEnergySmoothed) owns all temporal behaviour;
  // the frequency-dependent smoothing produces transient spikes at treble and
  // rolling hills at bass, which is not achievable with a single global constant.
  analyserLeft.smoothingTimeConstant = 0;
  analyserRight.smoothingTimeConstant = 0;
  leftData = new Uint8Array(analyserLeft.frequencyBinCount);
  rightData = new Uint8Array(analyserRight.frequencyBinCount);

  sourceNode.connect(splitter);
  splitter.connect(analyserLeft, 0);
  splitter.connect(analyserRight, 1);
  sourceNode.connect(audioContext.destination);
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function hzToIndex(hz, sampleRate, maxIndex) {
  const nyquist = sampleRate / 2;
  const clampedHz = Math.max(0, Math.min(hz, nyquist));
  const idx = Math.round((clampedHz / nyquist) * maxIndex);
  return Math.max(0, Math.min(maxIndex, idx));
}

function getBandEnergy(data, minHz, maxHz, sampleRate) {
  const maxIndex = data.length - 1;
  const start = hzToIndex(minHz, sampleRate, maxIndex);
  const end = hzToIndex(maxHz, sampleRate, maxIndex);
  // Changed from <= to < so that single-bin bands (common at low frequencies) still return a value
  if (end < start) return 0;

  let sumSq = 0;
  let count = 0;
  for (let i = start; i <= end; i += 1) {
    const v = data[i] / 255;
    sumSq += v * v;
    count += 1;
  }
  return count ? Math.sqrt(sumSq / count) : 0;
}

// Per-band smoothed pan state — persists across frames for temporal stability.
// Indices 0–49 = BOTTOM_FREQS, 50–99 = TOP_FREQS.
const panSmoothed = new Float32Array(FREQ_COUNT);

// Per-band energy envelope with frequency-dependent EMA.
// Bass bands (logT≈0) use a slow alpha → rolling hills.
// Treble bands (logT≈1) use a fast alpha → sharp transient spikes.
// Allocated once; updated each frame inside drawVisualizer (no per-frame alloc).
const bandEnergySmoothed = new Float32Array(FREQ_COUNT);

// Use the absolute L–R difference rather than the relative ratio (R-L)/(R+L).
// Relative normalization causes pan to collapse toward center whenever centered
// content is added to a band, because it grows the denominator without changing
// the numerator. Absolute difference is immune: adding equal energy to both
// channels leaves (R-L) unchanged, so the displayed pan position stays put.
function toPanPoint(left, right) {
  if (left + right < 0.015) return 0;
  const scale = Number(panScaleSlider.value);
  return Math.max(-100, Math.min(100, Math.round(((right - left) / scale) * 100)));
}

function amplitudeToHeightFactor(energy) {
  if (energy <= TYPICAL_ENERGY_THRESHOLD) {
    return (energy / TYPICAL_ENERGY_THRESHOLD) * TYPICAL_HEIGHT_FACTOR;
  }
  const headroomHeight = PEAK_HEIGHT_FACTOR - TYPICAL_HEIGHT_FACTOR;
  const headroomEnergy = 1 - TYPICAL_ENERGY_THRESHOLD;
  return (
    TYPICAL_HEIGHT_FACTOR +
    ((energy - TYPICAL_ENERGY_THRESHOLD) / headroomEnergy) * headroomHeight
  );
}

// Transient-response EMA alpha interpolated by log-frequency.
// bassSmoothingSlider (default 0.94) → slow decay at 20 Hz → rolling hills.
// trebleSmoothingSlider (default 0.55) → fast decay at 20 kHz → sharp spikes.
function frequencyToSmoothingAlpha(logT) {
  const alphaLow = Number(bassSmoothingSlider.value);
  const alphaHigh = Number(trebleSmoothingSlider.value);
  return alphaLow + (alphaHigh - alphaLow) * logT;
}

// Psychoacoustic localization spread: low frequencies are harder to localize (wider),
// high frequencies are tighter. Scaled down for 100 narrow bands.
function frequencyToWidthFactor(logT) {
  return 0.08 - 0.04 * logT; // 0.08 at 20Hz → 0.04 at 20kHz
}

function drawWaveform({ centerX, centerY, radius, dir, rgb, alpha, energy, logT, panPoint }) {
  const heightFactor = Math.max(0, Math.min(PEAK_HEIGHT_FACTOR, amplitudeToHeightFactor(energy)));
  const height = radius * heightFactor;

  const widthBase = frequencyToWidthFactor(logT);
  const levelBoost = 0.03 * energy;
  let halfWidth = radius * (widthBase + levelBoost);
  const absPan = Math.abs(panPoint) / 100;
  halfWidth *= 1 + absPan * 0.06;

  const leftLimit = centerX - radius;
  const rightLimit = centerX + radius;
  const panX = centerX + (panPoint / 100) * radius;
  const minX = Math.max(leftLimit, panX - halfWidth);
  const maxX = Math.min(rightLimit, panX + halfWidth);
  const actualCenterX = (minX + maxX) / 2;

  // Quadratic bezier: control point at 2× height ensures peak reaches exactly `height`.
  // For a symmetric bezier B(t) with equal-y endpoints, the midpoint (t=0.5) reaches
  // 50% of the control point's deviation — so we place it at 2× the desired peak.
  // This gives a smooth parabolic bell visually indistinguishable from Gaussian for narrow spikes,
  // with 3 path commands vs the previous 81-point loop.
  ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  ctx.beginPath();
  ctx.moveTo(minX, centerY);
  ctx.quadraticCurveTo(actualCenterX, centerY + dir * height * 2, maxX, centerY);
  ctx.lineTo(maxX, centerY);
  ctx.closePath();
  ctx.fill();
}

function drawVisualizer() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.42;

  ctx.fillStyle = '#161d25';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#0f141a';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3c4752';
  ctx.lineWidth = 2;
  ctx.stroke();

  const sampleRate = audioContext?.sampleRate || 44100;
  const left = leftData || ZERO_FREQUENCY_DATA;
  const right = rightData || ZERO_FREQUENCY_DATA;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  // Top semicircle: upper 50 frequencies, drawn highest→lowest so that the
  // boundary frequency (~655Hz, index 50) is painted last and visually prominent at equator.
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - radius, cy - radius, radius * 2, radius);
  ctx.clip();
  for (let i = TOP_FREQS.length - 1; i >= 0; i -= 1) {
    const { hz, logT, rgb, depth } = TOP_FREQS[i];
    const alpha = computeAlpha(depth);
    const l = getBandEnergy(left, hz / HALF_BIN_RATIO, hz * HALF_BIN_RATIO, sampleRate);
    const r = getBandEnergy(right, hz / HALF_BIN_RATIO, hz * HALF_BIN_RATIO, sampleRate);
    const rawEnergy = (l + r) / 2;
    const emaAlpha = frequencyToSmoothingAlpha(logT);
    const globalIdx = 50 + i;
    bandEnergySmoothed[globalIdx] = emaAlpha * bandEnergySmoothed[globalIdx] + (1 - emaAlpha) * rawEnergy;
    const energy = bandEnergySmoothed[globalIdx];
    const rawPan = toPanPoint(l, r);
    if (rawEnergy > 0.02) {
      panSmoothed[globalIdx] = panSmoothed[globalIdx] * 0.85 + rawPan * 0.15;
    } else {
      panSmoothed[globalIdx] *= 0.92; // decay toward center when band is silent
    }
    drawWaveform({
      centerX: cx,
      centerY: cy,
      radius,
      dir: -1,
      rgb,
      alpha,
      energy,
      logT,
      panPoint: panSmoothed[globalIdx],
    });
  }
  ctx.restore();

  // Bottom semicircle: lower 50 frequencies, drawn lowest→highest so that the
  // boundary frequency (~611Hz, index 49) is painted last and visually prominent at equator.
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - radius, cy, radius * 2, radius);
  ctx.clip();
  BOTTOM_FREQS.forEach(({ hz, logT, rgb, depth }, i) => {
    const alpha = computeAlpha(depth);
    const l = getBandEnergy(left, hz / HALF_BIN_RATIO, hz * HALF_BIN_RATIO, sampleRate);
    const r = getBandEnergy(right, hz / HALF_BIN_RATIO, hz * HALF_BIN_RATIO, sampleRate);
    const rawEnergy = (l + r) / 2;
    const emaAlpha = frequencyToSmoothingAlpha(logT);
    bandEnergySmoothed[i] = emaAlpha * bandEnergySmoothed[i] + (1 - emaAlpha) * rawEnergy;
    const energy = bandEnergySmoothed[i];
    const rawPan = toPanPoint(l, r);
    if (rawEnergy > 0.02) {
      panSmoothed[i] = panSmoothed[i] * 0.85 + rawPan * 0.15;
    } else {
      panSmoothed[i] *= 0.92; // decay toward center when band is silent
    }
    drawWaveform({
      centerX: cx,
      centerY: cy,
      radius,
      dir: 1,
      rgb,
      alpha,
      energy,
      logT,
      panPoint: panSmoothed[i],
    });
  });
  ctx.restore();

  ctx.restore();
}

function animate() {
  if (analyserLeft && analyserRight) {
    analyserLeft.getByteFrequencyData(leftData);
    analyserRight.getByteFrequencyData(rightData);
  }
  drawVisualizer();
  rafId = requestAnimationFrame(animate);
}

function startAnimation() {
  if (rafId || audio.paused || isDocumentHidden) return;
  rafId = requestAnimationFrame(animate);
}

function stopAnimation() {
  if (!rafId) return;
  cancelAnimationFrame(rafId);
  rafId = undefined;
}

function isMp3File(file) {
  const type = (file.type || '').toLowerCase();
  return MP3_MIME_TYPES.has(type) || file.name.toLowerCase().endsWith('.mp3');
}

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!isMp3File(file)) {
    window.alert('Please upload an MP3 file.');
    fileInput.value = '';
    return;
  }

  ensureAudioGraph();
  if (audioContext.state === 'suspended') await audioContext.resume();

  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  audio.src = objectUrl;
  audio.currentTime = 0;
  audio.pause();
  stopAnimation();
  drawVisualizer();
  playPauseBtn.disabled = false;
  playPauseBtn.textContent = 'Play';
  seekSlider.value = 0;
  seekSlider.max = 100;
  seekSlider.disabled = true;
  currentTimeEl.textContent = '0:00';
  totalTimeEl.textContent = '0:00';
});

async function togglePlayPause() {
  if (!audio.src) return;
  ensureAudioGraph();
  if (audioContext.state === 'suspended') await audioContext.resume();

  if (audio.paused) {
    await audio.play();
    playPauseBtn.textContent = 'Pause';
    startAnimation();
  } else {
    audio.pause();
    playPauseBtn.textContent = 'Play';
    stopAnimation();
  }
}

playPauseBtn.addEventListener('click', () => togglePlayPause());

let isPointerOverApp = false;
const appEl = document.querySelector('.app');
appEl.addEventListener('mouseenter', () => { isPointerOverApp = true; });
appEl.addEventListener('mouseleave', () => { isPointerOverApp = false; });

document.addEventListener('keydown', (e) => {
  if (!isPointerOverApp) return;
  if (e.key !== ' ') return;
  e.preventDefault();
  togglePlayPause();
});

audio.addEventListener('loadedmetadata', () => {
  seekSlider.max = audio.duration;
  totalTimeEl.textContent = formatTime(audio.duration);
  seekSlider.disabled = false;
});

audio.addEventListener('timeupdate', () => {
  if (isScrubbing) return;
  seekSlider.value = audio.currentTime;
  currentTimeEl.textContent = formatTime(audio.currentTime);
});

seekSlider.addEventListener('pointerdown', () => {
  isScrubbing = true;
  wasPlaying = !audio.paused;
  if (wasPlaying) audio.pause();
});

seekSlider.addEventListener('input', () => {
  currentTimeEl.textContent = formatTime(Number(seekSlider.value));
});

seekSlider.addEventListener('pointerup', async () => {
  audio.currentTime = Number(seekSlider.value);
  isScrubbing = false;
  if (wasPlaying) {
    ensureAudioGraph();
    if (audioContext.state === 'suspended') await audioContext.resume();
    await audio.play();
    playPauseBtn.textContent = 'Pause';
    startAnimation();
  }
});

panScaleSlider.addEventListener('input', () => {
  panScaleValueEl.value = Number(panScaleSlider.value).toFixed(2);
});

panScaleValueEl.addEventListener('focus', () => {
  panScaleValueEl.select();
});

panScaleValueEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') panScaleValueEl.blur();
});

panScaleValueEl.addEventListener('change', () => {
  const raw = parseFloat(panScaleValueEl.value);
  const clamped = isNaN(raw)
    ? Number(panScaleSlider.value)
    : Math.max(0.10, Math.min(0.80, raw));
  panScaleValueEl.value = clamped.toFixed(2);
  panScaleSlider.value = clamped;
});

function makeSliderPair(slider, field, min, max, decimals) {
  slider.addEventListener('input', () => {
    field.value = Number(slider.value).toFixed(decimals);
  });
  field.addEventListener('focus', () => { field.select(); });
  field.addEventListener('keydown', (e) => { if (e.key === 'Enter') field.blur(); });
  field.addEventListener('change', () => {
    const raw = parseFloat(field.value);
    const clamped = isNaN(raw) ? Number(slider.value) : Math.max(min, Math.min(max, raw));
    field.value = clamped.toFixed(decimals);
    slider.value = clamped;
  });
}

makeSliderPair(opacityCurvatureSlider, opacityCurvatureValueEl, -10, 10, 1);
makeSliderPair(minAlphaSlider, minAlphaValueEl, 0, 1, 2);
makeSliderPair(maxAlphaSlider, maxAlphaValueEl, 0, 1, 2);
makeSliderPair(bassSmoothingSlider, bassSmoothingValueEl, 0.80, 0.99, 2);
makeSliderPair(trebleSmoothingSlider, trebleSmoothingValueEl, 0.20, 0.80, 2);

// Nudge buttons: step a slider by one unit in either direction.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.nudge-btn');
  if (!btn) return;
  const slider = document.getElementById(btn.dataset.target);
  if (!slider || slider.disabled) return;
  const dir = Number(btn.dataset.dir);
  const step = parseFloat(slider.step) || 1;
  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);
  const decimals = (slider.step.toString().split('.')[1] || '').length;
  const newVal = parseFloat(
    Math.max(min, Math.min(max, parseFloat(slider.value) + dir * step)).toFixed(decimals)
  );
  slider.value = newVal;
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  if (slider.id === 'seekSlider') {
    audio.currentTime = newVal;
  }
});

audio.addEventListener('ended', () => {
  playPauseBtn.textContent = 'Play';
  stopAnimation();
  drawVisualizer();
});

document.addEventListener('visibilitychange', () => {
  isDocumentHidden = document.hidden;
  if (isDocumentHidden) {
    stopAnimation();
    return;
  }
  startAnimation();
});

window.addEventListener('resize', () => {
  resizeCanvas();
  drawVisualizer();
});

resizeCanvas();
drawVisualizer();

(function restoreFileOnLoad() {
  const file = fileInput.files?.[0];
  if (file && isMp3File(file)) {
    ensureAudioGraph();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;
    audio.currentTime = 0;
    audio.pause();
    playPauseBtn.disabled = false;
    playPauseBtn.textContent = 'Play';
  } else {
    fileInput.value = '';
  }
}());