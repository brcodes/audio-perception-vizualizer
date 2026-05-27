const canvas = document.getElementById('vizCanvas');
const fileInput = document.getElementById('fileInput');
const playPauseBtn = document.getElementById('playPauseBtn');
const seekSlider = document.getElementById('seekSlider');
const currentTimeEl = document.getElementById('currentTime');
const totalTimeEl = document.getElementById('totalTime');
const panFlexSlider = document.getElementById('panFlexSlider');
const panFlexValueEl = document.getElementById('panFlexValue');
const panLockSlider = document.getElementById('panLockSlider');
const panLockValueEl = document.getElementById('panLockValue');
const lineAlphaSlider = document.getElementById('lineAlphaSlider');
const lineAlphaValueEl = document.getElementById('lineAlphaValue');
const lineThicknessSlider = document.getElementById('lineThicknessSlider');
const lineThicknessValueEl = document.getElementById('lineThicknessValue');
const widthBoostSlider = document.getElementById('widthBoostSlider');
const widthBoostValueEl = document.getElementById('widthBoostValue');
const waveWidthScaleSlider = document.getElementById('waveWidthScaleSlider');
const waveWidthScaleValueEl = document.getElementById('waveWidthScaleValue');
const waveHeightScaleSlider = document.getElementById('waveHeightScaleSlider');
const waveHeightScaleValueEl = document.getElementById('waveHeightScaleValue');
const waveHeightScaleLabel = document.getElementById('waveHeightScaleLabel');
const panEdgeFadeSlider = document.getElementById('panEdgeFadeSlider');
const panEdgeFadeValueEl = document.getElementById('panEdgeFadeValue');
const togglePanLineBtn = document.getElementById('togglePanLineBtn');
const toggleDbLineBtn = document.getElementById('toggleDbLineBtn');
const waveHeightFitScaleSlider = document.getElementById('waveHeightFitScaleSlider');
const waveHeightFitScaleValueEl = document.getElementById('waveHeightFitScaleValue');
const waveHeightFitScaleLabel = document.getElementById('waveHeightFitScaleLabel');
const waveHeightAutoFitBtn = document.getElementById('waveHeightAutoFitBtn');
const analyserSmoothingSlider = document.getElementById('analyserSmoothingSlider');
const analyserSmoothingValueEl = document.getElementById('analyserSmoothingValue');
const binauralPanBtn = document.getElementById('binauralPanBtn');
const bandModeButtons = Array.from(document.querySelectorAll('.band-mode-btn'));
const foNotches = document.getElementById('foNotches');
const ctx = canvas.getContext('2d');

const DIVISION_EPSILON = 1e-6;
// Full-scale band energy maps to 94.86% of half-frame height (= 0.527 × 1.8); absorbs the
// former 1.8× curve overshoot so the height slider is the single knob for peak excursion.
const PEAK_HEIGHT_FACTOR = 0.9486;
// Max binaural pan spread bonus at full pan (±100). Derived from the (1-cosθ) apparent-source-width
// model: IACC ≈ cos(θ) for a lateral point source, so ASW ∝ (1-cos(θ)); 0.18 keeps the effect
// perceptually meaningful without exaggerating moderately panned material.
const BINAURAL_PAN_MAX_FLEX = 0.18;
// Compressed period-ratio model for band base width.
// Period ∝ 1/f; the 20Hz:20kHz period ratio is 1000:1 (untenable direct visual mapping).
// Compressing by exponent 1/5 yields a 4:1 visual ratio: bass 4× wider than treble.
// W0 sets the half-width factor at 20 Hz (fraction of the display radius).
const WIDTH_W0 = 0.10;
const WIDTH_COMPRESSION = 0.2; // α = 1/5
// Stevens-style loudness mapping for amplitude (A^0.67) keeps width growth perceptually realistic.
const WIDTH_LOUDNESS_EXPONENT = 0.67;
// Max proportional width expansion at full band level (independent of pitch by design).
const DEFAULT_WIDTH_LEVEL_BOOST_RATIO = 0.88;
// Uniform scalar applied to all band halfWidths; preserves bass:treble and binaural proportions.
const DEFAULT_WAVE_WIDTH_SCALE = 2.50;
// Uniform scalar applied to PEAK_HEIGHT_FACTOR; 1.0 = unmodified 0.527 peak excursion.
const DEFAULT_WAVE_HEIGHT_SCALE = 1.35;
const BASE_LINE_THICKNESS_CONTROL = 0.70;
const BASE_LINE_WIDTH_PX = 1.25;
// -30 dBFS ceiling matches the Web Audio AnalyserNode default: signals above -30 dBFS clip to 255,
// so the bulk of a loud mix immediately drives band energy toward 1.0 and fills the display.
const ANALYSER_FIXED_MAX_DB = -30;
// Shared dB span keeps low-level material visible without crushing loud transients.
const ANALYSER_DYNAMIC_RANGE_DB = 70;
// Default IIR smoothing applied on top of the inherent ~186ms FFT window integration.
// 0 = instantaneous (jittery), 1 = fully frozen; 0.3 (~14ms at 60fps) balances
// responsiveness against per-frame noise without masking transients.
const DEFAULT_ANALYSER_SMOOTHING = 0.3;
// Side bleed lets hard-panned shapes complete without inventing pan points beyond +/-100.
const PAN_EDGE_BLEED_PX = 200;
// 0 = no masking (bleed fully visible); 1 = hard cutoff right at the ±100 edge.
// Intermediate values start the fade at that opacity at ±100 and ramp to fully opaque at the clip edge.
let panEdgeFadeIntensity = Number(panEdgeFadeSlider.value);
const EDGE_FADE_SOLID = 'rgba(22, 29, 37, 1)';
// Tiny center deadband keeps front-center visually stable against micro L/R noise.
const PAN_CENTER_DEADBAND_POINTS = DIVISION_EPSILON;
// Fixed full dominance keeps hard-panned one-sided bands visually lateral.
const DEFAULT_PAN_DOMINANCE_RATIO = 1.00;
// Center Trust Threshold: minimum band energy required to accept a center pan reading;
// lower values trust quiet center more, higher values hold prior pan longer.
const DEFAULT_PAN_HOLD_FLOOR = 0.25;
// Pan lock amount: 0 = no lock, 1 = fully frozen pan state.
const DEFAULT_PAN_LOCK_RATIO = 0.0;
// Blend toward level-invariant pan only for clearly one-sided bands.
const PAN_DOMINANCE_BLEND_START = 0.70;
const PAN_DOMINANCE_BLEND_END = 0.98;
const PAN_DISPLAY_LINE_COLOR = 'rgba(70, 70, 70, 0.5)';
const PAN_DISPLAY_LINE_WIDTH = 1;
const PAN_DISPLAY_NOTCH_HALF_HEIGHT = 4;
const PAN_DISPLAY_MINOR_NOTCH_SCALE = 0.5;
const DB_DISPLAY_LINE_COLOR = 'rgba(70, 70, 70, 0.5)';
const DB_DISPLAY_LINE_WIDTH = 1;
const DB_DISPLAY_NOTCH_HALF_WIDTH = 4;
const DB_DISPLAY_MINOR_NOTCH_SCALE = 0.5;
// Vertical bleed lets the dB edge labels at the top/bottom of the square straddle
// the edge, mirroring how the pan labels at ±100 straddle the left/right edges.
const DB_VERT_BLEED_PX = 8;

