import type { Page, Route } from "@playwright/test";
import { expect, hydrated, test } from "./fixtures.ts";

// A guest's first line from the welcome card to the server, /api/guest and /api/guest/say stubbed (the real ones need a moderation
// provider): the name asked as the box takes the focus, the line sent as typed, and what a refusal says in the field's own words.
const json =
  (body: unknown, status = 200) =>
  (route: Route) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const NAME = "brave-otter-abcd";
const box = (page: Page) => page.getByRole("textbox", { name: /^Message / });

/** Stubs the guest's name and say; the bodies the page said are returned as they come. */
async function guest(page: Page, say: (route: Route) => Promise<void> | void): Promise<unknown[]> {
  const said: unknown[] = [];
  await page.route("**/api/guest", json({ name: NAME }));
  await page.route("**/api/guest/say", async (route) => {
    said.push(route.request().postDataJSON());
    await say(route);
  });
  return said;
}

/** The welcome card's Say hi, then the guest's box. */
async function sayHi(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/earth");
  await hydrated(page);
  const card = page.getByRole("article", { name: "Every world here is a program on gno.land" });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByRole("button", { name: "Say hi" }).click();
  await expect(box(page)).toBeFocused({ timeout: 15_000 });
}

test.describe("a guest's first line", () => {
  test("is asked a name as the box takes the focus, and sends the line as typed", async ({ page }) => {
    const said = await guest(page, json({ ok: true }));
    await sayHi(page);
    await expect(page.getByText(`You speak as ${NAME}.`)).toBeVisible();
    await box(page).fill("hello from a guest");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(box(page)).toHaveValue("");
    expect(said).toEqual([{ room: "#earth", text: "hello from a guest" }]);
  });

  test("says the moderation check is down, and keeps the draft", async ({ page }) => {
    await guest(page, json({ error: "not_ready", cause: "unchecked" }, 503));
    await sayHi(page);
    await box(page).fill("anyone there");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(
      page.getByText("Guests cannot speak while the moderation check is down. Try again soon.").first(),
    ).toBeVisible();
    await expect(box(page)).toHaveValue("anyone there");
  });

  test("says to slow down when the guest is rate-limited", async ({ page }) => {
    await guest(page, json({ error: "too_many" }, 429));
    await sayHi(page);
    await box(page).fill("one more");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Slow down: a guest says a few lines a minute.").first()).toBeVisible();
    await expect(box(page)).toHaveValue("one more");
  });

  test("says guests cannot speak where the server gives no name", async ({ page }) => {
    await page.route("**/api/guest", json({ error: "not_found" }, 404));
    await sayHi(page);
    await expect(page.getByText("Guests cannot speak here.")).toBeVisible();
    await box(page).fill("hi");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Guests cannot speak on this server. Connect Adena to speak.").first()).toBeVisible();
  });
});
