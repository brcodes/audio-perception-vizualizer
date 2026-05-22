const canvas = document.getElementById('vizCanvas');
const fileInput = document.getElementById('fileInput');
const playPauseBtn = document.getElementById('playPauseBtn');
const seekSlider = document.getElementById('seekSlider');
const currentTimeEl = document.getElementById('currentTime');
const totalTimeEl = document.getElementById('totalTime');
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
  // Alpha bell: peaks at mid frequencies (logT≈0.5), lower at extremes
  const alpha = 0.28 + 0.10 * Math.sin(Math.PI * logT);
  return { hz, logT, rgb, alpha };
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
  analyserLeft.smoothingTimeConstant = 0.8;
  analyserRight.smoothingTimeConstant = 0.8;
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

function toPanPoint(left, right) {
  const pan = (right - left) / (right + left + DIVISION_EPSILON);
  return Math.max(-100, Math.min(100, Math.round(pan * 100)));
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
    const { hz, logT, rgb, alpha } = TOP_FREQS[i];
    const l = getBandEnergy(left, hz / HALF_BIN_RATIO, hz * HALF_BIN_RATIO, sampleRate);
    const r = getBandEnergy(right, hz / HALF_BIN_RATIO, hz * HALF_BIN_RATIO, sampleRate);
    drawWaveform({
      centerX: cx,
      centerY: cy,
      radius,
      dir: -1,
      rgb,
      alpha,
      energy: (l + r) / 2,
      logT,
      panPoint: toPanPoint(l, r),
    });
  }
  ctx.restore();

  // Bottom semicircle: lower 50 frequencies, drawn lowest→highest so that the
  // boundary frequency (~611Hz, index 49) is painted last and visually prominent at equator.
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - radius, cy, radius * 2, radius);
  ctx.clip();
  BOTTOM_FREQS.forEach(({ hz, logT, rgb, alpha }) => {
    const l = getBandEnergy(left, hz / HALF_BIN_RATIO, hz * HALF_BIN_RATIO, sampleRate);
    const r = getBandEnergy(right, hz / HALF_BIN_RATIO, hz * HALF_BIN_RATIO, sampleRate);
    drawWaveform({
      centerX: cx,
      centerY: cy,
      radius,
      dir: 1,
      rgb,
      alpha,
      energy: (l + r) / 2,
      logT,
      panPoint: toPanPoint(l, r),
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

playPauseBtn.addEventListener('click', async () => {
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