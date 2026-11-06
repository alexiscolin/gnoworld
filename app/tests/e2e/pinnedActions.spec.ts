import { sound } from "./callCard.ts";
import { expect, test, type Page } from "./fixtures.ts";
import { openGovdao } from "./govdaoChain.ts";

// 9e-1 (Alexis, 2026-11-06): GovDAO's pinned "Vote" (hubs.json) on its page under Read the proposals and in the chat's quick actions
// beside Who's here, each once vm/qfuncs confirms it; its card names the realm and the function, every field empty and editable.
const opened = openGovdao;
const plate = (page: Page) => page.locator("[data-look='plate']");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Quick actions" });

for (const width of [390, 1280] as const) {
  test(`GovDAO's pinned Vote at ${String(width)} px: on the page under Read the proposals and beside Who's here, with no violation`, async ({
    page,
  }) => {
    await opened(page, width);
    const form = plate(page)
      .getByRole("figure")
      .filter({ has: page.getByRole("button", { name: "Vote" }) });
    await expect(form).toBeVisible();
    const read = await plate(page).getByRole("link", { name: "Read the proposals" }).boundingBox();
    const under = await form.boundingBox();
    expect(read !== null && under !== null && under.y >= read.y + read.height).toBe(true);
    // A step of 32 px (--space-l) after the actions' row, as f0030 leaves about 28 under Read the proposals (design review, 9e-1).
    const share = await plate(page)
      .getByRole("button", { name: "Share" })
      .or(plate(page).getByRole("link", { name: "Say hi in the chat" }))
      .last()
      .boundingBox();
    expect(share !== null && under !== null && Math.abs(under.y - (share.y + share.height) - 32) <= 1).toBe(true);
    await expect(bar(page).getByRole("button")).toHaveText(["Who's here", "Vote"]);

    await bar(page).getByRole("button", { name: "Vote" }).click();
    const card = page.getByRole("article").filter({ hasText: "MustVoteOnProposalSimple" });
    await expect(card).toContainText("gno.land/r/gov/dao");
    // D272: a GovDAO vote's card says, before Adena opens, that only its members can vote.
    await expect(card).toContainText(
      "Only GovDAO's members can vote: the chain refuses anyone else's vote, and its fee is lost.",
    );
    for (const name of ["pid", "option"]) {
      const box = card.getByRole("textbox", { name, exact: true });
      await expect(box).toHaveValue("");
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
  // The plate and the bar each read the functions: both answers, before any absence is asserted (the combined review of 9e-1).
  let answers = 0;
  page.on("response", (response) => {
    if (decodeURIComponent(response.url()).includes("vm/qfuncs")) answers += 1;
  });
  await opened(page, 1280, []);
  await expect.poll(() => answers).toBe(2);
  await expect(bar(page).getByRole("button", { name: "Who's here" })).toBeVisible();
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
  // What only the proposals' code draws, after the failed chunk: the pre-rendered page alone would pass the rest (F5933's journey
  // passed while the page fell a moment later, the combined review of 9e-1).
  await expect(plate(page).getByRole("heading", { name: "Proposals" })).toBeVisible();
  await expect(plate(page).getByRole("heading", { level: 1 })).toHaveText("GovDAO");
  await expect(plate(page).getByRole("link", { name: "Read the proposals" })).toBeVisible();
  await expect(bar(page).getByRole("button")).toHaveText(["Who's here"]);
  await expect(page.getByRole("button", { name: "Vote" })).toHaveCount(0);
});
