const canvas = document.getElementById('vizCanvas');
const fileInput = document.getElementById('fileInput');
const playPauseBtn = document.getElementById('playPauseBtn');
const seekSlider = document.getElementById('seekSlider');
const currentTimeEl = document.getElementById('currentTime');
const totalTimeEl = document.getElementById('totalTime');
const panScaleSlider = document.getElementById('panScaleSlider');
const panScaleValueEl = document.getElementById('panScaleValue');
const lineAlphaSlider = document.getElementById('lineAlphaSlider');
const lineAlphaValueEl = document.getElementById('lineAlphaValue');
const lineThicknessSlider = document.getElementById('lineThicknessSlider');
const lineThicknessValueEl = document.getElementById('lineThicknessValue');
const togglePanLineBtn = document.getElementById('togglePanLineBtn');
const normalizeHeightBtn = document.getElementById('normalizeHeightBtn');
const bandModeButtons = Array.from(document.querySelectorAll('.band-mode-btn'));
const ctx = canvas.getContext('2d');

const DIVISION_EPSILON = 1e-6;
const TYPICAL_ENERGY_THRESHOLD = 0.45;
const TYPICAL_HEIGHT_FACTOR = 0.38;
const PEAK_HEIGHT_FACTOR = 0.527;
const BASE_LINE_THICKNESS_CONTROL = 0.70;
const BASE_LINE_WIDTH_PX = 1.25;
// Option A (Logic default): fixed display scale where full-scale peaks approach display top.
const ANALYSER_FIXED_MAX_DB = 0;
// Shared dB span keeps low-level material visible without crushing loud transients.
const ANALYSER_DYNAMIC_RANGE_DB = 70;
const ANALYSER_HEADROOM_DB = 1;
const MAX_ANALYSER_MAX_DB = 0;
const MIN_ANALYSER_MAX_DB = -50;
// Small side bleed lets hard-panned shapes complete without inventing pan points beyond +/-100.
const PAN_EDGE_BLEED_PX = 14;
const EDGE_FADE_CLEAR = 'rgba(22, 29, 37, 0)';
const EDGE_FADE_SOLID = 'rgba(22, 29, 37, 1)';
// Tiny center deadband keeps front-center visually stable against micro L/R noise.
const PAN_CENTER_DEADBAND_POINTS = 0.6;
const PAN_DISPLAY_LINE_COLOR = 'rgba(70, 70, 70, 0.5)';
const PAN_DISPLAY_LINE_WIDTH = 1;
const PAN_DISPLAY_NOTCH_HALF_HEIGHT = 4;
const PAN_DISPLAY_MINOR_NOTCH_SCALE = 0.5;
// Fixed transient mapping removes per-band curve styling for a more uniform waveform language.
const TRANSIENT_ENERGY_EXPONENT = 0.78;
// Right-to-left sweep speed (cycles/sec) makes crest peaks read as transients crossing a window.
const TRANSIENT_SWEEP_HZ = 1.35;
const TRANSIENT_SKEW_MIN = 0.2;
const TRANSIENT_SKEW_MAX = 0.82;

const MIN_AUDIBLE_HZ = 20;
const MAX_AUDIBLE_HZ = 20000;
const BAND_MODE_KEYS = Object.freeze([7, 15, 25]);
const DEFAULT_BAND_MODE = 25;

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

