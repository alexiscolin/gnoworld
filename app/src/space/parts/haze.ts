// The galaxy's body (Alexis, 2026-11-09, the artifact's look, finer): a fine dense field of round grains that follows the saucer, bright
// and dense at the heart and thinning smoothly to the rim, laid on a jittered sunflower so it fills the disc with no clump and no hole;
// many tiny, a few larger, their soft falls overlapping into one diffuse glow whose parallax gives the volume. Their colour comes from one
// smooth field, as a spiral galaxy's: gold-white at the heart, blue-white to the rim, a touch of rose along two arms and of teal in places.
import { smoothstep, textHash, unitOf } from "@gnoworld/core";
import { BufferGeometry, Float32BufferAttribute } from "three";
import { DISC, type Universe } from "../layout.ts";
import { HEART, saucerHeight } from "../saucer.ts";

/** How many grains the body holds; Low draws the first quarter, a fair share of them, as they are stored shuffled. */
export const GRAINS = 14000;
type Rgb = readonly [number, number, number];
/** The heart's gold, which its glow (parts/sky.ts) shares. */
export const GOLD: Rgb = [1, 0.84, 0.6];
const WHITE: Rgb = [0.84, 0.88, 1];
const BLUE: Rgb = [0.6, 0.72, 1];
const ROSE: Rgb = [1, 0.62, 0.84];
const TEAL: Rgb = [0.52, 0.9, 0.86];
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const mix = (a: Rgb, b: Rgb, by: number): Rgb => [
  a[0] + (b[0] - a[0]) * by,
  a[1] + (b[1] - a[1]) * by,
  a[2] + (b[2] - a[2]) * by,
];

// The seed's stream (mulberry32 on core's step), and its rough gaussian: the same body for the same seed.
function streamOf(seed: string) {
  let state = textHash(seed);
  const random = () => unitOf((state = (state + 0x6d2b79f5) >>> 0));
  return { random, gauss: () => (random() + random() + random() - 1.5) / 1.5 };
}

/** The galaxy's colour `r` (a share of the disc) from the heart at `turn`, the arms turned by `phase`: smooth everywhere. */
function tintAt(r: number, turn: number, phase: number): Rgb {
  const base = mix(mix(GOLD, WHITE, smoothstep(0.05, 0.55, r)), BLUE, smoothstep(0.5, 1, r));
  const arm = Math.sin(2 * (turn - 2.6 * Math.log(r + 0.1)) + phase);
  const patch = Math.sin(3 * turn + 1.7 * Math.log(r + 0.1) + phase * 1.7);
  const rose = 0.3 * smoothstep(0.2, 1, arm) * smoothstep(0.15, 0.4, r);
  return mix(mix(base, ROSE, rose), TEAL, 0.25 * smoothstep(0.35, 1, patch) * smoothstep(0.3, 0.65, r));
}

// The order the grains are stored in, shuffled by the seed (Fisher-Yates), so any first share of them is spread like the whole.
function shuffled(count: number, random: () => number): Uint32Array {
  const order = Uint32Array.from({ length: count }, (_, at) => at);
  for (let at = count - 1; at > 0; at -= 1) {
    const other = Math.floor(random() * (at + 1));
    [order[at], order[other]] = [order[other] ?? 0, order[at] ?? 0];
  }
  return order;
}

/** The grains of `universe`: positions, and each one's colour times its light, and its size. */
export function grainsOf({ home, scale }: Universe): BufferGeometry {
  const disc = DISC * scale;
  const { random, gauss } = streamOf(home.id);
  const phase = unitOf(textHash(`${home.id}:arms`)) * Math.PI * 2;
  const order = shuffled(GRAINS, random);
  const [places, colours] = [new Float32Array(GRAINS * 3), new Float32Array(GRAINS * 4)];
  for (let at = 0; at < GRAINS; at += 1) {
    // Its own ring of the disc, jittered within it; the golden angle round, jittered too, and a faint spiral.
    const r = ((at + random()) / GRAINS) ** 0.85 * 1.05;
    const turn = at * GOLDEN + (random() - 0.5) * 0.5 + 0.35 * Math.sin(2 * Math.log(r + 0.1) * 2.6);
    const slot = order[at] ?? at;
    places[slot * 3] = HEART.x + Math.cos(turn) * r * disc;
    places[slot * 3 + 1] = HEART.y + gauss() * saucerHeight(r * disc, disc) * 0.7;
    places[slot * 3 + 2] = HEART.z + Math.sin(turn) * r * disc;
    const tint = tintAt(r, turn, phase);
    // The outer third fades to nothing, so the disc ends in a haze and never on a drawn edge (D494).
    const light = (0.1 + 0.32 * Math.max(0, 1 - r) ** 1.5 + random() * 0.06) * (1 - smoothstep(0.62, 1.05, r));
    colours.set([tint[0] * light, tint[1] * light, tint[2] * light, 0.6 + random() ** 4 * 2.4], slot * 4);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(places, 3));
  geometry.setAttribute("aColour", new Float32BufferAttribute(colours, 4));
  return geometry;
}
