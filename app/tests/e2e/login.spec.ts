import { adena, changeAccount } from "./adena.ts";
import { logIn } from "./irc.ts";
import { expect, hydrated, test } from "./fixtures.ts";
import { accountPill, connectAdena, connectButton, logOutHere, phoneWith } from "./account.ts";

// The login, end to end: the page, a stand-in for Adena (adena.ts), the static host and the real
// server behind its /api.

test.describe("the login with Adena", () => {
  test("offers a Connect to nobody logged in on a computer, whose menu holds Adena and gnokey (D13881)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await adena(page);
    await page.goto("/");
    await hydrated(page);
    await expect(connectButton(page)).toHaveText("Connect");
    await connectButton(page).click();
    await expect(page.getByRole("menuitem")).toHaveText(["Adena", "gnokey"]);
    // The command line's way opens its own login, the device view #key-login.
    await page.getByRole("menuitem", { name: "gnokey" }).click();
    await expect(page.getByRole("dialog", { name: "Log in with gnokey" })).toBeVisible();
    await expect(page).toHaveURL(/#key-login$/);
  });

  test("signs the server's text unchanged, and the server takes the proof: logged in, across a reload", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await adena(page);
    await page.goto("/");
    await hydrated(page);
    const challenge = page.waitForResponse((response) => response.url().endsWith("/api/login/challenge"));
    await connectAdena(page);
    const { text } = (await (await challenge).json()) as { text: string };
    await expect(accountPill(page)).toBeVisible();
    const asked = await page.evaluate(() => (window as unknown as { __asked: { data: string }[] }).__asked);
    expect(asked.map((params) => params.data)).toEqual([text]);
    const { address } = (await (await page.request.get("/__wallet")).json()) as { address: string };
    await expect(page.getByTitle(address)).toBeVisible();
    await page.reload();
    await hydrated(page);
    await expect(page.getByTitle(address)).toBeVisible();
    expect(
      await page.evaluate(
        async () =>
          (
            await fetch("/api/login/ticket", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: "{}",
            })
          ).status,
      ),
    ).toBe(200);
  });

  test("logs out: the server ends the session, and a reload finds none", async ({ page }) => {
    await adena(page);
    await page.goto("/");
    await hydrated(page);
    await connectAdena(page);
    await logOutHere(page);
    await expect(connectButton(page)).toBeVisible();
    await page.reload();
    await hydrated(page);
    await expect(connectButton(page)).toBeVisible();
    expect(await page.evaluate(async () => (await fetch("/api/login/me")).json() as Promise<unknown>)).toEqual({
      address: null,
    });
  });

  test("ends the session when Adena's account changes: the page logs out and the server is told (D200)", async ({
    page,
  }) => {
    await adena(page);
    await page.goto("/");
    await hydrated(page);
    await connectAdena(page);
    await expect(accountPill(page)).toBeVisible();
    const logout = page.waitForRequest((request) => request.url().endsWith("/api/login/logout"));
    await changeAccount(page, "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
    await logout;
    await expect(connectButton(page)).toBeVisible();
  });

  for (const [mode, words, short] of [
    ["declines", "You declined in Adena.", "Declined · try again"],
    ["locked", "Unlock Adena, then try again.", "Unlock Adena"],
  ] as const) {
    test(`says what to do when Adena ${mode}`, async ({ page }) => {
      await adena(page, mode);
      await page.goto("/");
      await hydrated(page);
      await connectAdena(page);
      await expect(page.getByRole("status").filter({ hasText: words })).toBeVisible();
      // A stopped login says why in the button's own few words.
      await expect(page.getByRole("button", { name: short })).toBeVisible();
    });
  }

  test("says to install Adena when the page has none", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);
    await connectAdena(page);
    await expect(page.getByRole("status").filter({ hasText: "Install Adena" })).toBeVisible();
  });
});

test.describe("on a phone", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("logs in on a computer only: no login button, and the words that say so", async ({ page }) => {
    // No Adena found (a phone has none): the menu says so; where Adena is found its Connect is a row of the menu instead.
    await page.goto("/");
    await hydrated(page);
    // A phone's header keeps the account's way in its menu: the words stand there.
    await page.getByRole("button", { name: "Menu" }).tap();
    await expect(
      page.getByRole("menu").getByText("To log in, use a computer; once logged in you can write from here."),
    ).toBeVisible();
    await expect(connectButton(page)).toBeHidden();
  });
});