const SEVEN_BAND_BINS = [
  { minHz: 20, maxHz: 60, hz: 34.6, rgb: { r: 88, g: 0, b: 0 } },
  { minHz: 60, maxHz: 250, hz: 122.5, rgb: { r: 255, g: 46, b: 0 } },
  { minHz: 250, maxHz: 500, hz: 353.6, rgb: { r: 255, g: 140, b: 0 } },
  { minHz: 500, maxHz: 2000, hz: 1000, rgb: { r: 255, g: 235, b: 0 } },
  { minHz: 2000, maxHz: 4000, hz: 2828.4, rgb: { r: 102, g: 204, b: 0 } },
  { minHz: 4000, maxHz: 6000, hz: 4898.9, rgb: { r: 0, g: 204, b: 221 } },
  { minHz: 6000, maxHz: 20000, hz: 10954.5, rgb: { r: 75, g: 46, b: 255 } },
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

function hzToLogT(hz) {
  const ratio = MAX_AUDIBLE_HZ / MIN_AUDIBLE_HZ;
  return Math.log(hz / MIN_AUDIBLE_HZ) / Math.log(ratio);
}

function createLogBands(count) {
  const ratio = MAX_AUDIBLE_HZ / MIN_AUDIBLE_HZ;
  // Constant-Q spread keeps proportional bandwidth per band across the audible range.
  const halfBinRatio = Math.pow(ratio, 0.5 / (count - 1));
  const bands = new Array(count);

  for (let i = 0; i < count; i += 1) {
    const logT = i / (count - 1);
    const hz = MIN_AUDIBLE_HZ * Math.pow(ratio, logT);
    bands[i] = {
      hz,
      logT,
      rgb: interpolateColor(logT),
      minHz: Math.max(MIN_AUDIBLE_HZ, hz / halfBinRatio),
      maxHz: Math.min(MAX_AUDIBLE_HZ, hz * halfBinRatio),
    };
  }

  // Force edge bins to cover the full 20Hz-20kHz range without leaving gaps.
  bands[0].minHz = MIN_AUDIBLE_HZ;
  bands[count - 1].maxHz = MAX_AUDIBLE_HZ;

  return bands;
}

function createBandProfile(bands) {
  const splitIndex = Math.floor(bands.length / 2);
  return {
    splitIndex,
    bottomBands: bands.slice(0, splitIndex),
    topBands: bands.slice(splitIndex),
    // Per-band smoothed pan state persists across frames for temporal stability.
    panSmoothed: new Float32Array(bands.length),
  };
}

const BAND_PROFILES = {
  7: createBandProfile(SEVEN_BAND_BINS.map((band) => ({
    minHz: band.minHz,
    maxHz: band.maxHz,
    hz: band.hz,
    logT: hzToLogT(band.hz),
    rgb: band.rgb,
  }))),
  15: createBandProfile(createLogBands(15)),
  25: createBandProfile(createLogBands(25)),
};

let activeBandMode = DEFAULT_BAND_MODE;
let activeBandProfile = BAND_PROFILES[activeBandMode];

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
let isPanDisplayLineVisible = true;
let isHeightNormalized = false;
let isHeightNormalizationCalibrating = false;
let currentFile;
let analysisGeneration = 0;

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function setAnalyserScale(maxDb) {
  if (!analyserLeft || !analyserRight) return;
  const minDb = maxDb - ANALYSER_DYNAMIC_RANGE_DB;
  analyserLeft.minDecibels = minDb;
  analyserRight.minDecibels = minDb;
  analyserLeft.maxDecibels = maxDb;
  analyserRight.maxDecibels = maxDb;
}

function applyFixedAnalyserScale() {
  setAnalyserScale(ANALYSER_FIXED_MAX_DB);
}

function updateNormalizeHeightToggleState() {
  const isActive = isHeightNormalized;
  const statusText = isActive
    ? (isHeightNormalizationCalibrating ? 'Calibrating...' : 'On')
    : 'Off';
  normalizeHeightBtn.textContent = `Normalize Height: ${statusText}`;
  normalizeHeightBtn.classList.toggle('is-active', isActive);
  normalizeHeightBtn.classList.toggle('is-calibrating', isActive && isHeightNormalizationCalibrating);
  normalizeHeightBtn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
}

function setNormalizeHeightCalibrating(isCalibrating) {
  if (isHeightNormalizationCalibrating === isCalibrating) return;
  isHeightNormalizationCalibrating = isCalibrating;
  updateNormalizeHeightToggleState();
}

async function analyzeAndCalibrateAnalysers(file) {
  if (!file || !isHeightNormalized) return;
  ensureAudioGraph();
  const generation = ++analysisGeneration;
  setNormalizeHeightCalibrating(true);
  try {
    const arrayBuffer = await file.arrayBuffer();
    if (generation !== analysisGeneration || !isHeightNormalized) return;

    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    if (generation !== analysisGeneration || !isHeightNormalized) return;

    let peakAmp = 0;
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch += 1) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < channelData.length; i += 1) {
        const sample = Math.abs(channelData[i]);
        if (sample > peakAmp) peakAmp = sample;
      }
    }

    if (peakAmp <= DIVISION_EPSILON) {
      setAnalyserScale(MIN_ANALYSER_MAX_DB);
      return;
    }

    const peakDb = 20 * Math.log10(peakAmp);
    const targetMaxDb = Math.max(
      MIN_ANALYSER_MAX_DB,
      Math.min(MAX_ANALYSER_MAX_DB, peakDb + ANALYSER_HEADROOM_DB),
    );
    setAnalyserScale(targetMaxDb);
  } catch (error) {
    // Keep the app interactive if decode/calibration fails for any reason.
    console.error('Waveform height normalization failed:', error);
    if (isHeightNormalized) applyFixedAnalyserScale();
  } finally {
    if (generation === analysisGeneration && isHeightNormalized) {
      setNormalizeHeightCalibrating(false);
      drawVisualizer();
    }
  }
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
  applyFixedAnalyserScale();
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

