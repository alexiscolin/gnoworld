import { adena } from "./adena.ts";
import { calls, callWallet, connect, openRealm, openRow, writeChain } from "./callCard.ts";
import { expect, test, type Page } from "./fixtures.ts";

// A page's form with a Call, and a write row that sends to gnoweb, as they look on a computer's screen (9e; frames 31 to 33): the
// form's frame, its Call at the end of the line, its card after the frame with the hidden field as a field, and the row with no Call.
// The pictures are made and approved on the Mac Studio (decision 4238523f): the header, which names the test wallet, is masked.
test.describe("a page's form and a gnoweb row, as they look", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("the form, its card and the row with no Call", async ({ page }: { page: Page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await adena(page);
    await callWallet(page);
    await writeChain(page);
    await openRealm(page, () => connect(page));
    const mask = [page.getByRole("banner")];
    const form = page.getByRole("figure");
    await expect(form).toHaveScreenshot("form-call.png", { mask });
    await openRow(page, "Upload");
    await expect(calls(page).getByRole("listitem").filter({ hasText: "Upload" })).toHaveScreenshot("row-gnoweb.png", {
      mask,
    });
    await form.getByRole("button", { name: "Call SetProfile" }).click();
    // The call card opens whole inside the page card's window: the realm's page is an article too, and holds it.
    await expect(page.getByText(/Stamped/)).toBeHidden({ timeout: 15_000 });
    await expect(page.getByRole("article").filter({ hasText: "Signature request" }).last()).toHaveScreenshot(
      "form-card.png",
      {
        mask,
      },
    );
  });
});
