// What the components do in a browser, which jsdom cannot show: the dialog and the popover in the
// top layer, the tooltip, the skeleton's wait, a figure's count, a chart's colours and the dock's
// magnification.
import type { Locator } from "@playwright/test";
import type { Page } from "../e2e/fixtures.ts";
import { contrast, expect, open, RING, test } from "./storybook.ts";

// The focused control by its name: an icon button has no words of its own.
const focused = (page: Page) =>
  page.evaluate(() => {
    const now = document.activeElement;
    return now?.getAttribute("aria-label") ?? now?.textContent.trim() ?? "";
  });

const box = async (locator: Locator) => {
  const found = await locator.boundingBox();
  if (found === null) throw new Error("not drawn");
  return found;
};

// The ring of the focused control, as stories.spec.ts reads it on every control Tab reaches.
const ring = (page: Page) =>
  page.evaluate(() => {
    const style = getComputedStyle(document.activeElement ?? document.body);
    return [style.outlineStyle, style.outlineWidth, style.outlineColor, style.outlineOffset];
  });

// The gap a floating box keeps from its anchor and from the screen's edge: --space-2xs.
const STEP = 8;

// The passport's story, its dialog opened from its button.
async function passport(page: Page) {
  await open(page, "dialog--from-a-button");
  await page.getByRole("button", { name: "Open the passport" }).click();
}

// The anchored popover at a width, a test's own step run before its trigger opens it: both, open.
async function anchored(page: Page, width: number, before?: (trigger: Locator) => Promise<void>) {
  await page.setViewportSize({ width, height: 700 });
  await open(page, "popover--anchored");
  const trigger = page.getByRole("button", { name: "Network" });
  await before?.(trigger);
  await trigger.click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  return { trigger, panel };
}

// The trigger set fixed at a corner of the screen, as a test asks.
const pinned = (where: Record<string, string>) => (trigger: Locator) =>
  trigger.evaluate((t, how) => {
    Object.assign(t.style, { position: "fixed", ...how });
  }, where);

// A flash's pill, in its region.
const pillOf = (page: Page) => page.locator("[role='status'] > *");
// The gap from the trigger's bottom to the panel's top, as it settles: one step when placed under.
const under = (trigger: Locator, panel: Locator) =>
  expect.poll(async () => (await box(panel)).y - ((await box(trigger)).y + (await box(trigger)).height));

