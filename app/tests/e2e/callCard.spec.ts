import AxeBuilder from "@axe-core/playwright";
import { adena, changeAccount } from "./adena.ts";
import {
  callAndSign,
  calls,
  callWallet,
  connect,
  done,
  HASH,
  openRealm,
  REALM,
  setNetwork,
  writeChain,
  type Wallet,
} from "./callCard.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";

// 9d's journey: a realm's write function, the card under its row, the signature in a stand-in for Adena built from the
// recording, the hash followed to its block. Nothing shows as done before the chain's answer.
const card = (page: Page) => calls(page).getByRole("article");
const violations = async (page: Page) => (await new AxeBuilder({ page }).analyze()).violations;

interface World {
  landing?: "now" | "never" | "later";
  wallet?: Wallet;
  fees?: "rows" | "down";
}

async function setup(page: Page, { landing = "now", wallet = {}, fees = "rows" }: World = {}) {
  await adena(page);
  await callWallet(page, wallet);
  const chain = await writeChain(page, { landing, fees });
  await openRealm(page, () => connect(page));
  return chain;
}

test.describe("a write function's call card", () => {
  test("shows the preview before Adena opens, signs, lands in a block, and is done only from the chain's answer", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const chain = await setup(page, { landing: "later" });
    await calls(page).getByRole("button", { name: "Call SetBio" }).click();
    await expect(card(page)).toContainText("SIGNATURE REQUEST · ADENA");
    for (const word of ["REALM", "FUNCTION", "ARGUMENTS", "NETWORK", "FEE"])
      await expect(card(page)).toContainText(word);
    await expect(card(page)).toContainText(REALM);
    await expect(card(page)).toContainText("≈ 0.052 GNOT, an estimate from calls up to block 102");
    await expect(card(page)).toContainText("gnoworld does not check what this realm does");
    expect(await done(page)).toBe(0);
    await card(page).getByRole("textbox", { name: "bio" }).fill("hello gno");
    await expect(card(page)).toContainText(`This text goes to ${REALM} on gno.land, publicly and forever`);
    await card(page).getByRole("button", { name: "Sign in Adena" }).click();
    await expect(card(page)).toContainText(/landing in a block/i);
    await expect.poll(chain.txReads).toBeGreaterThan(1);
    await expect(card(page)).not.toContainText("Signed · tx");
    expect(await done(page)).toBe(1);
    chain.release();
    await expect(card(page)).toContainText(`Signed · tx ${HASH.slice(0, 4)}…${HASH.slice(-4)}`);
    await expect(card(page)).toContainText("55,414");
    await expect(card(page)).toContainText("(42 int)");
    const sent = await page.evaluate(() => JSON.stringify((Reflect.get(window, "__done") as unknown[])[0]));
    expect(sent).toContain('"func":"SetBio"');
    expect(sent).toContain('"args":["hello gno"]');
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("draws each label on its value's baseline, as the frame does (F5739)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setup(page);
    await calls(page).getByRole("button", { name: "Call SetBio" }).click();
    expect(
      await card(page)
        .locator("dl")
        .evaluate((el) => getComputedStyle(el).alignItems),
    ).toBe("baseline");
  });

  test("draws the note small and muted, as the frame does (F5740)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setup(page);
    await calls(page).getByRole("button", { name: "Call SetBio" }).click();
    const style = (text: string, property: string) =>
      card(page)
        .getByText(text)
        .first()
        .evaluate((el, name) => getComputedStyle(el).getPropertyValue(name), property);
    expect(await style("gnoworld does not check", "font-size")).toBe("12px");
    expect(await style("gnoworld does not check", "color")).toBe(await style("A call to", "color"));
  });

  test("says Adena sets the fee when the indexer cannot give one", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setup(page, { fees: "down" });
    await calls(page).getByRole("button", { name: "Call SetBio" }).click();
    await expect(card(page)).toContainText("Set by Adena when you sign");
    await expect(card(page)).not.toContainText("estimate");
  });

  test("puts a field's problem under it and signs nothing until it is fixed", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setup(page);
    await calls(page).getByRole("button", { name: "Call SetProfile" }).click();
    await card(page).getByRole("textbox", { name: "times" }).fill("three");
    await expect(card(page).getByRole("textbox", { name: "times" })).toHaveAttribute("aria-invalid", "true");
    await expect(card(page).getByRole("button", { name: "Sign in Adena" })).toBeDisabled();
    expect(await done(page)).toBe(0);
    await card(page).getByRole("textbox", { name: "times" }).fill("3");
    await expect(card(page).getByRole("button", { name: "Sign in Adena" })).toBeEnabled();
  });

  test("cancels before signing and asks Adena nothing", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setup(page);
    await calls(page).getByRole("button", { name: "Call SetBio" }).click();
    await card(page).getByRole("button", { name: "Cancel" }).click();
    await expect(card(page)).toHaveCount(0);
    expect(await done(page)).toBe(0);
  });

  test("a call on the wrong network that will not move is stopped before signing, with its next step", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setup(page, { wallet: { moves: false } });
    await setNetwork(page, "gnoland-1");
    await callAndSign(page);
    await expect(card(page).getByRole("status")).toContainText(/network/i);
    await expect(card(page).getByRole("button", { name: "Try again" })).toBeVisible();
    expect(await done(page)).toBe(0);
  });

  test("a signature declined in Adena is a state with its next step, and the card can try again", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setup(page, { wallet: { declines: true } });
    await callAndSign(page);
    await expect(card(page).getByRole("status")).toContainText(/declined/i);
    await card(page).getByRole("button", { name: "Try again" }).click();
    await expect(card(page).getByRole("button", { name: "Sign in Adena" })).toBeVisible();
  });

  test("a call that never lands is said unseen after a bound, with its hash", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setup(page, { landing: "never" });
    // The page's clock is driven: the bound is minutes, the journey is not.
    await page.clock.install();
    await callAndSign(page);
    await expect
      .poll(
        async () => {
          await page.clock.runFor(10_000);
          return (await card(page).textContent()) ?? "";
        },
        { timeout: 60_000, intervals: [50] },
      )
      .toContain(HASH);
    await expect(card(page)).toContainText(/not known whether it succeeded or failed/i);
    await expect(card(page)).not.toContainText("Signed · tx");
  });

  test("a person logged in by cookie whose Adena account changes after the card's first gesture is logged out (F5651)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setup(page, { landing: "later" });
    await callAndSign(page);
    await expect.poll(() => done(page)).toBe(1);
    await changeAccount(page, "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
    await expect(page.getByRole("button", { name: "Connect Adena" })).toBeVisible();
  });

  // A phone cannot log in (its pointer is coarse), but an account logged in writes there: the session of a computer's login is
  // handed to a browser of its own, a touch one.
  test("a phone reads and fills the card, and is told to use a computer to sign", async ({
    page,
    playwright,
    launchOptions,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setup(page);
    const session = await page.context().storageState();
    const touch = await playwright.chromium.launch(launchOptions);
    const phone = await (
      await touch.newContext({
        baseURL: new URL(page.url()).origin,
        storageState: session,
        hasTouch: true,
        viewport: { width: 390, height: 844 },
      })
    ).newPage();
    await adena(phone);
    await callWallet(phone);
    await writeChain(phone);
    await phone.goto(`/r/${REALM.slice("gno.land/r/".length)}`);
    await hydrated(phone);
    await calls(phone).getByRole("button", { name: "Call SetBio" }).tap();
    await expect(card(phone)).toContainText("To sign, use a computer");
    await expect(card(phone).getByRole("button", { name: "Sign in Adena" })).toBeHidden();
    expect(await done(phone)).toBe(0);
    await touch.close();
  });

  test("has no accessibility violation on a failure: the declined signature and its way back", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setup(page, { wallet: { declines: true } });
    await callAndSign(page);
    await expect(card(page).getByRole("button", { name: "Try again" })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  for (const [name, width, height] of [
    ["a phone", 390, 844],
    ["a computer", 1280, 900],
  ] as const) {
    test(`has no accessibility violation on ${name}: the preview, a problem and the result`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await setup(page);
      await calls(page).getByRole("button", { name: "Call SetProfile" }).click();
      expect(await violations(page)).toEqual([]);
      await card(page).getByRole("textbox", { name: "times" }).fill("three");
      expect(await violations(page)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (width < 600) return;
      await card(page).getByRole("textbox", { name: "times" }).fill("3");
      await card(page).getByRole("button", { name: "Sign in Adena" }).click();
      await expect(card(page)).toContainText("Signed · tx");
      expect(await violations(page)).toEqual([]);
    });
  }
});