const MIN_AUDIBLE_HZ = 20;
const MAX_AUDIBLE_HZ = 20000;
const BAND_MODE_KEYS = Object.freeze([7, 15, 25, 49, 77, 99]);
const DEFAULT_BAND_MODE = 49;

const MP3_MIME_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/x-mp3', 'audio/mpeg3', 'audio/x-mpeg-3']);
const ZERO_FREQUENCY_DATA = new Uint8Array(1);

// Existing bin colors anchored to their log-frequency positions (logT = 0–1 over 20Hz–20kHz)
const COLOR_STOPS = [
  { t: 0, r: 88, g: 0, b: 0 },
  { t: 0.0794, r: 88, g: 0, b: 0 },
  { t: 0.2624, r: 255, g: 46, b: 0 },
  { t: 0.4160, r: 255, g: 140, b: 0 },
  { t: 0.5663, r: 255, g: 235, b: 0 },
  { t: 0.7169, r: 102, g: 204, b: 0 },
  { t: 0.7964, r: 0, g: 204, b: 221 },
  { t: 0.9129, r: 75, g: 46, b: 255 },
  { t: 1, r: 75, g: 46, b: 255 },
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
  49: createBandProfile(createLogBands(49)),
  77: createBandProfile(createLogBands(77)),
  99: createBandProfile(createLogBands(99)),
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
let isDbDisplayLineVisible = true;
let isBinauralPanDisplayActive = false;
let isAutoFitHeight = true;
let isAutoFitHeightCalibrating = false;
let autoFitBaseScale = 0;   // fittedScale from analysis; 0 until first run
let fitScaleRatio = 1.0;    // fraction of base fit [0.01, 1.0]; persists across toggles
let widthLevelBoostRatio = DEFAULT_WIDTH_LEVEL_BOOST_RATIO;
let waveWidthScale = DEFAULT_WAVE_WIDTH_SCALE;
let waveHeightScale = DEFAULT_WAVE_HEIGHT_SCALE;
let panDominanceRatio = DEFAULT_PAN_DOMINANCE_RATIO;
const panHoldFloor = DEFAULT_PAN_HOLD_FLOOR;
let panLockRatio = Math.max(
  0,
  Math.min(1, Number.isFinite(Number(panLockSlider.value))
    ? Number(panLockSlider.value)
    : DEFAULT_PAN_LOCK_RATIO),
);
let currentFile;
let analysisGeneration = 0;

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function setButtonsLockedWhileFitting(isLocked) {
  const buttons = document.querySelectorAll('button');
  for (let i = 0; i < buttons.length; i += 1) {
    const button = buttons[i];
    if (button === waveHeightAutoFitBtn) continue;
    if (isLocked) {
      if (!button.hasAttribute('data-fit-lock-prev-disabled')) {
        button.setAttribute('data-fit-lock-prev-disabled', button.disabled ? '1' : '0');
      }
      button.disabled = true;
      continue;
    }
    if (!button.hasAttribute('data-fit-lock-prev-disabled')) continue;
    const wasDisabled = button.getAttribute('data-fit-lock-prev-disabled') === '1';
    button.disabled = wasDisabled;
    button.removeAttribute('data-fit-lock-prev-disabled');
  }
}

function updateWaveHeightAutoFitToggleState() {
  const isActive = isAutoFitHeight;
  const statusText = isActive
    ? (isAutoFitHeightCalibrating ? 'Fitting...' : 'On')
    : 'Off';
  waveHeightAutoFitBtn.textContent = `Fit Wave Height: ${statusText}`;
  waveHeightAutoFitBtn.classList.toggle('is-active', isActive);
  waveHeightAutoFitBtn.classList.toggle('is-calibrating', isActive && isAutoFitHeightCalibrating);
  waveHeightAutoFitBtn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  setButtonsLockedWhileFitting(isActive && isAutoFitHeightCalibrating);
  // Fit On: lock original scale (auto-managed), unlock fit scale ratio slider.
  // Fit Off: unlock original scale, lock fit scale ratio slider (meaningless without fit).
  waveHeightScaleLabel.classList.toggle('ctrl-label--locked', isActive);
  waveHeightScaleSlider.disabled = isActive;
  waveHeightScaleValueEl.disabled = isActive;
  const scaleNudgeBtns = document.querySelectorAll('.nudge-btn[data-target="waveHeightScaleSlider"]');
  for (let i = 0; i < scaleNudgeBtns.length; i += 1) {
    scaleNudgeBtns[i].disabled = isActive;
  }
  waveHeightFitScaleLabel.classList.toggle('ctrl-label--locked', !isActive);
  waveHeightFitScaleSlider.disabled = !isActive;
  waveHeightFitScaleValueEl.disabled = !isActive;
  const fitNudgeBtns = document.querySelectorAll('.nudge-btn[data-target="waveHeightFitScaleSlider"]');
  for (let i = 0; i < fitNudgeBtns.length; i += 1) {
    fitNudgeBtns[i].disabled = !isActive;
  }
}

function setAutoFitHeightCalibrating(isCalibrating) {
  if (isAutoFitHeightCalibrating === isCalibrating) return;
  isAutoFitHeightCalibrating = isCalibrating;
  updateWaveHeightAutoFitToggleState();
}

function applyAutoFitScale() {
  if (!isAutoFitHeight || autoFitBaseScale <= DIVISION_EPSILON) return;
  const effective = Math.max(
    Number(waveHeightScaleSlider.min),
    Math.min(Number(waveHeightScaleSlider.max), autoFitBaseScale * fitScaleRatio),
  );
  waveHeightScaleSlider.value = effective;
  waveHeightScaleValueEl.value = effective.toFixed(2);
  waveHeightScale = effective;
  drawVisualizer();
}

async function analyzeAndAutoFitWaveHeight(file) {
  if (!file || !isAutoFitHeight) return false;
  ensureAudioGraph();
  const generation = ++analysisGeneration;
  setAutoFitHeightCalibrating(true);
  try {
    const arrayBuffer = await file.arrayBuffer();
    if (generation !== analysisGeneration || !isAutoFitHeight) return false;

    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    if (generation !== analysisGeneration || !isAutoFitHeight) return false;

    const { sampleRate, length } = audioBuffer;
    // Always render as 2-channel so the splitter receives a proper stereo signal.
    const offlineCtx = new OfflineAudioContext(2, length, sampleRate);
    const offSource = offlineCtx.createBufferSource();
    offSource.buffer = audioBuffer;

    const offSplitter = offlineCtx.createChannelSplitter(2);
    const offAnlLeft = offlineCtx.createAnalyser();
    const offAnlRight = offlineCtx.createAnalyser();
    offAnlLeft.fftSize = 8192;
    offAnlRight.fftSize = 8192;
    // Match live playback smoothing so effectiveMax is on the same temporal scale as the display.
    const offSmoothing = Number(analyserSmoothingSlider.value);
    offAnlLeft.smoothingTimeConstant = offSmoothing;
    offAnlRight.smoothingTimeConstant = offSmoothing;
    // Match the fixed playback dB range so energy values are on the same scale.
    const fixedMinDb = ANALYSER_FIXED_MAX_DB - ANALYSER_DYNAMIC_RANGE_DB;
    offAnlLeft.minDecibels = fixedMinDb;
    offAnlRight.minDecibels = fixedMinDb;
    offAnlLeft.maxDecibels = ANALYSER_FIXED_MAX_DB;
    offAnlRight.maxDecibels = ANALYSER_FIXED_MAX_DB;

    // ScriptProcessorNode onaudioprocess fires on the main thread for each rendered block,
    // giving us a hook to sample the AnalyserNode output during offline rendering.
    const offMerger = offlineCtx.createChannelMerger(2);
    const offProcessor = offlineCtx.createScriptProcessor(4096, 2, 2);

    const lBuf = new Uint8Array(offAnlLeft.frequencyBinCount);
    const rBuf = new Uint8Array(offAnlRight.frequencyBinCount);
    let maxEnergy = 0;
    // Evaluate every band in the active profile so the fit covers the actual draw pass.
    const { topBands, bottomBands } = BAND_PROFILES[activeBandMode];
    const allBands = topBands.concat(bottomBands);

    offProcessor.onaudioprocess = () => {
      offAnlLeft.getByteFrequencyData(lBuf);
      offAnlRight.getByteFrequencyData(rBuf);
      for (let i = 0; i < allBands.length; i += 1) {
        const band = allBands[i];
        const l = getBandEnergy(lBuf, band.minHz, band.maxHz, sampleRate);
        const r = getBandEnergy(rBuf, band.minHz, band.maxHz, sampleRate);
        const energy = (l + r) / 2;
        if (energy > maxEnergy) maxEnergy = energy;
      }
    };

    // Graph: source → splitter → analysers → merger → processor → destination.
    offSource.connect(offSplitter);
    offSplitter.connect(offAnlLeft, 0);
    offSplitter.connect(offAnlRight, 1);
    offAnlLeft.connect(offMerger, 0, 0);
    offAnlRight.connect(offMerger, 0, 1);
    offMerger.connect(offProcessor);
    offProcessor.connect(offlineCtx.destination);
    offSource.start(0);
    await offlineCtx.startRendering();

    if (generation !== analysisGeneration || !isAutoFitHeight) return false;

    // If onaudioprocess never fired (rare in some environments), fall back to worst-case
    // scale: energy=1.0 is the absolute ceiling, so the scale still guarantees no overflow.
    const effectiveMax = maxEnergy > DIVISION_EPSILON ? maxEnergy : 1.0;
    // Place the peak wave at 95% of the half-height boundary (5% clear headroom).
    const fittedScale = 0.95 / (effectiveMax * PEAK_HEIGHT_FACTOR);
    const clampedScale = Math.max(
      Number(waveHeightScaleSlider.min),
      Math.min(Number(waveHeightScaleSlider.max), fittedScale),
    );
    // Store the base fitted scale; apply with fit scale ratio on top.
    // Slider is locked so no 'input' event fires — sync field directly.
    autoFitBaseScale = clampedScale;
    const effectiveScale = Math.max(
      Number(waveHeightScaleSlider.min),
      Math.min(Number(waveHeightScaleSlider.max), autoFitBaseScale * fitScaleRatio),
    );
    waveHeightScaleSlider.value = effectiveScale;
    waveHeightScaleValueEl.value = effectiveScale.toFixed(2);
    waveHeightScale = effectiveScale;
    return true;
  } catch (error) {
    // Keep the app interactive if analysis fails for any reason.
    console.error('Wave height auto-fit analysis failed:', error);
    return false;
  } finally {
    if (generation === analysisGeneration && isAutoFitHeight) {
      setAutoFitHeightCalibrating(false);
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
  analyserLeft.smoothingTimeConstant = Number(analyserSmoothingSlider.value);
  analyserRight.smoothingTimeConstant = Number(analyserSmoothingSlider.value);
  const fixedMinDb = ANALYSER_FIXED_MAX_DB - ANALYSER_DYNAMIC_RANGE_DB;
  analyserLeft.minDecibels = fixedMinDb;
  analyserRight.minDecibels = fixedMinDb;
  analyserLeft.maxDecibels = ANALYSER_FIXED_MAX_DB;
  analyserRight.maxDecibels = ANALYSER_FIXED_MAX_DB;
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

// Pan Flex is stored as percent delta from unity width: 0% => 1.00, -50% => 0.50, +100% => 2.00.
function panFlexPercentToWidth(percent) {
  return Math.max(0.5, Math.min(2.0, 1 + percent / 100));
}

// Base pan uses absolute L-R level difference scaled by Pan Flex-derived width.
// For strongly one-sided bands, blend toward relative pan (R-L)/(R+L)
// so hard-panned content stays visually lateral even at low level.
function toPanPoint(left, right) {
  const energySum = left + right;
  if (energySum < 0.015) return 0;
  const delta = right - left;
  const flexPercent = Number(panFlexSlider.value);
  const width = Math.max(DIVISION_EPSILON, panFlexPercentToWidth(flexPercent));
  const absolutePan = Math.max(-100, Math.min(100, delta * width * 100));
  const relativePan = Math.max(-100, Math.min(100, (delta / Math.max(energySum, DIVISION_EPSILON)) * 100));
  const channelDominance = Math.abs(delta) / Math.max(energySum, DIVISION_EPSILON);
  const dominanceWindow = PAN_DOMINANCE_BLEND_END - PAN_DOMINANCE_BLEND_START;
  const dominanceBlend = Math.max(
    0,
    Math.min(1, (channelDominance - PAN_DOMINANCE_BLEND_START) / Math.max(dominanceWindow, DIVISION_EPSILON)),
  );
  // Keep subtle content readable via absolute pan, while one-sided bands retain hard-pan placement.
  const blend = panDominanceRatio * dominanceBlend;
  const panPoint = absolutePan + (relativePan - absolutePan) * blend;
  return Math.abs(panPoint) < PAN_CENTER_DEADBAND_POINTS ? 0 : panPoint;
}

function amplitudeToHeightFactor(energy) {
  // Linear amplitude mapping avoids bass/treble height distortion from non-linear display curves.
  return Math.max(0, Math.min(1, energy)) * PEAK_HEIGHT_FACTOR;
}

// Binaural apparent-source-width model (ASW):
// For a lateral point source, IACC ≈ cos(θ), so perceived source width grows as (1 - cos(θ)).
// Pan 0–100 maps to azimuth 0°–90°: θ = absPan × π/2 (absPan = |panPoint|/100, range 0–1).
// Sub-integer pan values (e.g. 50.3) resolve naturally through the cosine — no lookup needed.
//   pan  0 → flex 0.000   pan 20 → flex 0.015
//   pan 50 → flex 0.053   pan 70 → flex 0.098   pan 100 → flex 0.180
function computeBinauralPanFlex(absPan) {
  return BINAURAL_PAN_MAX_FLEX * (1 - Math.cos(absPan * Math.PI / 2));
}

// Compressed period-ratio width: widthFactor = W0 × (1/1000)^(α × logT).
// Anchors: 20 Hz → 0.100, ~630 Hz → 0.063, ~2 kHz → 0.040, 20 kHz → 0.025.
// The curve follows the compressed acoustic period of each frequency band,
// so bass waveforms appear proportionally wider than treble, mirroring cycle length.
function frequencyToWidthFactor(logT) {
  return WIDTH_W0 * Math.pow(1000, -WIDTH_COMPRESSION * logT);
}

function drawWaveform(centerX, centerY, radius, dir, rgb, lineAlpha, lineWidth, energy, logT, panPoint) {
  const heightFactor = Math.max(0, Math.min(PEAK_HEIGHT_FACTOR, amplitudeToHeightFactor(energy)));
  const height = radius * heightFactor * waveHeightScale;

  const widthBase = frequencyToWidthFactor(logT);
  const clampedEnergy = Math.max(0, Math.min(1, energy));
  const levelBoost =
    widthBase * widthLevelBoostRatio * Math.pow(clampedEnergy, WIDTH_LOUDNESS_EXPONENT);
  let halfWidth = radius * (widthBase + levelBoost) * waveWidthScale;
  // Off: no pan inflation — width driven purely by pitch and amplitude.
  // On: (1-cosθ) binaural spread bonus; zero at center, max lateral wrap at ±100.
  if (isBinauralPanDisplayActive) {
    const absPan = Math.abs(panPoint) / 100;
    halfWidth *= 1 + computeBinauralPanFlex(absPan);
  }

  const leftLimit = centerX - radius - PAN_EDGE_BLEED_PX;
  const rightLimit = centerX + radius + PAN_EDGE_BLEED_PX;
  const panX = centerX + (panPoint / 100) * radius;
  const minX = Math.max(leftLimit, panX - halfWidth);
  const maxX = Math.min(rightLimit, panX + halfWidth);
  const width = maxX - minX;
  if (width <= DIVISION_EPSILON) return;
  const peakX = minX + width * 0.5;

  ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${lineAlpha})`;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(minX, centerY);
  // Control at 2× height so the curve's actual midpoint peak lands at height.
  ctx.quadraticCurveTo(peakX, centerY + dir * height * 2, maxX, centerY);
  ctx.stroke();
}

function drawPanEdgeFade(centerX, centerY, radius) {
  if (PAN_EDGE_BLEED_PX <= 0 || panEdgeFadeIntensity <= 0) return;
  const topY = centerY - radius;
  const height = radius * 2;
  const leftCoreX = centerX - radius;
  const rightCoreX = centerX + radius;
  const leftBleedX = leftCoreX - PAN_EDGE_BLEED_PX;
  const rightBleedX = rightCoreX + PAN_EDGE_BLEED_PX;
  // Inner stop opacity = intensity: 1.0 = immediately opaque at ±100 (hard cut), <1 = gradient ramp.
  const innerStop = `rgba(22, 29, 37, ${panEdgeFadeIntensity})`;

  // Fade only in the bleed gutters so +/-100 remains the localization endpoint.
  const leftFade = ctx.createLinearGradient(leftCoreX, 0, leftBleedX, 0);
  leftFade.addColorStop(0, innerStop);
  leftFade.addColorStop(1, EDGE_FADE_SOLID);
  ctx.fillStyle = leftFade;
  ctx.fillRect(leftBleedX, topY, PAN_EDGE_BLEED_PX, height);

  const rightFade = ctx.createLinearGradient(rightCoreX, 0, rightBleedX, 0);
  rightFade.addColorStop(0, innerStop);
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

  // Numeric labels at major notches — skip 0 (origin handled by the shared coordinate pair label).
  ctx.fillStyle = 'rgba(110, 110, 110, 0.75)';
  ctx.font = '9px monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  for (let panPoint = -100; panPoint <= 100; panPoint += 20) {
    if (panPoint === 0) continue;
    const x = centerX + (panPoint / 100) * radius;
    ctx.fillText(panPoint.toString(), x, centerY + PAN_DISPLAY_NOTCH_HALF_HEIGHT + 2);
  }

  // When the dB line is hidden, render pan-only origin labels at the same two positions
  // the dB line uses, mirroring the dB-only fallback labels that appear when pan is hidden.
  if (!isDbDisplayLineVisible) {
    ctx.fillStyle = 'rgba(110, 110, 110, 0.75)';
    ctx.font = '9px monospace';
    // Center value '(0)' — sits right of the 'p' axis label, both below the pan line.
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('(0)', centerX + 5, centerY + 5);
    // Axis label 'p' — mirrors 'db' in dB-only mode.
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    ctx.fillText('p', centerX - 5, centerY + 5);
  }
}

function drawDbDisplayLine(centerX, centerY, radius) {
  const maxDb = ANALYSER_FIXED_MAX_DB;
  const minDb = ANALYSER_FIXED_MAX_DB - ANALYSER_DYNAMIC_RANGE_DB;
  const dynamicRange = maxDb - minDb;

  ctx.strokeStyle = DB_DISPLAY_LINE_COLOR;
  ctx.lineWidth = DB_DISPLAY_LINE_WIDTH;
  ctx.beginPath();
  // Vertical axis: center = silence (minDb), edges = full scale (maxDb).
  ctx.moveTo(centerX, centerY - radius);
  ctx.lineTo(centerX, centerY + radius);

  for (let i = -100; i <= 100; i += 1) {
    const absI = Math.abs(i);
    const isHighNotch =
      absI === 0 ||
      absI === 20 ||
      absI === 40 ||
      absI === 60 ||
      absI === 80 ||
      absI === 100;
    const notchHalfWidth = isHighNotch
      ? DB_DISPLAY_NOTCH_HALF_WIDTH
      : DB_DISPLAY_NOTCH_HALF_WIDTH * DB_DISPLAY_MINOR_NOTCH_SCALE;
    const y = centerY + (i / 100) * radius;
    ctx.moveTo(centerX - notchHalfWidth, y);
    ctx.lineTo(centerX + notchHalfWidth, y);
  }
  ctx.stroke();

  // Numeric labels at each major notch — skip i=0; origin is shown as the shared coordinate pair.
  ctx.fillStyle = 'rgba(110, 110, 110, 0.75)';
  ctx.font = '9px monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (let i = -100; i <= 100; i += 20) {
    if (i === 0) continue;
    const energy = (Math.abs(i) / 100) / (PEAK_HEIGHT_FACTOR * waveHeightScale);
    const db = minDb + Math.min(1, energy) * dynamicRange;
    const y = centerY + (i / 100) * radius;
    ctx.fillText(Math.round(db).toString(), centerX + DB_DISPLAY_NOTCH_HALF_WIDTH + 3, y);
  }

  // Origin label: top-right quadrant corner.
  ctx.fillStyle = 'rgba(110, 110, 110, 0.75)';
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  if (isPanDisplayLineVisible) {
    ctx.textBaseline = 'bottom';
    ctx.fillText('(0, -100)', centerX + 3, centerY - 3);
  } else {
    // dB-only: numeric value sits right of the 'db' axis label, both below the pan line position.
    ctx.textBaseline = 'top';
    ctx.fillText('(' + Math.round(minDb).toString() + ')', centerX + 5, centerY + 5);
  }

  // Axis label: mirrored position — top-right corner of the bottom-left quadrant.
  ctx.fillStyle = 'rgba(110, 110, 110, 0.75)';
  ctx.font = '9px monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'right';
  ctx.fillText(isPanDisplayLineVisible ? '(p, db)' : 'db', centerX - 5, centerY + 5);
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
  // Keep visual continuity: slider value 0.70 reproduces the prior fixed 1.25px line width.
  const lineWidth =
    (Math.max(0.01, Number(lineThicknessSlider.value)) / BASE_LINE_THICKNESS_CONTROL) *
    BASE_LINE_WIDTH_PX;
  const { topBands, bottomBands, splitIndex, panSmoothed } = activeBandProfile;
  const clipLeft = cx - halfSize - PAN_EDGE_BLEED_PX;
  const clipWidth = squareSize + PAN_EDGE_BLEED_PX * 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(clipLeft, cy - halfSize - DB_VERT_BLEED_PX, clipWidth, squareSize + DB_VERT_BLEED_PX * 2);
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
    const displayEnergy = energy;
    const globalIdx = splitIndex + i;
    const rawPan = toPanPoint(l, r);
    const panDelta = Math.abs(rawPan - panSmoothed[globalIdx]);
    // Center Trust Threshold tooltip: Minimum band energy required to accept a center pan reading;
    // lower values trust quiet center more, higher values hold prior pan longer.
    // Hold prior pan whenever low-energy centre readings are ambiguous.
    const centerIsTrusted = rawPan !== 0 || l + r > panHoldFloor;
    // Pan Lock: 0 = render every trusted pan calculation, 1 = freeze pan regardless of calculation.
    // Linear mapping uses full pan-delta span (0..200) between these endpoints.
    const panIsLocked = panLockRatio >= 1 - DIVISION_EPSILON;
    const minDeltaForUnlock = panLockRatio * 200;
    const passesPanLock = !panIsLocked && panDelta >= minDeltaForUnlock;
    if (centerIsTrusted && passesPanLock) {
      panSmoothed[globalIdx] = rawPan;
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
    const displayEnergy = energy;
    const rawPan = toPanPoint(l, r);
    const panDelta = Math.abs(rawPan - panSmoothed[i]);
    // Hold prior pan whenever low-energy centre readings are ambiguous.
    const centerIsTrusted = rawPan !== 0 || l + r > panHoldFloor;
    const panIsLocked = panLockRatio >= 1 - DIVISION_EPSILON;
    const minDeltaForUnlock = panLockRatio * 200;
    const passesPanLock = !panIsLocked && panDelta >= minDeltaForUnlock;
    if (centerIsTrusted && passesPanLock) {
      panSmoothed[i] = rawPan;
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
    );
  }
  ctx.restore();

  drawPanEdgeFade(cx, cy, halfSize);

  if (isPanDisplayLineVisible) {
    drawPanDisplayLine(cx, cy, halfSize);
  }

  if (isDbDisplayLineVisible) {
    drawDbDisplayLine(cx, cy, halfSize);
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
  ensureAudioGraph();
  if (audioContext.state === 'suspended') await audioContext.resume();
  for (const key of BAND_MODE_KEYS) BAND_PROFILES[key].panSmoothed.fill(0);

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
  if (isAutoFitHeight) analyzeAndAutoFitWaveHeight(file);
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

async function toggleAutoFitHeight() {
  isAutoFitHeight = !isAutoFitHeight;

  if (!isAutoFitHeight) {
    analysisGeneration += 1;
    autoFitBaseScale = 0;
    setAutoFitHeightCalibrating(false);
    updateWaveHeightAutoFitToggleState();
    drawVisualizer();
    return;
  }

  if (!currentFile) {
    updateWaveHeightAutoFitToggleState();
    drawVisualizer();
    return;
  }

  const shouldResumePlaybackAfterFit = !audio.paused;
  if (shouldResumePlaybackAfterFit) {
    audio.pause();
    playPauseBtn.textContent = 'Play';
    stopAnimation();
  }

  const didApplyFit = await analyzeAndAutoFitWaveHeight(currentFile);

  if (shouldResumePlaybackAfterFit && didApplyFit && isAutoFitHeight) {
    ensureAudioGraph();
    if (audioContext.state === 'suspended') await audioContext.resume();
    try {
      await audio.play();
      playPauseBtn.textContent = 'Pause';
      startAnimation();
    } catch (error) {
      console.error('Failed to resume playback after wave-height fit:', error);
      playPauseBtn.textContent = 'Play';
      stopAnimation();
    }
  }

  updateWaveHeightAutoFitToggleState();
  drawVisualizer();
}

function updatePanLineToggleState() {
  togglePanLineBtn.textContent = isPanDisplayLineVisible ? 'Pan Line: On' : 'Pan Line: Off';
  togglePanLineBtn.classList.toggle('is-active', isPanDisplayLineVisible);
  togglePanLineBtn.setAttribute('aria-pressed', isPanDisplayLineVisible ? 'true' : 'false');
}

function updateDbLineToggleState() {
  toggleDbLineBtn.textContent = isDbDisplayLineVisible ? 'dB Line: On' : 'dB Line: Off';
  toggleDbLineBtn.classList.toggle('is-active', isDbDisplayLineVisible);
  toggleDbLineBtn.setAttribute('aria-pressed', isDbDisplayLineVisible ? 'true' : 'false');
}

function updateBinauralPanToggleState() {
  binauralPanBtn.textContent = isBinauralPanDisplayActive ? 'Binaural Pan: On' : 'Binaural Pan: Off';
  binauralPanBtn.classList.toggle('is-active', isBinauralPanDisplayActive);
  binauralPanBtn.setAttribute('aria-pressed', isBinauralPanDisplayActive ? 'true' : 'false');
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

// ─────────────────────────────────────────────────────────────────────────────
// FREQUENCY ORGANIZER LINE
// Builds and updates the right-panel organizer: one notch per band, ordered
// top-to-bottom by pitch (high → dividing pitch → low), mirroring the visual
// z-order of the canvas (center = front, extremes = back).
// ─────────────────────────────────────────────────────────────────────────────

// Format a Hz value compactly: "440Hz", "1.5kHz", "10kHz".
function formatBandHz(hz) {
  if (hz >= 10000) return Math.round(hz / 1000) + 'kHz';
  if (hz >= 1000) return (hz / 1000).toFixed(1) + 'kHz';
  return Math.round(hz) + 'Hz';
}

// Build one color-notch row for a regular band.
function createNotchRow(band) {
  const tooltip = formatBandHz(band.hz) +
    ' (' + Math.round(band.minHz) + '\u2013' + Math.round(band.maxHz) + 'Hz)';
  const row = document.createElement('div');
  row.className = 'fo-notch-row';
  row.title = tooltip;

  const tick = document.createElement('div');
  tick.className = 'fo-tick';

  const label = document.createElement('span');
  label.className = 'fo-label';
  label.textContent = formatBandHz(band.hz);

  const swatch = document.createElement('div');
  swatch.className = 'fo-swatch';
  swatch.style.background =
    'rgb(' + band.rgb.r + ',' + band.rgb.g + ',' + band.rgb.b + ')';

  row.appendChild(tick);
  row.appendChild(label);
  row.appendChild(swatch);
  return row;
}

// Build the center divider row: bigger label in parens, no color swatch.
function createDividerRow(band) {
  const row = document.createElement('div');
  row.className = 'fo-notch-row fo-divider';
  row.title = 'Dividing pitch: ' + formatBandHz(band.hz);

  const tick = document.createElement('div');
  tick.className = 'fo-tick';

  const label = document.createElement('span');
  label.className = 'fo-label';
  label.textContent = '(' + formatBandHz(band.hz) + ')';

  row.appendChild(tick);
  row.appendChild(label);
  return row;
}

// Rebuild the organizer panel to reflect the current activeBandProfile.
// Called once on init and again whenever the band mode changes.
function updateFrequencyOrganizer() {
  // Clear existing notches without innerHTML
  while (foNotches.firstChild) foNotches.removeChild(foNotches.firstChild);

  const { topBands, bottomBands } = activeBandProfile;
  const totalBands = topBands.length + bottomBands.length;

  // Adaptive font size: stays readable from 7 bands down to 99
  const fontSize = Math.max(7, Math.min(13, Math.floor(600 / totalBands)));
  foNotches.style.fontSize = fontSize + 'px';

  // Top half: highest pitch (back) → second-from-center (near front)
  for (let i = topBands.length - 1; i >= 1; i -= 1) {
    foNotches.appendChild(createNotchRow(topBands[i]));
  }

  // Center: the dividing pitch (topBands[0] === bands[splitIndex])
  foNotches.appendChild(createDividerRow(topBands[0]));

  // Bottom half: highest-bottom pitch (near front) → lowest pitch (back)
  for (let i = bottomBands.length - 1; i >= 0; i -= 1) {
    foNotches.appendChild(createNotchRow(bottomBands[i]));
  }
}

function setBandMode(nextMode) {
  if (!BAND_MODE_KEYS.includes(nextMode) || nextMode === activeBandMode) return;
  activeBandMode = nextMode;
  activeBandProfile = BAND_PROFILES[nextMode];
  updateBandModeButtons();
  updateFrequencyOrganizer();
  drawVisualizer();
}

playPauseBtn.addEventListener('click', () => togglePlayPause());
togglePanLineBtn.addEventListener('click', () => {
  isPanDisplayLineVisible = !isPanDisplayLineVisible;
  updatePanLineToggleState();
  drawVisualizer();
});
toggleDbLineBtn.addEventListener('click', () => {
  isDbDisplayLineVisible = !isDbDisplayLineVisible;
  updateDbLineToggleState();
  drawVisualizer();
});
binauralPanBtn.addEventListener('click', () => {
  isBinauralPanDisplayActive = !isBinauralPanDisplayActive;
  updateBinauralPanToggleState();
  drawVisualizer();
});
waveHeightAutoFitBtn.addEventListener('click', () => {
  toggleAutoFitHeight();
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

panFlexSlider.addEventListener('input', () => {
  panFlexValueEl.value = Number(panFlexSlider.value).toFixed(0);
});

panFlexValueEl.addEventListener('focus', () => {
  panFlexValueEl.select();
});

panFlexValueEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') panFlexValueEl.blur();
});

panFlexValueEl.addEventListener('change', () => {
  const raw = parseFloat(panFlexValueEl.value);
  const clamped = isNaN(raw)
    ? Number(panFlexSlider.value)
    : Math.max(-50, Math.min(100, raw));
  panFlexValueEl.value = clamped.toFixed(0);
  panFlexSlider.value = clamped;
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

makeSliderPair(panLockSlider, panLockValueEl, 0, 1, 2);
makeSliderPair(lineAlphaSlider, lineAlphaValueEl, 0, 1, 2);
makeSliderPair(lineThicknessSlider, lineThicknessValueEl, 0.01, 1.0, 2);
makeSliderPair(widthBoostSlider, widthBoostValueEl, 0, 1.0, 2);
makeSliderPair(waveWidthScaleSlider, waveWidthScaleValueEl, 0.25, 10.0, 2);
makeSliderPair(waveHeightScaleSlider, waveHeightScaleValueEl, 0.25, 10.0, 2);
makeSliderPair(waveHeightFitScaleSlider, waveHeightFitScaleValueEl, 0.01, 1.0, 2);
makeSliderPair(analyserSmoothingSlider, analyserSmoothingValueEl, 0, 1.0, 2);
makeSliderPair(panEdgeFadeSlider, panEdgeFadeValueEl, 0, 1.0, 2);

function setPanLockRatio(nextRatio) {
  const clamped = Math.max(0, Math.min(1, nextRatio));
  if (Math.abs(panLockRatio - clamped) < DIVISION_EPSILON) return;
  panLockRatio = clamped;
  drawVisualizer();
}

panLockSlider.addEventListener('input', () => {
  setPanLockRatio(Number(panLockSlider.value));
});

panLockValueEl.addEventListener('change', () => {
  // makeSliderPair clamps the value first, so read from slider for canonical state.
  setPanLockRatio(Number(panLockSlider.value));
});

function setWidthLevelBoostRatio(nextRatio) {
  const clamped = Math.max(0, Math.min(1, nextRatio));
  if (Math.abs(widthLevelBoostRatio - clamped) < DIVISION_EPSILON) return;
  widthLevelBoostRatio = clamped;
  drawVisualizer();
}

widthBoostSlider.addEventListener('input', () => {
  setWidthLevelBoostRatio(Number(widthBoostSlider.value));
});

widthBoostValueEl.addEventListener('change', () => {
  // makeSliderPair clamps the value first, so read from slider for canonical state.
  setWidthLevelBoostRatio(Number(widthBoostSlider.value));
});

function setWaveWidthScale(nextScale) {
  const clamped = Math.max(0.25, Math.min(10.0, nextScale));
  if (Math.abs(waveWidthScale - clamped) < DIVISION_EPSILON) return;
  waveWidthScale = clamped;
  drawVisualizer();
}

waveWidthScaleSlider.addEventListener('input', () => {
  setWaveWidthScale(Number(waveWidthScaleSlider.value));
});

waveWidthScaleValueEl.addEventListener('change', () => {
  // makeSliderPair clamps the value first, so read from slider for canonical state.
  setWaveWidthScale(Number(waveWidthScaleSlider.value));
});

function setWaveHeightScale(nextScale) {
  const clamped = Math.max(0.25, Math.min(10.0, nextScale));
  if (Math.abs(waveHeightScale - clamped) < DIVISION_EPSILON) return;
  waveHeightScale = clamped;
  drawVisualizer();
}

waveHeightScaleSlider.addEventListener('input', () => {
  setWaveHeightScale(Number(waveHeightScaleSlider.value));
});

waveHeightScaleValueEl.addEventListener('change', () => {
  // makeSliderPair clamps the value first, so read from slider for canonical state.
  setWaveHeightScale(Number(waveHeightScaleSlider.value));
});

waveHeightFitScaleSlider.addEventListener('input', () => {
  fitScaleRatio = Number(waveHeightFitScaleSlider.value);
  applyAutoFitScale();
});

waveHeightFitScaleValueEl.addEventListener('change', () => {
  // makeSliderPair clamps the value first, so read from slider for canonical state.
  fitScaleRatio = Number(waveHeightFitScaleSlider.value);
  applyAutoFitScale();
});

analyserSmoothingSlider.addEventListener('input', () => {
  const smoothing = Number(analyserSmoothingSlider.value);
  if (analyserLeft) analyserLeft.smoothingTimeConstant = smoothing;
  if (analyserRight) analyserRight.smoothingTimeConstant = smoothing;
});

analyserSmoothingValueEl.addEventListener('change', () => {
  // makeSliderPair clamps the value first, so read from slider for canonical state.
  const smoothing = Number(analyserSmoothingSlider.value);
  if (analyserLeft) analyserLeft.smoothingTimeConstant = smoothing;
  if (analyserRight) analyserRight.smoothingTimeConstant = smoothing;
});

panEdgeFadeSlider.addEventListener('input', () => {
  panEdgeFadeIntensity = Number(panEdgeFadeSlider.value);
  drawVisualizer();
});

panEdgeFadeValueEl.addEventListener('change', () => {
  // makeSliderPair clamps the value first, so read from slider for canonical state.
  panEdgeFadeIntensity = Number(panEdgeFadeSlider.value);
  drawVisualizer();
});

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
updateDbLineToggleState();
updateWaveHeightAutoFitToggleState();
updateBandModeButtons();
updateFrequencyOrganizer();
resizeCanvas();
drawVisualizer();

(function restoreFileOnLoad() {
  const file = fileInput.files?.[0];
  if (file && isMp3File(file)) {
    currentFile = file;
    ensureAudioGraph();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;
    audio.currentTime = 0;
    audio.pause();
    playPauseBtn.disabled = false;
    playPauseBtn.textContent = 'Play';
    if (isAutoFitHeight) analyzeAndAutoFitWaveHeight(file);
  } else {
    currentFile = undefined;
    fileInput.value = '';
  }
}());