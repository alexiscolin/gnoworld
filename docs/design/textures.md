# Textures

Every file in `app/public/textures/` comes from a real map or image. `app/src/space/planet/credits.ts` holds the
words shown wherever one is drawn (`docs/DESIGN-SYSTEM.md`, "Credits"); a test holds that every file has its row.

## Solar System Scope, CC BY 4.0

https://www.solarsystemscope.com/textures/: "Distributed under Attribution 4.0 International license"; "You may use, adapt, and share
these textures for any purpose, even commercially." The pack is based on NASA elevation and imagery data, with unmapped gaps filled by
fictional terrain, and the site lists Ceres and Eris as fictional.

| File | Source | Size | Changes |
|---|---|---|---|
| `mars.webp` | `8k_mars.jpg` | 4096 by 2048 | Halved, re-encoded as WebP at 0.85 |
| `moon.webp` | `8k_moon.jpg` | 4096 by 2048 | Halved, re-encoded as WebP at 0.7 |
| `venus.webp` | `8k_venus_surface.jpg` | 4096 by 2048 | Halved, re-encoded as WebP at 0.78 |
| `jupiter.webp` | `8k_jupiter.jpg` (a 4096 by 2048 file, whatever its name) | 4096 by 2048 | Re-encoded as WebP at 0.85 |
| `ceres.webp` | `4k_ceres_fictional.jpg` | 4096 by 2048 | Re-encoded as WebP at 0.7 |
| `eris.webp` | `4k_eris_fictional.jpg` | 4096 by 2048 | Re-encoded as WebP at 0.75 |
| `neptune.webp` | `2k_neptune.jpg` (the site has no larger) | 2048 by 1024 | Re-encoded as WebP at 0.85 |
| `haze.webp` | `2k_venus_atmosphere.jpg` | 1024 by 512 | Halved, re-encoded as WebP |
| `clouds.webp` | `8k_earth_clouds.jpg` | 4096 by 2048 | Halved, re-encoded as WebP at 0.6 |
| `ring.webp` | `2k_saturn_ring_alpha.png` | 1024 by 16 | Its alpha taken as grey, for that is the density; scaled, re-encoded as WebP |

The shaders warp, recolour and mix them by each world's seed.

The Earth's two are drawn as they came on the Earth, with a row of their own in the credits. Temperate and ocean worlds warp and recolour
the day map, and every generated world's lights read the night map warped by its seed, which that row says. Read on the same day, from the same page. A Low or touch
device decodes them at half each side, from the same files (`decodeOptions`, `earth/maps.ts`).

| File | Source | Size | Changes |
|---|---|---|---|
| `earth-day.webp` | `8k_earth_daymap.jpg` | 4096 by 2048 | Halved, re-encoded as WebP at 0.9, 821 KB |
| `earth-night.webp` | `8k_earth_nightmap.jpg` | 4096 by 2048 | Halved, re-encoded as WebP at 0.85, 304 KB |

## How to remake one

`ffmpeg` here has no WebP encoder and `sips` cannot write it, so a canvas in Chromium encodes them: `OffscreenCanvas.convertToBlob({
type: "image/webp", quality })`, at 0.8 to 0.9.

## Height maps

Made by `app/tests/tools/heightMaps.mjs` at the one size they are read at (no variants: `textureVariants.mjs` skips `-height`), loaded late and not under Low.

| File | Source | Size | Changes |
|---|---|---|---|
| `moon-height.webp` | NASA SVS 4720 "CGI Moon Kit", `ldem_16_uint.tif` (LRO LOLA, 16 pixels a degree); terms: https://svs.gsfc.nasa.gov/help ("All of our content is in the public domain unless otherwise noted") | 1024 by 512 | -9.2 to +10.9 km over 0..255, mean of each block, WebP at 0.95, 114 KB |
| `earth-height.webp` | NOAA NCEI ETOPO 2022, 60 arc-second ice surface; the NCEI record (doi:10.25921/Fd45-Gt74) states the data are not subject to US copyright and waived worldwide under CC0 1.0 | 4096 by 2048 | Sea 0..68, land 84..255 (5.5 km), the Caspian kept as sea, WebP at 0.95, 575 KB |