test.describe("Dialog", () => {
  // The browser closes a dialog itself on a second Esc with nothing between (the close watcher's
  // rule): one its page keeps shows again, modal, the focus in it (F330).
  test("stays open and modal after two Esc when its page keeps it", async ({ page }) => {
    await open(page, "flash--over-a-dialog");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect
      .poll(() => dialog.evaluate((d) => [d.matches(":modal"), d.contains(document.activeElement)]))
      .toEqual([true, true]);
  });

  test("opens in the top layer over its scrim, its title focused, and Esc closes it once, focus back on the opener", async ({
    page,
  }) => {
    await passport(page);
    const dialog = page.getByRole("dialog", { name: "Your passport" });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((d) => d.matches(":modal"))).toBe(true);
    expect(await focused(page)).toBe("Your passport");
    // The scrim is the token's colour, read off a probe that wears it.
    const [scrim, token] = await dialog.evaluate((d) => {
      const probe = document.createElement("div");
      probe.style.background = "var(--color-scrim)";
      document.body.append(probe);
      const wanted = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return [getComputedStyle(d, "::backdrop").backgroundColor, wanted];
    });
    expect(scrim).toBe(token);
    expect(scrim).not.toBe("rgba(0, 0, 0, 0)");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(await focused(page)).toBe("Open the passport");
    await expect(page.getByText("Closed 1", { exact: true })).toBeVisible();
  });

  test("its Close button closes it once, focus back on the opener", async ({ page }) => {
    await passport(page);
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(await focused(page)).toBe("Open the passport");
    await expect(page.getByText("Closed 1", { exact: true })).toBeVisible();
  });

  // Past its last control Chromium goes to its own buttons, out of the page: the page behind is inert.
  test("never lets Tab reach the page behind it while open", async ({ page }) => {
    await passport(page);
    for (let step = 0; step < 4; step += 1) {
      await page.keyboard.press("Tab");
      const where = await page.evaluate(() => {
        const now = document.activeElement;
        return now === null || now === document.body || now.closest("dialog") !== null;
      });
      expect(where, `Tab ${String(step)}`).toBe(true);
    }
  });

  test("lets a first Esc hide a tooltip shown in it, and only the next one close it", async ({ page }) => {
    await passport(page);
    await page.keyboard.press("Tab");
    expect(await focused(page)).toBe("Close");
    const tip = page.getByRole("dialog").locator("[data-shown]");
    await expect(tip).toHaveAttribute("data-shown", "true");
    await page.keyboard.press("Escape");
    await expect(tip).toHaveAttribute("data-shown", "false");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("with a field, the field takes the focus, not a button", async ({ page }) => {
    await open(page, "dialog--with-field");
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("INPUT");
  });

  test("with a primary button first and no field, the title takes the focus, never the button", async ({ page }) => {
    await open(page, "dialog--with-action");
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await focused(page)).toBe("Sign the stamp");
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("H2");
  });

  test("is 460 px wide, or 760 when wide, never wider than the screen", async ({ page }) => {
    for (const [id, width] of [
      ["dialog--standard", 460],
      ["dialog--wide", 760],
    ] as const) {
      await page.setViewportSize({ width: 1280, height: 800 });
      await open(page, id);
      expect((await box(page.getByRole("dialog"))).width, id).toBe(width);
      await page.setViewportSize({ width: 320, height: 640 });
      expect((await box(page.getByRole("dialog"))).width, `${id} at 320`).toBeLessThanOrEqual(320);
    }
  });
});

