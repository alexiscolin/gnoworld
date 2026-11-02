import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { HOME } from "./drift.ts";
import { moodAt, newMood } from "./mood.ts";
import {
  NEBULA_IMAGES,
  NEBULA_LAYERS,
  NEBULA_REACH,
  NEBULAE_MOST,
  NebulaField,
  nebulaLight,
  nebulaShare,
  nebulaTint,
  sheetOf,
  windowOf,
  type Nebula,
} from "./nebulae.ts";
import { wholeShare } from "./whole.ts";

const far = 2 ** 40;
const coordinate = fc.double({ min: -far, max: far, noNaN: true });
const nearby = fc.double({ min: -700, max: 700, noNaN: true });
const point = fc.record({ x: coordinate, y: coordinate, z: coordinate });
// The scene's lens, at the video's size: 50 degrees from top to bottom, the eye looking down -z.
const WIDTH = 1728;
const HEIGHT = 1080;
const FOCAL = HEIGHT / 2 / Math.tan((25 * Math.PI) / 180);
// The fill a frame pays for, in whole screens: every drawn sheet's quad on screen, each at most once. The budget this part records:
// first 8 screens of rounds, the same as 10 of the quads the GPU draws (8 / (π / 4) = 10.2).
const COVER_MOST = 10;
const EARTH_RADIUS = 1.457;
const CLUSTER_WIDTH = 340;

interface Eye {
  x: number;
  y: number;
  z: number;
}

const fieldAt = (eye: Eye) => {
  const field = new NebulaField();
  field.around(eye);
  return field;
};
const listed = (field: NebulaField): Nebula[] => field.list.slice(0, field.count).map((nebula) => ({ ...nebula }));
const byId = (field: NebulaField) => new Map(listed(field).map((nebula) => [nebula.id, nebula]));
const lightsAt = (field: NebulaField, eye: Eye) =>
  new Map(listed(field).map((nebula) => [nebula.id, nebulaLight(nebula, eye)]));
const layerAt = (layer: number) => {
  const found = NEBULA_LAYERS[layer];
  if (found === undefined) throw new Error(`no layer ${String(layer)}`);
  return found;
};

// Where a sheet falls on screen from `eye`, and its half-width in pixels; undefined behind the eye or in its plane.
function projected(nebula: Nebula, layer: number, eye: Eye) {
  const at = { x: 0, y: 0, z: 0 };
  const half = sheetOf(nebula, layerAt(layer), at);
  const depth = eye.z - at.z;
  if (depth < 1e-6) return undefined;
  return {
    x: WIDTH / 2 + ((at.x - eye.x) / depth) * FOCAL,
    y: HEIGHT / 2 - ((at.y - eye.y) / depth) * FOCAL,
    half: (half / depth) * FOCAL,
    depth,
  };
}

// The share of the screen the drawn sheets cover: every sheet with light is drawn whole, its square quad cut by the screen's edges.
function cover(field: NebulaField, eye: Eye): number {
  let sum = 0;
  for (const nebula of listed(field)) {
    if (nebulaLight(nebula, eye) <= 0) continue;
    for (let layer = 0; layer < NEBULA_LAYERS.length; layer += 1) {
      const sheet = projected(nebula, layer, eye);
      if (sheet === undefined) continue;
      const across = Math.max(0, Math.min(sheet.x + sheet.half, WIDTH) - Math.max(sheet.x - sheet.half, 0));
      const down = Math.max(0, Math.min(sheet.y + sheet.half, HEIGHT) - Math.max(sheet.y - sheet.half, 0));
      sum += (across * down) / (WIDTH * HEIGHT);
    }
  }
  return sum;
}

