import { readFileSync } from "node:fs";
import { queryEnvelope, statusEnvelope } from "@gnoworld/chain/testing/envelopes";
import { violations } from "./axe.ts";
import { CORS, HOME, RPC } from "./govdaoChain.ts";
import { box, near } from "./geometry.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { opened, stats } from "./sceneStage.ts";

// GovDAO, a world with a realm (docs/decisions.md, 2026-10-31): its page reads the realm's proposals from the chain, in the format
// RECORDED on onyx-1 (tests/chain/recorded: its first line is the recording's own comment). The page states no threshold, so the
// page draws none: no "of 66.66%", no ring. The plate is the realm plate's (its kicker, title, line, actions, figures, then its cards).
async function chain(page: Page, { down = false }: { down?: boolean } = {}): Promise<void> {
  await page.route(RPC, (route) => {
    if (down) return route.fulfill({ status: 503, headers: CORS, body: "down" });
    if (new URL(route.request().url()).pathname === "/status")
      return route.fulfill({ headers: CORS, body: JSON.stringify(statusEnvelope(796379, "2026-10-31T09:46:00Z")) });
    return route.fulfill({ headers: CORS, body: JSON.stringify(queryEnvelope({ data: HOME })) });
  });
}

// A recorded page without its provenance line.
const recorded = (name: string) =>
  readFileSync(new URL(`../chain/recorded/${name}`, import.meta.url), "utf8")
    .split("\n")
    .slice(1)
    .join("\n");

// A chain whose realm has an open proposal: gnoland-1's home page, its #14 open, and #14's own page with its yes and no, as RECORDED.
async function openChain(page: Page): Promise<void> {
  const home = recorded("gnoland-1-gov-dao-home.md");
  const fourteen = recorded("gnoland-1-gov-dao-14-active.md");
  await page.route(RPC, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/status")
      return route.fulfill({ headers: CORS, body: JSON.stringify(statusEnvelope(1208159, "2026-10-31T09:46:00Z")) });
    const hex = /^0x([0-9a-f]*)$/.exec(url.searchParams.get("data") ?? "")?.[1] ?? "";
    const asked = new TextDecoder().decode(
      Uint8Array.from(hex.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16)),
    );
    return route.fulfill({
      headers: CORS,
      body: JSON.stringify(queryEnvelope({ data: asked.endsWith(":14") ? fourteen : home })),
    });
  });
}

// The Proposals card of the plate: its title, its rows, its link to gnoweb.
const proposals = (page: Page) =>
  page
    .locator("[data-look='plate'] article")
    .filter({ has: page.getByRole("heading", { name: "Proposals", exact: true }) });

// GovDAO's page on the recorded chain, hydrated, its proposals read.
async function openedWithProposals(page: Page): Promise<void> {
  await chain(page);
  await page.goto("/w/govdao");
  await hydrated(page);
  await expect(proposals(page).getByRole("link", { name: /#37/ })).toBeVisible();
}

for (const width of [390, 1280, 1728] as const) {
  test.describe(`GovDAO at ${String(width)} px`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 1080 }, deviceScaleFactor: 1 });

    test("reads the realm's proposals, with their state and no threshold, and has no accessibility violation", async ({
      page,
    }) => {
      await chain(page);
      await page.goto("/w/govdao");
      await hydrated(page);
      const plate = page.locator("[data-look='plate']");
      await expect(plate.getByRole("heading", { level: 1 })).toHaveText("GovDAO");
      await expect(plate.getByRole("link", { name: "Read the proposals" })).toHaveAttribute("href", "/r/gov/dao");
      const card = proposals(page);
      const newest = card.getByRole("link", { name: /Set validator gno-core-validator-1 to voting power 60/ }).first();
      await expect(newest).toBeVisible();
      await expect(newest).toContainText("#37");
      await expect(card.getByRole("listitem").filter({ has: newest })).toContainText("Accepted");
      // The recorded pages state no threshold: none is shown, never the video's; no open proposal, so no pill and no ring.
      await expect(plate).not.toContainText("66.66");
      await expect(plate).not.toContainText(/YES \d/);
      await expect(card.getByRole("status").filter({ hasText: /^Proposal/ })).toHaveCount(0);
      await expect(card.locator("svg circle")).toHaveCount(0);
      // Each row links to its proposal on the chain's own gnoweb.
      await expect(newest).toHaveAttribute("href", "https://onyx.testnets.gno.land/r/gov/dao:37");
      expect(await violations(page)).toEqual([]);
    });

    test("says why when the chain does not answer, and links to the realm on gnoweb", async ({ page }) => {
      await chain(page, { down: true });
      await page.goto("/w/govdao");
      await hydrated(page);
      const plate = page.locator("[data-look='plate']");
      await expect(plate.getByRole("alert")).toContainText("did not answer");
      await expect(plate.getByRole("link", { name: "Read them on gnoweb" })).toHaveAttribute(
        "href",
        "https://onyx.testnets.gno.land/r/gov/dao",
      );
      expect(await violations(page)).toEqual([]);
    });

    test("the proposals look as approved, the read's time held still", async ({ page }) => {
      await openedWithProposals(page);
      // The read's time is the run's clock, and its words' width moves the line: one time of the same shape, as shell.spec.ts does.
      await proposals(page)
        .locator("time")
        .evaluateAll((times) => {
          for (const time of times) time.textContent = "2026-10-31 06:07 UTC";
        });
      // A phone's views bar stands fixed over the page's foot: masked, as the shell's own journeys mask the header.
      await expect(proposals(page)).toHaveScreenshot(`govdao-${String(width)}.png`, {
        mask: [page.getByRole("navigation", { name: "Views" })],
      });
    });
  });
}

