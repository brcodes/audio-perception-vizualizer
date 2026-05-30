# Perceptual Music Visualizer — Scientific Reference

A 2D music visualizer whose rendering parameters are derived directly from psychoacoustic models and speaker physics, rather than raw signal amplitude. The goal is that what you *see* is an analogy of what you *hear* — not what the waveform looks like.

---

## Axes and Encodings

### X axis — Pan (Interaural Level Difference)

Pan position is not a simple linear mapping. In **speaker mode**, the perceived lateralization of a frequency band depends on how directional the cone is at that frequency. Because low-frequency sound radiates omnidirectionally, a hard-panned bass note still feels roughly centered — the sound wraps around your head before reaching the far ear. High-frequency sound beams tightly forward, so it reaches one ear significantly louder than the other.

The pan scaling function is:

```
panFeel(hz) = 0.35 + 0.65 * beaming(hz, coneInches)
panX = inputPan * panFeel(hz)
```

In **headphones mode**, the interaural level difference (ILD) is exaggerated for high frequencies, modeling how the pinna and skull attenuate sound reaching the far ear more strongly above ~1 kHz:

```
ildScale(hz) = min(1.6,  1 + hz/4000 * 0.5)
panX = inputPan * ildScale(hz)
```

This means a panned hi-hat feels further to one side than a panned kick drum — which matches perception.

---

### Y axis — Pitch (Logarithmic Frequency)

The Y axis maps frequency logarithmically from bottom (20 Hz) to top (20 kHz):

```
t = log2(hz / 20) / log2(20000 / 20)     // 0..1
y = canvasHeight - paddingBottom - t * usableHeight
```

Logarithmic spacing is used because pitch perception itself is logarithmic (equal musical intervals correspond to equal frequency ratios, not equal frequency differences). One octave looks the same size anywhere on the axis.

The placement also reflects physical and bodily reality:

- Sub-bass (20–80 Hz) sits at the bottom — felt in the floor, chest, and viscera
- Midrange (500–2000 Hz) sits at the dashed "ear level" line — where a speaker at face height fires its primary energy
- Air (10–20 kHz) sits at the top — diffuse, spacious, above the head

---

### Blob Size — Perceived Loudness (Phons, ISO 226)

Raw amplitude is never used directly. All amplitude values are first converted to **phons** using a simplified ISO 226 equal-loudness contour model before any visual mapping.

#### ISO 226 approximation

The equal-loudness correction models three perceptual features:

1. **Threshold of hearing** — the frequency-dependent minimum audible level, approximated as:

   ```
   thresh(fk) = 3.64 * fk^-0.8
              - 6.5 * exp(-0.6 * (fk - 3.3)^2)
              + 0.001 * fk^4
   ```
   where `fk = hz / 1000`.

2. **Pinna / HRTF boost at ~3.5 kHz** — the outer ear's geometry creates a resonance peak between 2–5 kHz. This is why the presence region "cuts through" mixes and why voices feel intimate:

   ```
   pinnaPeak = 8 * exp(-0.5 * (log2(hz/3500))^2 / 1.1)
   ```

3. **Low-frequency insensitivity** — the ear requires significantly more SPL to perceive bass at the same loudness as midrange:

   ```
   bassCut = 14 * max(0, 1 - min(1, hz/200))
   ```

The combined phon estimate:

```
phon(hz, dBSPL) = max(0, dBSPL + pinnaPeak - bassCut - hiRoll - thresh * 0.15)
```

This is normalized to 0–1 and used as the primary size driver. A blob only becomes large when the perceived loudness (not just the physical amplitude) is high. A 40 Hz sub at 70 dB will appear smaller than a 3.5 kHz presence peak at the same dB.

#### Distance attenuation

Physical distance is applied before the phon calculation using the inverse-square law (simplified to a dB attenuation):

```
distAttenDB = 20 * log10(max(0.3, distanceMeters))
effectiveDBSPL = rawAmp * 82 - distAttenDB
```

---

