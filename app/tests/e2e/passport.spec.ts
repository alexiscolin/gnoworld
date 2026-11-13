import { expect, hydrated, test, type Page } from "./fixtures.ts";

// The passport: a device's stamps seeded in its storage, its dialog's three tabs, "Show N more", the challenges' counts, and the figures and
// the tabs on one row at the computer widths.
const day = (back: number) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);
// Nine stamps of one system today, one of another a week ago; the first two charted first.
const STAMPS: Record<string, string> = { "onyx:beta/w0": day(7) };
for (let at = 0; at < 9; at += 1) STAMPS[`onyx:alpha/w${String(at)}`] = day(0);
const CHARTED = { "onyx:alpha/w0": day(0), "onyx:alpha/w1": day(0) };

async function seeded(page: Page, quests: Record<string, string[]> = {}) {
  await page.addInitScript(
    ([stamps, charted, done]) => {
      localStorage.setItem("gnoworld:device:stamps", JSON.stringify(stamps));
      localStorage.setItem("gnoworld:device:charted", JSON.stringify(charted));
      localStorage.setItem("gnoworld:device:quests", JSON.stringify(done));
    },
    [STAMPS, CHARTED, quests] as const,
  );
}

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/#passport");
  await hydrated(page);
  const dialog = page.getByRole("dialog", { name: "Passport" });
  await expect(dialog).toBeVisible();
  return dialog;
}

const figures = (dialog: ReturnType<Page["locator"]>) => dialog.locator("[data-value]");

test("the passport counts a device's stamps, systems and worlds charted first, by day, with Show N more", async ({
  page,
}) => {
  await seeded(page);
  const dialog = await open(page, 1280);
  await dialog.getByRole("tab", { name: /^Stamps/ }).click();
  await expect(figures(dialog).nth(0)).toHaveAttribute("data-value", "10");
  await expect(figures(dialog).nth(1)).toHaveAttribute("data-value", "2");
  await expect(figures(dialog).nth(2)).toHaveAttribute("data-value", "2");
  await expect(dialog.getByRole("tab", { name: /^Stamps/ })).toContainText("10");
  await expect(dialog.getByRole("tab", { name: /^Charted/ })).toContainText("2");
  await expect(dialog).toContainText("Today · 9 stamps");
  await expect(dialog).toContainText("1 stamp");
  // Seven of the day's nine, the rest one press away.
  const more = dialog.getByRole("button", { name: "Show 2 more" });
  await expect(more).toBeVisible();
  const marks = dialog.getByRole("img", { name: /, stamped / });
  await expect(marks).toHaveCount(8);
  await more.click();
  await expect(more).toHaveCount(0);
  await expect(marks).toHaveCount(10);
  await dialog.getByRole("tab", { name: /^Charted/ }).click();
  await expect(marks).toHaveCount(2);
  await expect(dialog.getByRole("button", { name: /Show \d+ more/ })).toHaveCount(0);
  await dialog.getByRole("tab", { name: /^Challenges/ }).click();
  await expect(dialog).toContainText("Quests");
});

test("a device with no stamp says so, and counts no step of the challenges", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/#passport");
  await hydrated(page);
  const dialog = page.getByRole("dialog", { name: "Passport" });
  await expect(figures(dialog).nth(0)).toHaveAttribute("data-value", "0");
  await expect(figures(dialog).nth(3)).toHaveAttribute("data-value", "0");
  await dialog.getByRole("tab", { name: /^Stamps/ }).click();
  await expect(dialog).toContainText("No stamp yet");
  await dialog.getByRole("tab", { name: /^Charted/ }).click();
  await expect(dialog).toContainText("No world charted first yet");
});

test("a quest step done on the device counts in the challenges' steps and in its quest's card", async ({ page }) => {
  await seeded(page, { named: ["read"] });
  const dialog = await open(page, 1280);
  await expect(figures(dialog).nth(3)).toHaveAttribute("data-value", "1");
  await expect(dialog).toContainText("· 1 of 2");
});

for (const width of [1280, 1440])
  test(`the passport's figures and its tabs share one row at ${String(width)}`, async ({ page }) => {
    await seeded(page);
    const dialog = await open(page, width);
    const tabs = await dialog.getByRole("tablist").boundingBox();
    const first = await figures(dialog).first().boundingBox();
    const last = await figures(dialog).last().boundingBox();
    if (tabs === null || first === null || last === null) throw new Error("the row is not drawn");
    // The tabs' row meets the figures': they overlap in height, and the tabs sit after the last figure.
    expect(tabs.y).toBeLessThan(last.y + last.height);
    expect(tabs.y + tabs.height).toBeGreaterThan(first.y);
    expect(tabs.x).toBeGreaterThan(last.x + last.width);
  });