test.describe("Popover", () => {
  test("opens under its trigger, inside the screen, and Esc closes it, focus back on the trigger", async ({ page }) => {
    for (const width of [1280, 320]) {
      const { trigger, panel } = await anchored(page, width);
      await expect(page.getByRole("dialog", { name: "Choose the network" })).toBeVisible();
      const [t, p] = [await box(trigger), await box(panel)];
      expect(p.y, `${String(width)}: under the trigger`).toBeGreaterThanOrEqual(t.y + t.height);
      expect(p.x >= 0 && p.x + p.width <= width, `${String(width)}: inside the screen`).toBe(true);
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
      expect(await focused(page)).toBe("Network");
    }
  });

  test("gives the focus back to its trigger when Esc closes it with the focus inside", async ({ page }) => {
    await anchored(page, 1280);
    await page.keyboard.press("Tab");
    expect(await focused(page)).toBe("Switch to Onyx");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(await focused(page)).toBe("Network");
  });

  test("closes on a click outside it", async ({ page }) => {
    await anchored(page, 1280);
    await page.mouse.click(5, 5);
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("opens above a trigger at the screen's bottom end, still inside the screen", async ({ page }) => {
    const { trigger, panel } = await anchored(
      page,
      320,
      pinned({ insetBlockEnd: `${String(STEP)}px`, insetInlineEnd: `${String(STEP)}px` }),
    );
    const [t, p] = [await box(trigger), await box(panel)];
    expect(t.y - (p.y + p.height), "a step above the trigger").toBe(STEP);
    expect(p.x >= 0 && p.x + p.width <= 320, "inside the screen").toBe(true);
  });

  test("starts at its trigger's end in a right-to-left page", async ({ page }) => {
    const { trigger, panel } = await anchored(page, 1280, () =>
      page.evaluate(() => {
        document.documentElement.dir = "rtl";
      }),
    );
    const [t, p] = [await box(trigger), await box(panel)];
    expect(Math.abs(p.x + p.width - (t.x + t.width)), "its right edge on the trigger's").toBeLessThanOrEqual(1);
  });

  test("follows its trigger as the window narrows", async ({ page }) => {
    const { panel } = await anchored(
      page,
      1280,
      pinned({ insetBlockStart: "100px", insetInlineEnd: `${String(STEP)}px` }),
    );
    for (const width of [1280, 800]) {
      await page.setViewportSize({ width, height: 700 });
      await expect.poll(async () => (await box(panel)).x + (await box(panel)).width, String(width)).toBe(width - STEP);
    }
  });

  test("follows its trigger as a box it sits in scrolls", async ({ page }) => {
    await page.addInitScript(() => {
      addEventListener("DOMContentLoaded", () => {
        const root = document.querySelector<HTMLElement>("#storybook-root");
        root?.style.setProperty("overflow", "auto");
        root?.style.setProperty("block-size", "300px");
        root?.style.setProperty("padding-block", "200px 600px");
      });
    });
    const { trigger, panel } = await anchored(page, 1280);
    await under(trigger, panel).toBe(STEP);
    await page.evaluate(() => {
      document.querySelector("#storybook-root")?.scrollBy(0, 100);
    });
    await under(trigger, panel).toBe(STEP);
  });

  test("stays under its trigger on a scrolled page, and as the page scrolls on", async ({ page }) => {
    await page.addInitScript(() => {
      addEventListener("DOMContentLoaded", () => {
        document.body.style.minBlockSize = "300vh";
        document.querySelector<HTMLElement>("#storybook-root")?.style.setProperty("padding-block-start", "400px");
      });
    });
    const { trigger, panel } = await anchored(page, 1280, () =>
      page.evaluate(() => {
        scrollTo(0, 200);
      }),
    );
    await under(trigger, panel).toBe(STEP);
    await page.evaluate(() => {
      scrollBy(0, 100);
    });
    await under(trigger, panel).toBe(STEP);
  });

  test("a menu focuses its first item, moves with the arrows, does an item's act and closes", async ({ page }) => {
    await open(page, "popover--message-menu");
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    expect(await focused(page)).toBe("Copy");
    await page.keyboard.press("ArrowDown");
    expect(await focused(page)).toBe("Room link");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeHidden();
    expect(await focused(page)).toBe("More");
  });

  test("a menu opens from the keyboard, rings each item the arrows reach, and Esc gives the focus back", async ({
    page,
  }) => {
    await open(page, "popover--message-menu");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    for (const name of ["Copy", "Room link", "Save", "Report"]) {
      expect(await focused(page)).toBe(name);
      expect(await ring(page), name).toEqual(RING);
      await page.keyboard.press("ArrowDown");
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    expect(await focused(page)).toBe("More");
  });

  test("a menu taller than the screen stays inside it, and its last item can be reached", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 200 });
    await open(page, "popover--message-menu");
    await page.getByRole("button", { name: "More" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const m = await box(menu);
    expect(m.y, "below the screen's top").toBeGreaterThanOrEqual(STEP);
    expect(m.y + m.height, "above the screen's bottom").toBeLessThanOrEqual(200 - STEP);
    await page.keyboard.press("End");
    const last = await box(page.getByRole("menuitem", { name: "Report" }));
    expect(last.y + last.height, "the last item in sight").toBeLessThanOrEqual(200);
  });

  test("a menu's item taken with the pointer closes it, focus back on the trigger", async ({ page }) => {
    await open(page, "popover--message-menu");
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Save" }).click();
    await expect(page.getByRole("menu")).toBeHidden();
    expect(await focused(page)).toBe("More");
  });
});

test("a selected chip keeps its cream fill under the pointer, its words as dark as at rest", async ({ page }) => {
  await open(page, "chip--selected");
  const chip = page.getByRole("button", { pressed: true });
  const look = () => chip.evaluate((c) => [getComputedStyle(c).backgroundColor, getComputedStyle(c).color]);
  const resting = await look();
  await chip.hover();
  expect(await look()).toEqual(resting);
});

test("tabs ring each tab the arrows reach, and select it", async ({ page }) => {
  for (const id of ["tabs--segmented", "tabs--icons-only"]) {
    await open(page, id);
    await page.keyboard.press("Tab");
    const tabs = await page.getByRole("tab").count();
    for (let step = 0; step < tabs; step += 1) {
      expect(await ring(page), `${id}, tab ${String(step)}`).toEqual(RING);
      expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-selected"))).toBe("true");
      await page.keyboard.press("ArrowRight");
    }
  }
});

test.describe("an icon button's tooltip", () => {
  const tip = (page: Page) => page.locator("#storybook-root [data-shown]");

  test("shows its label at once on keyboard focus, above it when there is room, and Esc hides it", async ({ page }) => {
    await open(page, "button-iconbutton--outline");
    await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>("#storybook-root");
      root?.style.setProperty("padding-block-start", "200px");
      root?.style.setProperty("padding-inline-start", "300px");
    });
    await page.keyboard.press("Tab");
    await expect(tip(page)).toHaveAttribute("data-shown", "true");
    await expect(tip(page)).toHaveCSS("opacity", "1");
    expect(Number.parseFloat(await tip(page).evaluate((t) => getComputedStyle(t).fontSize))).toBeGreaterThanOrEqual(11);
    const [b, t] = [await box(page.getByRole("button")), await box(tip(page))];
    expect(b.y - (t.y + t.height), "a step above the button").toBe(STEP);
    expect(Math.abs(t.x + t.width / 2 - (b.x + b.width / 2)), "centred on the button").toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    await expect(tip(page)).toHaveAttribute("data-shown", "false");
    await expect(tip(page)).toBeHidden();
  });

  test("goes below its button when there is no room above, still inside the screen", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page, "button-iconbutton--outline");
    await page.keyboard.press("Tab");
    await expect(tip(page)).toBeVisible();
    const [b, t] = [await box(page.getByRole("button")), await box(tip(page))];
    expect(t.y, "below the button").toBeGreaterThanOrEqual(b.y + b.height);
    expect(t.x >= 0 && t.x + t.width <= 320, "inside the screen").toBe(true);
  });

  // The page's clock held still, so no wait of its own runs out while the test looks: what shows at
  // once shows on the click's focus. Its half second is counted to the millisecond by its unit test.
  test("shows nothing for a click's focus until its wait under the pointer, and stays while the pointer moves onto it", async ({
    page,
  }) => {
    await page.clock.install();
    await open(page, "button-iconbutton--outline");
    await page.clock.pauseAt(Date.now() + 1_000);
    await page.getByRole("button").click();
    await page.waitForTimeout(300);
    await expect(tip(page)).toHaveAttribute("data-shown", "false");
    await page.clock.runFor(500);
    await expect(tip(page)).toHaveAttribute("data-shown", "true");
    const t = await box(tip(page));
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 5 });
    await page.clock.runFor(1_000);
    await expect(tip(page)).toHaveAttribute("data-shown", "true");
  });
});

