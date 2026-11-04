import { expect, test, type Page } from "./fixtures.ts";
import { brightness } from "./geometry.ts";

// The realism page (app/lab), as its journeys open and read it: a view, its numbers, where its worlds stand.
export const PAGE = "/lab/realism.html";
export const COMPUTER = { width: 1728, height: 1080 };
/** What the hand-made Earth's view draws: earthView.ts's circle, a third of the screen's height at its centre. */
export const EARTH_VIEW = { x: COMPUTER.width / 2, y: COMPUTER.height / 2, r: COMPUTER.height * 0.33 } as const;
/** The instant realism.spec pins the Earth at, so its clouds and its light read the same on every visit. */
export const EARTH_INSTANT = Date.UTC(2026, 10, 2, 3, 0, 0);

interface LabStats {
  view: string;
  worlds: number;
  frames: number;
  textures: number;
  programs: number;
  calls: number;
  mapBytes: number;
  renderer: string;
  /** The renderer's exposure, which the tuning panel sets. */
  exposure: number;
}
export interface Circle {
  x: number;
  y: number;
  r: number;
}
type Asked =
  | "stats"
  | "circles"
  | "looks"
  | "stages"
  | "ids"
  | "minors"
  | "surfaces"
  | "centres"
  | "live"
  | "cost"
  | "styles"
  | "poles";

export const askLab = <T>(page: Page, what: Asked, ...rest: number[]) =>
  page.evaluate(
    ([name, args]) => {
      const lab: unknown = Reflect.get(globalThis, "__lab");
      return (lab as Record<typeof name, (...given: number[]) => T>)[name](...args);
    },
    [what, rest] as const,
  );
export const stats = (page: Page) => askLab<LabStats>(page, "stats");
export const circles = (page: Page) => askLab<Circle[]>(page, "circles");
export const looks = (page: Page) => askLab<{ anchor: string }[]>(page, "looks");

// What a software GPU may take to build a view with its 4096 maps, at a gate's load.
export const SOFTWARE = { timeout: 60_000 };
export const drawn = (page: Page) => expect(page.locator("canvas[data-drawn='true']")).toBeAttached(SOFTWARE);

export const open = async (page: Page, query: string) => {
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

// The canvas with the panel away, which sits over a corner: P hides it, as for a capture, and shows it again: pressed only while it shows.
export const picture = async (page: Page) => {
  if (await page.getByRole("main").isVisible()) await page.keyboard.press("p");
  await expect(page.getByRole("main")).toBeHidden();
  return page.locator("canvas").screenshot();
};
export const lit = async (page: Page, boxes: [number, number, number, number][]) =>
  brightness(page, await picture(page), boxes);

export const whole = ({ x, y, r }: Circle) => {
  expect(x - r).toBeGreaterThanOrEqual(0);
  expect(y - r).toBeGreaterThanOrEqual(0);
  expect(x + r).toBeLessThanOrEqual(COMPUTER.width);
  expect(y + r).toBeLessThanOrEqual(COMPUTER.height);
};

// Every world whole on the screen, big enough to read, and none on another.
export const noneOnAnother = (places: readonly Circle[], smallest = 60) => {
  for (const [index, place] of places.entries()) {
    whole(place);
    expect(place.r).toBeGreaterThan(smallest);
    for (const other of places.slice(index + 1))
      expect(Math.hypot(place.x - other.x, place.y - other.y)).toBeGreaterThan(place.r + other.r);
  }
};

/** What the page says wrong, kept in `wrong`: a shader that fails to compile only reaches the console. A screenshot reads the buffer back,
 * which the driver remarks on, and a software GPU has no parallel compile, which the Earth's build asks for: neither is wrong. */
export const listen = (page: Page, wrong: string[]) => {
  page.on("console", (message) => {
    const software = ["GPU stall", "KHR_parallel_shader_compile"].some((remark) => message.text().includes(remark));
    if (["error", "warning"].includes(message.type()) && !software) wrong.push(message.text());
  });
  page.on("pageerror", (error) => wrong.push(error.message));
};

/** Ends each test of the describe it is called in red if its page said anything wrong (`listen`). */
export function heldQuiet(): void {
  const wrong: string[] = [];
  test.beforeEach(({ page }) => {
    wrong.length = 0;
    listen(page, wrong);
  });
  test.afterEach(() => {
    expect(wrong, "the console").toEqual([]);
  });
}
