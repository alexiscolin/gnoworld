import { ANCHORS } from "@gnoworld/core";
import { expect, test, type Page } from "./fixtures.ts";
import { brightness, colours } from "./geometry.ts";

// 7b's realism page (app/lab): a world of each anchor and one nebula made both ways, for Alexis's eye on a real GPU. These journeys hold what a
// software GPU can prove: it draws, under the site's CSP (the fixtures fail on a violation), on a small set of maps, inside its memory.
// The canvas is not pixel-compared (the plan, section 6).
const PAGE = "/lab/realism.html";
// Nine surface maps (the Earth's among them), the clouds and the ring's profile.
const MAPS_AT_MOST = 11;
const MEMORY_AT_MOST = 120 * 1024 * 1024;
// How far apart two classes' added light may lie at one stage: their forms differ, their reading must not. A golden net lights a whole disc, as
// frame 4's does, and has a bound of its own.
const LIT_APART = 6;
const NET_APART = 30;
const NETS: readonly string[] = ["volcanic", "dark carbon", "lava world"];
const NEBULA_AT_MOST = 40 * 1024 * 1024;
const COMPUTER = { width: 1728, height: 1080 };
const VIEWS = [
  "?view=gallery",
  "?view=close&world=1",
  "?view=eclipse&world=1",
  "?view=nebula&method=computed",
  "?view=earth",
];

interface LabStats {
  view: string;
  worlds: number;
  frames: number;
  textures: number;
  images: number;
  programs: number;
  calls: number;
  mapBytes: number;
  targetBytes: number;
  renderer: string;
}
interface Circle {
  x: number;
  y: number;
  r: number;
}

const askLab = <T>(page: Page, what: "stats" | "circles" | "looks" | "stages") =>
  page.evaluate((name) => {
    const lab: unknown = Reflect.get(globalThis, "__lab");
    return (lab as Record<typeof name, () => T>)[name]();
  }, what);
const stats = (page: Page) => askLab<LabStats>(page, "stats");
const circles = (page: Page) => askLab<Circle[]>(page, "circles");
const looks = (page: Page) => askLab<{ anchor: string }[]>(page, "looks");
const stages = (page: Page) => askLab<string[]>(page, "stages");

// What a software GPU may take to build a view with its 4096 maps, at a gate's load.
const SOFTWARE = { timeout: 60_000 };
const drawn = (page: Page) => expect(page.locator("canvas[data-drawn='true']")).toBeAttached(SOFTWARE);

const open = async (page: Page, query: string) => {
  await page.setViewportSize(COMPUTER);
  // Under reduced motion the page draws once a change: a software GPU takes seconds a frame.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const answer = await page.goto(`${PAGE}${query}`);
  const policy = answer?.headers()["content-security-policy"] ?? "";
  expect(policy).toContain("script-src 'self'");
  expect(policy).toContain("worker-src 'self'");
  expect(policy).not.toContain("unsafe-eval");
  expect(policy).not.toContain("blob:");
  await drawn(page);
};

// With the panel away, which sits over a corner: P hides it, as for a capture.
const lit = async (page: Page, boxes: [number, number, number, number][]) => {
  await page.keyboard.press("p");
  await expect(page.getByRole("main")).toBeHidden();
  return brightness(page, await page.locator("canvas").screenshot(), boxes);
};

const { width, height } = COMPUTER;
const CORNER = 80;
const CORNERS: [number, number, number, number][] = [
  [0, 0, CORNER, CORNER],
  [width - CORNER, 0, width, CORNER],
  [0, height - CORNER, CORNER, height],
  [width - CORNER, height - CORNER, width, height],
];
// Each world's whole disc: a stage adds its lights near the limb too, and the day side, which it leaves alone, cancels out.
const discs = (places: readonly Circle[]): [number, number, number, number][] =>
  places.map(({ x, y, r }) => [Math.round(x - r), Math.round(y - r), Math.round(x + r), Math.round(y + r)]);
