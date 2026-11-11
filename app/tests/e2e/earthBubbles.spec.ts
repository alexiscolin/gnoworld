import { expect, test, type Page } from "./fixtures.ts";
import { onEarth, raw, record, type Frame, type Said } from "./earthStage.ts";

// The Earth's bubbles in a real browser (D13998): a line whose country is in view moves nothing and shows over its country; one that is not
// turns the Earth once, one way, eased, then it keeps its own spin. Every frame is recorded: the ground's lead, what faces the eye, each bubble.
const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const DEGREE = Math.PI / 180;

// The software GPU runs the scene at a fifth to two fifths of the wall's speed: wait for the scene's seconds, and, after a line, till the turn ends.
const settle = (page: Page, seconds: number) => page.waitForTimeout((seconds * 1000) / 0.4);
const turned = async (page: Page) => {
  await page.waitForTimeout(2000);
  await page.waitForFunction(
    () =>
      !(Reflect.get(globalThis, "__gnoworldSpace") as { stage: { ground: { turning: boolean } } }).stage.ground.turning,
    undefined,
    { timeout: 120_000 },
  );
  return page.evaluate(() => (Reflect.get(globalThis, "__frames") as unknown[]).length);
};

const frames = (page: Page) => page.evaluate(() => Reflect.get(globalThis, "__frames") as Frame[]);
// The angle between what faces the eye and a country, in degrees.
const apart = (frame: Frame, { lat, lon }: { lat: number; lon: number }) =>
  Math.acos(
    Math.min(
      1,
      Math.sin(frame.lat * DEGREE) * Math.sin(lat * DEGREE) +
        Math.cos(frame.lat * DEGREE) * Math.cos(lat * DEGREE) * Math.cos((frame.lon - lon) * DEGREE),
    ),
  ) / DEGREE;

// The speed over spans of 0.3 s of the scene's clock (two frames can share a stamp): the moves of `of`, and how long each took.
interface Span {
  move: number;
  seconds: number;
}
const spans = (own: Frame[], of: (frame: Frame) => number): Span[] =>
  own.flatMap((now, n) => {
    const from = own.slice(0, n).findLast((then) => now.seconds - then.seconds >= 0.3);
    return from === undefined ? [] : [{ move: of(now) - of(from), seconds: now.seconds - from.seconds }];
  });
const reversals = (steps: Span[]) => {
  const moving = steps.filter(({ move }) => Math.abs(move) > 1e-6);
  return moving.filter(({ move }, n) => n > 0 && Math.sign(move) !== Math.sign(moving[n - 1]?.move ?? move)).length;
};
const fastest = (steps: Span[]) =>
  +(Math.max(0, ...steps.map(({ move, seconds }) => Math.abs(move) / seconds)) / DEGREE).toFixed(0);

interface Area {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
// Where a line's bubble stands in the free area, as shares across and down it, and how far its country is from the eye.
function whereIs(text: string, last: Frame | undefined, area: Area) {
  const mine = last?.bubbles.find((one) => one.text.includes(text));
  if (last === undefined || mine === undefined) return { shown: false, across: NaN, down: NaN, apart: NaN };
  return {
    shown: mine.shown,
    across: +((mine.x - area.left) / (area.right - area.left)).toFixed(2),
    down: +((mine.y - area.top) / (area.bottom - area.top)).toFixed(2),
    apart: Math.round(apart(last, mine)),
  };
}

test.describe.configure({ timeout: 420_000 });

// What a line leaves behind: when it was said (the page's clock), and where its bubble's point stands once the wait is over.
interface Line {
  text: string;
  sent: number;
  // How many frames were recorded when its turn ended: its bubble lives five seconds, so it is read then.
  done: number;
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1728, height: 1080 },
]) {
  test.describe(`${String(viewport.width)} px`, () => {
    test.use({ viewport });

    test("lines of yours from Japan, Iceland and Chile bring each country to the free area's middle by spin and lean, one way, eased", async ({
      page,
    }) => {
      const { socket } = await onEarth(page, { me: ME, motion: true });
      await expect(page.getByRole("navigation", { name: "Rooms on the globe" })).toBeAttached();
      await settle(page, 6);
      await record(page);
      const said: Line[] = [];
      const say = async (line: Said) => {
        socket().send(raw({ from: ME, ...line }));
        const sent = await page.evaluate(() => performance.now());
        await expect(page.locator("[data-bubble]").filter({ hasText: line.text })).toBeAttached();
        const done = await turned(page);
        said.push({ text: line.text, sent, done });
        await test.info().attach(`line ${line.id}`, { body: await page.screenshot(), contentType: "image/png" });
      };
      await say({ id: "1", text: "konnichiwa one", country: "JP" });
      await say({ id: "2", text: "konnichiwa two", country: "JP" });
      await say({ id: "3", text: "hello from Iceland", country: "IS" });
      await say({ id: "4", text: "hello from Chile", country: "CL" });
      await say({ id: "5", text: "back to Japan", country: "JP" });
      const all = await frames(page);
      await test.info().attach("frames", { body: JSON.stringify(all), contentType: "application/json" });
      // The free area as the page frames it: right of the plate when it stands beside the globe, under the header, left of the dock.
      const area = await page.evaluate(() => {
        const plate = document.querySelector("[data-look='plate']")?.getBoundingClientRect();
        const dock = document.querySelector("[data-dock]")?.getBoundingClientRect().left ?? innerWidth;
        const top = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
        return {
          left: plate !== undefined && dock - plate.right >= 240 ? plate.right + 8 : 8,
          right: dock,
          top,
          bottom: innerHeight,
        };
      });
      const ends = [...said.slice(1).map(({ sent }) => sent), Infinity];
      const rows = said.map(({ text, sent, done }, at) => {
        const own = all.filter((frame, n) => frame.ms >= sent && frame.ms < (ends[at] ?? Infinity) && n < done);
        const [spin, lean] = [spans(own, (frame) => frame.lead), spans(own, (frame) => frame.lean)];
        const [first, last] = [own[0], own.at(-1)];
        return {
          text,
          spun: +(((last?.lead ?? 0) - (first?.lead ?? 0)) / DEGREE).toFixed(1),
          leant: +((last?.lean ?? 0) / DEGREE).toFixed(1),
          reversals: [reversals(spin), reversals(lean)],
          fastest: [fastest(spin), fastest(lean)],
          ...whereIs(text, last, area),
        };
      });
      const eyeMoved = all.some((frame) => frame.eye.some((v, i) => Math.abs(v - (all[0]?.eye[i] ?? 0)) > 1e-6));
      console.log(`NUMBERS ${JSON.stringify({ area, rows, eyeMoved, frames: all.length })}`);
      expect(eyeMoved, "the camera flies nowhere for a line").toBe(false);
      for (const row of rows) {
        expect(row.reversals, `${row.text}: one way, spin and lean`).toEqual([0, 0]);
        expect(Math.max(...row.fastest), `${row.text}: eased, at most 90 deg a second`).toBeLessThanOrEqual(95);
        expect(row.shown, `${row.text}: shown`).toBe(true);
        expect(row.apart, `${row.text}: well seen, within 57 deg of the eye`).toBeLessThanOrEqual(57);
        // Where the plate leaves room beside the globe: Japan at 40 % across and 57 % down the free area, as the frames keep it.
        if (viewport.width >= 1600) {
          expect(Math.abs(row.across - 0.4), `${row.text}: across the free area`).toBeLessThanOrEqual(0.2);
          expect(Math.abs(row.down - 0.57), `${row.text}: down the free area`).toBeLessThanOrEqual(0.2);
        }
      }
    });
  });
}