### Blob Shape — Asymmetric Vertical Expansion

Each blob is not a simple circle or ellipse. It is rendered as two half-ellipses joined at the blob's center point, with different vertical radii above and below. This models the perceptual spatial character of each frequency band.

#### Vertical asymmetry by frequency

| Band | Below-center expansion | Above-center expansion | Physical basis |
|---|---|---|---|
| Sub (40 Hz) | 65% | 35% | Felt in floor and legs; pressure wave travels down |
| Bass (100 Hz) | 60% | 40% | Body resonance, chest coupling |
| Lo-mid (250 Hz) | 55% | 45% | Still weighted below ear level |
| Mid (800 Hz) | 50% | 50% | Symmetric — exactly at ear level |
| Presence (3.5 kHz) | 45% | 55% | Forward / face-level; begins to feel above you |
| Hi (7 kHz) | 38% | 62% | Airy, spacious, above the head |
| Air (14 kHz) | 30% | 70% | Strongly upward — ceiling and room sense |

#### Gravity drift

As loudness increases, each blob's center of gravity drifts in its natural direction. Bass blobs sink slightly louder; treble blobs lift:

```
gravDrift = gravityBias * pNorm * 0.08 * canvasHeight
cy = freqY + gravDrift
```

`gravityBias` is negative for bass (−0.35 for sub) and positive for treble (+0.35 for air).

#### Horizontal radius and beaming

The horizontal spread is inversely related to the beaming factor:

```
xSpread = baseRadius * (0.9 - 0.55 * beaming(hz, coneInches))
```

An omnidirectional bass blob is wide and flat. A beamed treble blob is narrow and tall — modeling the directional "column" of sound a tweeter fires at your face.

---

## Speaker Physics — Cone Beaming

A cone speaker is omnidirectional at low frequencies and becomes increasingly directional as frequency rises. The transition occurs when the cone's circumference approaches one wavelength:

```
ratio = π * coneDiameter / (343 / hz)
beaming = clamp((ratio - 0.4) / 2.2, 0, 1)
```

Where:
- `343 m/s` is the speed of sound in air at ~20°C
- `coneDiameter` is the cone size in meters (converted from the user-selected inches)
- A result of 0 means fully omnidirectional; 1 means tightly beamed

This affects three visual properties simultaneously:
- Horizontal blob width (beamed = narrow)
- Perceptual pan scale (beamed = wider apparent stereo)
- Implicit Z-depth ordering (high-frequency beamed blobs drawn last, on top)

---

## Color Encoding — Pitch to Color (Log Scale)

Pitch is mapped to color along a perceptually motivated spectral gradient. The mapping is logarithmic (matching the frequency axis). Color stop positions are not evenly spaced — they're weighted to make the most perceptually significant region (2–5 kHz, the presence peak) visually prominent:

| Frequency | Color | Perceptual significance |
|---|---|---|
| 20 Hz | Deep red | Infrasonic; felt not heard |
| ~100 Hz | Orange-red | Bass body |
| ~250 Hz | Orange | Warmth/muddiness zone |
| ~1 kHz | Yellow | Nasal, forward |
| ~3.5 kHz | Yellow-green | Sensitivity peak (HRTF pinna boost) |
| ~7 kHz | Cyan | Sibilance, attack |
| ~12 kHz | Blue | Air, shimmer |
| 20 kHz | Violet | Beyond hearing for most adults |

Color is redundant with Y position by design — two encodings of the same variable reinforce each other and make the visualization legible at a glance without reading axis labels.

---

## Implicit Z-axis (Drawing Order)

There is no explicit depth coordinate, but a perceptual depth field is created by draw ordering and alpha:

- Frequency bands are drawn in ascending frequency order: sub first, air last
- Higher-frequency blobs render on top of lower-frequency blobs
- Alpha (opacity) is modulated by a depth factor: `depthAlpha = 0.55 + 0.45 * (log2(hz/20) / log2(20000/20))`

