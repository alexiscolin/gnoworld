// A generated ground's relief seen close (slice 7, 7b6; 7b5's design pass, 8): no 2x2 steps where the light grazes. The Earth is the
// measure's control, read in the same run.

import { ANCHORS, type Anchor } from "@gnoworld/core";
import { expect, test } from "./fixtures.ts";
import { circles, COMPUTER, heldQuiet, open, picture, type Circle } from "./lab.ts";
import { steps } from "./relief.ts";

// 2x2 steps where the light grazes (F4238): the Earth 1.00, a rocky world 1.02; 7b5's grooved world 2.10, desert 1.56, shattered 1.50,
// real3 1.35.
const STEPS_AT_MOST = 1.15;
// What the hand-made Earth's view draws: earthView.ts's circle, a third of the screen's height at its centre.
const EARTH: Circle = { x: COMPUTER.width / 2, y: COMPUTER.height / 2, r: COMPUTER.height * 0.33 };

const close = (anchor: Anchor) => `?view=close&world=${String(ANCHORS.indexOf(anchor))}`;
const GROUNDS = {
  "grooved ice": close("grooved ice"),
  desert: close("desert"),
  shattered: close("shattered"),
  real3: "?view=close&real=3",
};

const seen = async (page: Parameters<typeof open>[0], query: string) => {
  await open(page, query);
  const [place] = await circles(page);
  if (place === undefined) throw new Error("no world");
  return { place, shot: await picture(page) };
};

test.describe("a generated ground's relief seen close", () => {
  test.slow();

  heldQuiet();

  test("the measure's control: the Earth seen close steps no more at a 2x2 block's border than inside it", async ({
    page,
  }) => {
    await open(page, "?view=earth");
    expect((await steps(page, await picture(page), [EARTH]))[0]).toBeLessThanOrEqual(1.05);
  });

  for (const [name, query] of Object.entries(GROUNDS))
    test(`${name} seen close: no 2x2 steps where the light grazes (F4238)`, async ({ page }) => {
      const { place, shot } = await seen(page, query);
      const [ratio] = await steps(page, shot, [place]);
      test.info().annotations.push({ type: "steps", description: String(ratio) });
      expect(ratio).toBeLessThanOrEqual(STEPS_AT_MOST);
    });
});
