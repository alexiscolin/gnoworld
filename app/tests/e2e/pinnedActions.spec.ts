import type { Locator } from "@playwright/test";
import { sound } from "./callCard.ts";
import { expect, test, type Page } from "./fixtures.ts";
import { openGovdao } from "./govdaoChain.ts";

// 9e-1 (Alexis, 2026-11-06): GovDAO's pinned "Vote" (hubs.json) on its page under Read the proposals and in the chat's pinned row,
// each once vm/qfuncs confirms it; its card names the realm and the function, every field empty and editable.
const opened = openGovdao;
const plate = (page: Page) => page.locator("[data-look='plate']");
// The row over the composer holds a world's pinned pills alone: the room's quick actions are in the composer's + menu.
const bar = (page: Page) => page.getByRole("toolbar", { name: "Pinned actions" });

// Whether `lower` starts below where `upper` ends.
async function follows(upper: Locator, lower: Locator): Promise<boolean> {
  const [top, bottom] = [await upper.boundingBox(), await lower.boundingBox()];
  return top !== null && bottom !== null && bottom.y >= top.y + top.height;
}

for (const width of [390, 1280] as const) {
  test(`GovDAO's pinned Vote at ${String(width)} px: on the page under Read the proposals and in the pinned row over the composer, with no violation`, async ({
    page,
  }) => {
    await opened(page, width);
    const form = plate(page)
      .getByRole("figure")
      .filter({ has: page.getByRole("button", { name: "Vote" }) });
    await expect(form).toBeVisible();
    // The form comes after the actions' row and the figures, and before the Proposals card, which stays last among them.
    const above = plate(page).getByRole("link", { name: "Read the proposals" });
    const figures = plate(page).getByRole("region", { name: "Figures" });
    const proposals = plate(page).getByRole("heading", { name: "Proposals", exact: true });
    expect(await follows(above, form), "the form under the actions' row").toBe(true);
    expect(await follows(figures, form), "the form under the figures").toBe(true);
    expect(await follows(form, proposals), "the Proposals card under the form").toBe(true);
    await expect(bar(page).getByRole("button")).toHaveText(["Vote"]);

    await bar(page).getByRole("button", { name: "Vote" }).click();
    const card = page.getByRole("article").filter({ hasText: "MustVoteOnProposalSimple" });
    await expect(card).toContainText("gno.land/r/gov/dao");
    // D272: a GovDAO vote's card says, before Adena opens, that only its members can vote.
    await expect(card).toContainText(
      "Only GovDAO's members can vote: the chain refuses anyone else's vote, and its fee is lost.",
    );
    for (const name of ["pid", "option"]) {
      const box = card.getByRole("textbox", { name, exact: true });
      await expect(box).toHaveText("");
      await expect(box).toBeEditable();
    }
    // The card opens over the bar inside the dock: the bar stays on the screen, the card scrolls in its own box (design review, 9e-1).
    const row = await bar(page).boundingBox();
    expect(row !== null && row.y + row.height <= (page.viewportSize()?.height ?? 0)).toBe(true);
    await card.getByRole("button", { name: "Sign in Adena" }).scrollIntoViewIfNeeded();
    await expect(card.getByRole("button", { name: "Sign in Adena" })).toBeInViewport();
    // Its title is the action's name, as the video's card is named ("Boop the pot", f0110); the function keeps its row.
    await expect(card.getByRole("heading", { name: "Vote" })).toBeVisible();
    await sound(page);
  });
}

test("GovDAO shows no pinned Vote anywhere when vm/qfuncs does not list its function", async ({ page }) => {
  // The plate and the bar read the functions: the answer, before any absence is asserted (the combined review of 9e-1).
  let answers = 0;
  page.on("response", (response) => {
    if (decodeURIComponent(response.url()).includes("vm/qfuncs")) answers += 1;
  });
  await opened(page, 1280, []);
  // One read for both: the plate and the bar share the realm's functions' query.
  await expect.poll(() => answers).toBe(1);
  await expect(page.getByRole("textbox", { name: "Message #govdao" })).toBeVisible();
  await expect(plate(page).getByRole("link", { name: "Read the proposals" })).toBeVisible();
  // The answer parsed and drawn: a task after the response, as callFixtures' after() waits in the unit tests.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  await expect(page.getByRole("button", { name: "Vote" })).toHaveCount(0);
  await expect(page.getByRole("figure")).toHaveCount(0);
});

// F1763: a chunk that cannot be fetched leaves its own place alone, never the page: the plate and the chat's bar stand.
test("GovDAO keeps its plate and its chat's bar when the pinned actions' code cannot be fetched", async ({ page }) => {
  // A route on the page does not see this chunk's request here; one on the context does.
  await page.context().route(/\/assets\/Pinned-[\w-]+\.js$/, (route) => route.abort());
  const failed = page.waitForEvent("requestfailed", (request) => request.url().includes("/assets/Pinned"));
  await opened(page, 1280);
  await failed;
  // What only the proposals' code draws, after the failed chunk: a proposal read from the chain. The pre-rendered page holds the rest,
  // its "Proposals" heading too, so a journey waiting on those passed while the page fell (F5941, refuted by the verifier).
  await expect(
    plate(page)
      .getByRole("link", { name: /Set validator gno-core-validator-1 to voting power 60/ })
      .first(),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "This world could not load" })).toHaveCount(0);
  await expect(plate(page).getByRole("heading", { level: 1 })).toHaveText("GovDAO");
  await expect(plate(page).getByRole("link", { name: "Read the proposals" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message #govdao" })).toBeVisible();
  await expect(bar(page).getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Vote" })).toHaveCount(0);
});

// Alexis, D273 (answer 9e-3, F5950): GovDAO's action row holds Read the proposals and Share on one line in its column, as frame 30.
test("GovDAO's action row is Read the proposals then Share, on one line, at the video's size", async ({ page }) => {
  await opened(page, 1728);
  const row = plate(page).getByRole("link", { name: "Read the proposals" });
  const share = plate(page).getByRole("button", { name: "Share" });
  await expect(share).toBeVisible();
  await expect(plate(page).getByRole("link", { name: "Say hi in the chat" })).toHaveCount(0);
  const [a, b] = [await row.boundingBox(), await share.boundingBox()];
  expect(a !== null && b !== null && Math.abs(a.y - b.y) <= 1 && b.x > a.x).toBe(true);
});
