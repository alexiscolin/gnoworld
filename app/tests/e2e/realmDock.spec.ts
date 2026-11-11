import { indexer } from "../chain/indexerRoute.ts";
import { expect, hydrated, test } from "./fixtures.ts";

// A realm page whose room cannot be made says so in its dock, with a way to try again: never an empty column (slice 13).
test.describe("a realm page's dock when its room is not made", () => {
  test("says it, and asks the server again on Try again", async ({ page }) => {
    await indexer(page);
    let asks = 0;
    await page.route("**/api/rooms/realm", async (route) => {
      asks += 1;
      await route.fulfill({ status: 500, body: "{}" });
    });
    await page.route("**/api/rooms?*", (route) =>
      route.fulfill({ json: { world: "hostile", sections: [] }, headers: { "access-control-allow-origin": "*" } }),
    );
    await page.setViewportSize({ width: 1728, height: 1080 });
    await page.goto("/r/demo/hostile");
    await hydrated(page);
    const dock = page.locator("[data-dock]");
    await expect(dock.getByRole("alert")).toContainText("could not be opened");
    await dock.getByRole("button", { name: "Try again" }).click();
    await expect.poll(() => asks).toBe(2);
    await expect(dock.getByRole("alert")).toBeVisible();
  });
});
