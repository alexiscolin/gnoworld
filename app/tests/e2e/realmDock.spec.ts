import { chain } from "../chain/rpcRoute.ts";
import { expect, hydrated, test } from "./fixtures.ts";

// A realm page whose room cannot be made says so in its dock, with a way to try again: never an empty column. The chain reads its page,
// as no room is asked for a realm nothing proved.
test.describe("a realm page's dock when its room is not made", () => {
  test("says it, and asks the server again on Try again", async ({ page }) => {
    await chain(page, { "gno.land/r/demo/hostile": "# hostile" });
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
    const said = dock.getByRole("status").filter({ hasText: "The server is not answering." });
    await expect(said).toBeVisible();
    await dock.getByRole("button", { name: "Try again" }).click();
    await expect.poll(() => asks).toBe(2);
    await expect(said).toBeVisible();
  });
});