describe("the nebulae around an eye", () => {
  it("cuts them from the three real images whose credits ship", () => {
    expect(NEBULA_IMAGES).toEqual(["carina", "veil", "cliffs"]);
  });

  // Worked out apart from this code, in Python's doubles with JavaScript's integer rules by hand: the same place is the same nebula, on
  // every device and in every release.
  it.each([
    {
      eye: HOME,
      nebula: {
        id: 26874738,
        x: 4724.127520318143,
        y: 3513.0882118595764,
        z: -2794.1489765653387,
        image: 1,
        size: 474.1519592003897,
        turn: 5.7816649165908345,
        u: 0.34507630037056325,
        v: 0.48696775101212897,
        span: 0.8941468219272792,
        flip: 1,
        seed: 4.2481508404016495,
        red: 1,
        green: 0.36502848155974127,
        blue: 0.6676249514263095,
        strength: 0.9243596956599504,
      },
    },
    {
      eye: HOME,
      nebula: {
        id: 604313407,
        x: 5170.834422111511,
        y: 4313.793829805218,
        z: -2216.1980737466365,
        image: 1,
        size: 481.418233923614,
        turn: 0.6268224400934932,
        u: 0.5160050704082599,
        v: 0.4527043971829875,
        span: 0.646407387778163,
        flip: -1,
        seed: 29.655937299132347,
        red: 1,
        green: 0.30250973846272633,
        blue: 0.03862702204490322,
        strength: 0.15702066230667935,
      },
    },
    {
      eye: { x: 2 ** 40 + 0.5, y: -(2 ** 33), z: 7.25 },
      nebula: {
        id: 167415153,
        x: 1099511627848.612,
        y: -8589934758.356016,
        z: -605.3033374249935,
        image: 0,
        size: 692.239045817405,
        turn: 2.325533535417651,
        u: 0.3837782199935693,
        v: 0.4626884026731817,
        span: 0.6081184840761125,
        flip: 1,
        seed: 14.78976795077324,
        red: 0.07183042454399555,
        green: 0.6104302422242072,
        blue: 1,
        strength: 0.8076616620994173,
      },
    },
  ])("holds nebula $nebula.id in its place", ({ eye, nebula }) => {
    const found = byId(fieldAt(eye)).get(nebula.id);
    expect(found).toBeDefined();
    for (const [key, value] of Object.entries(nebula))
      expect(found?.[key as keyof Nebula], key).toBeCloseTo(value, key === "x" || key === "y" ? 3 : 9);
  });

  it("finds as many around home as a count apart from this code does, each once", () => {
    const ids = listed(fieldAt(HOME)).map(({ id }) => id);
    expect(ids).toHaveLength(14);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives a place the same nebula, whichever way the eye came to it", () => {
    let shared = 0;
    fc.assert(
      fc.property(point, fc.record({ x: nearby, y: nearby, z: nearby }), (eye, by) => {
        const first = byId(fieldAt(eye));
        const reused = new NebulaField();
        reused.around({ x: eye.x + 9000, y: eye.y, z: eye.z });
        reused.around({ x: eye.x + by.x, y: eye.y + by.y, z: eye.z + by.z });
        for (const [id, nebula] of byId(reused)) {
          if (!first.has(id)) continue;
          shared += 1;
          expect(nebula).toEqual(first.get(id));
        }
      }),
    );
    expect(shared).toBeGreaterThan(100);
  });

  it.each([2 ** 60, -(2 ** 60)])("stands none for an eye at %s, past where a lattice counts whole cells", (farOut) => {
    for (const eye of [
      { x: farOut, y: 0, z: 0 },
      { x: 0, y: farOut, z: 0 },
      { x: 0, y: 0, z: farOut },
    ])
      expect(fieldAt(eye).count).toBe(0);
  });

  it.each([1e19, -1e19, Infinity, -Infinity, NaN])("stands none, and ends, for an eye at %s", (farOut) => {
    for (const eye of [
      { x: farOut, y: 0, z: 0 },
      { x: 0, y: farOut, z: 0 },
      { x: 0, y: 0, z: farOut },
    ])
      expect(fieldAt(eye).count).toBe(0);
  });

  it("keeps each one within reach, finite at any coordinate, never twice and never more than the bound", () => {
    fc.assert(
      fc.property(point, (eye) => {
        const field = fieldAt(eye);
        expect(field.count).toBeLessThanOrEqual(NEBULAE_MOST);
        const nebulae = listed(field);
        expect(new Set(nebulae.map(({ id }) => id)).size).toBe(nebulae.length);
        for (const nebula of nebulae) {
          for (const value of Object.values(nebula)) expect(Number.isFinite(value)).toBe(true);
          expect(Math.hypot(nebula.x - eye.x, nebula.y - eye.y, nebula.z - eye.z)).toBeLessThan(NEBULA_REACH * 1.05);
        }
      }),
    );
  });

  it("stands one where the mood's haze is, in the mood's colour from its brightest channel, as strong as the haze is thick", () => {
    const mood = newMood();
    fc.assert(
      fc.property(point, (eye) => {
        for (const nebula of listed(fieldAt(eye))) {
          moodAt(mood, nebula);
          expect(mood.haze).toBeGreaterThan(0);
          expect(nebula.strength).toBeGreaterThan(0);
          expect(nebula.strength).toBeLessThanOrEqual(1);
          if (mood.haze >= 0.35) expect(nebula.strength).toBeGreaterThanOrEqual(0.65);
          if (mood.haze < 0.02) expect(nebula.strength).toBeLessThan(0.02);
          const brightest = Math.max(mood.red, mood.green, mood.blue);
          expect(Math.max(nebula.red, nebula.green, nebula.blue)).toBeCloseTo(1, 9);
          expect(nebula.red).toBeCloseTo(mood.red / brightest, 9);
          expect(nebula.green).toBeCloseTo(mood.green / brightest, 9);
          expect(nebula.blue).toBeCloseTo(mood.blue / brightest, 9);
        }
      }),
    );
  });

  it("cuts each from one of the images, all of them used, a square window inside the picture", () => {
    const counts = NEBULA_IMAGES.map(() => 0);
    const window = { u: NaN, v: NaN, width: NaN, height: NaN };
    for (let at = 0; at < 300; at += 1) {
      for (const nebula of listed(fieldAt({ x: at * 3100.5, y: -at * 1700.25, z: at * 900.125 }))) {
        counts[nebula.image] = (counts[nebula.image] ?? 0) + 1;
        for (const layer of NEBULA_LAYERS) {
          windowOf(nebula, layer, window);
          // A square of the picture: the images are twice as wide as they are high.
          expect(Math.abs(window.width) * 2).toBeCloseTo(window.height, 9);
          const left = Math.min(window.u, window.u + window.width);
          expect(left).toBeGreaterThanOrEqual(0);
          expect(window.v).toBeGreaterThanOrEqual(0);
          expect(left + Math.abs(window.width)).toBeLessThanOrEqual(1);
          expect(window.v + window.height).toBeLessThanOrEqual(1);
          expect(Math.sign(window.width)).toBe(nebula.flip);
        }
      }
    }
    const total = counts.reduce((sum, count) => sum + count, 0);
    expect(total).toBeGreaterThan(300);
    for (const count of counts) expect(count / total).toBeGreaterThan(0.2);
  });

  it("stands the arrival's view on one: lit, in frame, from the eye at home", () => {
    const seen = listed(fieldAt(HOME)).filter((nebula) => {
      const sheet = projected(nebula, 1, HOME);
      return (
        sheet !== undefined &&
        nebulaLight(nebula, HOME) > 0.3 &&
        sheet.x > 0 &&
        sheet.x < WIDTH &&
        sheet.y > 0 &&
        sheet.y < HEIGHT
      );
    });
    expect(seen.length).toBeGreaterThan(0);
  });
});