This makes bass bands appear as hazy, diffuse backgrounds, and treble bands appear crisp and forward — matching the perceptual reality that a beamed tweeter feels "in your face" while bass envelops you from behind and below.

---

## Modes

### Speaker mode

Models a single cone speaker positioned in front of the listener in an ideal dry room (no early reflections, no room modes). The cone diameter (user-selectable) governs the beaming crossover frequency, which in turn affects pan perception, blob width, and the horizontal/vertical aspect ratio of each blob.

Available cone sizes:
- **18″ sub** — beaming crossover at ~750 Hz; bass blobs are enormous and diffuse
- **6.5″ mid** (default) — crossover at ~2.7 kHz; typical bookshelf/studio monitor behavior
- **1″ tweeter** — beaming crossover at ~13 kHz; almost everything beams tightly

### Headphones mode

Models ideal, balanced headphones with no crossfeed. Key differences from speaker mode:

- Pan is driven purely by ILD (interaural level difference), scaled with frequency
- There is no beaming: all frequencies have the same cone physics (no physical speaker)
- Horizontal blob widths are wider across all frequencies (the "inside the head" imaging effect)
- High-frequency blobs pan more aggressively than low-frequency ones (ILD is stronger above ~1 kHz)
- Pinna notch is modeled as a subtle attenuation around 8–10 kHz (the cue your auditory system uses for front-back localization)

---

## Parameters

| Parameter | Range | What it models |
|---|---|---|
| Distance | 0.3–5 m | Inverse-square SPL attenuation before phon calculation |
| Sub (40 Hz) | 0–1 | Amplitude of the sub-bass band |
| Bass (100 Hz) | 0–1 | Amplitude of the bass band |
| Lo-mid (250 Hz) | 0–1 | Amplitude of the low-midrange (warmth/mud zone) |
| Mid (800 Hz) | 0–1 | Amplitude of the core midrange |
| Pan | −1 to +1 | Stereo position, frequency-scaled by beaming / ILD |
| Presence (3.5 kHz) | 0–1 | Amplitude at the HRTF sensitivity peak |
| Hi (7 kHz) | 0–1 | Amplitude of the high-frequency band |
| Air (14 kHz) | 0–1 | Amplitude of the ultra-high / air band |

---

## Presets

| Preset | Character |
|---|---|
| Rock mix | Heavy mids and presence; bass present but not dominant; compressed feel |
| Electronic | Sub-dominant; large bass blob anchored at the floor; extended air |
| Jazz | Warm mids centered at ear level; minimal sub; slight left pan; restrained presence |
| Vocal focus | Presence-dominant; minimal bass; the 3.5 kHz blob dominates the center |

---

## What Is Not Modeled (Explicit Omissions)

- **Room acoustics** — no early reflections, flutter echo, or room modes
- **Crossfeed** — headphones mode does not simulate speaker crossfeed (no ITD/ILD from the "wrong" speaker)
- **Interaural time difference (ITD)** — only ILD is modeled; true binaural ITD requires per-sample delay
- **Nonlinear distortion** — no harmonic distortion, intermodulation, or cone breakup
- **Dynamic compression** — no loudness maximization or attack/release behavior
- **Individual HRTFs** — the pinna boost and notch are averaged approximations; real HRTFs vary significantly between individuals
- **Multi-speaker setups** — stereo, surround, and Atmos configurations are not modeled

---

## References

- ISO 226:2003 — *Acoustics: Normal equal-loudness-level contours*
- Fletcher, H. & Munson, W.A. (1933). "Loudness, Its Definition, Measurement and Calculation." *JASA* 5(2)
- Blauert, J. (1997). *Spatial Hearing: The Psychophysics of Human Sound Localization*. MIT Press
- Beranek, L. (1954). *Acoustics*. McGraw-Hill (cone beaming / directivity)
- CIPIC HRTF Database — UC Davis (pinna notch / elevation cues)
- Toole, F. (2008). *Sound Reproduction: The Acoustics and Psychoacoustics of Loudspeakers and Rooms*. Focal Press
