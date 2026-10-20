// The design system's stories in a real browser (docs/DESIGN-SYSTEM.md, "Testing the CSS"): what
// jsdom cannot see, since it applies no stylesheet. Each test walks every story Storybook built.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "../e2e/fixtures.ts";
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

// Each control is brought into view first: elementFromPoint sees nothing outside the viewport. A link
// with words of its own around it, inside a sentence, is left out, as WCAG 2.5.8 leaves it out.
test("in every story, each control is a target of 24 px or more that nothing covers", async ({ page }) => {
  for (const id of await stories(page)) {
    await open(page, id);
    const faults = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("#storybook-root button, #storybook-root a[href]")].flatMap(
        (control) => {
          const inSentence =
            control instanceof HTMLAnchorElement &&
            control.parentElement?.textContent.trim() !== control.textContent.trim();
          if (inSentence) return [];
          control.scrollIntoView({ block: "center", inline: "center" });
          const box = control.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          const name = control.outerHTML.slice(0, 60);
          const small =
            box.width < 24 || box.height < 24 ? [`${name} is ${String(box.width)}x${String(box.height)}`] : [];
          const covered = hit === null || !control.contains(hit) ? [`${name} is covered or out of view`] : [];
          return [...small, ...covered];
        },
      ),
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

test("the focus ring is the 2 px mint outline, 2 px off, on every control reached by the keyboard", async ({
  page,
}) => {
  await open(page, "button--primary");
  await page.keyboard.press("Tab");
  const ring = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement ?? document.body);
    return [style.outlineStyle, style.outlineWidth, style.outlineColor, style.outlineOffset];
  });
  expect(ring).toEqual(["solid", "2px", "rgb(92, 242, 200)", "2px"]);
});

test("each composition spaces its children by the token its step names", async ({ page }) => {
  for (const id of await stories(page, "compositions-")) {
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

// Every icon drawn in these stories, by its size: 16 px at m, 20 px at l, and both seen.
test("icons are 16 or 20 px, and those that point along the text turn right to left", async ({ page }) => {
  const seen = new Map<string, Set<number>>();
  for (const id of ["icons-icon--all", "icons-icon--large", "button--sizes", "button-iconbutton--sizes"]) {
    await open(page, id);
    for (const [size, width] of await page.evaluate(() =>
      [...document.querySelectorAll<SVGElement>("#storybook-root svg")].map(
        (svg) => [svg.dataset["size"] ?? "", svg.getBoundingClientRect().width] as const,
      ),
    )) {
      seen.set(size, (seen.get(size) ?? new Set()).add(width));
    }
  }
  expect(Object.fromEntries([...seen].map(([size, widths]) => [size, [...widths]]))).toEqual({ m: [16], l: [20] });
  await open(page, "icons-icon--all");
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

// Each control's height by its size, in one story, and whether every one of them is square.
async function sizes(page: Page, id: string) {
  await open(page, id);
  return page.evaluate(() => {
    const boxes = [...document.querySelectorAll<HTMLElement>("#storybook-root button")].map((b) => ({
      size: b.dataset["size"] ?? "",
      box: b.getBoundingClientRect(),
    }));
    return {
      heights: Object.fromEntries(boxes.map(({ size, box }) => [size, box.height])),
      square: boxes.every(({ box }) => box.width === box.height),
    };
  });
}

for (const touch of [false, true]) {
  const how = touch ? "by touch" : "with a pointer";
  test.describe(how, () => {
    test.use({ contextOptions: { hasTouch: touch, isMobile: touch } });

    test("controls are as tall as their size's control, the default 44 px by touch", async ({ page }) => {
      const m = touch ? 44 : 40;
      expect((await sizes(page, "button--sizes")).heights).toEqual({ s: 32, m, l: 56 });
      expect(await sizes(page, "button-iconbutton--sizes"), "icon buttons").toEqual({
        heights: { s: 32, m, l: 56 },
        square: true,
      });
    });
  });
}

test("a busy button's spinner turns, and stops under reduced motion", async ({ page }) => {
  const spin = async () => {
    await open(page, "button--busy");
    return page.evaluate(() =>
      [...document.querySelectorAll("#storybook-root [aria-busy] [aria-hidden='true']")].map((e) => {
        const style = getComputedStyle(e);
        return [style.animationName === "none" ? "none" : "spins", style.animationDuration];
      }),
    );
  };
  expect(await spin()).toEqual([["spins", "0.8s"]]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect((await spin()).map(([name]) => name)).toEqual(["none"]);
});

test("controls ease their changes, and change at once under reduced motion", async ({ page }) => {
  const durations = async () => {
    await open(page, "button--matrix");
    return page.evaluate(() => [
      ...new Set(
        [...document.querySelectorAll("#storybook-root button")].flatMap((b) =>
          getComputedStyle(b).transitionDuration.split(", "),
        ),
      ),
    ]);
  };
  expect(await durations()).toEqual(["0.12s"]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await durations()).toEqual(["0s"]);
});

test("a button lightens under the pointer, unless it is disabled or busy", async ({ page }) => {
  for (const [id, lit] of [
    ["button--primary", true],
    ["button--outline", true],
    ["button--disabled", false],
    ["button--busy", false],
  ] as const) {
    await open(page, id);
    const button = page.locator("#storybook-root button");
    await button.hover({ force: true });
    expect(await button.evaluate((b) => getComputedStyle(b).backgroundImage !== "none"), id).toBe(lit);
  }
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

test("the base styles text with the tokens, and the label keeps its case where caps break the script", async ({
  page,
}) => {
  await open(page, "overview--all");
  const text = page.getByRole("region", { name: "Text" });
  const style = (selector: string, property: string) =>
    text
      .locator(selector)
      .first()
      .evaluate((e, p) => getComputedStyle(e).getPropertyValue(p), property);
  expect(await style("h1", "font-size")).toBe("36px");
  expect(await style("h2", "font-size")).toBe("28px");
  expect(await style("h3", "font-size")).toBe("20px");
  expect(await style("small", "font-size")).toBe("12px");
  expect(await style("code", "font-family")).toContain("Geist Mono Variable");
  expect(await style("hr", "border-top-width")).toBe("1px");
  expect(await style("a", "color")).toBe(await style("p", "color"));
  expect(await style(".label:not(:lang(ar))", "text-transform")).toBe("uppercase");
  expect(await style(".label:lang(ar)", "text-transform")).toBe("none");
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
