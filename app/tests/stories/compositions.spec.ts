// The compositions' geometry in a browser, wide and narrow: each one places its children as its
// choices say (docs/DESIGN-SYSTEM.md, "CSS rules"), which no attribute test can see.
import type { Page } from "../e2e/fixtures.ts";
import { expect, open, stories, test, token } from "./storybook.ts";

const WIDTHS = [1280, 320];

// Every box of a composition in the story open, with its children's boxes and its own content box.
function boxes(page: Page, selector: string) {
  return page.evaluate((within) => {
    return [...document.querySelectorAll<HTMLElement>(`#storybook-root ${within}`)].map((box) => {
      const style = getComputedStyle(box);
      const outer = box.getBoundingClientRect();
      const left = outer.left + Number.parseFloat(style.paddingLeft);
      const right = outer.right - Number.parseFloat(style.paddingRight);
      const children = [...box.children].map((child) => child.getBoundingClientRect());
      return {
        data: Object.fromEntries(Object.entries(box.dataset)),
        content: { left, right, width: right - left },
        gap: Number.parseFloat(style.columnGap),
        children: children.map((c) => ({ left: c.left, right: c.right, top: c.top, bottom: c.bottom, width: c.width })),
      };
    });
  }, selector);
}

async function eachWidth(page: Page, id: string, check: () => Promise<void>) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await open(page, id);
    await check();
  }
}

test("a Cluster lines its children up from the start, the centre, both ends or the end", async ({ page }) => {
  await eachWidth(page, "compositions-compositions--justify", async () => {
    const found = await boxes(page, "[data-justify]");
    expect(found.map((b) => b.data["justify"]).sort()).toEqual(["between", "center", "end", "start"]);
    for (const { data, content, children } of found) {
      const first = children[0];
      const last = children.at(-1);
      if (first === undefined || last === undefined) throw new Error("a Cluster with no child");
      const before = first.left - content.left;
      const after = content.right - last.right;
      const where = {
        start: before < 1,
        end: after < 1,
        center: Math.abs(before - after) < 1,
        between: before < 1 && after < 1,
      };
      expect(where[data["justify"] as keyof typeof where], `justify ${String(data["justify"])}`).toBe(true);
    }
  });
});

test("a Grid holds as many columns as its minimum width allows", async ({ page }) => {
  await eachWidth(page, "compositions-compositions--columns", async () => {
    const found = await boxes(page, "[data-min]");
    expect(found.map((b) => b.data["min"]).sort()).toEqual(["l", "m", "s"]);
    for (const { data, content, gap, children } of found) {
      const min = await token(page, `--column-${data["min"] ?? ""}`);
      const columns = new Set(children.map((c) => Math.round(c.left))).size;
      const fit = Math.max(1, Math.min(children.length, Math.floor((content.width + gap) / (min + gap))));
      expect(columns, `min ${String(data["min"])} in ${String(content.width)} px`).toBe(fit);
    }
  });
});

test("a Sidebar's main part keeps half its box, or takes a row of its own", async ({ page }) => {
  for (const id of await stories(page, "compositions-")) {
    await eachWidth(page, id, async () => {
      for (const { data, content, children } of await boxes(page, "[data-side]")) {
        const [first, second] = children;
        if (first === undefined || second === undefined) throw new Error("a Sidebar needs two parts");
        const [side, main] = data["side"] === "end" ? [second, first] : [first, second];
        const ownRow = main.top >= side.bottom || side.top >= main.bottom;
        expect(ownRow || main.width >= content.width / 2 - 1, `${id}, side ${String(data["side"])}`).toBe(true);
      }
    });
  }
});

test("a Switcher's children share one row when it is wide, and each has its own when it is narrow", async ({
  page,
}) => {
  for (const [width, oneRow] of [
    [1280, true],
    [320, false],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await open(page, "compositions-compositions--switcher");
    const [switcher] = await boxes(page, "> *");
    const rows = new Set(switcher?.children.map((c) => Math.round(c.top))).size;
    expect(rows, `${String(width)} px`).toBe(oneRow ? 1 : switcher?.children.length);
  }
});

// Every Center of every story, so both widths are seen: the dialog's and the measure's.
test("a Center holds its width, in the middle of its room", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const seen = new Set<string>();
  for (const id of await stories(page)) {
    await open(page, id);
    for (const { data, content } of await boxes(page, "[data-max]")) {
      const max = data["max"] ?? "";
      seen.add(max);
      expect(content.width, `${id}, ${max}`).toBeLessThanOrEqual(
        (await token(page, max === "dialog" ? "--dialog-w" : "--measure")) + 1,
      );
    }
    const margins = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("#storybook-root [data-max]")].map((box) => {
        // Alone in its parent, its room is the parent's; beside others, it is a share of a row.
        if (box.parentElement?.children.length !== 1) return 0;
        const parent = box.parentElement.getBoundingClientRect();
        const own = box.getBoundingClientRect();
        return Math.abs(own.left - parent.left - (parent.right - own.right));
      }),
    );
    for (const off of margins) expect(off, `${id}: off the middle`).toBeLessThan(1);
  }
  expect([...seen].sort()).toEqual(["dialog", "measure"]);
});
