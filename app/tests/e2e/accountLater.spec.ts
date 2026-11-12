import { connectButton } from "./account.ts";
import { word } from "./chat.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { opened } from "./scripted.ts";

// Code only an account uses (direct messages, notifications, what an account keeps) is not a visitor's first screen's
// (ADR-0001 §12; docs/decisions.md, 2026-10-27's rule): a script holding one of these words is an account's.
const ACCOUNT_ONLY = [
  "Not encrypted: the server can read these.",
  "Direct message with",
  "mentioned the room",
  // What an account keeps on its device: the room keeping's acts on a line.
  ".markUnread(",
  // The composer's side of a thread and of a reply: a visitor reads a thread, whose field is an account's.
  "Replying to an earlier message",
  // What the page's link sends for an account: its typing, a room's reading place, a correction of a line.
  "@+typing=",
  "MARKREAD ",
  "+gnoworld/edit=",
  // The country an account declares (7j): the tag it sends.
  "+gnoworld/country=",
  // What reads a line's Markdown for a mention of the room: a notice's, or a line shown, never an empty room's first screen.
  "@room(?!",
];

// The words of every script the page loads, the lines' view and the composer included, once the page is quiet.
function scriptWords(page: Page) {
  const bodies: Promise<string>[] = [];
  const pending = new Set<unknown>();
  page.on("request", (request) => {
    if (request.resourceType() === "script") pending.add(request);
  });
  const done = (request: unknown) => pending.delete(request);
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  page.on("response", (response) => {
    if (response.request().resourceType() === "script") bodies.push(response.text());
  });
  return async () => {
    await expect.poll(() => pending.size, "the scripts the page asks for come").toBe(0);
    return (await Promise.all(bodies)).join("\n");
  };
}

test.describe("what only an account uses, loaded for an account alone", () => {
  // The worker serves the build's scripts from its precache, past the page's events.
  test.use({ serviceWorkers: "block" });

  test("a visitor's world page loads none of it, and still reads and is told to log in", async ({ page }) => {
    const words = scriptWords(page);
    await page.routeWebSocket(/\/ws$/, () => undefined);
    await page.goto("/w/bubble?room=games&chat=full");
    await hydrated(page);
    await expect(page.getByRole("navigation", { name: "Rooms" })).toBeVisible();
    // A visitor writes as a guest; the way to an account stays beside the composer.
    await expect(connectButton(page)).toBeVisible();
    const loaded = await words();
    for (const mark of ACCOUNT_ONLY) expect(loaded.includes(mark), `a visitor's page loads ${mark}`).toBe(false);
  });

  test("a visitor's ?dm= says to log in, no room in its place", async ({ page }) => {
    await page.routeWebSocket(/\/ws$/, () => undefined);
    await page.goto("/w/bubble?dm=g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv&chat=full");
    await hydrated(page);
    await expect(page.getByRole("status").filter({ hasText: "Log in to read direct messages." })).toBeVisible();
    await expect(page.getByRole("form", { name: /Write in/ })).toHaveCount(0);
  });

  test("an account's page loads it, and shows its direct messages", async ({ page }) => {
    const words = scriptWords(page);
    const address = await logIn(page, word("acct"));
    await opened(page, address);
    await expect(page.getByRole("heading", { name: "Direct messages" })).toBeVisible();
    const loaded = await words();
    for (const mark of ACCOUNT_ONLY) expect(loaded.includes(mark), `an account's page loads ${mark}`).toBe(true);
  });
});
