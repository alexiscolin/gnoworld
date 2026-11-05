// A world's small picture, drawn once from the look the scene draws it from (its seed, its class, its ramp of colours) as an SVG, with no
// WebGL and no map to fetch: the look's colours and shapes, not the scene's shader. Cached by id, so a world is one string everywhere.
import { planetSeed, worldLook, worldPath, type Anchor } from "@gnoworld/core";

type Attributes = Record<string, string | number>;

const SIDE = 64;
const MIDDLE = SIDE / 2;
const CACHE = new Map<string, string>();
// The classes drawn in bands from pole to pole (anchors.ts); the others in patches.
const GIANTS: ReadonlySet<Anchor> = new Set([
  "gas giant",
  "ice giant",
  "cloud deck",
  "water cloud giant",
  "azure giant",
  "dark giant",
  "hot giant",
  "sub-Neptune",
]);

// A colour of the look, its channels from 0 to 1, as the hex colour a picture takes.
const hex = (colour: readonly number[]): string =>
  `#${colour
    .map((value) =>
      Math.round(255 * Math.min(1, Math.max(0, value)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

const tag = (name: string, attributes: Attributes, inside = ""): string => {
  const written = Object.entries(attributes).map(([key, value]) => ` ${key}='${String(value)}'`);
  return `<${name}${written.join("")}>${inside}</${name}>`;
};

// A seed byte as a number from `from` to `to`.
const spread = (seed: Uint8Array, at: number, [from, to]: readonly [number, number]): number =>
  from + ((seed[at % seed.length] ?? 0) / 255) * (to - from);

const NIGHT = "#05070d";
const STOPS =
  tag("stop", { offset: 0.35, "stop-color": NIGHT, "stop-opacity": 0 }) +
  tag("stop", { offset: 1, "stop-color": NIGHT, "stop-opacity": 0.85 });

// Bands of the ramp's three colours, or patches of them on its middle one.
function surface(seed: Uint8Array, colours: readonly string[], banded: boolean): string {
  const pick = (at: number) => colours[(seed[at] ?? 0) % colours.length] ?? "";
  let paint = tag("rect", { width: SIDE, height: SIDE, fill: colours[1] ?? "" });
  const count = banded ? 5 + ((seed[0] ?? 0) % 8) : 9;
  for (let at = 0; at < count; at += 1)
    paint += banded
      ? tag("rect", {
          y: (at * SIDE) / count,
          width: SIDE,
          height: SIDE / count + 1,
          fill: pick(at + 1),
          opacity: 0.85,
        })
      : tag("ellipse", {
          cx: spread(seed, at, [6, 58]),
          cy: spread(seed, at + 9, [6, 58]),
          rx: spread(seed, at + 18, [8, 20]),
          ry: spread(seed, at + 3, [6, 14]),
          fill: pick(at + 8),
          opacity: 0.8,
        });
  return paint;
}

/** The picture of the world `id`, an SVG data URI: the same string for the same world, a different one for a different seed. */
export function worldThumb(id: string): string {
  const held = CACHE.get(id);
  if (held !== undefined) return held;
  const { ramp, anchor } = worldLook(id);
  const disc = { cx: MIDDLE, cy: MIDDLE, r: MIDDLE };
  const defs = tag(
    "defs",
    {},
    tag("clipPath", { id: "d" }, tag("circle", disc)) +
      tag("filter", { id: "b" }, tag("feGaussianBlur", { stdDeviation: 3 })) +
      tag("radialGradient", { id: "s", cx: "35%", cy: "30%", r: "85%" }, STOPS),
  );
  const painted = surface(planetSeed(worldPath(id)), ramp.map(hex), GIANTS.has(anchor));
  const svg = tag(
    "svg",
    { xmlns: "http://www.w3.org/2000/svg", viewBox: `0 0 ${String(SIDE)} ${String(SIDE)}` },
    defs +
      tag(
        "g",
        { "clip-path": "url(#d)" },
        tag("g", { filter: "url(#b)" }, painted) + tag("rect", { width: SIDE, height: SIDE, fill: "url(#s)" }),
      ),
  );
  const picture = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  CACHE.set(id, picture);
  return picture;
}