// A touch tablet keeps the words in the header from 900 px; under it the words move into the guest's menu (LoginView.module.css).
const USE_A_COMPUTER = "To log in, use a computer; once logged in you can write from here.";
for (const [width, here] of [
  [899, "the menu"],
  [900, "the header"],
] as const) {
  test.describe(`a touch screen ${String(width)} px wide`, () => {
    test.use({ hasTouch: true, viewport: { width, height: 844 } });

    test(`says to use a computer in ${here}`, async ({ page }) => {
      // A screen with no Adena is told to use a computer; where Adena is found the menu holds its Connect instead.
      if (width >= 900) await adena(page);
      await page.goto("/");
      await hydrated(page);
      const words = page.getByRole("banner").getByText(USE_A_COMPUTER);
      await expect(words).toHaveCount(1);
      if (width < 900) await expect(words).toBeHidden();
      else await expect(words).toBeVisible();
      await page.getByRole("button", { name: "Menu" }).tap();
      const note = page.getByRole("menu").getByText(USE_A_COMPUTER);
      if (width < 900) await expect(note).toBeVisible();
      else await expect(note).toHaveCount(0);
    });
  });
}

// Get started's steps read at the body size on a phone's width and the reading size from 900 px (GetStarted.module.css).
for (const [width, size] of [
  [390, "14px"],
  [900, "13px"],
] as const) {
  test(`draws Get started's steps in ${size} at ${String(width)} px`, async ({ page }) => {
    // Opened at a computer's width (a phone's header has no Connect where Adena is absent), then narrowed to the width read.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await hydrated(page);
    await connectAdena(page);
    await page.setViewportSize({ width, height: 800 });
    const steps = page.getByRole("dialog", { name: "Get started" }).getByRole("list").first();
    await expect(steps).toBeVisible();
    expect(await steps.evaluate((el) => getComputedStyle(el).fontSize)).toBe(size);
  });
}

// Where Adena is found a phone's menu holds Connect as a row: it stays a 44 px target.
test("draws the header's Connect Adena 44 px tall at 390 px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await adena(page);
  await page.goto("/");
  await hydrated(page);
  await page.getByRole("button", { name: "Menu" }).click();
  // Polled: the menu comes in scaled up from a little smaller (surface.module.css), and a slow machine measured 43.9 px mid-way.
  const row = page.getByRole("menuitem", { name: /^Connect Adena/ });
  await expect.poll(async () => (await row.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

// The way out is in the account's menu, which a phone given a computer's session must still reach.
test("logs out of a phone through the account's menu, the session handed from a computer", async ({
  page,
  playwright,
  launchOptions,
}) => {
  await logIn(page);
  const { phone, close } = await phoneWith(page, { playwright, launchOptions });
  await phone.goto("/");
  await hydrated(phone);
  await accountPill(phone).tap();
  await phone.getByRole("menuitem", { name: "Log out" }).tap();
  await expect(accountPill(phone)).toHaveCount(0);
  expect(await phone.evaluate(async () => (await fetch("/api/login/me")).json() as Promise<unknown>)).toEqual({
    address: null,
  });
  await close();
});

test.describe("Adena's code", () => {
  // Adena's calls (connect, sign) are the login's click's: a page that never logs in does not load them, and the click
  // asks for them.
  const ADENA_CALLS = "SIGN_ARBITRARY";

  test("comes with the click that logs in, not with the page", async ({ page }) => {
    await adena(page);
    const bodies: Promise<string>[] = [];
    page.on("response", (response) => {
      if (response.request().resourceType() === "script") bodies.push(response.text());
    });
    await page.goto("/");
    await hydrated(page);
    await expect(connectButton(page)).toBeVisible();
    const before = (await Promise.all(bodies)).join("\n");
    expect(before.includes(ADENA_CALLS), "the page's scripts hold Adena's calls").toBe(false);
    await connectAdena(page);
    await expect(accountPill(page)).toBeVisible();
    const after = (await Promise.all(bodies)).join("\n");
    expect(after.includes(ADENA_CALLS), "the click loaded Adena's calls").toBe(true);
  });
});
