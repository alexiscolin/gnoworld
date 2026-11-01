# Textures

Every file in `app/public/textures/` comes from a real map or image, read on 2026-11-02. `app/src/scene/planet/credits.ts` holds the
words shown wherever one is drawn (`docs/DESIGN-SYSTEM.md`, "Credits"); a test holds that every file has its row.

## Solar System Scope, CC BY 4.0

https://www.solarsystemscope.com/textures/: "Distributed under Attribution 4.0 International license"; "You may use, adapt, and share
these textures for any purpose, even commercially." The pack is based on NASA elevation and imagery data, with unmapped gaps filled by
fictional terrain, and the site lists Ceres and Eris as fictional.

| File | Source | Size | Changes |
|---|---|---|---|
| `mars.webp` | `2k_mars.jpg` | 2048 by 1024 | Re-encoded as WebP |
| `moon.webp` | `2k_moon.jpg` | 2048 by 1024 | Re-encoded as WebP |
| `venus.webp` | `2k_venus_surface.jpg` | 2048 by 1024 | Re-encoded as WebP |
| `jupiter.webp` | `2k_jupiter.jpg` | 2048 by 1024 | Re-encoded as WebP |
| `ceres.webp` | `2k_ceres_fictional.jpg` | 2048 by 1024 | Re-encoded as WebP |
| `eris.webp` | `2k_eris_fictional.jpg` | 2048 by 1024 | Re-encoded as WebP |
| `neptune.webp` | `2k_neptune.jpg` | 1024 by 512 | Halved, re-encoded as WebP |
| `haze.webp` | `2k_venus_atmosphere.jpg` | 1024 by 512 | Halved, re-encoded as WebP |
| `clouds.webp` | `2k_earth_clouds.jpg` | 2048 by 1024 | Re-encoded as WebP |
| `ring.webp` | `2k_saturn_ring_alpha.png` | 1024 by 16 | Its alpha taken as grey, for that is the density; scaled, re-encoded as WebP |

The shaders warp, recolour and mix them by each world's seed.

## ESA/Hubble, CC BY 4.0

https://esahubble.org/copyright/: images "released under the Creative Commons Attribution 4.0 International license"; the credit in
full and legible; no endorsement implied; changes noted after the credit; no logos.

| File | Source | Size | Changes |
|---|---|---|---|
| `carina.webp` | "Star birth in the extreme", heic0707a, https://esahubble.org/images/heic0707a/ | 2048 by 1024 | Cropped to 2:1; its stars taken out at 3874 px in three passes: a grey opening (square and diamond erosions in turn, then as many dilations, reach 2, 6, 3) replaces the image only where a point stood above it by 60, 120, 42 of 255, through a soft mask; scaled, re-encoded as WebP |

Credit: NASA, ESA, N. Smith (University of California, Berkeley), and The Hubble Heritage Team (STScI/AURA). The shader recolours and
warps it.

## How to remake one

`ffmpeg` here has no WebP encoder and `sips` cannot write it, so a canvas in Chromium encodes them: `OffscreenCanvas.convertToBlob({
type: "image/webp", quality })`, at 0.8 to 0.9.
