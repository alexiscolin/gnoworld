// The design system's stories in a real browser (docs/DESIGN-SYSTEM.md, "Testing the CSS"): what
// jsdom cannot see, since it applies no stylesheet. Each test walks every story Storybook built.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "../e2e/fixtures.ts";
import { BUTTONS, expect, open, stories, test } from "./storybook.ts";

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
            !control.hasAttribute("data-emphasis") &&
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
      (buttons) =>
        [...document.querySelectorAll(buttons)].filter((button) => {
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
      BUTTONS,
    );
    expect.soft(spilled, `${id}: controls whose text spills at 200%`).toBe(0);
  }
});

// Every control of every story, tabbed to in turn: a component rule that hides or clips the one
// ring would show here.
test("the focus ring is the 2 px mint outline, 2 px off, on every control reached by the keyboard", async ({
  page,
}) => {
  for (const id of await stories(page)) {
    await open(page, id);
    const controls = await page.locator("#storybook-root :is(button:not(:disabled), a[href])").count();
    const reached = new Set<string>();
    for (let step = 0; step < controls; step += 1) {
      await page.keyboard.press("Tab");
      const [name, ...ring] = await page.evaluate(() => {
        const focused = document.activeElement;
        const all = [...document.querySelectorAll("#storybook-root *")];
        const where = focused === null ? -1 : all.indexOf(focused);
        const style = getComputedStyle(focused ?? document.body);
        return [String(where), style.outlineStyle, style.outlineWidth, style.outlineColor, style.outlineOffset];
      });
      reached.add(name);
      expect.soft(ring, `${id}, control ${name}`).toEqual(["solid", "2px", "rgb(92, 242, 200)", "2px"]);
    }
    expect.soft(reached.size, `${id}: controls the keyboard reaches`).toBe(controls);
    expect.soft(reached.has("-1"), `${id}: focus left the story`).toBe(false);
  }
});

// The state the accessibility tree sees is the state the CSS draws (docs/DESIGN-SYSTEM.md, "CSS
// rules"): each state is turned off in place, transitions stilled, and the control must look different.
test("in every story, a pressed, selected, expanded or current control looks unlike its resting self", async ({
  page,
}) => {
  const states = ["aria-pressed", "aria-selected", "aria-expanded", "aria-current"];
  let seen = 0;
  for (const id of await stories(page)) {
    await open(page, id);
    const found = await page.evaluate((names) => {
      const still = document.createElement("style");
      still.textContent = "* { transition: none !important; }";
      document.head.append(still);
      const looks = (e: Element) => {
        const s = getComputedStyle(e);
        return [
          s.backgroundColor,
          s.backgroundImage,
          s.color,
          s.borderColor,
          s.boxShadow,
          s.fontWeight,
          s.outlineStyle,
        ].join();
      };
      const on = names.map((name) => `#storybook-root [${name}]:not([${name}="false"])`).join(", ");
      const result = [...document.querySelectorAll(on)].map((element) => {
        const name = names.find((n) => element.hasAttribute(n)) ?? "";
        const value = element.getAttribute(name) ?? "";
        const shown = looks(element);
        element.setAttribute(name, "false");
        const resting = looks(element);
        element.setAttribute(name, value);
        return shown === resting ? `${name} on ${element.outerHTML.slice(0, 60)}` : "";
      });
      still.remove();
      return result;
    }, states);
    seen += found.length;
    expect.soft(found.filter(Boolean), id).toEqual([]);
  }
  expect(seen).toBeGreaterThan(0);
});