describe("its layers", () => {
  it("parts them as the eye moves: the nearer a sheet, the further it slides, a quarter more at least", () => {
    let checked = 0;
    for (let at = 0; at < 200; at += 1) {
      const eye = { x: HOME.x + at * 1301.5, y: HOME.y - at * 77.25, z: HOME.z + at * 913.75 };
      for (const nebula of listed(fieldAt(eye))) {
        if (nebulaLight(nebula, eye) < 0.05) continue;
        const sheets = NEBULA_LAYERS.map((_, layer) => projected(nebula, layer, eye));
        if (sheets.some((sheet) => sheet === undefined)) continue;
        checked += 1;
        // A step of the eye aside moves a sheet on screen by the focal over its depth.
        const slides = sheets.map((sheet) => FOCAL / (sheet?.depth ?? NaN));
        for (let layer = 1; layer < slides.length; layer += 1)
          expect(slides[layer] ?? NaN).toBeGreaterThan(slides[layer - 1] ?? NaN);
        expect((slides.at(-1) ?? NaN) / (slides[0] ?? NaN)).toBeGreaterThan(1.25);
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("softens what is far: each layer, far to near, sharper, and a closer cut of the same window", () => {
    expect(NEBULA_LAYERS.length).toBeGreaterThanOrEqual(3);
    const [nebula] = listed(fieldAt(HOME));
    if (nebula === undefined) throw new Error("no nebula at home");
    const before = { u: NaN, v: NaN, width: NaN, height: NaN };
    const after = { u: NaN, v: NaN, width: NaN, height: NaN };
    for (let layer = 1; layer < NEBULA_LAYERS.length; layer += 1) {
      const [farther, nearer] = [layerAt(layer - 1), layerAt(layer)];
      expect(nearer.blur).toBeLessThan(farther.blur);
      expect(nearer.along).toBeGreaterThan(farther.along);
      windowOf(nebula, farther, before);
      windowOf(nebula, nearer, after);
      expect(after.height).toBeLessThan(before.height);
      expect(after.u + after.width / 2).toBeCloseTo(before.u + before.width / 2, 9);
      expect(after.v + after.height / 2).toBeCloseTo(before.v + before.height / 2, 9);
    }
  });
});

describe("its light", () => {
  it("lights nothing up or out at once: a walk in small steps changes no nebula by more than a little", () => {
    const ways = [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: -1 },
      { x: 0.6, y: 0.48, z: -0.64 },
    ];
    let lit = 0;
    for (const way of ways) {
      const field = new NebulaField();
      let eye = { ...HOME };
      field.around(eye);
      let before = lightsAt(field, eye);
      for (let step = 0; step < 2000; step += 1) {
        eye = { x: eye.x + way.x * 3, y: eye.y + way.y * 3, z: eye.z + way.z * 3 };
        field.around(eye);
        const after = lightsAt(field, eye);
        for (const id of new Set([...before.keys(), ...after.keys()]))
          expect(Math.abs((after.get(id) ?? 0) - (before.get(id) ?? 0))).toBeLessThan(0.02);
        if ([...after.values()].some((light) => light > 0.1)) lit += 1;
        before = after;
      }
    }
    expect(lit).toBeGreaterThan(1000);
  }, 60_000);

  it("is none when it would add less than a level of eight bits: a sheet too faint to see is not drawn", () => {
    fc.assert(
      fc.property(point, (eye) => {
        for (const nebula of listed(fieldAt(eye))) {
          const light = nebulaLight(nebula, eye);
          expect(light === 0 || light >= 1 / 255).toBe(true);
        }
      }),
    );
    const [nebula] = listed(fieldAt(HOME));
    if (nebula === undefined) throw new Error("no nebula at home");
    expect(nebulaLight(nebula, { x: nebula.x + NEBULA_REACH - 1, y: nebula.y, z: nebula.z })).toBe(0);
  });

  it("is none at the reach, and none from its centre, where a flat sheet would read as a wash", () => {
    for (const nebula of listed(fieldAt(HOME))) {
      expect(nebulaLight(nebula, nebula)).toBe(0);
      expect(nebulaLight(nebula, { x: nebula.x + NEBULA_REACH, y: nebula.y, z: nebula.z })).toBe(0);
      expect(nebulaLight(nebula, { x: nebula.x, y: nebula.y + nebula.size * 0.5, z: nebula.z })).toBe(0);
      if (nebula.strength >= 1 / 255)
        expect(nebulaLight(nebula, { x: nebula.x, y: nebula.y, z: nebula.z + 1200 })).toBeCloseTo(nebula.strength, 9);
    }
  });

  // Worked out apart from this code, in Python, for the nebula held at home above.
  it("holds its fades' middles: the share's two ramps and the light's two", () => {
    expect(nebulaShare(7.5)).toBeCloseTo(0.175, 12);
    expect(nebulaShare(12)).toBeCloseTo(0.35, 12);
    expect(nebulaShare(138)).toBeCloseTo(0.675, 12);
    expect(nebulaShare(240)).toBe(1);
    expect(nebulaShare(510)).toBeCloseTo(0.5, 12);
    expect(nebulaShare(600)).toBeCloseTo(0.14003663749236717, 12);
    const nebula = byId(fieldAt(HOME)).get(26874738);
    if (nebula === undefined) throw new Error("no nebula 26874738 at home");
    const from = (away: number) => nebulaLight(nebula, { x: nebula.x + away, y: nebula.y, z: nebula.z });
    expect(from(1700)).toBeCloseTo(0.4621798478299752, 12);
    expect(from(545.2747530804481)).toBeCloseTo(0.4621798478299752, 12);
    expect(from(1300)).toBeCloseTo(0.9243596956599504, 12);
  });

  it("is dark near a world, low at a system's distance where the worlds are the subject, whole at a cluster's, gone past it", () => {
    expect(nebulaShare(0)).toBe(0);
    expect(nebulaShare(EARTH_RADIUS * 2)).toBe(0);
    expect(nebulaShare(36)).toBeCloseTo(0.35, 12);
    expect(nebulaShare(CLUSTER_WIDTH)).toBe(1);
    expect(nebulaShare(CLUSTER_WIDTH * 2)).toBe(0);
    for (let distance = 0; distance < 1000; distance += 0.25) {
      const share = nebulaShare(distance);
      expect(share).toBeGreaterThanOrEqual(0);
      expect(share).toBeLessThanOrEqual(1);
      expect(Math.abs(nebulaShare(distance + 0.25) - share)).toBeLessThan(0.05);
    }
  });
});

describe("its cost", () => {
  it("fills a few screens at most, wherever the eye is", () => {
    let most = cover(fieldAt(HOME), HOME);
    fc.assert(
      fc.property(point, (eye) => {
        const filled = cover(fieldAt(eye), eye);
        most = Math.max(most, filled);
        expect(filled).toBeLessThanOrEqual(COVER_MOST);
      }),
      { numRuns: 500 },
    );
    expect(most).toBeGreaterThan(0);
  });

  it("fills a few screens at most from inside a nebula too, its sheets all around the eye", () => {
    const offsets = [-400, -250, -120, 0, 120, 250, 400];
    for (const nebula of listed(fieldAt(HOME)))
      for (const along of offsets)
        for (const aside of offsets) {
          const eye = { x: nebula.x + aside, y: nebula.y, z: nebula.z + along };
          expect(cover(fieldAt(eye), eye)).toBeLessThanOrEqual(COVER_MOST);
        }
  });
});

describe("the hand-over to the whole cosmos", () => {
  it("gives the view to the worlds themselves at one distance: none to a cluster's, all from twice it, never both whole", () => {
    expect(wholeShare(0)).toBe(0);
    expect(wholeShare(CLUSTER_WIDTH)).toBe(0);
    expect(wholeShare(CLUSTER_WIDTH * 1.5)).toBeCloseTo(0.5, 12);
    expect(wholeShare(CLUSTER_WIDTH * 2)).toBe(1);
    expect(wholeShare(1e9)).toBe(1);
    for (let distance = 0; distance < 3000; distance += 0.5) {
      const whole = wholeShare(distance);
      expect(whole + nebulaShare(distance)).toBeLessThanOrEqual(1 + 1e-12);
      // No dark gap between the two: past a cluster's distance one gives what the other takes.
      if (distance >= CLUSTER_WIDTH) expect(whole + nebulaShare(distance)).toBeCloseTo(1, 12);
      expect(Math.abs(wholeShare(distance + 0.5) - whole)).toBeLessThan(0.005);
    }
  });
});

// Frame 16's teal, top right (f0016.jpg, its pixels read with ffmpeg on 2026-11-02): mean sRGB (10, 44, 50), hue 190, its pixels' hues
// 182 to 193 from the tenth to the ninetieth part. A cool nebula takes it, dark and discreet as there (Alexis, 2026-11-02).
const FRAME_TEAL = { least: 182, most: 194 };
const FRAME_MEAN = [10, 44, 50] as const;
const encoded = (linear: number) => (linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055);
const decoded = (byte: number) => {
  const unit = byte / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
};
function hueOf(red: number, green: number, blue: number): number {
  const [r, g, b] = [encoded(red), encoded(green), encoded(blue)];
  const top = Math.max(r, g, b);
  const span = top - Math.min(r, g, b);
  if (span === 0) return 0;
  const sector = top === r ? (g - b) / span : top === g ? 2 + (b - r) / span : 4 + (r - g) / span;
  return (sector * 60 + 360) % 360;
}

describe("a nebula's colour", () => {
  it("takes frame 16's teal where the mood is cool, never the grey-blue between its hues", () => {
    const tint = { red: 0, green: 0, blue: 0 };
    let cool = 0;
    fc.assert(
      fc.property(point, (eye) => {
        for (const nebula of listed(fieldAt(eye))) {
          nebulaTint(nebula, tint);
          expect(Math.max(tint.red, tint.green, tint.blue)).toBeCloseTo(1, 9);
          if (nebula.blue < 0.6 || nebula.blue - nebula.red < 0.5) continue;
          cool += 1;
          const hue = hueOf(tint.red, tint.green, tint.blue);
          expect(hue).toBeGreaterThanOrEqual(FRAME_TEAL.least);
          expect(hue).toBeLessThanOrEqual(FRAME_TEAL.most);
          // At the frame's own light it is the frame's teal to the byte: its hue, its saturation, its green against its blue.
          const brightest = Math.max(...FRAME_MEAN.map(decoded));
          const bytes = [tint.red, tint.green, tint.blue].map((channel) =>
            Math.round(encoded(channel * brightest) * 255),
          );
          expect(bytes).toEqual([...FRAME_MEAN]);
        }
      }),
      { numRuns: 300 },
    );
    expect(cool).toBeGreaterThan(20);
  });

  it("keeps a warm nebula the mood's own colour, and moves no colour at once between the two", () => {
    const tintOf = (red: number, green: number, blue: number) => {
      const tint = { red: 0, green: 0, blue: 0 };
      const brightest = Math.max(red, green, blue);
      nebulaTint({ red: red / brightest, green: green / brightest, blue: blue / brightest }, tint);
      return tint;
    };
    expect(tintOf(1, 0.35, 0.05)).toEqual({ red: 1, green: 0.35, blue: 0.05 });
    expect(tintOf(1, 0.09, 0.2)).toEqual({ red: 1, green: 0.09, blue: 0.2 });
    // From the mood's rose to its teal through mauve, in a hundred steps: each moves the colour a little.
    const [rose, teal] = [
      [0.1946, 0.0176, 0.0395],
      [0.006, 0.0497, 0.0844],
    ] as const;
    let before = tintOf(...rose);
    for (let step = 1; step <= 100; step += 1) {
      const by = step / 100;
      const after = tintOf(
        rose[0] + (teal[0] - rose[0]) * by,
        rose[1] + (teal[1] - rose[1]) * by,
        rose[2] + (teal[2] - rose[2]) * by,
      );
      const moved =
        Math.abs(after.red - before.red) + Math.abs(after.green - before.green) + Math.abs(after.blue - before.blue);
      expect(moved).toBeLessThan(0.12);
      before = after;
    }
  });
});
