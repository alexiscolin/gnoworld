// The account in the header, as the journeys reach it (frames 6 and 17): its one pill once logged in, the way out in its menu, and a
// phone given a computer's session, since a phone cannot log in.
import type { Locator, Page, PlaywrightWorkerArgs, PlaywrightWorkerOptions } from "@playwright/test";
import { expect, hydrated, test } from "./fixtures.ts";
import { ownContext } from "./deployed.ts";

/** The account's pill in the header once logged in (frame 17): its face and short address, opening the menu that holds the way out. */
export const accountPill = (page: Page) => page.getByRole("button", { name: /Your account/ });

/** The header's Connect button for a reader logged out, read in the banner. */
export const connectButton = (page: Page) =>
  page.getByRole("banner").getByRole("button", { name: "Connect", exact: true });

/** Starts Adena's login as a reader does (D13881): Connect, then Adena in its menu. */
export async function connectAdena(page: Page): Promise<void> {
  await connectButton(page).click();
  await page.getByRole("menuitem", { name: "Adena", exact: true }).click();
}

/** Logs in with the page's Adena at a computer's width, the page's size given back after: a phone's header keeps Connect in its menu
 * and a phone opens into a chat. */
export async function connectAtComputer(page: Page): Promise<void> {
  const size = page.viewportSize();
  const narrow = size !== null && size.width < 900;
  if (narrow) await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await hydrated(page);
  await connectAdena(page);
  await expect(accountPill(page)).toBeVisible();
  if (narrow) await page.setViewportSize(size);
}

/** Settings, opened from the account's menu (its pill, or the button given), and its dialog. */
export async function openSettings(page: Page, menu: Locator = accountPill(page)): Promise<Locator> {
  await menu.click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Logs out as a reader does: the account's pill, then Log out in its menu. */
export async function logOutHere(page: Page): Promise<void> {
  await accountPill(page).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
}

/** A phone's page, in a browser of its own, holding `page`'s session: a phone cannot log in (its pointer is coarse), so an account logged in
 * on a computer is handed to it (keep.spec.ts, login.spec.ts). `close` takes the browser away. */
export async function phoneWith(
  page: Page,
  {
    playwright,
    launchOptions,
  }: Pick<PlaywrightWorkerArgs, "playwright"> & Pick<PlaywrightWorkerOptions, "launchOptions">,
): Promise<{ phone: Page; close: () => Promise<void> }> {
  const { baseURL } = test.info().project.use;
  if (baseURL === undefined) throw new Error("no baseURL");
  const browser = await playwright.chromium.launch(launchOptions);
  const storageState = await page.context().storageState();
  const context = await ownContext(browser, {
    baseURL,
    storageState,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  return { phone: await context.newPage(), close: () => browser.close() };
}