// A copy of each composition as a list too: whatever element it is given, it keeps no marks and no
// block margins, and only Center keeps an inline padding, its gutter.
test("each composition spaces its children by the token its step names, and keeps a list's marks off", async ({
  page,
}) => {
  for (const id of await stories(page, "compositions-")) {
    await open(page, id);
    const faults = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("#storybook-root [data-space]")].flatMap((box) => {
        const token = getComputedStyle(document.documentElement)
          .getPropertyValue(`--space-${box.dataset["space"] ?? ""}`)
          .trim();
        const style = getComputedStyle(box);
        const used = box.dataset["max"] === undefined ? style.rowGap : style.paddingInlineStart;
        const list = document.createElement("ul");
        list.className = box.className;
        Object.assign(list.dataset, box.dataset);
        list.append(document.createElement("li"));
        box.after(list);
        const listed = getComputedStyle(list);
        const got = [listed.listStyleType, listed.marginBlockStart, listed.marginBlockEnd, listed.paddingInlineStart];
        const want = ["none", "0px", "0px", style.paddingInlineStart];
        list.remove();
        return [
          ...(used === token && token !== "" ? [] : [`${box.dataset["space"] ?? ""}: ${used} for ${token}`]),
          ...(got.join() === want.join() ? [] : [`as a list: ${got.join()} for ${want.join()}`]),
        ];
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

// The design's motion: "Hovered items follow the pointer at once and ease back on leave". Each
// button's transitions are slowed to 10 s, so a transition that runs is still running when read.
test("every button lightens at once under the pointer and eases back on leave, at once under reduced motion", async ({
  page,
}) => {
  for (const [reduced, id] of [
    [false, "button--matrix"],
    [false, "button--as-link"],
    [true, "button--matrix"],
    [true, "button--as-link"],
  ] as const) {
    await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
    await open(page, id);
    const buttons = page.locator(`${BUTTONS}:not(:disabled):not([aria-busy='true'])`);
    expect(await buttons.count()).toBeGreaterThan(0);
    for (const button of await buttons.all()) {
      if (!reduced) {
        await button.evaluate((b) => {
          b.style.setProperty("--motion-fast", "10s");
        });
      }
      const name = await button.evaluate((b) => b.outerHTML.slice(0, 60));
      await button.hover();
      expect.soft(await button.evaluate((b) => b.getAnimations().length), `${name}: on enter`).toBe(0);
      await page.mouse.move(0, 0);
      const easing = await button.evaluate((b) => b.getAnimations().length);
      expect.soft(easing > 0, `${name}: easing back${reduced ? " under reduced motion" : ""}`).toBe(!reduced);
    }
  }
});

// What the pointer changes, read from every property that paints a box, whatever draws it.
test("a button lightens under the pointer, unless it is disabled or busy", async ({ page }) => {
  for (const [id, lit] of [
    ["button--primary", true],
    ["button--outline", true],
    ["button--disabled", false],
    ["button--busy", false],
    ["button--as-link", true],
  ] as const) {
    await open(page, id);
    const button = page.locator(BUTTONS);
    const paint = () =>
      button.evaluate((b) => {
        const s = getComputedStyle(b);
        return [s.backgroundColor, s.backgroundImage, s.boxShadow, s.borderColor, s.color, s.opacity].join();
      });
    const resting = await paint();
    await button.hover({ force: true });
    expect((await paint()) !== resting, id).toBe(lit);
    await page.mouse.move(0, 0);
  }
});

// A link with the button's look is the button, read from every property that draws it, and no underline.
test("a link-button wears its button's look, with no underline", async ({ page }) => {
  const look = async (id: string, selector: string) => {
    await open(page, id);
    return page.locator(`#storybook-root ${selector}`).evaluate((e) => {
      const s = getComputedStyle(e);
      return [
        s.textDecorationLine,
        s.color,
        s.backgroundColor,
        s.borderTopColor,
        s.borderTopWidth,
        s.borderRadius,
        s.font,
        s.paddingInlineStart,
        s.blockSize,
        s.cursor,
        s.display,
      ];
    });
  };
  const link = await look("button--as-link", "a");
  expect(link[0]).toBe("none");
  expect(link).toEqual(await look("button--primary", "button"));
});

// The flash is in the page's flow, where its slot puts it: empty, it takes no room and paints nothing;
// full, nothing in it is fixed or absolute.
test("the flash sits in the flow: empty it takes no room and paints nothing, full it holds no fixed box", async ({
  page,
}) => {
  await open(page, "flash--empty");
  const empty = await page.getByRole("status").evaluate((region) => {
    const s = getComputedStyle(region);
    return {
      height: region.getBoundingClientRect().height,
      inside: region.childElementCount,
      ground: s.backgroundColor,
      position: s.position,
    };
  });
  expect(empty).toEqual({ height: 0, inside: 0, ground: "rgba(0, 0, 0, 0)", position: "static" });
  await open(page, "flash--timed");
  const placed = await page
    .getByRole("status")
    .evaluate((region) => [region, ...region.querySelectorAll("*")].map((e) => getComputedStyle(e).position));
  expect(new Set(placed)).toEqual(new Set(["static"]));
});

test("under forced colours, every button keeps a visible edge", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  const edges: string[] = [];
  for (const id of ["button--matrix", "button--as-link"]) {
    await open(page, id);
    edges.push(
      ...(await page.evaluate(
        (buttons) => [...document.querySelectorAll(buttons)].map((b) => getComputedStyle(b).borderTopWidth),
        BUTTONS,
      )),
    );
  }
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

// The scripts that caps or tracking break, Arabic's and Hebrew's, each by the languages written in
// them; the label's own language is set in turn, and English keeps its caps.
test("the label keeps its case and its spacing in every language whose script caps break", async ({ page }) => {
  await open(page, "overview--all");
  const languages = ["ar", "fa", "ur", "ps", "ckb", "sd", "ug", "ks", "he", "yi", "en"];
  const looks = await page.evaluate((all) => {
    const label = document.querySelector<HTMLElement>("#storybook-root .label");
    if (label === null) return {};
    return Object.fromEntries(
      all.map((language) => {
        label.lang = language;
        const style = getComputedStyle(label);
        return [language, style.textTransform === "none" && style.letterSpacing === "normal"];
      }),
    );
  }, languages);
  expect(looks).toEqual(Object.fromEntries(languages.map((language) => [language, language !== "en"])));
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
