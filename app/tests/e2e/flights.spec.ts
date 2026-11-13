import { readFileSync } from "node:fs";
import type { Space } from "../../src/space/scene.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { countFlights, flightOf, goInPage, gpuOf, heapOf, landed, running, shownLabels } from "./sceneStage.ts";

// Flights (7g; ADR-0001 §7; ADR-0002 §1; frames 18, 19, 36, 88, 89, 101, 128, 129, 142), read off the engine (`__gnoworldSpace`): the flight
// to a system aimed at, Escape going up a level, the names hidden on the way, a page's flight, one under reduced motion, and what twenty
// leave behind (row 7's test, slice 7 §1). Every journey runs under the page's CSP, and fails on a violation (fixtures.ts).
const HOME = "/?test-gpu";
const FRAME = { width: 1728, height: 1080 };
// Small enough for twenty flights on the gate's software GPU, wide enough for a computer's layout.
const SMALL = { width: 1000, height: 700 };
const SLOW = { timeout: 90_000 };
const RECORDED = readFileSync(new URL("../recordedWorlds.json", import.meta.url), "utf8");

test.describe.configure({ timeout: 240_000 });

async function home(page: Page, size = FRAME, motion: "reduce" | "no-preference" = "no-preference") {
  await page.setViewportSize(size);
  await page.emulateMedia({ reducedMotion: motion });
  await page.goto(HOME);
  await hydrated(page);
  await running(page);
  await landed(page);
  await countFlights(page);
}

// The recorded worlds' file, served: its namespaces are the systems a journey flies to.
const withWorlds = (page: Page) =>
  page.route("**/worlds.json", (route) => route.fulfill({ body: RECORDED, contentType: "application/json" }));

// A system other than the home's, on screen, nearest the screen's middle: where a reader aims, and its id. The page's frames are held from the
// read to the click: the view sways, and under load the frames between them took the sun past a click's reach (7g2's report, F5400).
async function aimAtASystem(page: Page) {
  const aimed = await page.evaluate(
    () =>
      new Promise<{ id: string; x: number; y: number } | undefined>((resolve) => {
        const ask = globalThis.requestAnimationFrame.bind(globalThis);
        const held: FrameRequestCallback[] = [];
        globalThis.requestAnimationFrame = (run) => {
          held.push(run);
          return 0;
        };
        Reflect.set(globalThis, "__release", () => {
          globalThis.requestAnimationFrame = ask;
          for (const run of held.splice(0)) ask(run);
        });
        // The frame the engine asked before the hold runs first; this reads what it drew.
        ask(() => {
          const { universe, see } = Reflect.get(globalThis, "__gnoworldSpace") as Space;
          const on = { x: 0, y: 0, z: 0 };
          // Each system but the home's whose sun stands on screen, how far from the middle; the nearest is aimed at.
          const inside = () => on.x > 0 && on.y > 0 && on.x < innerWidth && on.y < innerHeight;
          const shown = (universe?.systems ?? []).flatMap((system) =>
            !system.home && see.project(system.place, on) && inside()
              ? [{ id: system.id, x: on.x, y: on.y, off: Math.hypot(on.x - innerWidth / 2, on.y - innerHeight / 2) }]
              : [],
          );
          const found = shown.sort((a, b) => a.off - b.off)[0];
          resolve(found === undefined ? undefined : { id: found.id, x: found.x, y: found.y });
        });
      }),
  );
  try {
    if (aimed === undefined) throw new Error("no system on screen to aim at");
    await page.mouse.click(aimed.x, aimed.y);
  } finally {
    await page.evaluate(() => {
      (Reflect.get(globalThis, "__release") as () => void)();
    });
  }
  return aimed.id;
}

// Asks a flight of the engine as a link on the page would, by the router, and waits till one starts.
async function fly(page: Page, path: string) {
  const before = (await flightOf(page)).flights;
  await goInPage(page, path);
  await expect.poll(async () => (await flightOf(page)).flights, SLOW).toBeGreaterThan(before);
}

const flown = (page: Page) => expect.poll(async () => (await flightOf(page)).flying, SLOW).toBe(false);

// A system other than the home's, by its id: a place to fly to.
const otherSystem = (page: Page) =>
  page.evaluate(() => {
    const { universe } = Reflect.get(globalThis, "__gnoworldSpace") as Space;
    return universe?.systems.find((system) => !system.home)?.id ?? "";
  });

const systemPath = (id: string) => `/s/${encodeURIComponent(id)}`;

const labelsShown = async (page: Page) => (await shownLabels(page)).length;

// Each timed read below runs in the page, a frame at a time: a flight of a second or two is over before a journey's own read comes.
test("flies to the system aimed at, lands, and goes back up to the universe on Escape", async ({ page }) => {
  await withWorlds(page);
  await home(page);
  // The labels stand once the cosmos has looked: by then its systems can be aimed at.
  await expect.poll(() => labelsShown(page), SLOW).toBeGreaterThan(0);
  const id = await aimAtASystem(page);
  await expect.poll(async () => (await flightOf(page)).id, SLOW).toBe(id);
  expect(await flightOf(page)).toMatchObject({ kind: "system", id });
  expect((await flightOf(page)).flights).toBeGreaterThan(0);
  await flown(page);
  await expect(page).toHaveURL(systemPath(id));
  // Escape goes up a level: a system's, the universe's.
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await flightOf(page)).kind, SLOW).toBe("universe");
  await expect(page).toHaveURL("/universe");
  await flown(page);
});