test("a skeleton shows only after 300 ms, and breathes then, but stays still under reduced motion", async ({
  page,
}) => {
  for (const reduced of [false, true]) {
    await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
    await open(page, "skeleton--lines");
    const line = page.locator("[data-shape='line']").first();
    // Its animations started again, held at a moment, and read: what the page shows then.
    const at = (ms: number) =>
      line.evaluate((shape, moment) => {
        shape.style.animation = "none";
        shape.getBoundingClientRect();
        shape.style.removeProperty("animation");
        for (const animation of shape.getAnimations()) {
          animation.pause();
          animation.currentTime = moment;
        }
        return getComputedStyle(shape).visibility;
      }, ms);
    const how = reduced ? "under reduced motion" : "";
    expect(await at(100), `hidden at 100 ms ${how}`).toBe("hidden");
    expect(await at(400), `shown at 400 ms ${how}`).toBe("visible");
    const loops = await line.evaluate(
      (shape) => shape.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations === Infinity).length,
    );
    expect(loops, `loops ${how}`).toBe(reduced ? 0 : 1);
  }
});

test.describe("a figure", () => {
  // Each figure the page draws, in turn, with when: recorded from before the story's first render.
  async function recorded(page: Page) {
    await page.addInitScript(() => {
      const seen: { text: string; at: number }[] = [];
      Reflect.set(window, "counted", seen);
      new MutationObserver(() => {
        const text = document.querySelector("#storybook-root [data-value]")?.textContent;
        if (text !== undefined && text !== seen.at(-1)?.text) seen.push({ text, at: performance.now() });
      }).observe(document, { subtree: true, childList: true, characterData: true });
    });
    await open(page, "stat--with-unit");
    const read = () =>
      page.evaluate(() => {
        const seen: unknown = Reflect.get(window, "counted");
        return Array.isArray(seen) ? (seen as { text: string; at: number }[]) : [];
      });
    await expect.poll(async () => (await read()).at(-1)?.text, { intervals: [50] }).toBe("21,480");
    return read();
  }

  test("counts up from nothing to its value on arrival, never back, within the arrival's 1.2 s", async ({ page }) => {
    const seen = await recorded(page);
    const values = seen.map(({ text }) => Number(text.replaceAll(",", "")));
    expect(values[0]).toBe(0);
    expect(values.some((v) => v > 0 && v < 21480)).toBe(true);
    expect(values.every((v, at) => at === 0 || v > (values[at - 1] ?? 0))).toBe(true);
    expect((seen.at(-1)?.at ?? 0) - (seen[0]?.at ?? 0)).toBeLessThanOrEqual(1_200);
  });

  test("stands at its value from the first frame under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect((await recorded(page)).map(({ text }) => text)).toEqual(["21,480"]);
  });
});

