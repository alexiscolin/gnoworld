import type { Page } from "./fixtures.ts";
import type { Circle } from "./lab.ts";
import { READ, type added, type gridOf } from "./coasts.ts";
import { reading, type Tools } from "./pixels.ts";
import type { colourKind } from "./textures.ts";

// A temperate world's land by latitude (7b8), on coasts.ts's grid: each band's land, its mean colour and how much of it is green, and the
// land in full light, its colour and its chroma. Hue and greenness, never lightness, carry the climate: a disc's light falls toward its
// poles and its night, the Earth's map is unlit. The Earth's day map is read by its own latitudes.
type Lab = readonly [number, number, number];
export type Pole = readonly [number, number, number];
/** A band of latitude: its land's share of its lit ground, the land's mean colour, and the share of it green (hue 95 to 150, chroma 3+). */
interface Band {
  readonly land: number;
  readonly lab: Lab | null;
  readonly green: number;
}
/** Tropics (15 to 35 degrees), middle (40 to 60) and high (60 on); the land in full light (luma over 25, kindOf's): its mean colour, its
 * mean chroma, its green share and its green part's mean L* (null under 30 pixels). */
export interface Climate {
  readonly bands: readonly [Band, Band, Band];
  readonly land: Lab | null;
  readonly chroma: number;
  readonly green: number;
  readonly greenLight: number | null;
}
// The helpers the reading page declares, as it holds them: an imported function is a property of the import's binding once compiled.
interface Held {
  readonly gridOf: typeof gridOf;
  readonly added: typeof added;
  readonly colourKind: typeof colourKind;
}
const held = (): Held => globalThis as unknown as Held;

// The band of latitude a sine of it falls in: tropics, middle, high, or none.
const bandOf = (sine: number) =>
  sine >= 0.259 && sine <= 0.574 ? 0 : sine >= 0.643 && sine < 0.866 ? 1 : sine >= 0.866 ? 2 : -1;

// A band from its sums of lit and land weights, its land's L*, a* and b*, and its green weight.
function bandFrom([lit = 0, ground = 0, l = 0, a = 0, b = 0, green = 0]: readonly number[]): Band {
  return {
    land: ground / Math.max(lit, 1),
    lab: ground < 30 ? null : [l / ground, a / ground, b / ground],
    green: green / Math.max(ground, 1),
  };
}

// The land in full light from its sums of weight, L*, a*, b*, chroma, green weight and green L*.
function litFrom([weight = 0, l = 0, a = 0, b = 0, chroma = 0, green = 0, greenL = 0]: readonly number[]) {
  const mean = (sum: number) => sum / Math.max(weight, 1);
  return {
    land: weight < 30 ? null : ([mean(l), mean(a), mean(b)] as const),
    chroma: mean(chroma),
    green: mean(green),
    greenLight: green < 30 ? null : greenL / green,
  };
}

// Sums by band from pixels `[x, y, sine of latitude, weight, kind]` (coasts.ts's kinds: 2 is land), and of the land in full light.
function summed(points: readonly (readonly [number, number, number, number, number])[]): Climate {
  const { image, labAt, luma } = Reflect.get(globalThis, "__pixels") as Tools;
  const sums = [0, 1, 2, 3].map((): number[] => []);
  for (const [x, y, sine, weight, kind] of points) {
    const [l, a, b] = kind === 2 ? labAt(image, x, y) : [0, 0, 0];
    const hue = (Math.atan2(b, a) * 180) / Math.PI;
    const green = Number(kind === 2 && Math.hypot(a, b) >= 3 && hue >= 95 && hue <= 150);
    held().added(sums[bandOf(sine)], [1, Number(kind === 2), l, a, b, green], weight);
    if (kind === 2 && luma(image, x, y) > 25)
      held().added(sums[3], [1, l, a, b, Math.hypot(a, b), green, green * l], weight);
  }
  const [tropics, middle, high] = sums.map(bandFrom);
  return { bands: [tropics, middle, high] as Climate["bands"], ...litFrom(sums[3] ?? []) };
}

// Each disc's pixels read, with the sine of their latitude from its pole in its own screen frame (the lab's poles).
function climatesOf(input: readonly (readonly [Circle, Pole])[]): Climate[] {
  return input.map(([disc, [px, py, pz]]) => {
    const { kinds, w, x0, y0 } = held().gridOf(disc);
    const points = [...kinds.keys()].flatMap((at) => {
      const [x, y] = [x0 + (at % w), y0 + Math.floor(at / w)];
      const [nx, ny] = [(x - disc.x) / disc.r, (disc.y - y) / disc.r];
      const sine = Math.abs(nx * px + ny * py + Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * pz);
      return kinds[at] === 0 ? [] : [[x, y, sine, 1, kinds[at] ?? 0] as const];
    });
    return summed(points);
  });
}

// An equirectangular map's pixels, one in four each way, each weighed by its row's share of the sphere, every one lit.
function mapClimateOf(): Climate {
  const { image } = Reflect.get(globalThis, "__pixels") as Tools;
  const height = image.data.length / 4 / image.width;
  const codes = { sea: 1, land: 2, cloud: 3 } as const;
  const points: [number, number, number, number, number][] = [];
  for (let y = 0; y < height; y += 4)
    for (let x = 0; x < image.width; x += 4) {
      const latitude = (0.5 - (y + 0.5) / height) * Math.PI;
      const kind = codes[held().colourKind(x, y)];
      points.push([x, y, Math.abs(Math.sin(latitude)), Math.cos(latitude), kind]);
    }
  return summed(points);
}

const BANDS = [READ, `const held = ${String(held)};`, `const bandOf = ${String(bandOf)};`, bandFrom, litFrom, summed]
  .map(String)
  .join("\n");

export const climatesOn = (
  page: Page,
  picture: Buffer,
  discs: readonly (readonly [Circle, Pole])[],
): Promise<Climate[]> => reading(page, [picture], [climatesOf, discs, BANDS]);
export const mapClimateOn = (page: Page, map: Buffer): Promise<Climate> =>
  reading(page, [map], [mapClimateOf, undefined, BANDS]);
