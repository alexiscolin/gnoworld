import { readFileSync } from "node:fs";
import type { WebSocketRoute } from "@playwright/test";
import { lines } from "./chat.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { scriptedErgo } from "./scripted.ts";
import { SITE } from "./sites.ts";
import { axeOf } from "./axe.ts";

// A page's preview (8f, slice 7's 7l): the capture the server's job wrote of a realm's home, on its world's plate (frame 26) and under a
// chat line that links that page (frames 104, 107), once the line is checked. The page asks the site's own previews.json and nothing the
// line names. GovDAO's capture is its page as RECORDED on onyx-1 (tests/chain/recorded), the first line the recording's own comment.
const HOME = readFileSync(new URL("../chain/recorded/onyx-1-gov-dao-home.md", import.meta.url), "utf8")
  .split("\n")
  .slice(1)
  .join("\n");
const FILE = {
  version: 1,
  universe: "onyx",
  updated: "2026-11-05T10:00:01.000Z",
  previews: [{ path: "gno.land/r/gov/dao", captured: "2026-11-05T10:00:00.000Z", text: HOME.slice(0, 4000) }],
};
const LINK = "https://onyx.testnets.gno.land/r/gov/dao";
const GUEST = "guest-zzzzzz";

// The captures' file as the deployment serves it once the job has run, or its 404 before (null).
async function served(page: Page, file: unknown = FILE): Promise<string[]> {
  const asked: string[] = [];
  await page.route("**/previews.json", (route) => {
    asked.push(route.request().url());
    return file === null ? route.fulfill({ status: 404 }) : route.fulfill({ json: file });
  });
  return asked;
}
const card = (page: Page) => page.locator("button[data-preview]");

test.describe("on a world's plate", () => {
  test("GovDAO's plate shows its page's capture, which opens large and closes back to the card", async ({ page }) => {
    await served(page);
    await page.goto("/w/govdao");
    await hydrated(page);
    const preview = card(page);
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("Preview");
    await expect(preview).toContainText("gno.land/r/gov/dao · captured");
    await expect(preview).toContainText("Open large");
    await preview.click();
    const dialog = page.getByRole("dialog", { name: "gno.land/r/gov/dao" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("GovDAO");
    await expect(dialog.getByRole("link", { name: "Open the page" })).toHaveAttribute("href", "/r/gov/dao");
    // The page's own heading at the plate's small scale (RealmBlocks.module.css's `.page h1`, 20 px), in the dialog and in the picture:
    // the plate's title rule (Panel.module.css) styles the plate's own title, never a page drawn on the plate.
    const size = (heading: ReturnType<Page["locator"]>) =>
      heading.evaluate((element) => getComputedStyle(element).fontSize);
    expect(await size(dialog.locator("h1"))).toBe("20px");
    expect(await size(page.locator("[data-preview-thumb] h1"))).toBe("20px");
    expect((await axeOf(page).include("dialog[open]").analyze()).violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(preview).toBeFocused();
  });

  test("a world with no capture shows no preview, and the page stands", async ({ page }) => {
    await served(page, null);
    const answered = page.waitForResponse((response) => response.url().endsWith("/previews.json"));
    await page.goto("/w/govdao");
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name: "GovDAO" })).toBeVisible();
    await answered;
    await expect(card(page)).toHaveCount(0);
  });

  test("a world with no realm asks for no capture", async ({ page }) => {
    const asked = await served(page);
    // The chat's stream opens after the plate's late parts (the chat waits for the door): its request is the sync point of the absence.
    const stream = page.waitForRequest((request) => request.url().includes("/api/stream"));
    await page.goto("/w/bubble");
    await hydrated(page);
    await stream;
    expect(asked).toEqual([]);
    await expect(card(page)).toHaveCount(0);
  });
});

test.describe("under a chat line", () => {
  const verdict = (msgid: string, state: "checked" | "hidden") =>
    `id: 1\nevent: verdict\ndata: ${JSON.stringify({ msgid, room: "#bubble/games", state })}\n\n`;

  async function room(page: Page, verdicts: () => string) {
    const away: string[] = [];
    const site = new URL(SITE).host;
    await page.route(
      (url) => url.host !== site,
      (route) => {
        away.push(route.request().url());
        return route.fulfill({ status: 404, body: "" });
      },
    );
    const since = `event: since\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`;
    await page.route("**/api/stream?**", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
        body: `retry: 100\n\n${verdicts()}${since}`,
      }),
    );
    let socket: WebSocketRoute | undefined;
    await page.routeWebSocket(/\/ws$/, (ergo) => {
      socket = ergo;
      scriptedErgo(ergo, GUEST, {
        history: [
          ["p1", "2026-11-05T15:32:00.000Z", `how the hub looked last week ${LINK}`],
          ["p2", "2026-11-05T15:33:00.000Z", "and https://evil.example/r/gov/dao"],
        ],
      });
    });
    await page.goto("/w/bubble?room=games&chat=full");
    await hydrated(page);
    await expect(lines(page)).toHaveCount(2);
    return { away, socket: () => socket };
  }

  test("a checked line's link to GovDAO's page shows its capture under the line, and nothing the line names is asked", async ({
    page,
  }) => {
    const asked = await served(page);
    const { away } = await room(page, () => verdict("p1", "checked") + verdict("p2", "checked"));
    const first = lines(page).nth(0);
    await expect(first.locator("button[data-preview]")).toContainText("gno.land/r/gov/dao · captured");
    await expect(lines(page).nth(1).locator("button[data-preview]")).toHaveCount(0);
    expect(asked.length).toBeGreaterThan(0);
    expect(away.filter((url) => url.includes("onyx.testnets.gno.land") || url.includes("evil.example"))).toEqual([]);
  });

  test("a line shows no preview until its check, then shows it; a hidden one never does", async ({ page }) => {
    await served(page);
    // The stream is asked again every 100 ms (its retry): what it answers changes as the test says, the line checked later.
    const said = { verdicts: verdict("p2", "hidden") };
    const streams: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/stream")) streams.push(request.url());
    });
    await room(page, () => said.verdicts);
    // The stream read again once the lines stand: its answers, the first line still unchecked, have reached the page.
    const before = streams.length;
    await expect.poll(() => streams.length).toBeGreaterThan(before + 1);
    await expect(card(page)).toHaveCount(0);
    said.verdicts = verdict("p1", "checked") + verdict("p2", "hidden");
    await expect(lines(page).nth(0).locator("button[data-preview]")).toBeVisible();
    said.verdicts = verdict("p1", "hidden") + verdict("p2", "hidden");
    await expect(card(page)).toHaveCount(0);
  });

  test("the capture opens large from the line, and keys in it move no line", async ({ page }) => {
    await served(page);
    await room(page, () => verdict("p1", "checked"));
    const preview = lines(page).nth(0).locator("button[data-preview]");
    await preview.click();
    const dialog = page.getByRole("dialog", { name: "gno.land/r/gov/dao" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(dialog).toBeVisible();
    // The focus stays in the dialog: the list's arrows did not take it to the next line.
    expect(await page.evaluate(() => document.activeElement?.closest("dialog[open]") !== null)).toBe(true);
    await expect(lines(page).nth(1)).not.toBeFocused();
    await page.keyboard.press("Escape");
    await expect(preview).toBeFocused();
  });
});