test.describe("GovDAO at the video's size", () => {
  // Reduced motion: the plate's parts stand where they settle, not where their entrance has them as the boxes are read.
  test.use({ viewport: { width: 1728, height: 1080 }, deviceScaleFactor: 1, reducedMotion: "reduce" });

  // The plate's column: the kicker, the title, the line and the actions stand at one left, in that order, the proposals' card under them.
  test("the kicker, the title, the line and the actions stand in order at the column's left", async ({ page }) => {
    await openedWithProposals(page);
    const kicker = await box(page, "[data-look='plate'] [data-planet]");
    const title = await box(page, "[data-look='plate'] h1");
    const line = await box(page, "[data-look='plate'] p:has-text('GovDAO, the governance')");
    const main = await box(page, "[data-look='plate'] a[href='/r/gov/dao']");
    const card = await box(page, "[data-look='plate'] article:has(h2:text-is('Proposals'))");
    near(title.x, 100, "the title's left");
    near(line.x, title.x, "the line's left");
    near(main.x, title.x, "the main action's left");
    near(main.height, 44, "the main action's height");
    expect(kicker.y + kicker.height, "the title under the kicker").toBeLessThanOrEqual(title.y + 0.5);
    expect(line.y, "the line under the title").toBeGreaterThanOrEqual(title.y + title.height);
    expect(main.y, "the actions under the line").toBeGreaterThanOrEqual(line.y + line.height);
    expect(card.y, "the card under the actions").toBeGreaterThanOrEqual(main.y + main.height);
  });
});

// An open proposal (Alexis, 2026-11-02, F4308): the ring and the pill show what the chain gives, its yes and its no, and no threshold where
// none exists; the scene's ring has no mark.
test.describe("GovDAO with an open proposal", () => {
  test.use({ viewport: { width: 1728, height: 1080 }, deviceScaleFactor: 1 });

  test("says the open proposal's yes and no, invents no threshold, and rings it with no mark", async ({ page }) => {
    await openChain(page);
    await page.goto("/w/govdao?test-gpu");
    await hydrated(page);
    const plate = page.locator("[data-look='plate']");
    await expect(plate.getByRole("status").filter({ hasText: "Proposal 14" })).toHaveText(
      "Proposal 14 · YES 33% · NO 0%",
    );
    await expect(plate).not.toContainText(/YES \d+% of/);
    await opened(page);
    const ring = async () =>
      ((await stats(page)) as unknown as { world?: { ring?: { moon: number; against?: number; mark?: number } } }).world
        ?.ring;
    await expect.poll(async () => (await ring())?.against, { timeout: 90_000 }).toBe(0);
    const shown = await ring();
    expect(shown?.mark, "no threshold's mark").toBeUndefined();
    expect(shown?.moon).toBeCloseTo(Math.PI * (1 - 33.33333333333333 / 100), 6);
    expect(await violations(page)).toEqual([]);
  });
});

test("Bubble has no realm: no Read the proposals, no proposals", async ({ page }) => {
  await page.goto("/w/bubble");
  await hydrated(page);
  const plate = page.locator("[data-look='plate']");
  await expect(plate.getByRole("link", { name: "Read the proposals" })).toHaveCount(0);
  await expect(plate.getByRole("heading", { name: "Proposals" })).toHaveCount(0);
});
