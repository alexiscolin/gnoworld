import { expect, test, type Page } from "./fixtures.ts";
import { onEarth, raw, record, type Frame } from "./earthStage.ts";

// The dive (D429, the flights) is untouched by the bubbles' spin and lean (D13916): lines of yours arrive while the camera flies down to
// /earth and while it flies out, and the same dive with no line is the control. Each frame records the camera, the ground's spin and lean.
const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

const go = (page: Page, to: string) =>
  page.evaluate((path) => {
    history.pushState({}, "", path);
    dispatchEvent(new PopStateEvent("popstate"));
  }, to);

// The page's frames of one dive in and out, with `lines` of yours sent through it (none for the control).
async function dive(page: Page, lines: boolean): Promise<Frame[]> {
  const { socket } = await onEarth(page, { me: ME, path: "/?test-gpu", motion: true, joined: false });
  await page.waitForFunction(() => Reflect.has(globalThis, "__gnoworldSpace"));
  await page.waitForTimeout(6000);
  await record(page);
  let n = 0;
  const open = () => {
    try {
      return socket();
    } catch {
      return undefined;
    }
  };
  const say = async (country: string) => {
    n += 1;
    if (lines) {
      await expect.poll(() => Boolean(open())).toBe(true);
      socket().send(raw({ id: `d${String(n)}`, text: `line ${String(n)}`, country, from: ME }));
    }
    await page.waitForTimeout(1500);
  };
  await go(page, "/earth?test-gpu");
  for (const country of ["JP", "IS", "CL", "JP"]) await say(country);
  await expect(page.locator("[data-earth='drawn']")).toBeAttached({ timeout: 90_000 });
  await page.waitForTimeout(8000);
  await say("JP");
  await go(page, "/?test-gpu");
  for (const country of ["BR", "AU", "JP"]) await say(country);
  await page.waitForTimeout(8000);
  return page.evaluate(() => Reflect.get(globalThis, "__frames") as Frame[]);
}

// How far the camera went in the frames of flights alone (a pair of frames that follow each other with the camera flying in both): the
// rest of the run is the camera's own slow drift, which a few frames' timing changes by a half.
const flown = (frames: Frame[]) =>
  frames.slice(1).flatMap((now, n) => (now.flying && frames[n]?.flying === true ? [[frames[n], now] as const] : []));
const pathOf = (frames: Frame[]) =>
  flown(frames).reduce((sum, [before, now]) => sum + Math.hypot(...now.eye.map((v, i) => v - (before.eye[i] ?? 0))), 0);

test.describe.configure({ timeout: 300_000, mode: "serial" });
test.use({ viewport: { width: 1728, height: 1080 } });

// The dive with no line, run first: the control the second is held to.
let control: Frame[] = [];

test("the dive in and out, with no line: the control", async ({ page }) => {
  control = await dive(page, false);
  expect(
    control.some((frame) => frame.flying),
    "the dive flew",
  ).toBe(true);
});

test("lines arriving while the camera dives in and out change nothing of the dive and turn nothing during it", async ({
  page,
}) => {
  const said = await dive(page, true);
  const pairs = flown(said);
  const spun = pairs.map(([before, now]) => Math.abs(now.lead - before.lead));
  // The lean only ever eases back to rest while the camera flies: its size never grows.
  const grew = pairs.filter(([before, now]) => Math.abs(now.lean) > Math.abs(before.lean) + 1e-9);
  const numbers = {
    control: { frames: control.length, path: pathOf(control), flying: control.filter((f) => f.flying).length },
    said: { frames: said.length, path: pathOf(said), flying: pairs.length },
    spunInFlight: Math.max(0, ...spun),
    leanGrewInFlight: grew.length,
    endEyeApart: Math.hypot(...(said.at(-1)?.eye ?? []).map((v, i) => v - (control.at(-1)?.eye[i] ?? 0))),
  };
  console.log(`DIVE ${JSON.stringify(numbers)}`);
  expect(numbers.said.flying, "the dive flew").toBeGreaterThan(0);
  expect(numbers.spunInFlight, "no spin during a flight").toBe(0);
  expect(numbers.leanGrewInFlight, "no lean grows during a flight").toBe(0);
  // The camera's path itself is not compared: on a software GPU the flights of one dive differ by a third from run to run (four controls: 352 to 428).
  expect(numbers.endEyeApart / numbers.control.path, "the dive ends where the control's did").toBeLessThan(0.01);
});
