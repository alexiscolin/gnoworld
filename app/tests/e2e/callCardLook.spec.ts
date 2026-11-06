import { adena } from "./adena.ts";
import { callAndSign, calls, callWallet, connect, openRealm, signNow, writeChain } from "./callCard.ts";
import { expect, test, type Page } from "./fixtures.ts";

// The card's four states as they look, on a computer's screen (9d; frames 31 to 33 and 108 to 114): the preview, the wait for
// the signature, the landing in a block, the result. The pictures are made and approved on the Mac Studio (decision 4238523f):
// the header, which names the test wallet drawn at the server's start, is masked.
test.describe("the call card, as it looks", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("the preview, the wait, the landing and the result", async ({ page }: { page: Page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await adena(page);
    await callWallet(page, { hold: true });
    const chain = await writeChain(page, { landing: "later" });
    await openRealm(page, () => connect(page));
    const mask = [page.getByRole("banner")];
    const article = calls(page).getByRole("article");
    await calls(page).getByRole("button", { name: "Call SetBio" }).click();
    await article.getByRole("textbox", { name: "bio" }).fill("hello gno");
    await expect(article).toHaveScreenshot("call-card-preview.png", { mask });
    await article.getByRole("button", { name: "Sign in Adena" }).click();
    await expect(article).toContainText("Waiting for your signature in Adena…");
    await expect(article).toHaveScreenshot("call-card-waiting.png", { mask });
    await signNow(page);
    await expect(article).toContainText(/landing in a block/i);
    await expect(article).toHaveScreenshot("call-card-landing.png", { mask });
    chain.release();
    await expect(article).toContainText("Signed · tx");
    await expect(article).toHaveScreenshot("call-card-done.png", { mask });
  });

  test("a failure", async ({ page }: { page: Page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await adena(page);
    await callWallet(page, { declines: true });
    await writeChain(page);
    await openRealm(page, () => connect(page));
    const article = calls(page).getByRole("article");
    await callAndSign(page);
    await expect(article).toContainText(/declined/i);
    await expect(article).toHaveScreenshot("call-card-declined.png", { mask: [page.getByRole("banner")] });
  });
});
