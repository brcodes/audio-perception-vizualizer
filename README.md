# music-mix-mapper

Music Mix Mapper is a static JavaScript web app for MP3-driven 2D circular visualization focused on mixing use-cases.

## Run locally

This project is static and Cloudflare Pages ready.

- Open `index.html` directly, or
- Serve the folder (example):

```bash
cd <project-directory>
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Mapping model implemented

- **7 frequency bins / fixed geometric means / colors / alphas** exactly as specified.
- **North/South split** on an invisible center cut:
  - Top semicircle: 1000, 2828.4, 4898.9, 10954.5 Hz
  - Bottom semicircle: 1000, 353.6, 122.5, 34.6 Hz
- **Z-order** rendered exactly per requirement (back to front).
- **Height ↔ amplitude**:
  - Piecewise map: typical energy (`~0.45`) reaches ~70% of semicircle radius.
  - Peaks can reach ~97%.
- **Horizontal center ↔ pan**:
  - Stereo pan proxy per bin is computed from left/right analyser energies:
    - `pan = (R - L) / (R + L + epsilon)`
  - Quantized to **201 discrete pan points** (`-100..100`).
- **Width extents ↔ frequency (plus slight loudness expansion)**:
  - Low frequencies are wider (“blobbier”), highs narrower (“spikier”) using a log-frequency width curve.
  - Width gets slight boost with level so louder content feels broader.
  - Total horizontal occupancy is clamped to fit inside the circle and constrained to:
    - Typical region around <=70% of diameter.
    - Max transient region around ~97% of diameter.
