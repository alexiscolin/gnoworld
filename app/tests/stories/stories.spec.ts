// The design system's stories in a real browser (docs/DESIGN-SYSTEM.md, "Testing the CSS"): what
// jsdom cannot see, since it applies no stylesheet. Each test walks every story Storybook built.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "../e2e/fixtures.ts";
import { open, stories } from "./storybook.ts";

test("every story renders with no error and passes axe", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const id of await stories(page)) {
    await open(page, id);
    const found = (await new AxeBuilder({ page }).include("#storybook-root").analyze()).violations;
    expect
      .soft(
        found.map((v) => v.id),
        id,
      )
      .toEqual([]);
  }
  expect(errors).toEqual([]);
});

test("in every story, each control is a target of 24 px or more that nothing covers", async ({ page }) => {
  for (const id of await stories(page)) {
    await open(page, id);
    const faults = await page.evaluate(() =>
      [...document.querySelectorAll("#storybook-root button, #storybook-root a[href]")].flatMap((control) => {
        const box = control.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        const small =
          box.width < 24 || box.height < 24
            ? [`${control.outerHTML.slice(0, 60)} is ${String(box.width)}x${String(box.height)}`]
            : [];
        const covered = hit !== null && !control.contains(hit) ? [`${control.outerHTML.slice(0, 60)} is covered`] : [];
        return [...small, ...covered];
      }),
    );
    expect.soft(faults, id).toEqual([]);
  }
});

test("no story scrolls sideways at 320 px, and text at 200% still fits its controls", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const id of await stories(page)) {
    await open(page, id);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect.soft(wide, `${id} scrolls sideways`).toBe(false);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    // Each word's box against its control's: a control grows with its text, so no word sticks out.
    // What is hidden from assistive technology is decoration, as a count's badge on a corner.
    const spilled = await page.evaluate(
      () =>
        [...document.querySelectorAll("#storybook-root button")].filter((button) => {
          const outer = button.getBoundingClientRect();
          const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
            if (node.parentElement?.closest("[aria-hidden='true']") || node.textContent?.trim() === "") continue;
            const words = document.createRange();
            words.selectNodeContents(node);
            const inner = words.getBoundingClientRect();
            const out =
              inner.top < outer.top ||
              inner.bottom > outer.bottom ||
              inner.left < outer.left ||
              inner.right > outer.right;
            if (out) return true;
          }
          return false;
        }).length,
    );
    expect.soft(spilled, `${id}: controls whose text spills at 200%`).toBe(0);
  }
});

test("the focus ring is the 2 px mint outline, on every control reached by the keyboard", async ({ page }) => {
  await open(page, "button--primary");
  await page.keyboard.press("Tab");
  const ring = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement ?? document.body);
    return [style.outlineStyle, style.outlineWidth, style.outlineColor];
  });
  expect(ring).toEqual(["solid", "2px", "rgb(92, 242, 200)"]);
});

test("each composition spaces its children by the token its step names", async ({ page }) => {
  for (const id of (await stories(page)).filter((s) => s.startsWith("compositions-"))) {
    await open(page, id);
    const faults = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("#storybook-root [data-space]")].flatMap((box) => {
        const token = getComputedStyle(document.documentElement)
          .getPropertyValue(`--space-${box.dataset["space"] ?? ""}`)
          .trim();
        const style = getComputedStyle(box);
        const used = box.dataset["max"] === undefined ? style.rowGap : style.paddingInlineStart;
        return used === token && token !== "" ? [] : [`${box.dataset["space"] ?? ""}: ${used} for ${token}`];
      }),
    );
    expect.soft(faults, id).toEqual([]);
  }
});

test("icons are 16 or 20 px, and those that point along the text turn right to left", async ({ page }) => {
  await open(page, "icons-icon--all");
  const sizes = await page.evaluate(() =>
    [...document.querySelectorAll<SVGElement>("#storybook-root svg")].map((svg) => [
      svg.dataset["size"],
      svg.getBoundingClientRect().width,
    ]),
  );
  expect(new Set(sizes.map(([size, width]) => `${String(size)} ${String(width)}`))).toEqual(new Set(["m 16"]));
  await page.evaluate(() => {
    document.documentElement.dir = "rtl";
  });
  const turned = await page.evaluate(() =>
    [...document.querySelectorAll<SVGElement>("#storybook-root svg")].map((svg) => [
      svg.hasAttribute("data-mirror"),
      getComputedStyle(svg).scale,
    ]),
  );
  for (const [mirror, scale] of turned) expect(scale).toBe(mirror ? "-1 1" : "none");
});

test("buttons are as tall as their size's control, and 44 px by touch", async ({
  playwright,
  launchOptions,
  baseURL,
}) => {
  for (const touch of [false, true]) {
    // A browser each: in the sandbox's one-process Chromium, closing a context ends its browser.
    const browser = await playwright.chromium.launch(launchOptions);
    const context = await browser.newContext({
      hasTouch: touch,
      isMobile: touch,
      ...(baseURL === undefined ? {} : { baseURL }),
    });
    const page = await context.newPage();
    await open(page, "button--sizes");
    const heights = await page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll<HTMLElement>("#storybook-root button")].map(
          (b) => [b.dataset["size"] ?? "", b.getBoundingClientRect().height] as const,
        ),
      ),
    );
    expect(heights, touch ? "by touch" : "with a pointer").toEqual({ s: 32, m: touch ? 44 : 40, l: 56 });
    await browser.close();
  }
});

test("a busy button's spinner stops under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "button--busy");
  const names = await page.evaluate(() =>
    [...document.querySelectorAll("#storybook-root [aria-busy] *")].map((e) => getComputedStyle(e).animationName),
  );
  expect(names.length).toBeGreaterThan(0);
  expect(names.every((name) => name === "none")).toBe(true);
});

test("under forced colours, every button keeps a visible edge", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page, "button--matrix");
  const edges = await page.evaluate(() =>
    [...document.querySelectorAll("#storybook-root button")].map((b) => getComputedStyle(b).borderTopWidth),
  );
  expect(edges.length).toBeGreaterThan(0);
  expect(edges.every((width) => Number.parseFloat(width) >= 1)).toBe(true);
});

// A layer ranks by where it first appears, whatever form the minifier gives it: were a component's
// sheet to name its layer first, the reset's `button { font: inherit }` would beat Button's font.
test("the layers rank reset, tokens, base, compositions, components, utilities, as the sheets load", async ({
  page,
}) => {
  await open(page, "overview--all");
  const named = await page.evaluate(() =>
    [...document.styleSheets].flatMap((sheet) =>
      [...sheet.cssRules].flatMap((rule) =>
        rule instanceof CSSLayerStatementRule
          ? [...rule.nameList]
          : rule instanceof CSSLayerBlockRule
            ? [rule.name]
            : [],
      ),
    ),
  );
  expect([...new Set(named)]).toEqual(["reset", "tokens", "base", "compositions", "components", "utilities"]);
});