test("a chart's bars hold 3:1 against the page, the current one unlike the past, and its values are a table", async ({
  page,
}) => {
  await open(page, "activitychart--day");
  await expect(page.getByRole("table", { name: "Calls per hour, today" })).toHaveCount(1);
  const [past, now, ground] = await page.evaluate(() => {
    const fill = (selector: string) => getComputedStyle(document.querySelector(selector) ?? document.body).fill;
    return [fill("[data-hour='0']"), fill("[data-current='true']"), getComputedStyle(document.body).backgroundColor];
  });
  const rgb = (colour: string) => (colour.match(/\d+/g) ?? []).slice(0, 3).map(Number);
  expect(past).not.toBe(now);
  for (const bar of [past, now]) expect(contrast(rgb(bar), rgb(ground))).toBeGreaterThanOrEqual(3);
});

test.describe("a planet's thumb", () => {
  test("grows under the pointer when magnified, and not under reduced motion", async ({ page }) => {
    for (const reduced of [false, true]) {
      await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      await open(page, "planetthumb--magnified");
      const thumb = page.locator("[data-magnify]");
      const resting = (await box(thumb)).width;
      await thumb.hover();
      if (reduced) {
        expect(await thumb.evaluate((t) => getComputedStyle(t).transitionDuration)).toBe("0s");
        expect((await box(thumb)).width).toBe(resting);
      } else {
        await expect.poll(async () => (await box(thumb)).width).toBeGreaterThan(resting);
      }
    }
  });

  test("is 32, 48 or 64 px by its size", async ({ page }) => {
    await open(page, "planetthumb--sizes");
    const widths = await page
      .locator("[data-size]")
      .evaluateAll((all) => all.map((t) => [t.getAttribute("data-size"), t.getBoundingClientRect().width]));
    expect(Object.fromEntries(widths)).toEqual({ s: 32, m: 48, l: 64 });
  });
});

// A flash raised from a modal dialog shows above its scrim, at the top centre, as bright as without a
// dialog (F331). Outside the dialog, it stays inert until the dialog closes: the platform's rule.
test("a flash raised from a dialog shows above its scrim, at the top centre", async ({ page }) => {
  const pill = pillOf(page);
  await open(page, "flash--timed");
  const alone = await pill.screenshot();
  await open(page, "flash--over-a-dialog");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  const placed = await box(pill);
  const screen = page.viewportSize() ?? { width: 0, height: 0 };
  expect(Math.abs(placed.x + placed.width / 2 - screen.width / 2)).toBeLessThanOrEqual(1);
  expect(placed.y).toBeLessThan(screen.height / 4);
  expect(await pill.screenshot()).toEqual(alone);
});

