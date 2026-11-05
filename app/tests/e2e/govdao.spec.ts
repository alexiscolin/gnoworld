import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { queryEnvelope, statusEnvelope } from "@gnoworld/chain/testing/envelopes";
import { box, near } from "./geometry.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { opened, stats } from "./sceneStage.ts";

// GovDAO, a world with a realm (docs/decisions.md, 2026-10-31): its page reads the realm's proposals from the chain, in the format
// RECORDED on onyx-1 (tests/chain/recorded: its first line is the recording's own comment). The page states no threshold, so the
// page draws none: no "of 66.66%", no ring. The geometry is frame 26's (the same GovDAO plate), to 2 px (geometry.ts).
const RPC = "https://rpc.onyx.testnets.gno.land/**";
const HOME = readFileSync(new URL("../chain/recorded/onyx-1-gov-dao-home.md", import.meta.url), "utf8")
  .split("\n")
  .slice(1)
  .join("\n");
const CORS = { "access-control-allow-origin": "*", "content-type": "application/json" };

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

const violations = async (page: Page) => (await new AxeBuilder({ page }).analyze()).violations;

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
      await expect(
        plate.getByRole("heading", { name: "Set validator gno-core-validator-1 to voting power 60" }).first(),
      ).toBeVisible();
      await expect(plate.locator("[data-field='state']").first()).toHaveText("ACCEPTED");
      await expect(plate.getByRole("status").filter({ hasText: "Proposal 37" })).toHaveText("Proposal 37");
      // The recorded pages state no threshold: none is shown, never the video's.
      await expect(plate).not.toContainText("66.66");
      await expect(plate).not.toContainText(/YES \d/);
      await expect(plate.locator("svg circle")).toHaveCount(0);
      // Each card links to its proposal on the chain's own gnoweb.
      await expect(plate.getByRole("link", { name: "Read it on gnoweb" }).first()).toHaveAttribute(
        "href",
        "https://onyx.testnets.gno.land/r/gov/dao:37",
      );
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
      await chain(page);
      await page.goto("/w/govdao");
      await hydrated(page);
      await expect(page.locator("[data-look='plate'] [data-field='number']").first()).toBeVisible();
      // A phone's chat takes the page (ChatScreen's takesPage) and closing it leaves for the universe's home: the picture hides it, so it
      // shows the proposals as they stand under it, not the chat.
      if (width === 390) {
        const chatScreen = page.locator("[data-full]");
        await expect(chatScreen).toBeAttached({ timeout: 30_000 });
        await chatScreen.evaluate((screen) => {
          screen.setAttribute("hidden", "");
        });
      }
      // The read's time is the run's clock, and its words' width moves the line: one time of the same shape, as shell.spec.ts does.
      await page.locator("section[aria-labelledby='proposals-title'] time").evaluateAll((times) => {
        for (const time of times) time.textContent = "2026-10-31 06:07 UTC";
      });
      // A phone's views bar stands fixed over the page's foot: masked, as the shell's own journeys mask the header.
      await expect(page.locator("section[aria-labelledby='proposals-title']")).toHaveScreenshot(
        `govdao-${String(width)}.png`,
        { mask: [page.getByRole("navigation", { name: "Views" })] },
      );
    });
  });
}

test.describe("GovDAO at the video's size", () => {
  test.use({ viewport: { width: 1728, height: 1080 }, deviceScaleFactor: 1 });

  // Frame 26 is this plate: the kicker's row at y 137, the title's top at 172, the line's first line's middle at 316, the text
  // column at x 100 and 484 px wide. The frame's figures and chart (it has a source for them) and its Follow are not here.
  test("the kicker, the title, the line and the column stand where frame 26's do", async ({ page }) => {
    await chain(page);
    await page.goto("/w/govdao");
    await hydrated(page);
    // 8g: the kicker is frame 26's crumb, "UNIVERSE › DAO".
    const kicker = await box(page, "[data-look='plate'] nav[aria-label='You are here']");
    const title = await box(page, "[data-look='plate'] h1");
    const line = await box(page, "[data-look='plate'] h1 + p");
    near(kicker.x, 100, "the kicker's left");
    near(kicker.y + kicker.height / 2, 137, "the kicker's middle");
    near(title.x, 100, "the title's left");
    near(title.y, 172, "the title's top");
    near(line.x, 100, "the line's left");
    near(line.y + 12.4, 316, "the line's first line's middle");
    const main = await box(page, "[data-look='plate'] a[href='/r/gov/dao']");
    near(main.x, 100, "the main action's left");
    near(main.height, 56, "the main action's height");
    await expect(page.locator("[data-look='plate'] section[aria-labelledby='proposals-title']")).toBeVisible();
    const card = await box(
      page,
      "[data-look='plate'] section[aria-labelledby='proposals-title'] [data-field='number']",
    );
    near(card.x - 17, 100, "the cards' left, the column's");
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