// No name while a flight runs (D13128; move.ts): they fade as it starts and come back as it lands. Read in the page on every frame of the
// flight past 0.3 of the way, when a name told to go has faded long since.
test("hides the names through a flight, and gives them back once it lands", async ({ page }) => {
  await withWorlds(page);
  await home(page);
  await expect.poll(() => labelsShown(page), SLOW).toBeGreaterThan(0);
  const to = systemPath(await otherSystem(page));
  const shown = page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const { rig, options } = Reflect.get(globalThis, "__gnoworldSpace") as Space;
        const counts: number[] = [];
        let flew = false;
        const frame = () => {
          flew ||= rig.flying;
          if (rig.flying && rig.along > 0.3)
            counts.push(
              [...options.labels.children].filter((label) => Number(getComputedStyle(label).opacity) > 0.05).length,
            );
          if (flew && !rig.flying) resolve(counts);
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
  await fly(page, to);
  const counts = await shown;
  expect(counts.length).toBeGreaterThan(0);
  expect(Math.max(...counts), `labels on each frame past 0.3 of the way: ${counts.join(", ")}`).toBe(0);
  await expect.poll(() => labelsShown(page), SLOW).toBeGreaterThan(0);
});

// The streaks are the speed pass's: its strength follows the rig's speed, which a flight raises and a view at rest does not.
test("draws its streaks while it crosses, and none at rest", async ({ page }) => {
  await withWorlds(page);
  await home(page);
  const speed = () => page.evaluate(() => (Reflect.get(globalThis, "__gnoworldSpace") as Space).rig.speed);
  expect(await speed()).toBeCloseTo(0, 2);
  const crossed = page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const { rig } = Reflect.get(globalThis, "__gnoworldSpace") as Space;
        let most = 0;
        const frame = () => {
          most = Math.max(most, rig.speed);
          if (most > 0 && !rig.flying) resolve(most);
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
  await fly(page, systemPath(await otherSystem(page)));
  expect(await crossed).toBeGreaterThan(0);
  await flown(page);
  await expect.poll(speed, SLOW).toBeCloseTo(0, 2);
});

// Under reduced motion a flight lands in the frame it starts: no frame of travel, the rig never part of the way.
test("under reduced motion, lands at once: no frame between", async ({ page }) => {
  await withWorlds(page);
  await home(page, FRAME, "reduce");
  const between = page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const { rig } = Reflect.get(globalThis, "__gnoworldSpace") as Space;
        let [partway, frames] = [0, 0];
        const frame = () => {
          if (rig.along > 0 && rig.along < 1) partway += 1;
          frames += 1;
          if (frames > 60) resolve(partway);
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
  await fly(page, systemPath(await otherSystem(page)));
  expect(await between, "frames with the flight part of the way").toBe(0);
  await flown(page);
  expect((await flightOf(page)).along).toBe(1);
});

test("flies from the cosmos to a world's page, and lands as the world comes into its circle", async ({ page }) => {
  await home(page, SMALL);
  await page.locator("a[href='/w/bubble']").first().dispatchEvent("click");
  await expect.poll(async () => (await flightOf(page)).id, SLOW).toBe("bubble");
  expect(await flightOf(page)).toMatchObject({ kind: "world", id: "bubble" });
  expect((await flightOf(page)).flights).toBeGreaterThan(0);
  await flown(page);
  await expect(page.locator("[data-globe]")).toHaveAttribute("data-world", "drawn", SLOW);
  await expect(page.locator("[data-look='plate']")).toBeVisible();
  expect((await flightOf(page)).neared).toBe(true);
});

// Row 7's test, word for word: "After 20 flights, GPU resources are at their baseline and the JS heap is within 10%" (CDP; slice 7 §9, Q17).
// Every kind of place, half pages' flights, driven through the router; a world page's own warming is no flight's (heap snapshots, 2026-11-03).
// The baseline once a round adds nothing: three counts a geometry from its first draw, which a loaded first round can miss (F5404).
test("leaves the GPU's resources at their baseline and the heap within a tenth after twenty flights there and back", async ({
  page,
}) => {
  test.setTimeout(600_000);
  await withWorlds(page);
  await home(page, SMALL);
  const cdp = await page.context().newCDPSession(page);
  const heap = () => heapOf(cdp);
  const gpu = () => gpuOf(page);
  // Once the looks a flight asks for are done: two reads half a second apart agree.
  const steady = () =>
    expect
      .poll(async () => {
        const first = await gpu();
        await page.waitForTimeout(500);
        return JSON.stringify(first) === JSON.stringify(await gpu());
      }, SLOW)
      .toBe(true);
  const system = systemPath(await otherSystem(page));
  const round = async () => {
    for (const path of [system, "/", "/w/bubble", "/universe"]) {
      await fly(page, path);
      await flown(page);
    }
  };
  await test.step("one round of each kind first", round);
  await steady();
  // A round that adds each time is a leak: three rounds at most before the baseline.
  let warmed = await gpu();
  for (let rounds = 2; ; rounds += 1) {
    await test.step(`round ${String(rounds)}, till one adds nothing`, round);
    await steady();
    const now = await gpu();
    if (JSON.stringify(now) === JSON.stringify(warmed)) break;
    expect(
      rounds,
      `round ${String(rounds)} added: ${JSON.stringify(warmed)}, then ${JSON.stringify(now)}`,
    ).toBeLessThan(3);
    warmed = now;
  }
  const before = { ...warmed, heap: await heap(), flights: (await flightOf(page)).flights };
  for (let flight = 0; flight < 20; flight += 4)
    await test.step(`flights ${String(flight + 1)} to ${String(flight + 4)}`, round);
  await steady();
  // A page that frames its planet close flies once more as it settles: at least the twenty asked.
  expect((await flightOf(page)).flights).toBeGreaterThanOrEqual(before.flights + 20);
  expect(await gpu()).toEqual({ geometries: before.geometries, textures: before.textures });
  expect(await heap()).toBeLessThanOrEqual(before.heap * 1.1);
});
