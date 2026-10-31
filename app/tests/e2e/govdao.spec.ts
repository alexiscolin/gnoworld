import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { queryEnvelope, statusEnvelope } from "../chain/chainEnvelopes.ts";
import { box, near } from "./geometry.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";

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
      // The read's time is the run's clock, and its words' width moves the line: one time of the same shape, as shell.spec.ts does.
      await page.locator("section[aria-labelledby='proposals-title'] time").evaluateAll((times) => {
        for (const time of times) time.textContent = "2026-10-31 06:07 UTC";
      });
      await expect(page.locator("section[aria-labelledby='proposals-title']")).toHaveScreenshot(
        `govdao-${String(width)}.png`,
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
    const label = "[data-look='plate'] p.label:not([data-orientation])";
    const kicker = await box(page, label);
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

test("Bubble has no realm: no Read the proposals, no proposals", async ({ page }) => {
  await page.goto("/w/bubble");
  await hydrated(page);
  const plate = page.locator("[data-look='plate']");
  await expect(plate.getByRole("link", { name: "Read the proposals" })).toHaveCount(0);
  await expect(plate.getByRole("heading", { name: "Proposals" })).toHaveCount(0);
});
