import { expect, hydrated, test } from "./fixtures.ts";
import { connectAdena } from "./account.ts";

// A Connect with no Adena opens the steps; Adena's coming, seen without a reload, shows Connect; a guest closes it.
const SHOTS = process.env["GET_STARTED_SHOTS"];
const sizes = { computer: { width: 1280, height: 900 }, phone: { width: 390, height: 800 } };

for (const [name, size] of Object.entries(sizes)) {
  test(`opens the steps with no Adena and shows Connect once it comes (${name})`, async ({ page }) => {
    // Opened at a computer's width, then narrowed to the width read: under 900 px the header has no Connect, and a guest's menu offers
    // Adena only where it is found (LoginView.module.css). Connect's menu (D13881): Adena's row opens the steps where there is no Adena.
    await page.setViewportSize(sizes.computer);
    await page.goto("/");
    await hydrated(page);
    await connectAdena(page);
    await page.setViewportSize(size);
    const dialog = page.getByRole("dialog", { name: "Get started" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Connect", exact: true })).toHaveCount(0);
    if (SHOTS !== undefined) await page.screenshot({ path: `${SHOTS}/${name}-1-no-adena.png` });
    await dialog.getByText("Further, if you want").click();
    await page.waitForTimeout(500);
    if (SHOTS !== undefined) await page.screenshot({ path: `${SHOTS}/${name}-2-further.png` });
    await page.evaluate(() => {
      Object.assign(window, { adena: { AddEstablish: () => Promise.resolve({}) } });
      window.dispatchEvent(new Event("focus"));
    });
    await expect(dialog.getByRole("button", { name: "Connect", exact: true })).toBeVisible();
    if (SHOTS !== undefined) await page.screenshot({ path: `${SHOTS}/${name}-3-adena-here.png` });
    await dialog.getByRole("button", { name: "Continue as a guest" }).click();
    await expect(dialog).toBeHidden();
  });
}
