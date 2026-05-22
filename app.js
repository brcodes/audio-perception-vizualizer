const canvas = document.getElementById('vizCanvas');
const fileInput = document.getElementById('fileInput');
const playPauseBtn = document.getElementById('playPauseBtn');
const ctx = canvas.getContext('2d');

const DIVISION_EPSILON = 1e-6;
const TYPICAL_ENERGY_THRESHOLD = 0.45;
const TYPICAL_HEIGHT_FACTOR = 0.7;
const PEAK_HEIGHT_FACTOR = 0.97;
const GAUSSIAN_SIGMA_DIVISOR = 2.6;
const WAVEFORM_RESOLUTION = 80;
const MIN_GEOMETRIC_MEAN_HZ = 34.6;
const MAX_GEOMETRIC_MEAN_HZ = 10954.5;
const ZERO_FREQUENCY_DATA = new Uint8Array(1);
const MP3_MIME_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/x-mp3', 'audio/mpeg3', 'audio/x-mpeg-3']);

const BINS = {
  sub: {
    minHz: 20,
    maxHz: 60,
    geometricMeanHz: 34.6,
    color: '#580000',
    alpha: 0.22
  },
  bass: {
    minHz: 60,
    maxHz: 250,
    geometricMeanHz: 122.5,
    color: '#FF2E00',
    alpha: 0.24
  },
  lowMid: {
    minHz: 250,
    maxHz: 500,
    geometricMeanHz: 353.6,
    color: '#FF8C00',
    alpha: 0.26
  },
  mid: {
    minHz: 500,
    maxHz: 2000,
    geometricMeanHz: 1000,
    color: '#FFEB00',
    alpha: 0.3
  },
  upperMid: {
    minHz: 2000,
    maxHz: 4000,
    geometricMeanHz: 2828.4,
    color: '#66CC00',
    alpha: 0.26
  },
  presence: {
    minHz: 4000,
    maxHz: 6000,
    geometricMeanHz: 4898.9,
    color: '#00CCDD',
    alpha: 0.24
  },
  brilliance: {
    minHz: 6000,
    maxHz: 20000,
    geometricMeanHz: 10954.5,
    color: '#4B2EFF',
    alpha: 0.22
  }
};

const TOP_STACK = [BINS.brilliance, BINS.presence, BINS.upperMid, BINS.mid];
const BOTTOM_STACK = [BINS.sub, BINS.bass, BINS.lowMid, BINS.mid];

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

const METRICS = new Map(Object.values(BINS).map((bin) => [bin, { energy: 0, panPoint: 0 }]));

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
  if (end <= start) return 0;

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

function frequencyToWidthFactor(geometricMeanHz) {
  const logNorm =
    (Math.log(geometricMeanHz) - Math.log(MIN_GEOMETRIC_MEAN_HZ)) /
    (Math.log(MAX_GEOMETRIC_MEAN_HZ) - Math.log(MIN_GEOMETRIC_MEAN_HZ));
  return 0.58 - 0.34 * logNorm;
}

function hexToRgb(hex) {
  const sanitized = hex.replace('#', '');
  const value = Number.parseInt(sanitized, 16);
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff
  };
}

function drawWaveform({
  centerX,
  centerY,
  radius,
  dir,
  color,
  alpha,
  energy,
  geometricMeanHz,
  panPoint
}) {
  const heightFactor = Math.max(
    0,
    Math.min(PEAK_HEIGHT_FACTOR, amplitudeToHeightFactor(energy))
  );
  const height = radius * heightFactor;

  const widthBase = frequencyToWidthFactor(geometricMeanHz);
  const levelBoost = 0.18 * energy;
  let halfWidth = radius * (widthBase + levelBoost);
  const absPan = Math.abs(panPoint) / 100;
  halfWidth *= 1 + absPan * 0.06;

  const leftLimit = centerX - radius;
  const rightLimit = centerX + radius;
  const panX = centerX + (panPoint / 100) * radius;
  const minX = Math.max(leftLimit, panX - halfWidth);
  const maxX = Math.min(rightLimit, panX + halfWidth);
  const actualHalfWidth = Math.max(1, (maxX - minX) / 2);
  const actualCenterX = (minX + maxX) / 2;

  const sigma = actualHalfWidth / GAUSSIAN_SIGMA_DIVISOR;
  const rgb = hexToRgb(color);

  ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  ctx.beginPath();
  ctx.moveTo(minX, centerY);
  for (let i = 0; i <= WAVEFORM_RESOLUTION; i += 1) {
    const x = minX + ((maxX - minX) * i) / WAVEFORM_RESOLUTION;
    const dx = x - actualCenterX;
    const gaussian = Math.exp(-(dx * dx) / (2 * sigma * sigma));
    const y = centerY + dir * height * gaussian;
    ctx.lineTo(x, y);
  }
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

  Object.values(BINS).forEach((bin) => {
    const l = getBandEnergy(left, bin.minHz, bin.maxHz, sampleRate);
    const r = getBandEnergy(right, bin.minHz, bin.maxHz, sampleRate);
    const metric = METRICS.get(bin);
    metric.energy = (l + r) / 2;
    metric.panPoint = toPanPoint(l, r);
  });

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - radius, cy - radius, radius * 2, radius);
  ctx.clip();
  TOP_STACK.forEach((bin) => {
    const m = METRICS.get(bin);
    drawWaveform({
      centerX: cx,
      centerY: cy,
      radius,
      dir: -1,
      color: bin.color,
      alpha: bin.alpha,
      energy: m.energy,
      geometricMeanHz: bin.geometricMeanHz,
      panPoint: m.panPoint
    });
  });
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - radius, cy, radius * 2, radius);
  ctx.clip();
  BOTTOM_STACK.forEach((bin) => {
    const m = METRICS.get(bin);
    drawWaveform({
      centerX: cx,
      centerY: cy,
      radius,
      dir: 1,
      color: bin.color,
      alpha: bin.alpha,
      energy: m.energy,
      geometricMeanHz: bin.geometricMeanHz,
      panPoint: m.panPoint
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

// On load, restore state if the browser retained the file (soft refresh),
// otherwise clear the stale filename that some browsers display.
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