const discLight = async (page: Page, query: string) => {
  await open(page, `?view=gallery&${query}`);
  return lit(page, discs(await circles(page)));
};
const nightAt = (page: Page, stage: string) => discLight(page, `stage=${stage}`);
// Each class's night side, stage by stage. A living world's few first lights may stand on its far side as it turns: from inhabited on, none may hide.
const holdsItsClimb = (climb: readonly string[], seen: readonly number[][]) => {
  for (const [index, anchor] of ANCHORS.entries()) {
    const ladder = seen.map((levels) => levels[index] ?? 0);
    expect(ladder[1], `${anchor}, living`).toBeGreaterThanOrEqual(ladder[0] ?? 0);
    for (const [step, level] of ladder.slice(2).entries())
      expect(level, `${anchor}, ${climb[step + 2] ?? ""}`).toBeGreaterThan(ladder[step + 1] ?? 0);
  }
};
const addedOver = (levels: readonly number[], rest: readonly number[]) =>
  levels.map((level, index) => level - (rest[index] ?? 0));
const readsAlike = ([rest = [], living = [], , , beacon = []]: readonly number[][]) => {
  const stirring = addedOver(living, rest).filter((added) => added > 0);
  expect(stirring.length, "most worlds show their first lights").toBeGreaterThanOrEqual(ANCHORS.length / 2);
  const added = addedOver(beacon, rest);
  const towns = added.filter((_, index) => !NETS.includes(ANCHORS[index] ?? ""));
  const faintest = Math.min(...towns);
  expect(Math.max(...towns) / faintest, "one stage, read alike").toBeLessThan(LIT_APART);
  expect(Math.max(...added) / faintest, "a net, the brightest").toBeLessThan(NET_APART);
};
// Blue gains the least. Red cannot rise where a shattered world's own lava already fills it, so green speaks for that one.
const warmer = (anchor: string, before: readonly number[] = [], after: readonly number[] = []) => {
  const gain = (channel: number) => (after[channel] ?? 0) - (before[channel] ?? 0);
  if (anchor !== "shattered") expect(gain(0), anchor).toBeGreaterThan(gain(2));
  expect(gain(1), anchor).toBeGreaterThan(gain(2));
};
const whole = (circle: Circle) => {
  expect(circle.x - circle.r).toBeGreaterThanOrEqual(0);
  expect(circle.y - circle.r).toBeGreaterThanOrEqual(0);
  expect(circle.x + circle.r).toBeLessThanOrEqual(width);
  expect(circle.y + circle.r).toBeLessThanOrEqual(height);
};

