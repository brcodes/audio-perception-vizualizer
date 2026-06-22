const canvas = document.getElementById('vizCanvas');
const vizStage = document.getElementById('vizStage');
const fileInput = document.getElementById('fileInput');
const selectedFileText = document.getElementById('selectedFileText');
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
const frequencyOrganizer = document.getElementById('frequencyOrganizer');
const toggleFoOrganizerBtn = document.getElementById('toggleFoOrganizerBtn');
const foNotches = document.getElementById('foNotches');
const foCategoryTree = document.getElementById('foCategoryTree');
const foMainTree = document.getElementById('foMainTree');
const foLineContainer = document.querySelector('.fo-line-container');
const allButtons = Array.from(document.querySelectorAll('button'));
const waveHeightScaleNudgeButtons = Array.from(document.querySelectorAll('.nudge-btn[data-target="waveHeightScaleSlider"]'));
const waveHeightFitScaleNudgeButtons = Array.from(document.querySelectorAll('.nudge-btn[data-target="waveHeightFitScaleSlider"]'));
const ctx = canvas.getContext('2d');
const foTooltipEl = document.createElement('div');
foTooltipEl.className = 'fo-tooltip';
const foTooltipMainLineEl = document.createElement('div');
foTooltipMainLineEl.className = 'fo-tooltip-line';
const foTooltipRangeLineEl = document.createElement('div');
foTooltipRangeLineEl.className = 'fo-tooltip-range-line';
const foTooltipSwatchListEl = document.createElement('div');
foTooltipSwatchListEl.className = 'fo-tooltip-swatch-list';
foTooltipEl.appendChild(foTooltipMainLineEl);
foTooltipEl.appendChild(foTooltipRangeLineEl);
foTooltipEl.appendChild(foTooltipSwatchListEl);
document.body.appendChild(foTooltipEl);

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
// 0 = instantaneous (jittery), 1 = fully frozen; we keep the previous 0.80 smoothing default
// and expose Render Speed as its inverse (speed = 1 - smoothing).
const DEFAULT_ANALYSER_SMOOTHING = 0.8;
// 0 = no masking (post-edge content fully visible); 1 = hard cutoff right at the ±100 edge.
// Intermediate values start the fade at that opacity at ±100 and ramp to fully opaque at the canvas edge.
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
const COMPACT_ORGANIZER_MAX_BANDS = 25;
const FO_TOOLTIP_OFFSET_X = 14;
const FO_TOOLTIP_OFFSET_Y = 18;
const FO_LABEL_TO_SWATCH_GAP_PX = 15;
const FO_PITCH_CATEGORIES = Object.freeze([
  { minHz: 20, maxHz: 60, label: 'Sub-bass (20-60Hz)' },
  { minHz: 60, maxHz: 250, label: 'Bass (60-250Hz)' },
  { minHz: 250, maxHz: 500, label: 'Low midrange (250-500Hz)' },
  { minHz: 500, maxHz: 2000, label: 'Midrange (500Hz-2kHz)' },
  { minHz: 2000, maxHz: 4000, label: 'Upper midrange (2-4kHz)' },
  { minHz: 4000, maxHz: 6000, label: 'Presence (4-6kHz)' },
  { minHz: 6000, maxHz: 20000, label: 'Brilliance/Treble (6-20kHz)' },
]);
const FO_CATEGORY_SPINE_X = 8;
const FO_MAIN_SPINE_X = 4;

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
  for (let i = 0; i < bands.length; i += 1) {
    const { r, g, b } = bands[i].rgb;
    bands[i].strokeColor = `rgb(${r}, ${g}, ${b})`;
  }
  const splitIndex = Math.floor(bands.length / 2);
  const topBands = bands.slice(splitIndex);
  const bottomBands = bands.slice(0, splitIndex);
  return {
    splitIndex,
    bottomBands,
    topBands,
    allBands: topBands.concat(bottomBands),
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
let isFrequencyOrganizerVisible = true;
let isAutoFitHeight = true;
let isAutoFitHeightCalibrating = false;
let autoFitBaseScale = 0;   // fittedScale from analysis; 0 until first run
let fitScaleRatio = 1.0;    // fraction of base fit [0.01, 1.0]; persists across toggles
let widthLevelBoostRatio = DEFAULT_WIDTH_LEVEL_BOOST_RATIO;
let waveWidthScale = DEFAULT_WAVE_WIDTH_SCALE;
let waveHeightScale = DEFAULT_WAVE_HEIGHT_SCALE;
let lineAlpha = Number(lineAlphaSlider.value);
let lineThicknessControl = Math.max(0.01, Number(lineThicknessSlider.value));
let panDominanceRatio = DEFAULT_PAN_DOMINANCE_RATIO;
const panHoldFloor = DEFAULT_PAN_HOLD_FLOOR;
let panLockRatio = Math.max(
  0,
  Math.min(1, Number.isFinite(Number(panLockSlider.value))
    ? Number(panLockSlider.value)
    : DEFAULT_PAN_LOCK_RATIO),
);
let currentFile;
let activeFrequencyTooltipRow = null;
let activeCategoryTooltipLabel = null;
let pinnedCategoryIndex = -1;
let analysisGeneration = 0;
let panFlexWidth = 1;

const activeBandRangeCache = {
  mode: -1,
  sampleRate: 0,
  binCount: 0,
  topStarts: new Uint16Array(0),
  topEnds: new Uint16Array(0),
  bottomStarts: new Uint16Array(0),
  bottomEnds: new Uint16Array(0),
};

const panEdgeFadeCache = {
  canvasWidth: 0,
  leftCoreX: 0,
  rightCoreX: 0,
  intensity: -1,
  leftGradient: null,
  rightGradient: null,
};

function invalidateBandRangeCache() {
  activeBandRangeCache.mode = -1;
}

function revokeObjectUrlIfNeeded() {
  if (!objectUrl) return;
  URL.revokeObjectURL(objectUrl);
  objectUrl = undefined;
}

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function renderSpeedToSmoothing(renderSpeed) {
  const clampedSpeed = Math.max(0, Math.min(1, renderSpeed));
  return 1 - clampedSpeed;
}

function getAnalyserSmoothingFromControl() {
  return renderSpeedToSmoothing(Number(analyserSmoothingSlider.value));
}

function syncRenderSpeedControlFromSmoothing(smoothing) {
  const speed = renderSpeedToSmoothing(smoothing);
  analyserSmoothingSlider.value = speed.toFixed(2);
  analyserSmoothingValueEl.value = speed.toFixed(2);
}

function setButtonsLockedWhileFitting(isLocked) {
  for (let i = 0; i < allButtons.length; i += 1) {
    const button = allButtons[i];
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
  for (let i = 0; i < waveHeightScaleNudgeButtons.length; i += 1) {
    waveHeightScaleNudgeButtons[i].disabled = isActive;
  }
  waveHeightFitScaleLabel.classList.toggle('ctrl-label--locked', !isActive);
  waveHeightFitScaleSlider.disabled = !isActive;
  waveHeightFitScaleValueEl.disabled = !isActive;
  for (let i = 0; i < waveHeightFitScaleNudgeButtons.length; i += 1) {
    waveHeightFitScaleNudgeButtons[i].disabled = !isActive;
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
    const offSmoothing = getAnalyserSmoothingFromControl();
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
    const allBands = BAND_PROFILES[activeBandMode].allBands;
    const offBandStarts = new Uint16Array(allBands.length);
    const offBandEnds = new Uint16Array(allBands.length);
    for (let i = 0; i < allBands.length; i += 1) {
      offBandStarts[i] = hzToIndex(allBands[i].minHz, sampleRate, lBuf.length - 1);
      offBandEnds[i] = hzToIndex(allBands[i].maxHz, sampleRate, lBuf.length - 1);
    }

    offProcessor.onaudioprocess = () => {
      offAnlLeft.getByteFrequencyData(lBuf);
      offAnlRight.getByteFrequencyData(rBuf);
      for (let i = 0; i < allBands.length; i += 1) {
        const l = getBandEnergyFromIndices(lBuf, offBandStarts[i], offBandEnds[i]);
        const r = getBandEnergyFromIndices(rBuf, offBandStarts[i], offBandEnds[i]);
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
  const analyserSmoothing = getAnalyserSmoothingFromControl();
  analyserLeft.smoothingTimeConstant = analyserSmoothing;
  analyserRight.smoothingTimeConstant = analyserSmoothing;
  const fixedMinDb = ANALYSER_FIXED_MAX_DB - ANALYSER_DYNAMIC_RANGE_DB;
  analyserLeft.minDecibels = fixedMinDb;
  analyserRight.minDecibels = fixedMinDb;
  analyserLeft.maxDecibels = ANALYSER_FIXED_MAX_DB;
  analyserRight.maxDecibels = ANALYSER_FIXED_MAX_DB;
  leftData = new Uint8Array(analyserLeft.frequencyBinCount);
  rightData = new Uint8Array(analyserRight.frequencyBinCount);
  invalidateBandRangeCache();

  sourceNode.connect(splitter);
  splitter.connect(analyserLeft, 0);
  splitter.connect(analyserRight, 1);
  sourceNode.connect(audioContext.destination);
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const stageWidth = vizStage.clientWidth;
  const stageHeight = vizStage.clientHeight;
  const width = Math.max(1, Math.floor(stageWidth));
  const height = Math.max(1, Math.floor(stageHeight));
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
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
  return getBandEnergyFromIndices(data, start, end);
}

function getBandEnergyFromIndices(data, start, end) {
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

function getActiveBandRanges(sampleRate, binCount) {
  if (
    activeBandRangeCache.mode === activeBandMode &&
    activeBandRangeCache.sampleRate === sampleRate &&
    activeBandRangeCache.binCount === binCount
  ) {
    return activeBandRangeCache;
  }

  const maxIndex = Math.max(0, binCount - 1);
  const { topBands, bottomBands } = activeBandProfile;
  const topStarts = new Uint16Array(topBands.length);
  const topEnds = new Uint16Array(topBands.length);
  const bottomStarts = new Uint16Array(bottomBands.length);
  const bottomEnds = new Uint16Array(bottomBands.length);

  for (let i = 0; i < topBands.length; i += 1) {
    topStarts[i] = hzToIndex(topBands[i].minHz, sampleRate, maxIndex);
    topEnds[i] = hzToIndex(topBands[i].maxHz, sampleRate, maxIndex);
  }

  for (let i = 0; i < bottomBands.length; i += 1) {
    bottomStarts[i] = hzToIndex(bottomBands[i].minHz, sampleRate, maxIndex);
    bottomEnds[i] = hzToIndex(bottomBands[i].maxHz, sampleRate, maxIndex);
  }

  activeBandRangeCache.mode = activeBandMode;
  activeBandRangeCache.sampleRate = sampleRate;
  activeBandRangeCache.binCount = binCount;
  activeBandRangeCache.topStarts = topStarts;
  activeBandRangeCache.topEnds = topEnds;
  activeBandRangeCache.bottomStarts = bottomStarts;
  activeBandRangeCache.bottomEnds = bottomEnds;
  return activeBandRangeCache;
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
  const width = Math.max(DIVISION_EPSILON, panFlexWidth);
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

function drawWaveform(centerX, centerY, radius, dir, strokeColor, lineWidth, energy, logT, panPoint, leftLimit, rightLimit) {
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

  const panX = centerX + (panPoint / 100) * radius;
  const minX = Math.max(leftLimit, panX - halfWidth);
  const maxX = Math.min(rightLimit, panX + halfWidth);
  const width = maxX - minX;
  if (width <= DIVISION_EPSILON) return;
  const peakX = minX + width * 0.5;

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(minX, centerY);
  // Control at 2× height so the curve's actual midpoint peak lands at height.
  ctx.quadraticCurveTo(peakX, centerY + dir * height * 2, maxX, centerY);
  ctx.stroke();
}

function drawPanEdgeFade(centerX, centerY, radius, canvasWidth) {
  if (panEdgeFadeIntensity <= 0) return;
  const topY = centerY - radius;
  const height = radius * 2;
  const leftCoreX = centerX - radius;
  const rightCoreX = centerX + radius;
  const leftBleedWidth = Math.max(0, leftCoreX);
  const rightBleedWidth = Math.max(0, canvasWidth - rightCoreX);
  if (leftBleedWidth <= DIVISION_EPSILON && rightBleedWidth <= DIVISION_EPSILON) return;

  if (
    panEdgeFadeCache.canvasWidth !== canvasWidth ||
    panEdgeFadeCache.leftCoreX !== leftCoreX ||
    panEdgeFadeCache.rightCoreX !== rightCoreX ||
    panEdgeFadeCache.intensity !== panEdgeFadeIntensity
  ) {
    // Inner stop opacity = intensity: 1.0 = immediately opaque at ±100 (hard cut), <1 = gradient ramp.
    const innerStop = `rgba(22, 29, 37, ${panEdgeFadeIntensity})`;
    panEdgeFadeCache.canvasWidth = canvasWidth;
    panEdgeFadeCache.leftCoreX = leftCoreX;
    panEdgeFadeCache.rightCoreX = rightCoreX;
    panEdgeFadeCache.intensity = panEdgeFadeIntensity;

    panEdgeFadeCache.leftGradient = null;
    if (leftBleedWidth > DIVISION_EPSILON) {
      const leftFade = ctx.createLinearGradient(leftCoreX, 0, 0, 0);
      leftFade.addColorStop(0, innerStop);
      leftFade.addColorStop(1, EDGE_FADE_SOLID);
      panEdgeFadeCache.leftGradient = leftFade;
    }

    panEdgeFadeCache.rightGradient = null;
    if (rightBleedWidth > DIVISION_EPSILON) {
      const rightFade = ctx.createLinearGradient(rightCoreX, 0, canvasWidth, 0);
      rightFade.addColorStop(0, innerStop);
      rightFade.addColorStop(1, EDGE_FADE_SOLID);
      panEdgeFadeCache.rightGradient = rightFade;
    }
  }

  // Fade only in the bleed gutters so +/-100 remains the localization endpoint.
  if (leftBleedWidth > DIVISION_EPSILON && panEdgeFadeCache.leftGradient) {
    ctx.fillStyle = panEdgeFadeCache.leftGradient;
    ctx.fillRect(0, topY, leftBleedWidth, height);
  }

  if (rightBleedWidth > DIVISION_EPSILON && panEdgeFadeCache.rightGradient) {
    ctx.fillStyle = panEdgeFadeCache.rightGradient;
    ctx.fillRect(rightCoreX, topY, rightBleedWidth, height);
  }
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
  const ranges = getActiveBandRanges(sampleRate, left.length);
  // Keep visual continuity: slider value 0.70 reproduces the prior fixed 1.25px line width.
  const lineWidth =
    (lineThicknessControl / BASE_LINE_THICKNESS_CONTROL) *
    BASE_LINE_WIDTH_PX;
  const { topBands, bottomBands, splitIndex, panSmoothed } = activeBandProfile;
  const leftDrawLimit = 0;
  const rightDrawLimit = width;
  const panIsLocked = panLockRatio >= 1 - DIVISION_EPSILON;
  const minDeltaForUnlock = panLockRatio * 200;
  // Pinned category filter: null = draw all; otherwise restrict to [minHz, maxHz].
  const pinnedCat = pinnedCategoryIndex >= 0 ? FO_PITCH_CATEGORIES[pinnedCategoryIndex] : null;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, cy - halfSize - DB_VERT_BLEED_PX, width, squareSize + DB_VERT_BLEED_PX * 2);
  ctx.clip();
  ctx.globalAlpha = lineAlpha;

  // Top half: upper bands drawn highest->lowest to keep the center boundary prominent.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, cy - halfSize, width, halfSize);
  ctx.clip();
  for (let i = topBands.length - 1; i >= 0; i -= 1) {
    const band = topBands[i];
    if (pinnedCat && (band.hz < pinnedCat.minHz || band.hz > pinnedCat.maxHz)) continue;
    const l = getBandEnergyFromIndices(left, ranges.topStarts[i], ranges.topEnds[i]);
    const r = getBandEnergyFromIndices(right, ranges.topStarts[i], ranges.topEnds[i]);
    const energy = (l + r) / 2;
    const globalIdx = splitIndex + i;
    const rawPan = toPanPoint(l, r);
    const panDelta = Math.abs(rawPan - panSmoothed[globalIdx]);
    // Center Trust Threshold tooltip: Minimum band energy required to accept a center pan reading;
    // lower values trust quiet center more, higher values hold prior pan longer.
    // Hold prior pan whenever low-energy centre readings are ambiguous.
    const centerIsTrusted = rawPan !== 0 || l + r > panHoldFloor;
    const passesPanLock = !panIsLocked && panDelta >= minDeltaForUnlock;
    if (centerIsTrusted && passesPanLock) {
      panSmoothed[globalIdx] = rawPan;
    }
    drawWaveform(
      cx,
      cy,
      halfSize,
      -1,
      band.strokeColor,
      lineWidth,
      energy,
      band.logT,
      panSmoothed[globalIdx],
      leftDrawLimit,
      rightDrawLimit,
    );
  }
  ctx.restore();

  // Bottom half: lower bands drawn lowest->highest for symmetric layering.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, cy, width, halfSize);
  ctx.clip();
  for (let i = 0; i < bottomBands.length; i += 1) {
    const band = bottomBands[i];
    if (pinnedCat && (band.hz < pinnedCat.minHz || band.hz > pinnedCat.maxHz)) continue;
    const l = getBandEnergyFromIndices(left, ranges.bottomStarts[i], ranges.bottomEnds[i]);
    const r = getBandEnergyFromIndices(right, ranges.bottomStarts[i], ranges.bottomEnds[i]);
    const energy = (l + r) / 2;
    const rawPan = toPanPoint(l, r);
    const panDelta = Math.abs(rawPan - panSmoothed[i]);
    // Hold prior pan whenever low-energy centre readings are ambiguous.
    const centerIsTrusted = rawPan !== 0 || l + r > panHoldFloor;
    const passesPanLock = !panIsLocked && panDelta >= minDeltaForUnlock;
    if (centerIsTrusted && passesPanLock) {
      panSmoothed[i] = rawPan;
    }
    drawWaveform(
      cx,
      cy,
      halfSize,
      1,
      band.strokeColor,
      lineWidth,
      energy,
      band.logT,
      panSmoothed[i],
      leftDrawLimit,
      rightDrawLimit,
    );
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  drawPanEdgeFade(cx, cy, halfSize, width);

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

function updateSelectedFileText(file) {
  selectedFileText.textContent = file ? file.name : '';
}

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    updateSelectedFileText();
    return;
  }
  if (!isMp3File(file)) {
    window.alert('Please upload an MP3 file.');
    fileInput.value = '';
    updateSelectedFileText();
    return;
  }

  currentFile = file;
  updateSelectedFileText(file);
  analysisGeneration += 1;
  ensureAudioGraph();
  if (audioContext.state === 'suspended') await audioContext.resume();
  for (const key of BAND_MODE_KEYS) BAND_PROFILES[key].panSmoothed.fill(0);

  revokeObjectUrlIfNeeded();
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
  toggleDbLineBtn.textContent = isDbDisplayLineVisible ? 'Db Line: On' : 'Db Line: Off';
  toggleDbLineBtn.classList.toggle('is-active', isDbDisplayLineVisible);
  toggleDbLineBtn.setAttribute('aria-pressed', isDbDisplayLineVisible ? 'true' : 'false');
}

function updateBinauralPanToggleState() {
  binauralPanBtn.textContent = isBinauralPanDisplayActive
    ? 'Wave Width Boost (when Panned): Binaural'
    : 'Wave Width Boost (when Panned): None';
  binauralPanBtn.classList.toggle('is-active', isBinauralPanDisplayActive);
  binauralPanBtn.setAttribute('aria-pressed', isBinauralPanDisplayActive ? 'true' : 'false');
}

function updateFrequencyOrganizerToggleState() {
  toggleFoOrganizerBtn.textContent = 'Frequency Organizer';
  toggleFoOrganizerBtn.classList.remove('is-active');
  toggleFoOrganizerBtn.setAttribute('aria-pressed', isFrequencyOrganizerVisible ? 'true' : 'false');
  frequencyOrganizer.classList.toggle('frequency-organizer--hidden', !isFrequencyOrganizerVisible);
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

function positionFrequencyTooltip(clientX, clientY) {
  const tooltipRect = foTooltipEl.getBoundingClientRect();
  const maxLeft = window.innerWidth - tooltipRect.width - 8;
  const maxTop = window.innerHeight - tooltipRect.height - 8;
  const left = Math.min(clientX + FO_TOOLTIP_OFFSET_X, Math.max(8, maxLeft));
  const top = Math.min(clientY + FO_TOOLTIP_OFFSET_Y, Math.max(8, maxTop));
  foTooltipEl.style.left = left + 'px';
  foTooltipEl.style.top = top + 'px';
}

function clearTooltipSwatchLines() {
  while (foTooltipSwatchListEl.firstChild) {
    foTooltipSwatchListEl.removeChild(foTooltipSwatchListEl.firstChild);
  }
}

function appendTooltipSwatchLine(swatchColor, text, showText) {
  const lineEl = document.createElement('div');
  lineEl.className = 'fo-tooltip-swatch-line';
  if (!showText) lineEl.classList.add('fo-tooltip-swatch-line--chip-only');

  const chipEl = document.createElement('span');
  chipEl.className = 'fo-tooltip-swatch-chip';
  chipEl.style.background = swatchColor;
  lineEl.appendChild(chipEl);

  if (showText) {
    const textEl = document.createElement('span');
    textEl.className = 'fo-tooltip-swatch-text';
    textEl.textContent = text;
    lineEl.appendChild(textEl);
  }

  foTooltipSwatchListEl.appendChild(lineEl);
}

function setTooltipContent(title, rangeText, swatches, showSwatchText) {
  foTooltipMainLineEl.textContent = title;
  if (rangeText) {
    foTooltipRangeLineEl.textContent = rangeText;
    foTooltipRangeLineEl.style.display = 'block';
  } else {
    foTooltipRangeLineEl.style.display = 'none';
  }

  clearTooltipSwatchLines();
  if (!swatches.length) {
    foTooltipSwatchListEl.style.display = 'none';
    return;
  }

  foTooltipSwatchListEl.style.display = 'flex';
  for (let i = 0; i < swatches.length; i += 1) {
    appendTooltipSwatchLine(swatches[i].color, swatches[i].text, showSwatchText);
  }
}

function showFrequencyTooltip(text, swatchColor, clientX, clientY) {
  setTooltipContent(
    text,
    '',
    [{ color: swatchColor, text: '' }],
    false,
  );
  foTooltipEl.classList.add('is-visible');
  positionFrequencyTooltip(clientX, clientY);
}

function collectCategoryTooltipSwatches(category) {
  const rows = foNotches.querySelectorAll('.fo-notch-row');
  const swatches = [];

  for (let i = 0; i < rows.length; i += 1) {
    const hz = Number(rows[i].dataset.hz);
    if (!Number.isFinite(hz)) continue;
    if (hz < category.minHz || hz > category.maxHz) continue;

    const swatchEl = rows[i].querySelector('.fo-swatch');
    if (!swatchEl) continue;
    const labelEl = rows[i].querySelector('.fo-label');

    swatches.push({
      hz,
      color: swatchEl.style.background || getComputedStyle(swatchEl).backgroundColor,
      text: labelEl ? labelEl.textContent : formatBandHz(hz),
    });
  }

  return swatches;
}

function showCategoryTooltip(category, clientX, clientY) {
  const swatches = collectCategoryTooltipSwatches(category);
  let actualMinHz = category.minHz;
  let actualMaxHz = category.maxHz;

  if (swatches.length) {
    actualMinHz = swatches[0].hz;
    actualMaxHz = swatches[0].hz;
    for (let i = 1; i < swatches.length; i += 1) {
      actualMinHz = Math.min(actualMinHz, swatches[i].hz);
      actualMaxHz = Math.max(actualMaxHz, swatches[i].hz);
    }
  }

  setTooltipContent(
    category.label,
    'Actual: ' + formatBandHz(actualMinHz) + '-' + formatBandHz(actualMaxHz),
    swatches,
    true,
  );
  foTooltipEl.classList.add('is-visible');
  positionFrequencyTooltip(clientX, clientY);
}

function hideFrequencyTooltip() {
  foTooltipEl.classList.remove('is-visible');
  if (activeFrequencyTooltipRow) {
    activeFrequencyTooltipRow.classList.remove('fo-row--tooltip-active');
    activeFrequencyTooltipRow = null;
  }
  if (activeCategoryTooltipLabel) {
    activeCategoryTooltipLabel.classList.remove('fo-category-label--tooltip-active');
    activeCategoryTooltipLabel = null;
  }
}

function setActiveFrequencyTooltipRow(row) {
  if (activeFrequencyTooltipRow === row) return;
  if (activeFrequencyTooltipRow) {
    activeFrequencyTooltipRow.classList.remove('fo-row--tooltip-active');
  }
  activeFrequencyTooltipRow = row;
  activeFrequencyTooltipRow.classList.add('fo-row--tooltip-active');
}

function setActiveCategoryTooltipLabel(labelEl) {
  if (activeCategoryTooltipLabel === labelEl) return;
  if (activeCategoryTooltipLabel) {
    activeCategoryTooltipLabel.classList.remove('fo-category-label--tooltip-active');
  }
  activeCategoryTooltipLabel = labelEl;
  activeCategoryTooltipLabel.classList.add('fo-category-label--tooltip-active');
}

// Show/hide FO rows to match the current pinnedCategoryIndex.
function applyFoRowVisibility() {
  const rows = foNotches.querySelectorAll('.fo-notch-row');
  const cat = pinnedCategoryIndex >= 0 ? FO_PITCH_CATEGORIES[pinnedCategoryIndex] : null;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (cat) {
      const hz = Number(row.dataset.hz);
      const inRange = Number.isFinite(hz) && hz >= cat.minHz && hz <= cat.maxHz;
      row.classList.toggle('fo-row--inactive', !inRange);
    } else {
      row.classList.remove('fo-row--inactive');
    }
  }
}

// Toggle a persistent click-pinned highlight on a category label and its fork.
function setPinnedCategory(index) {
  const prevLabelEls = foCategoryTree.querySelectorAll('.fo-category-label--pinned');
  const prevForkEls = foCategoryTree.querySelectorAll('.fo-fork--pinned');
  for (let i = 0; i < prevLabelEls.length; i += 1) {
    prevLabelEls[i].classList.remove('fo-category-label--pinned');
  }
  for (let i = 0; i < prevForkEls.length; i += 1) {
    prevForkEls[i].classList.remove('fo-fork--pinned');
  }
  if (pinnedCategoryIndex === index) {
    pinnedCategoryIndex = -1;
    applyFoRowVisibility();
    drawVisualizer();
    return;
  }
  pinnedCategoryIndex = index;
  const pinnedLabel = foCategoryTree.querySelector(
    '.fo-category-label[data-category-index="' + index + '"]',
  );
  if (pinnedLabel) pinnedLabel.classList.add('fo-category-label--pinned');
  const forkEls = foCategoryTree.querySelectorAll('[data-category-fork="' + index + '"]');
  for (let i = 0; i < forkEls.length; i += 1) {
    forkEls[i].classList.add('fo-fork--pinned');
  }
  applyFoRowVisibility();
  drawVisualizer();
}

function bindFrequencyTooltip(row, text, swatchColor) {
  row.setAttribute('aria-label', text);
  row.addEventListener('mouseenter', (event) => {
    setActiveFrequencyTooltipRow(row);
    showFrequencyTooltip(text, swatchColor, event.clientX, event.clientY);
  });
  row.addEventListener('mousemove', (event) => {
    positionFrequencyTooltip(event.clientX, event.clientY);
  });
  row.addEventListener('mouseleave', () => {
    hideFrequencyTooltip();
  });
}

function bindCategoryTooltip(labelEl, category) {
  labelEl.setAttribute('aria-label', category.label);
  labelEl.addEventListener('mouseenter', (event) => {
    setActiveCategoryTooltipLabel(labelEl);
    showCategoryTooltip(category, event.clientX, event.clientY);
  });
  labelEl.addEventListener('mousemove', (event) => {
    positionFrequencyTooltip(event.clientX, event.clientY);
  });
  labelEl.addEventListener('mouseleave', () => {
    hideFrequencyTooltip();
  });
}

function collectMainOrganizerRowCenters() {
  const rows = foNotches.querySelectorAll('.fo-notch-row');
  if (!rows.length) return [];

  const baseRect = foNotches.getBoundingClientRect();
  const centers = [];
  for (let i = 0; i < rows.length; i += 1) {
    const hz = Number(rows[i].dataset.hz);
    if (!Number.isFinite(hz)) continue;
    const rect = rows[i].getBoundingClientRect();
    centers.push({
      hz,
      y: rect.top - baseRect.top + rect.height / 2,
    });
  }
  return centers;
}

function mapClosestInCategoryRowY(targetHz, categoryMinHz, categoryMaxHz, rowCenters) {
  if (!rowCenters.length) return 0;

  const inCategoryRows = [];
  for (let i = 0; i < rowCenters.length; i += 1) {
    const hz = rowCenters[i].hz;
    if (hz >= categoryMinHz && hz <= categoryMaxHz) {
      inCategoryRows.push(rowCenters[i]);
    }
  }

  const candidates = inCategoryRows.length ? inCategoryRows : rowCenters;
  let best = candidates[0];
  let bestDelta = Math.abs(Math.log(best.hz) - Math.log(targetHz));

  for (let i = 1; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const delta = Math.abs(Math.log(candidate.hz) - Math.log(targetHz));
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }

  return best.y;
}

function updatePitchCategoryTree() {
  if (!foCategoryTree || !isFrequencyOrganizerVisible) return;

  while (foCategoryTree.firstChild) foCategoryTree.removeChild(foCategoryTree.firstChild);

  const rowCenters = collectMainOrganizerRowCenters();
  if (!rowCenters.length) return;

  // Match the category tree height to the rendered frequency tree so endpoint
  // interpolation lines up in both compact and expanded organizer modes.
  const organizerHeight = Math.max(1, Math.round(foNotches.getBoundingClientRect().height));
  foCategoryTree.style.height = organizerHeight + 'px';
  const treeRect = foCategoryTree.getBoundingClientRect();
  const rightEdgeX = Math.max(FO_CATEGORY_SPINE_X + 72, treeRect.width - 6);

  if (foLineContainer && foMainTree) {
    const containerRect = foLineContainer.getBoundingClientRect();
    const mainTreeRect = foMainTree.getBoundingClientRect();
    const dividerStart = FO_CATEGORY_SPINE_X;
    const dividerEnd = mainTreeRect.left - containerRect.left + FO_MAIN_SPINE_X;
    const dividerWidth = Math.max(0, dividerEnd - dividerStart);
    foLineContainer.style.setProperty('--fo-divider-start', dividerStart + 'px');
    foLineContainer.style.setProperty('--fo-divider-width', dividerWidth + 'px');
  }

  function appendHorizontal(className, left, right, y) {
    if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(y)) return null;
    if (right - left <= DIVISION_EPSILON) return null;
    const line = document.createElement('div');
    line.className = className;
    line.style.left = left + 'px';
    line.style.width = right - left + 'px';
    line.style.top = y + 'px';
    foCategoryTree.appendChild(line);
    return line;
  }

  function appendVertical(className, x, top, bottom) {
    if (!Number.isFinite(x) || !Number.isFinite(top) || !Number.isFinite(bottom)) return null;
    const yTop = Math.min(top, bottom);
    const yBottom = Math.max(top, bottom);
    const line = document.createElement('div');
    line.className = className;
    line.style.left = x + 'px';
    line.style.top = yTop + 'px';
    line.style.height = Math.max(1, yBottom - yTop) + 'px';
    foCategoryTree.appendChild(line);
    return line;
  }

  for (let i = 0; i < FO_PITCH_CATEGORIES.length; i += 1) {
    const category = FO_PITCH_CATEGORIES[i];
    const minY = mapClosestInCategoryRowY(
      category.minHz,
      category.minHz,
      category.maxHz,
      rowCenters,
    );
    const maxY = mapClosestInCategoryRowY(
      category.maxHz,
      category.minHz,
      category.maxHz,
      rowCenters,
    );
    const endpointTopY = Math.min(minY, maxY);
    const endpointBottomY = Math.max(minY, maxY);

    const labelEl = document.createElement('div');
    labelEl.className = 'fo-category-label';
    labelEl.textContent = category.label;
    const midpointHz = Math.sqrt(category.minHz * category.maxHz);
    const midpointY = mapClosestInCategoryRowY(
      midpointHz,
      category.minHz,
      category.maxHz,
      rowCenters,
    );
    labelEl.style.top = midpointY + 'px';
    labelEl.dataset.categoryIndex = i;
    bindCategoryTooltip(labelEl, category);
    labelEl.addEventListener('click', () => { setPinnedCategory(i); });
    foCategoryTree.appendChild(labelEl);

    const labelRect = labelEl.getBoundingClientRect();
    const labelLeftX = labelRect.left - treeRect.left;
    const labelRightX = labelRect.right - treeRect.left;

    // Left side: a category-level notch from the category spine centered on the label.
    appendHorizontal(
      'fo-category-center-notch',
      FO_CATEGORY_SPINE_X,
      Math.max(FO_CATEGORY_SPINE_X + 6, labelLeftX - 6),
      midpointY,
    );

    // Right side: connector from label to a short split spine, then two endpoint branches.
    const connectorStartX = Math.min(rightEdgeX - 18, labelRightX + 6);
    const splitSpineX = Math.max(
      connectorStartX + 8,
      Math.min(rightEdgeX - 10, connectorStartX + 16),
    );

    const rightNotchEl = appendHorizontal('fo-category-right-notch', connectorStartX, splitSpineX, midpointY);
    const splitSpineEl = appendVertical('fo-category-split-spine', splitSpineX, endpointTopY, endpointBottomY);
    const branchTopEl = appendHorizontal('fo-category-branch-notch', splitSpineX, rightEdgeX, endpointTopY);
    const branchBottomEl = appendHorizontal('fo-category-branch-notch', splitSpineX, rightEdgeX, endpointBottomY);

    // Tag fork elements so setPinnedCategory can highlight them by category index.
    const forkElements = [rightNotchEl, splitSpineEl, branchTopEl, branchBottomEl];
    for (let j = 0; j < forkElements.length; j += 1) {
      if (forkElements[j]) forkElements[j].dataset.categoryFork = i;
    }
  }

  // Re-apply pinned highlight after full tree rebuild.
  if (pinnedCategoryIndex >= 0) {
    const pinnedLabel = foCategoryTree.querySelector(
      '.fo-category-label[data-category-index="' + pinnedCategoryIndex + '"]',
    );
    if (pinnedLabel) pinnedLabel.classList.add('fo-category-label--pinned');
    const forkEls = foCategoryTree.querySelectorAll('[data-category-fork="' + pinnedCategoryIndex + '"]');
    for (let i = 0; i < forkEls.length; i += 1) {
      forkEls[i].classList.add('fo-fork--pinned');
    }
  }
}

// Build one color-notch row for a regular band.
function createNotchRow(band) {
  const tooltip = formatBandHz(band.hz) +
    ' (' + Math.round(band.minHz) + '\u2013' + Math.round(band.maxHz) + 'Hz)';
  const swatchColor =
    'rgb(' + band.rgb.r + ',' + band.rgb.g + ',' + band.rgb.b + ')';
  const row = document.createElement('div');
  row.className = 'fo-notch-row';
  row.dataset.hz = band.hz.toString();
  bindFrequencyTooltip(row, tooltip, swatchColor);

  const tick = document.createElement('div');
  tick.className = 'fo-tick';

  const label = document.createElement('span');
  label.className = 'fo-label';
  label.textContent = formatBandHz(band.hz);

  const swatch = document.createElement('div');
  swatch.className = 'fo-swatch';
  swatch.style.background = swatchColor;

  row.appendChild(tick);
  row.appendChild(label);
  row.appendChild(swatch);
  return row;
}

// Build the center divider row: divider label in parens with a matching swatch.
function createDividerRow(band) {
  const row = document.createElement('div');
  row.className = 'fo-notch-row fo-divider';
  row.dataset.hz = band.hz.toString();
  const tooltip = 'Dividing pitch: ' + formatBandHz(band.hz);
  const swatchColor =
    'rgb(' + band.rgb.r + ',' + band.rgb.g + ',' + band.rgb.b + ')';
  bindFrequencyTooltip(row, tooltip, swatchColor);

  const tick = document.createElement('div');
  tick.className = 'fo-tick';

  const label = document.createElement('span');
  label.className = 'fo-label';
  label.textContent = '(' + formatBandHz(band.hz) + ')';

  const swatch = document.createElement('div');
  swatch.className = 'fo-swatch';
  swatch.style.background = swatchColor;

  row.appendChild(tick);
  row.appendChild(label);
  row.appendChild(swatch);
  return row;
}

function syncFrequencyOrganizerSwatchColumn() {
  const dividerRow = foNotches.querySelector('.fo-divider');
  const dividerLabel = foNotches.querySelector('.fo-divider .fo-label');
  if (!dividerRow || !dividerLabel) {
    foNotches.style.removeProperty('--fo-label-column-width');
    foNotches.style.removeProperty('--fo-label-swatch-extra-gap');
    return;
  }

  const rowStyles = getComputedStyle(dividerRow);
  const rowGap = parseFloat(rowStyles.columnGap || rowStyles.gap || '0');
  const baseGap = Number.isFinite(rowGap) ? rowGap : 0;
  const swatchExtraGap = Math.max(0, FO_LABEL_TO_SWATCH_GAP_PX - baseGap);

  const dividerLabelWidth = Math.ceil(dividerLabel.getBoundingClientRect().width);
  foNotches.style.setProperty('--fo-label-column-width', dividerLabelWidth + 'px');
  foNotches.style.setProperty('--fo-label-swatch-extra-gap', swatchExtraGap + 'px');
}

// Rebuild the organizer panel to reflect the current activeBandProfile.
// Called once on init and again whenever the band mode changes.
function updateFrequencyOrganizer() {
  hideFrequencyTooltip();
  if (!isFrequencyOrganizerVisible) return;
  // Clear existing notches without innerHTML
  while (foNotches.firstChild) foNotches.removeChild(foNotches.firstChild);

  const { topBands, bottomBands } = activeBandProfile;
  const totalBands = topBands.length + bottomBands.length;
  const useCompactOrganizer = totalBands <= COMPACT_ORGANIZER_MAX_BANDS;

  frequencyOrganizer.classList.toggle('frequency-organizer--compact', useCompactOrganizer);

  if (useCompactOrganizer) {
    // Keep organizer labels aligned with the slider label/value text size.
    foNotches.style.fontSize = 'var(--control-font-size)';
  } else {
    // Adaptive font size: stays readable from 49 bands up to 99.
    const fontSize = Math.max(7, Math.min(13, Math.floor(600 / totalBands)));
    foNotches.style.fontSize = fontSize + 'px';
  }

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

  syncFrequencyOrganizerSwatchColumn();
  updatePitchCategoryTree();
  applyFoRowVisibility();
}

function setBandMode(nextMode) {
  if (!BAND_MODE_KEYS.includes(nextMode) || nextMode === activeBandMode) return;
  activeBandMode = nextMode;
  activeBandProfile = BAND_PROFILES[nextMode];
  invalidateBandRangeCache();
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
toggleFoOrganizerBtn.addEventListener('click', () => {
  isFrequencyOrganizerVisible = !isFrequencyOrganizerVisible;
  updateFrequencyOrganizerToggleState();
  if (isFrequencyOrganizerVisible) {
    updateFrequencyOrganizer();
  } else {
    hideFrequencyTooltip();
  }
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
  panFlexWidth = panFlexPercentToWidth(Number(panFlexSlider.value));
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
  panFlexWidth = panFlexPercentToWidth(clamped);
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

lineAlphaSlider.addEventListener('input', () => {
  lineAlpha = Number(lineAlphaSlider.value);
});

lineAlphaValueEl.addEventListener('change', () => {
  lineAlpha = Number(lineAlphaSlider.value);
});

lineThicknessSlider.addEventListener('input', () => {
  lineThicknessControl = Math.max(0.01, Number(lineThicknessSlider.value));
});

lineThicknessValueEl.addEventListener('change', () => {
  lineThicknessControl = Math.max(0.01, Number(lineThicknessSlider.value));
});

panFlexWidth = panFlexPercentToWidth(Number(panFlexSlider.value));

// Render Speed UI is inverse-mapped from analyser smoothing.
syncRenderSpeedControlFromSmoothing(DEFAULT_ANALYSER_SMOOTHING);

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
  const smoothing = getAnalyserSmoothingFromControl();
  if (analyserLeft) analyserLeft.smoothingTimeConstant = smoothing;
  if (analyserRight) analyserRight.smoothingTimeConstant = smoothing;
});

analyserSmoothingValueEl.addEventListener('change', () => {
  // makeSliderPair clamps the value first, so read from slider for canonical state.
  const smoothing = getAnalyserSmoothingFromControl();
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
  if (isFrequencyOrganizerVisible) updatePitchCategoryTree();
  drawVisualizer();
});

updatePanLineToggleState();
updateDbLineToggleState();
updateFrequencyOrganizerToggleState();
updateWaveHeightAutoFitToggleState();
updateBandModeButtons();
updateFrequencyOrganizer();
resizeCanvas();
drawVisualizer();

(function restoreFileOnLoad() {
  const file = fileInput.files?.[0];
  if (file && isMp3File(file)) {
    currentFile = file;
    updateSelectedFileText(file);
    ensureAudioGraph();
    revokeObjectUrlIfNeeded();
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
    updateSelectedFileText();
  }
}());

window.addEventListener('beforeunload', () => {
  analysisGeneration += 1;
  stopAnimation();
  revokeObjectUrlIfNeeded();
});