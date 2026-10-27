import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { lines } from "./chat.ts";
import { MEMBER, scriptedErgo } from "./scripted.ts";

// How the room's pins and what an account keeps look (slice 4's 4d), on a computer's screen and a phone's: the page's
// socket answered by a scripted Ergo (scripted.ts) and the pins' answer fixed, so each picture is the same each run. The
// account's saved lines are on its device before the page loads; the header, which names the wallet, is masked.
const ACCOUNT = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const ROOM = "#bubble/games";
const pins = (may: boolean) => ({
  room: ROOM,
  may,
  pins: [
    { id: "a1", time: "2026-10-25T10:00:00.000Z", account: MEMBER, text: "Welcome to the games room." },
    { id: "old", time: "2026-10-20T08:00:00.000Z", account: MEMBER, text: "Be kind: **no spam**, no `secrets`." },
  ],
});
const saved = (room: string, id: string, text: string) => ({
  room,
  id,
  time: "2026-10-25T10:01:00.000Z",
  from: MEMBER,
  account: MEMBER,
  text,
});

// The room as a reader sees it, the pins answered as given; as an account, with these lines saved on its device.
async function look(
  page: Page,
  { width, may, kept }: { width: number; may: boolean; kept?: { account: string; saved: unknown[] } },
) {
  await page.setViewportSize({ width, height: 900 });
  await page.route("**/api/pins?room=*", (route) => route.fulfill({ json: pins(may) }));
  if (kept !== undefined) {
    await page.addInitScript(
      ([key, value]) => {
        localStorage.setItem(key ?? "", value ?? "");
      },
      [`gnoworld:saved:${kept.account}`, JSON.stringify(kept.saved)],
    );
  }
  await page.routeWebSocket(/\/ws$/, (ergo) => {
    scriptedErgo(ergo, kept === undefined ? "guest-zzzzzz" : ACCOUNT);
  });
  await page.goto("/w/bubble?room=games");
  await hydrated(page);
  await expect(lines(page)).toHaveCount(2);
}

test.describe("the pins and what an account keeps, as they look", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("the pin bar shut, a line pinned and a line saved, on a computer's screen", async ({ page }) => {
    const address = await logIn(page, "keep-look");
    await look(page, {
      width: 1280,
      may: true,
      kept: { account: address, saved: [saved(ROOM, "a2", "Who is up for a round")] },
    });
    await expect(page.getByRole("region", { name: "Pinned messages" })).toBeVisible();
    await expect(page).toHaveScreenshot("pins-shut-computer.png", { mask: [page.getByRole("banner")] });
  });

  test("the pin bar open, with each pin's Unpin for a moderator, on a computer's screen", async ({ page }) => {
    const address = await logIn(page, "keep-look");
    await look(page, { width: 1280, may: true, kept: { account: address, saved: [] } });
    await page.getByRole("button", { name: /Welcome to the games room/ }).click();
    await expect(page.getByRole("button", { name: /^Unpin/ })).toHaveCount(2);
    await expect(page).toHaveScreenshot("pins-open-computer.png", { mask: [page.getByRole("banner")] });
  });

  test("the pin bar open, to a guest, on a phone's screen", async ({ page }) => {
    await look(page, { width: 390, may: false });
    await page.getByRole("button", { name: /Welcome to the games room/ }).click();
    await expect(page.getByRole("region", { name: "Pinned messages" }).getByRole("listitem")).toHaveCount(2);
    await expect(page).toHaveScreenshot("pins-open-phone.png");
  });

  test("the saved messages' list, on a computer's screen", async ({ page }) => {
    const address = await logIn(page, "keep-look");
    await look(page, {
      width: 1280,
      may: false,
      kept: {
        account: address,
        saved: [
          saved(ROOM, "a2", "Who is up for a round of **gnogolf**?"),
          saved("#bubble", "b1", "Rules: https://gno.land/r/demo"),
        ],
      },
    });
    await page.getByRole("button", { name: "Saved" }).click();
    await expect(page.getByRole("dialog", { name: "Saved messages" })).toBeVisible();
    await expect(page).toHaveScreenshot("saved-computer.png", { mask: [page.getByRole("banner")] });
  });
});
