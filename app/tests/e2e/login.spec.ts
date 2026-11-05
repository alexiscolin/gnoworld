import { adena, changeAccount } from "./adena.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";

// The login, end to end (slice 4's 4a): the page, a stand-in for Adena (adena.ts), the static host and the real
// server behind its /api.
const logInButton = (page: Page) => page.getByRole("button", { name: "Log in with Adena" });

test.describe("the login with Adena", () => {
  test("signs the server's text unchanged, and the server takes the proof: logged in, across a reload", async ({
    page,
  }) => {
    await adena(page);
    await page.goto("/");
    await hydrated(page);
    const challenge = page.waitForResponse((response) => response.url().endsWith("/api/login/challenge"));
    await logInButton(page).click();
    const { text } = (await (await challenge).json()) as { text: string };
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
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
    await logInButton(page).click();
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(logInButton(page)).toBeVisible();
    await page.reload();
    await hydrated(page);
    await expect(logInButton(page)).toBeVisible();
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
    await logInButton(page).click();
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    const logout = page.waitForRequest((request) => request.url().endsWith("/api/login/logout"));
    await changeAccount(page, "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
    await logout;
    await expect(logInButton(page)).toBeVisible();
  });

  for (const [mode, words] of [
    ["declines", "You declined in Adena."],
    ["locked", "Unlock Adena, then try again."],
  ] as const) {
    test(`says what to do when Adena ${mode}`, async ({ page }) => {
      await adena(page, mode);
      await page.goto("/");
      await hydrated(page);
      await logInButton(page).click();
      await expect(page.getByRole("status").filter({ hasText: words })).toBeVisible();
      await expect(logInButton(page)).toBeVisible();
    });
  }

  test("says to install Adena when the page has none", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);
    await logInButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: "Install Adena" })).toBeVisible();
  });
});

test.describe("on a phone", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("logs in on a computer only: no login button, and the words that say so", async ({ page }) => {
    await adena(page);
    await page.goto("/");
    await hydrated(page);
    await expect(page.getByText("To log in, use a computer; once logged in you can write from here.")).toBeVisible();
    await expect(logInButton(page)).toBeHidden();
  });
});

test.describe("Adena's code", () => {
  // Adena's calls (connect, sign) are the login's click's: a page that never logs in does not load them, and the click
  // asks for them (docs/decisions.md, 2026-10-28).
  const ADENA_CALLS = "SIGN_ARBITRARY";

  test("comes with the click that logs in, not with the page", async ({ page }) => {
    await adena(page);
    const bodies: Promise<string>[] = [];
    page.on("response", (response) => {
      if (response.request().resourceType() === "script") bodies.push(response.text());
    });
    await page.goto("/");
    await hydrated(page);
    await expect(logInButton(page)).toBeVisible();
    const before = (await Promise.all(bodies)).join("\n");
    expect(before.includes(ADENA_CALLS), "the page's scripts hold Adena's calls").toBe(false);
    await logInButton(page).click();
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    const after = (await Promise.all(bodies)).join("\n");
    expect(after.includes(ADENA_CALLS), "the click loaded Adena's calls").toBe(true);
  });
});