test.describe("the realism page", () => {
  // SwiftShader draws a world of each anchor in seconds at this size, and more at a gate's load.
  test.slow();

  // A shader that fails to compile only reaches the console, and a map that fails only draws black.
  const wrong: string[] = [];
  test.beforeEach(({ page }) => {
    wrong.length = 0;
    page.on("console", (message) => {
      // A screenshot reads the buffer back, which the driver remarks on; a software GPU has no parallel compile, which the Earth's build asks for.
      const software = ["GPU stall", "KHR_parallel_shader_compile"].some((remark) => message.text().includes(remark));
      if (["error", "warning"].includes(message.type()) && !software) wrong.push(message.text());
    });
    page.on("pageerror", (error) => wrong.push(error.message));
    page.on("response", (response) => {
      if (response.url().includes("/textures/") && response.status() !== 200) wrong.push(response.url());
    });
  });
  test.afterEach(() => {
    expect(wrong, "the console and the textures").toEqual([]);
  });

  test("a world of each anchor in their order, all in frame, none on another", async ({ page }) => {
    await open(page, "?view=gallery");
    const found = await stats(page);
    expect(found.view).toBe("gallery");
    expect(found.worlds).toBe(ANCHORS.length);
    expect((await looks(page)).map((look) => look.anchor)).toEqual(ANCHORS);
    const places = await circles(page);
    expect(places).toHaveLength(ANCHORS.length);
    for (const [index, place] of places.entries()) {
      whole(place);
      expect(place.r).toBeGreaterThan(60);
      for (const other of places.slice(index + 1))
        expect(Math.hypot(place.x - other.x, place.y - other.y)).toBeGreaterThan(place.r + other.r);
    }
    const lights = await lit(
      page,
      places.map(({ x, y, r }) => [
        Math.round(x - r / 2),
        Math.round(y - r / 2),
        Math.round(x + r / 2),
        Math.round(y + r / 2),
      ]),
    );
    for (const light of lights) expect(light).toBeGreaterThan(2);
  });

  test("they share a small set of maps and few programs", async ({ page }) => {
    await open(page, "?view=gallery");
    const found = await stats(page);
    expect(found.textures).toBeLessThanOrEqual(MAPS_AT_MOST);
    expect(found.textures).toBeGreaterThan(5);
    // Surface, shell, rings, the stars and the star's sprite, each one program whatever the count of worlds.
    expect(found.programs).toBeLessThanOrEqual(6);
  });

  test("their maps stay inside the memory the plan allows", async ({ page }) => {
    await open(page, "?view=gallery");
    const found = await stats(page);
    expect(found.mapBytes).toBeGreaterThan(0);
    expect(found.mapBytes).toBeLessThanOrEqual(MEMORY_AT_MOST);
  });

  for (const query of ["?view=close&world=1", "?view=eclipse&world=1"])
    test(`a close view's 4096 maps stay inside it too, on ${query}`, async ({ page }) => {
      await open(page, query);
      const found = await stats(page);
      expect(found.mapBytes).toBeGreaterThan(0);
      expect(found.mapBytes).toBeLessThanOrEqual(MEMORY_AT_MOST);
    });

  test("a world close up holds the frame, with near-black space around it", async ({ page }) => {
    await open(page, "?view=close&world=1");
    expect((await stats(page)).worlds).toBe(1);
    const [place] = await circles(page);
    if (place === undefined) throw new Error("no world");
    whole(place);
    expect(place.r).toBeGreaterThan(300);
    const { x, y, r } = place;
    const [disc = 0, ...corners] = await lit(page, [
      [Math.round(x), Math.round(y - r / 3), Math.round(x + r / 2), Math.round(y + r / 3)],
      ...CORNERS,
    ]);
    expect(disc).toBeGreaterThan(8);
    for (const corner of corners) expect(corner).toBeLessThan(16);
  });

  test("a star behind a world leaves its disc black and lights its rim", async ({ page }) => {
    await open(page, "?view=eclipse&world=1");
    expect((await stats(page)).view).toBe("eclipse");
    const [place] = await circles(page);
    if (place === undefined) throw new Error("no world");
    const { x, y, r } = place;
    const round = Math.round;
    const [disc = 0, rim = 0] = await lit(page, [
      [round(x - r / 4), round(y - r / 4), round(x + r / 4), round(y + r / 4)],
      // A thin box across the limb, on the side the star lights.
      [round(x + r * 0.97), round(y - r * 0.1), round(x + r * 1.05), round(y + r * 0.1)],
    ]);
    expect(disc).toBeLessThan(10);
    expect(rim).toBeGreaterThan(disc + 20);
    // What the ceiling of 10 is for: a night with air keeps a deep blue and the ground's faint form, no hole in the sky.
    const [night] = await colours(page, await page.locator("canvas").screenshot(), [
      [round(x - r / 4), round(y - r / 4), round(x + r / 4), round(y + r / 4)],
    ]);
    if (night === undefined) throw new Error("no disc");
    const [red, , blue] = night;
    expect(disc).toBeGreaterThan(1);
    expect(blue).toBeGreaterThan(red);
  });

  for (const method of ["computed", "image"])
    test(`the nebula made as ${method} draws, and stays near-black at its corners`, async ({ page }) => {
      await open(page, `?view=nebula&method=${method}`);
      const found = await stats(page);
      expect(found.view).toBe(`nebula ${method}`);
      if (method === "image") expect(found.images).toBeGreaterThanOrEqual(1);
      else expect(found.images).toBe(0);
      expect(found.mapBytes + found.targetBytes).toBeLessThanOrEqual(NEBULA_AT_MOST);
      const [middle = 0, ...corners] = await lit(page, [[0, height / 2 - 100, width, height / 2 + 100], ...CORNERS]);
      expect(middle).toBeGreaterThan(4);
      for (const corner of corners) expect(corner).toBeLessThan(16);
    });

  test("the Earth view draws the Earth itself, lit from the right, with the night on its left", async ({ page }) => {
    await open(page, "?view=earth");
    expect((await stats(page)).view).toBe("earth");
    const [day = 0, night = 0, ...corners] = await lit(page, [
      [Math.round(width * 0.54), Math.round(height * 0.45), Math.round(width * 0.6), Math.round(height * 0.55)],
      [Math.round(width * 0.31), Math.round(height * 0.45), Math.round(width * 0.36), Math.round(height * 0.55)],
      ...CORNERS,
    ]);
    expect(day).toBeGreaterThan(night + 20);
    for (const corner of corners) expect(corner).toBeLessThan(16);
  });

  test("the same path gives the same world on a second visit", async ({ page }) => {
    await open(page, "?view=close&world=4");
    const first = JSON.stringify(await looks(page));
    await page.reload();
    await drawn(page);
    expect(JSON.stringify(await looks(page))).toBe(first);
  });

  for (const query of VIEWS)
    test(`the textures' authors are named on ${query}`, async ({ page }) => {
      await open(page, query);
      const credits = page.getByRole("contentinfo");
      await expect(credits).toContainText("Solar System Scope");
      await expect(credits).toContainText("CC BY 4.0");
      await expect(credits).toContainText("ESA/Hubble");
    });

  test("the keys walk the views, and each still draws", async ({ page }) => {
    await open(page, "?view=gallery");
    await page.keyboard.press("2");
    await expect.poll(async () => (await stats(page)).view).toBe("close");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("world")).toContainText("temperate");
    await drawn(page);
    await page.keyboard.press("3");
    await expect.poll(async () => (await stats(page)).view).toBe("eclipse");
    await drawn(page);
    await page.keyboard.press("4");
    await expect.poll(async () => (await stats(page)).view).toBe("nebula computed");
    await page.keyboard.press("n");
    await expect.poll(async () => (await stats(page)).view).toBe("nebula image");
    await drawn(page);
    await page.keyboard.press("5");
    await expect.poll(async () => (await stats(page)).view).toBe("earth");
    await drawn(page);
    await page.keyboard.press("1");
    await expect.poll(async () => (await stats(page)).view).toBe("gallery");
  });

  for (const query of [
    "?view=bogus",
    "?view=close&world=99",
    "?view=close&world=-1",
    "?view=close&world=abc",
    "?view=nebula&method=x",
  ])
    test(`a page asked for ${query} still draws one of its views`, async ({ page }) => {
      await open(page, query);
      expect((await stats(page)).worlds + (await stats(page)).calls).toBeGreaterThan(0);
    });

  test("with motion allowed the loop runs, and a pointer moves the eye without reallocating the canvas", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 480, height: 300 });
    await page.goto(`${PAGE}?view=close&world=6`);
    await drawn(page);
    const before = (await stats(page)).frames;
    await expect.poll(async () => (await stats(page)).frames, { timeout: 60_000 }).toBeGreaterThan(before + 2);
    await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      if (canvas === null) throw new Error("no canvas");
      const size = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "width");
      Reflect.set(globalThis, "__resized", 0);
      Object.defineProperty(canvas, "width", {
        get: () => size?.get?.call(canvas) as number,
        set: (value: number) => {
          Reflect.set(globalThis, "__resized", Number(Reflect.get(globalThis, "__resized")) + 1);
          size?.set?.call(canvas, value);
        },
      });
    });
    await page.mouse.move(100, 100);
    await page.mouse.move(300, 200);
    await expect
      .poll(() => page.evaluate(() => Number(Reflect.get(globalThis, "__resized"))), { timeout: 2_000 })
      .toBe(0);
  });

  test("a view at rest asks for no map more: only a stage's lights do", async ({ page }) => {
    await open(page, "?view=close&world=2");
    const { textures } = await stats(page);
    await open(page, "?view=close&world=2&stage=rest");
    expect((await stats(page)).textures).toBe(textures);
    await open(page, "?view=close&world=2&stage=busy");
    expect((await stats(page)).textures).toBe(textures + 1);
  });

  test("how far lights reach follows the vitality alone, the people held", async ({ page }) => {
    const settled = await discLight(page, "stage=inhabited&present=0.5");
    const further = await discLight(page, "stage=beacon&present=0.5");
    for (const [index, anchor] of ANCHORS.entries())
      expect(further[index], anchor).toBeGreaterThan(settled[index] ?? 0);
  });

  test("how lit they are follows the people alone, the vitality held", async ({ page }) => {
    const empty = await discLight(page, "stage=busy&present=0.05");
    const full = await discLight(page, "stage=busy&present=0.95");
    for (const [index, anchor] of ANCHORS.entries()) expect(full[index], anchor).toBeGreaterThan(empty[index] ?? 0);
  });

  test("a seed glows pink past its limb, fades out by three radii, and a world at rest does not glow", async ({
    page,
  }) => {
    await open(page, "?view=stages&world=0");
    const [seed, rest] = await circles(page);
    if (seed === undefined || rest === undefined) throw new Error("no worlds");
    const beside = ({ x, y, r }: Circle, from: number): [number, number, number, number] => [
      Math.round(x + r * from),
      Math.round(y - r * 0.2),
      Math.round(x + r * from + 8),
      Math.round(y + r * 0.2),
    ];
    await page.keyboard.press("p");
    const picture = await page.locator("canvas").screenshot();
    const [near, far, plain] = await colours(page, picture, [beside(seed, 1.4), beside(seed, 3.2), beside(rest, 1.4)]);
    if (near === undefined || far === undefined || plain === undefined) throw new Error("no boxes");
    expect(near[0], "its glow").toBeGreaterThan(plain[0] + 8);
    expect(near[0], "red over blue").toBeGreaterThan(near[1]);
    expect(far[0], "gone by three radii").toBeLessThan(near[0] / 3);
    expect(plain[0], "no glow at rest").toBeLessThan(6);
  });

  test("a stage reads the same on every class: each night side lights up as a world grows", async ({ page }) => {
    const climb = ["rest", "living", "inhabited", "busy", "beacon"];
    const seen: number[][] = [];
    for (const stage of climb) seen.push(await nightAt(page, stage));
    holdsItsClimb(climb, seen);
    readsAlike(seen);
  });

  test("every class's lights keep the Earth's warm family: a form varies, a colour does not", async ({ page }) => {
    await open(page, "?view=gallery&stage=rest");
    const places = await circles(page);
    const boxes = discs(places);
    await page.keyboard.press("p");
    const before = await colours(page, await page.locator("canvas").screenshot(), boxes);
    await open(page, "?view=gallery&stage=beacon");
    await page.keyboard.press("p");
    const after = await colours(page, await page.locator("canvas").screenshot(), boxes);
    for (const [index, anchor] of ANCHORS.entries()) warmer(anchor, before[index], after[index]);
  });

  test("a gas giant's lights lie in belts: the form is its own, not the towns' of a rock", async ({ page }) => {
    await open(page, "?view=gallery&stage=rest");
    const giant = (await circles(page))[ANCHORS.indexOf("gas giant")];
    if (giant === undefined) throw new Error("no giant");
    const { x, y, r } = giant;
    const round = Math.round;
    const step = (r * 0.6) / 10;
    const strips = Array.from({ length: 10 }, (_, at) => at);
    const rows = strips.map((at): [number, number, number, number] => [
      round(x - r * 0.75),
      round(y - r * 0.3 + at * step),
      round(x - r * 0.15),
      round(y - r * 0.3 + (at + 1) * step),
    ]);
    const columns = strips.map((at): [number, number, number, number] => [
      round(x - r * 0.75 + at * step),
      round(y - r * 0.3),
      round(x - r * 0.75 + (at + 1) * step),
      round(y + r * 0.3),
    ]);
    const read = () => page.locator("canvas").screenshot();
    await page.keyboard.press("p");
    const dark = await read();
    await open(page, "?view=gallery&stage=beacon");
    await page.keyboard.press("p");
    const bright = await read();
    // What the stage added, strip by strip: the terminator's own gradient runs across the columns at rest too.
    const added = async (boxes: [number, number, number, number][]) => {
      const [before, after] = [await brightness(page, dark, boxes), await brightness(page, bright, boxes)];
      return after.map((level, at) => level - (before[at] ?? 0));
    };
    const swing = (values: readonly number[]) => Math.max(...values) - Math.min(...values);
    expect(swing(await added(rows))).toBeGreaterThan(swing(await added(columns)));
  });

  test("a world's lights stay on its night: its day side keeps the approved render's light", async ({ page }) => {
    await open(page, "?view=close&world=2&stage=rest");
    const [place] = await circles(page);
    if (place === undefined) throw new Error("no world");
    const { x, y, r } = place;
    const day: [number, number, number, number] = [
      Math.round(x + r * 0.45),
      Math.round(y - r * 0.2),
      Math.round(x + r * 0.7),
      Math.round(y + r * 0.2),
    ];
    const [before = 0] = await lit(page, [day]);
    await open(page, "?view=close&world=2&stage=beacon");
    const [after = 0] = await lit(page, [day]);
    expect(after).toBe(before);
  });

  test("the six stages stand side by side, each bigger than the last, the seed the smallest", async ({ page }) => {
    await open(page, "?view=stages&world=0");
    expect(await stages(page)).toEqual(["seed", "rest", "living", "inhabited", "busy", "beacon"]);
    const found = await stats(page);
    expect(found.view).toBe("stages");
    expect(found.worlds).toBe(6);
    const places = await circles(page);
    for (const place of places) whole(place);
    const sizes = places.map(({ r }) => r);
    expect(sizes).toEqual([...sizes].sort((one, other) => one - other));
    expect(new Set(sizes).size).toBe(6);
  });

  test("the lights' one map keeps a view inside the memory the plan allows", async ({ page }) => {
    await open(page, "?view=stages&world=1");
    const found = await stats(page);
    expect(found.mapBytes).toBeLessThanOrEqual(MEMORY_AT_MOST);
    await open(page, "?view=gallery&stage=beacon");
    const gallery = await stats(page);
    expect(gallery.textures).toBeLessThanOrEqual(MAPS_AT_MOST + 1);
    expect(gallery.programs).toBeLessThanOrEqual(6);
    expect(gallery.mapBytes).toBeLessThanOrEqual(MEMORY_AT_MOST);
    await open(page, "?view=close&world=2&stage=beacon");
    expect((await stats(page)).mapBytes, "a world seen close, its two maps at 4096").toBeLessThanOrEqual(
      MEMORY_AT_MOST,
    );
  });

  for (const asked of ["bogus", "__proto__", "constructor", ""])
    test(`a stage asked for as "${asked}" falls back to the lab's own view`, async ({ page }) => {
      await open(page, `?view=close&world=2&stage=${asked}`);
      expect((await stages(page)).at(0)).toBe("rest");
    });

  test("the brackets step a world through its stages, and each draws", async ({ page }) => {
    await open(page, "?view=close&world=2");
    await page.keyboard.press("]");
    await expect.poll(async () => (await stages(page)).at(0), SOFTWARE).toBe("living");
    await drawn(page);
    await page.keyboard.press("[");
    await page.keyboard.press("[");
    await expect.poll(async () => (await stages(page)).at(0), SOFTWARE).toBe("seed");
    await drawn(page);
    await page.keyboard.press("[");
    await expect.poll(async () => (await stages(page)).at(0), SOFTWARE).toBe("seed");
    for (const key of Array.from({ length: 7 }, () => "]")) await page.keyboard.press(key);
    await expect.poll(async () => (await stages(page)).at(0), SOFTWARE).toBe("beacon");
    await drawn(page);
    await page.keyboard.press("6");
    await expect.poll(async () => (await stats(page)).view, SOFTWARE).toBe("stages");
    await drawn(page);
  });

  test("the worker keeps nothing of this page", async ({ page }) => {
    await page.goto("/");
    expect(await (await page.request.get("/sw.js")).text()).not.toContain("lab/");
  });
});