// Use the absolute L–R difference rather than the relative ratio (R-L)/(R+L).
// Relative normalization causes pan to collapse toward center whenever centered
// content is added to a band, because it grows the denominator without changing
// the numerator. Absolute difference is immune: adding equal energy to both
// channels leaves (R-L) unchanged, so the displayed pan position stays put.
function toPanPoint(left, right) {
  if (left + right < 0.015) return 0;
  const scale = Number(panScaleSlider.value);
  const panPoint = Math.max(-100, Math.min(100, ((right - left) / scale) * 100));
  return Math.abs(panPoint) < PAN_CENTER_DEADBAND_POINTS ? 0 : panPoint;
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

function shapeEnergyForTransientView(energy) {
  return Math.min(1, Math.pow(Math.max(0, energy), TRANSIENT_ENERGY_EXPONENT));
}

function computeTransientSweepT() {
  const t = (audio.currentTime * TRANSIENT_SWEEP_HZ) % 1;
  return t < 0 ? t + 1 : t;
}

// Psychoacoustic localization spread: low frequencies are harder to localize (wider),
// high frequencies are tighter.
function frequencyToWidthFactor(logT) {
  return 0.08 - 0.04 * logT; // 0.08 at 20Hz → 0.04 at 20kHz
}

function drawWaveform(centerX, centerY, radius, dir, rgb, lineAlpha, lineWidth, energy, logT, panPoint, sweepT) {
  const heightFactor = Math.max(0, Math.min(PEAK_HEIGHT_FACTOR, amplitudeToHeightFactor(energy)));
  const height = radius * heightFactor;

  const widthBase = frequencyToWidthFactor(logT);
  const levelBoost = 0.03 * energy;
  let halfWidth = radius * (widthBase + levelBoost);
  const absPan = Math.abs(panPoint) / 100;
  halfWidth *= 1 + absPan * 0.06;

  const leftLimit = centerX - radius - PAN_EDGE_BLEED_PX;
  const rightLimit = centerX + radius + PAN_EDGE_BLEED_PX;
  const panX = centerX + (panPoint / 100) * radius;
  const minX = Math.max(leftLimit, panX - halfWidth);
  const maxX = Math.min(rightLimit, panX + halfWidth);
  const width = maxX - minX;
  if (width <= DIVISION_EPSILON) return;
  const transientSkew = TRANSIENT_SKEW_MAX - sweepT * (TRANSIENT_SKEW_MAX - TRANSIENT_SKEW_MIN);
  const transientPeakX = minX + width * transientSkew;
  const shoulderX = minX + width * 0.45;

  // Asymmetric crest with a drifting peak reads like transients moving right→left.
  ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${lineAlpha})`;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(minX, centerY);
  ctx.quadraticCurveTo(shoulderX, centerY + dir * height * 0.95, transientPeakX, centerY + dir * height * 1.8);
  ctx.quadraticCurveTo(maxX - width * 0.08, centerY + dir * height * 1.15, maxX, centerY);
  ctx.stroke();
}

function drawPanEdgeFade(centerX, centerY, radius) {
  if (PAN_EDGE_BLEED_PX <= 0) return;
  const topY = centerY - radius;
  const height = radius * 2;
  const leftCoreX = centerX - radius;
  const rightCoreX = centerX + radius;
  const leftBleedX = leftCoreX - PAN_EDGE_BLEED_PX;
  const rightBleedX = rightCoreX + PAN_EDGE_BLEED_PX;

  // Fade only in the bleed gutters so +/-100 remains the localization endpoint.
  const leftFade = ctx.createLinearGradient(leftCoreX, 0, leftBleedX, 0);
  leftFade.addColorStop(0, EDGE_FADE_CLEAR);
  leftFade.addColorStop(1, EDGE_FADE_SOLID);
  ctx.fillStyle = leftFade;
  ctx.fillRect(leftBleedX, topY, PAN_EDGE_BLEED_PX, height);

  const rightFade = ctx.createLinearGradient(rightCoreX, 0, rightBleedX, 0);
  rightFade.addColorStop(0, EDGE_FADE_CLEAR);
  rightFade.addColorStop(1, EDGE_FADE_SOLID);
  ctx.fillStyle = rightFade;
  ctx.fillRect(rightCoreX, topY, PAN_EDGE_BLEED_PX, height);
}

function drawPanDisplayLine(centerX, centerY, radius) {
  ctx.strokeStyle = PAN_DISPLAY_LINE_COLOR;
  ctx.lineWidth = PAN_DISPLAY_LINE_WIDTH;
  ctx.beginPath();
  ctx.moveTo(centerX - radius, centerY);
  ctx.lineTo(centerX + radius, centerY);
  for (let panPoint = -100; panPoint <= 100; panPoint += 1) {
    const absPanPoint = Math.abs(panPoint);
    const isHighNotch =
      absPanPoint === 0 ||
      absPanPoint === 20 ||
      absPanPoint === 40 ||
      absPanPoint === 60 ||
      absPanPoint === 80 ||
      absPanPoint === 100;
    const notchHalfHeight = isHighNotch
      ? PAN_DISPLAY_NOTCH_HALF_HEIGHT
      : PAN_DISPLAY_NOTCH_HALF_HEIGHT * PAN_DISPLAY_MINOR_NOTCH_SCALE;
    const x = centerX + (panPoint / 100) * radius;
    ctx.moveTo(x, centerY - notchHalfHeight);
    ctx.lineTo(x, centerY + notchHalfHeight);
  }
  ctx.stroke();
}

function drawVisualizer() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const halfSize = Math.min(width, height) * 0.42;
  const squareSize = halfSize * 2;

  ctx.fillStyle = '#161d25';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#0f141a';
  ctx.fillRect(cx - halfSize, cy - halfSize, squareSize, squareSize);
  ctx.strokeStyle = '#3c4752';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - halfSize, cy - halfSize, squareSize, squareSize);

  const sampleRate = audioContext?.sampleRate || 44100;
  const left = leftData || ZERO_FREQUENCY_DATA;
  const right = rightData || ZERO_FREQUENCY_DATA;
  const lineAlpha = Number(lineAlphaSlider.value);
  const sweepT = computeTransientSweepT();
  // Keep visual continuity: slider value 0.70 reproduces the prior fixed 1.25px line width.
  const lineWidth =
    (Math.max(0.01, Number(lineThicknessSlider.value)) / BASE_LINE_THICKNESS_CONTROL) *
    BASE_LINE_WIDTH_PX;
  const { topBands, bottomBands, splitIndex, panSmoothed } = activeBandProfile;
  const clipLeft = cx - halfSize - PAN_EDGE_BLEED_PX;
  const clipWidth = squareSize + PAN_EDGE_BLEED_PX * 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(clipLeft, cy - halfSize, clipWidth, squareSize);
  ctx.clip();

  // Top half: upper bands drawn highest->lowest to keep the center boundary prominent.
  ctx.save();
  ctx.beginPath();
  ctx.rect(clipLeft, cy - halfSize, clipWidth, halfSize);
  ctx.clip();
  for (let i = topBands.length - 1; i >= 0; i -= 1) {
    const band = topBands[i];
    const l = getBandEnergy(left, band.minHz, band.maxHz, sampleRate);
    const r = getBandEnergy(right, band.minHz, band.maxHz, sampleRate);
    const energy = (l + r) / 2;
    const displayEnergy = shapeEnergyForTransientView(energy);
    const globalIdx = splitIndex + i;
    const rawPan = toPanPoint(l, r);
    if (energy > 0.02) {
      panSmoothed[globalIdx] = panSmoothed[globalIdx] * 0.85 + rawPan * 0.15;
    } else {
      panSmoothed[globalIdx] *= 0.92; // decay toward center when band is silent
    }
    drawWaveform(
      cx,
      cy,
      halfSize,
      -1,
      band.rgb,
      lineAlpha,
      lineWidth,
      displayEnergy,
      band.logT,
      panSmoothed[globalIdx],
      sweepT,
    );
  }
  ctx.restore();

  // Bottom half: lower bands drawn lowest->highest for symmetric layering.
  ctx.save();
  ctx.beginPath();
  ctx.rect(clipLeft, cy, clipWidth, halfSize);
  ctx.clip();
  for (let i = 0; i < bottomBands.length; i += 1) {
    const band = bottomBands[i];
    const l = getBandEnergy(left, band.minHz, band.maxHz, sampleRate);
    const r = getBandEnergy(right, band.minHz, band.maxHz, sampleRate);
    const energy = (l + r) / 2;
    const displayEnergy = shapeEnergyForTransientView(energy);
    const rawPan = toPanPoint(l, r);
    if (energy > 0.02) {
      panSmoothed[i] = panSmoothed[i] * 0.85 + rawPan * 0.15;
    } else {
      panSmoothed[i] *= 0.92; // decay toward center when band is silent
    }
    drawWaveform(
      cx,
      cy,
      halfSize,
      1,
      band.rgb,
      lineAlpha,
      lineWidth,
      displayEnergy,
      band.logT,
      panSmoothed[i],
      sweepT,
    );
  }
  ctx.restore();

  drawPanEdgeFade(cx, cy, halfSize);

  if (isPanDisplayLineVisible) {
    drawPanDisplayLine(cx, cy, halfSize);
  }

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

  currentFile = file;
  analysisGeneration += 1;
  setNormalizeHeightCalibrating(false);
  ensureAudioGraph();
  if (audioContext.state === 'suspended') await audioContext.resume();
  applyFixedAnalyserScale();

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
  if (isHeightNormalized) analyzeAndCalibrateAnalysers(file);
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

function toggleNormalizeHeight() {
  isHeightNormalized = !isHeightNormalized;
  audio.pause();
  playPauseBtn.textContent = 'Play';
  stopAnimation();

  if (!isHeightNormalized) {
    analysisGeneration += 1;
    setNormalizeHeightCalibrating(false);
    applyFixedAnalyserScale();
    updateNormalizeHeightToggleState();
    drawVisualizer();
    return;
  }

  if (!currentFile) {
    updateNormalizeHeightToggleState();
    drawVisualizer();
    return;
  }

  analyzeAndCalibrateAnalysers(currentFile);
  updateNormalizeHeightToggleState();
  drawVisualizer();
}

function updatePanLineToggleState() {
  togglePanLineBtn.textContent = isPanDisplayLineVisible ? 'Pan Line: On' : 'Pan Line: Off';
  togglePanLineBtn.classList.toggle('is-active', isPanDisplayLineVisible);
  togglePanLineBtn.setAttribute('aria-pressed', isPanDisplayLineVisible ? 'true' : 'false');
}

function updateBandModeButtons() {
  for (let i = 0; i < bandModeButtons.length; i += 1) {
    const button = bandModeButtons[i];
    const bandCount = Number(button.dataset.bandCount);
    const isActive = bandCount === activeBandMode;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  }
}

function setBandMode(nextMode) {
  if (!BAND_MODE_KEYS.includes(nextMode) || nextMode === activeBandMode) return;
  activeBandMode = nextMode;
  activeBandProfile = BAND_PROFILES[nextMode];
  updateBandModeButtons();
  drawVisualizer();
}

playPauseBtn.addEventListener('click', () => togglePlayPause());
togglePanLineBtn.addEventListener('click', () => {
  isPanDisplayLineVisible = !isPanDisplayLineVisible;
  updatePanLineToggleState();
  drawVisualizer();
});
normalizeHeightBtn.addEventListener('click', () => {
  toggleNormalizeHeight();
});
for (let i = 0; i < bandModeButtons.length; i += 1) {
  const button = bandModeButtons[i];
  button.addEventListener('click', () => {
    setBandMode(Number(button.dataset.bandCount));
  });
}

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

makeSliderPair(lineAlphaSlider, lineAlphaValueEl, 0, 1, 2);
makeSliderPair(lineThicknessSlider, lineThicknessValueEl, 0.01, 1.0, 2);

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

updatePanLineToggleState();
updateNormalizeHeightToggleState();
updateBandModeButtons();
resizeCanvas();
drawVisualizer();

(function restoreFileOnLoad() {
  const file = fileInput.files?.[0];
  if (file && isMp3File(file)) {
    currentFile = file;
    ensureAudioGraph();
    applyFixedAnalyserScale();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;
    audio.currentTime = 0;
    audio.pause();
    playPauseBtn.disabled = false;
    playPauseBtn.textContent = 'Play';
    if (isHeightNormalized) analyzeAndCalibrateAnalysers(file);
  } else {
    currentFile = undefined;
    fileInput.value = '';
  }
}());