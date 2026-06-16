## Audio Perception Visualizer

Audio visualizer whose properties aim to serve as an analogy to the scientific principles of human audio perception. 'See' your sound for engineering purposes, or pleasure.

## Default Mode

- Log-frequency (constant-Q) band spacing across the 20 Hz to 20 kHz audible range preserves proportional octave resolution.
- Geometric-mean band centers and logarithmic interpolation map frequency perception more closely than linear-Hz spacing.
- FFT window integration plus configurable IIR smoothing model temporal persistence in short-time spectral analysis.
- Stereo lateralization is estimated from interaural level difference using normalized channel-energy contrast: pan = (R - L) / (R + L + epsilon).
- A center deadband suppresses micro-jitter near equal-channel energy to stabilize front-center localization.
- Pan-lock interpolation provides temporal hysteresis, reflecting perceived source continuity over frame-to-frame fluctuation.
- Band-energy to vertical excursion uses calibrated nonlinear scaling so typical program material remains readable while transient peaks retain headroom.
- Dynamic-range mapping is anchored to analyser dB limits, preserving low-level visibility without flattening high-level transients.
- Edge masking past the pan boundary applies graded opacity falloff to model reduced perceptual salience outside the intended lateral field.
- Quantized pan points and bounded geometry enforce deterministic, repeatable measurement states for comparative listening workflows.

## Blob Mode

- Frequency-to-width mapping follows inverse-period behavior (1/f), with compression to keep low-frequency dominance perceptually meaningful but visually bounded.
- Loudness-coupled blob spread uses a Stevens-style power law (amplitude^0.67) to approximate nonlinear human loudness growth.
- Binaural spread augmentation uses a cosine-derived apparent-source-width model based on reduced interaural correlation at larger lateral angles.
- Frequency-category grouping (sub-bass through brilliance) reflects standard psychoacoustic/engineering pitch regions for mix analysis.
- Blob geometry remains bounded to preserve repeatable comparison states while still representing transient expansion and contraction.