// A manual popover, as its page holds it: an auto one closes on any click outside while the page
// still thinks it shown (F346).
test("a flash stays shown when the page is clicked outside it", async ({ page }) => {
  await open(page, "flash--with-action");
  await page.mouse.click(5, 300);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  expect(await pillOf(page).evaluate((pill) => pill.matches(":popover-open"))).toBe(true);
});

test.describe("an avatar", () => {
  test("is a disc of 20, 24 or 48 px by its size", async ({ page }) => {
    await open(page, "avatar--sizes");
    const sides = await page.locator("[data-size]").evaluateAll((all) =>
      all.map((a) => {
        const { width, height } = a.getBoundingClientRect();
        return [a.getAttribute("data-size"), [width, height]];
      }),
    );
    expect(Object.fromEntries(sides)).toEqual({ s: [20, 20], m: [24, 24], l: [48, 48] });
  });

  // Decision 3 (docs/decisions.md): the assistant's orb is violet, the machine's colour; never mint.
  test("draws the assistant's orb in violet, never in mint", async ({ page }) => {
    await open(page, "avatar--kinds");
    const colours = await page.locator("[data-orb]").evaluate((orb) => {
      const target = /url\(#([^)]+)\)/.exec(orb.getAttribute("fill") ?? "")?.[1] ?? "";
      const stops = [...(document.getElementById(target)?.querySelectorAll("stop") ?? [])];
      return stops.map((stop) => getComputedStyle(stop).stopColor);
    });
    // A core of the text's colour, then violet to its edge, where it fades.
    expect(colours).toEqual(["rgb(244, 246, 250)", "rgb(183, 156, 255)", "rgb(183, 156, 255)"]);
  });

  test("draws its stars and their line in the text's colour, the line unfilled", async ({ page }) => {
    await open(page, "avatar--person");
    const drawn = await page.locator("[data-kind='person'] svg").evaluate((svg) => {
      const line = getComputedStyle(svg.querySelector("polyline") ?? svg);
      return {
        stars: [...new Set([...svg.querySelectorAll("[data-star]")].map((star) => getComputedStyle(star).fill))],
        line: [line.stroke, line.fill],
      };
    });
    expect(drawn).toEqual({ stars: ["rgb(244, 246, 250)"], line: ["rgb(244, 246, 250)", "none"] });
  });

  // A face is a picture: forced colours leave it as drawn, night and colours, as they leave a photo
  // (F319). A bot's mark is the code icon, which takes the system's colours as every icon does.
  test("keeps its face, night and colours, under forced colours", async ({ page }) => {
    await open(page, "avatar--kinds");
    const faces = await page.locator("[data-kind='person'] svg, [data-kind='assistant'] svg").all();
    expect(faces).toHaveLength(2);
    // The square inside each disc, a pixel in: around it, the page's colours change with the mode.
    const inside = async () =>
      Promise.all(
        faces.map(async (face) => {
          const { x, y, width } = await box(face);
          const side = Math.floor(width / Math.SQRT2) - 2;
          const from = (start: number) => Math.ceil(start + (width - side) / 2);
          return page.screenshot({ clip: { x: from(x), y: from(y), width: side, height: side } });
        }),
      );
    const normal = await inside();
    await page.emulateMedia({ forcedColors: "active" });
    expect(await inside()).toEqual(normal);
  });

  // The ring is a border, which forced colours paint in the system's colour; a box-shadow they drop,
  // and an outline is the focus ring's alone (docs/DESIGN-SYSTEM.md, "Three meanings").
  test("keeps its speaking ring and its presence dot under forced colours; the ring is no outline", async ({
    page,
  }) => {
    await open(page, "avatar--here-and-speaking");
    for (const forced of [false, true]) {
      await page.emulateMedia({ forcedColors: forced ? "active" : "none" });
      const marks = await page.evaluate(() => {
        const edge = (e: Element | null, pseudo?: string) => {
          const s = getComputedStyle(e ?? document.body, pseudo);
          return { style: s.borderTopStyle, width: Number.parseFloat(s.borderTopWidth), colour: s.borderTopColor };
        };
        const speaking = document.querySelector("[data-speaking]");
        return {
          edges: [edge(speaking, "::after"), edge(document.querySelector("[data-presence]"))],
          outline: getComputedStyle(speaking ?? document.body).outlineStyle,
          ground: getComputedStyle(document.body).backgroundColor,
        };
      });
      for (const { style, width, colour } of marks.edges) {
        expect([style, width >= 2]).toEqual(["solid", true]);
        expect(colour).not.toBe(marks.ground);
      }
      expect(marks.outline).toBe("none");
    }
  });

  // slice-2.md §5: each face as drawn at 20 px, blurred to 4 x 4 zones; two faces are alike when their
  // zones differ by under 0.06 in OKLab on average. The browser converts the colours (relative colour).
  test("tells 200 addresses apart at 20 px: two faces alike in under 1% of pairs", async ({ page }) => {
    await open(page, "avatar--spread");
    const list = page.getByRole("list");
    const png = (await list.screenshot({ scale: "css" })).toString("base64");
    const measured = await list.evaluate(async (ul, shot) => {
      const bytes = Uint8Array.from(atob(shot), (c) => c.charCodeAt(0));
      const picture = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = new OffscreenCanvas(picture.width, picture.height);
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("no canvas");
      context.drawImage(picture, 0, 0);
      const origin = ul.getBoundingClientRect();
      const probe = document.body.appendChild(document.createElement("i"));
      const oklab = (r: number, g: number, b: number) => {
        probe.style.color = `oklab(from rgb(${String(r)} ${String(g)} ${String(b)}) l a b)`;
        return (getComputedStyle(probe).color.match(/-?[\d.]+(e-?\d+)?/g) ?? []).slice(0, 3).map(Number);
      };
      const sides = new Set<string>();
      const zones = [...ul.querySelectorAll("[data-size] svg")].map((face) => {
        const at = face.getBoundingClientRect();
        sides.add(`${String(at.width)}x${String(at.height)}`);
        const { data } = context.getImageData(Math.round(at.x - origin.x), Math.round(at.y - origin.y), 20, 20);
        return Array.from({ length: 16 }, (_, zone) => {
          const sum = [0, 0, 0];
          for (let y = 0; y < 5; y++)
            for (let x = 0; x < 5; x++) {
              const i = ((Math.floor(zone / 4) * 5 + y) * 20 + (zone % 4) * 5 + x) * 4;
              for (let c = 0; c < 3; c++) sum[c] = (sum[c] ?? 0) + (data[i + c] ?? 0);
            }
          const [r = 0, g = 0, b = 0] = sum.map((s) => s / 25);
          return oklab(r, g, b);
        });
      });
      probe.remove();
      // A distance the browser could not compute is NaN, which no threshold catches: counted apart.
      let [close, pairs, unread] = [0, 0, 0];
      for (let i = 0; i < zones.length; i++)
        for (let j = i + 1; j < zones.length; j++) {
          const apart = (zones[i] ?? []).map((zone, z) =>
            Math.hypot(...zone.map((v, c) => v - (zones[j]?.[z]?.[c] ?? NaN))),
          );
          const mean = apart.reduce((s, d) => s + d, 0) / 16;
          pairs++;
          if (!Number.isFinite(mean)) unread++;
          else if (mean < 0.06) close++;
        }
      return { faces: zones.length, sides: [...sides], pairs, unread, alike: close };
    }, png);
    const { alike, ...read } = measured;
    expect(read).toEqual({ faces: 200, sides: ["20x20"], pairs: (200 * 199) / 2, unread: 0 });
    expect(alike / read.pairs).toBeLessThan(0.01);
  });
});
