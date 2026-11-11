import { inGames, lineOf, word } from "./chat.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { answerSearchFrom } from "./searchServer.mjs";

// The chat's search (search.md part C): ⌘⇧F opens it, the words find a line through the real server's index, a result opens its room at the
// message with "Back to the latest" over it, and the way back leaves it. CROPS, when set, is a folder the states are photographed to.
const CROPS = process.env["SEARCH_CROPS"];
const field = (page: Page) => page.getByRole("searchbox", { name: /^Search messages in/ });
const panel = (page: Page) => page.getByRole("complementary", { name: "Search results" });
const say = async (page: Page, text: string) => {
  await page.getByRole("textbox", { name: "Message #games" }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(lineOf(page, text)).toBeVisible();
};
const shot = async (page: Page, name: string) => {
  if (CROPS !== undefined) await page.screenshot({ path: `${CROPS}/${name}.png` });
};

test("a found line opens its room at the message, and Back to the latest leaves it", async ({ page }) => {
  const me = await inGames(page);
  const index = await answerSearchFrom(page);
  const found = `quorum${word("q").replaceAll("-", "")}`;
  await say(page, `I think the ${found} stays where it is`);
  await say(page, "a later line that is no answer");
  const id = await lineOf(page, found).getAttribute("data-line");
  const line = (msgid: string, text: string, over: { ago?: number; room?: string } = {}) => {
    const { ago = 0, room = "#bubble/games" } = over;
    index.add({ room, account: me, msgid, text, time: new Date(Date.now() - ago).toISOString() });
  };
  // Other days and rooms, so the list shows what the canvas shows; only the last is a line Ergo holds.
  line("seed-c", `the ${found} check runs in r/gov/dao`, { ago: 6 * 24 * 3_600_000 });
  line("seed-b", `could we lower the ${found} for small treasury moves?`, {
    ago: 26 * 3_600_000,
    room: "#bubble/news",
  });
  line("seed-a", `prop 15 needs 66.66 %, we are at 33 %: the ${found} looks far`, { ago: 3_600_000, room: "#bubble" });
  line(id ?? "", `I think the ${found} stays where it is`);
  await page.keyboard.press("Control+Shift+F");
  await expect(field(page)).toBeFocused();
  await shot(page, "1-before");
  await field(page).fill(found);
  const hit = panel(page).getByRole("button", { name: /stays where it is/ });
  await expect(hit).toBeVisible();
  await shot(page, "2-results");
  // The arrow goes from the field to the newest result (the line sent last), and Enter opens it.
  await field(page).press("ArrowDown");
  await expect(hit).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/You are reading .*, around a found message\./)).toBeVisible();
  await expect(lineOf(page, found)).toBeVisible();
  await shot(page, "3-around");
  await page.getByRole("button", { name: /Back to the latest/ }).click();
  await expect(page.getByText(/You are reading/)).toBeHidden();
  await expect(lineOf(page, "a later line that is no answer")).toBeVisible();
  await field(page).fill(`nothing${word("n").replaceAll("-", "")}`);
  await expect(panel(page).getByText(/No message says/)).toBeVisible();
  await shot(page, "4-nothing");
});

test("a direct message is not searched", async ({ page }) => {
  await inGames(page);
  await page.goto("/w/bubble?dm=g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5&chat=full");
  await hydrated(page);
  await expect(page.getByRole("button", { name: "Search messages" }).first()).toBeVisible();
  await page.keyboard.press("Control+Shift+F");
  await expect(panel(page).getByText("This conversation is not searched")).toBeVisible();
  await shot(page, "5-dm");
  // Escape closes the panel and the focus goes to the button that opens it.
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "Search messages" }).first()).toBeFocused();
});

test("on a phone the search takes the screen, and a result gives it back at the message", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const me = await logIn(page, word("as"));
  await page.goto("/w/bubble?room=games&chat=full");
  await hydrated(page);
  const index = await answerSearchFrom(page);
  const found = `quorum${word("q").replaceAll("-", "")}`;
  await say(page, `I think the ${found} stays where it is`);
  const id = await lineOf(page, found).getAttribute("data-line");
  index.add({
    room: "#bubble/games",
    account: me,
    msgid: id ?? "",
    text: `I think the ${found} stays`,
    time: new Date().toISOString(),
  });
  await page.getByRole("button", { name: "Search messages" }).first().click();
  await field(page).fill(found);
  const hit = panel(page).getByRole("button", { name: /stays/ });
  await expect(hit).toBeVisible();
  await shot(page, "6-phone");
  await hit.click();
  await expect(page.getByText(/You are reading/)).toBeVisible();
  await expect(lineOf(page, found)).toBeVisible();
  await shot(page, "7-phone-around");
});

test("the palette's last row hands the words to the chat's search, which opens on them", async ({ page }) => {
  await inGames(page);
  await page.keyboard.press("Control+k");
  await page.getByRole("searchbox", { name: "Search places" }).fill("quorum");
  await page.getByRole("button", { name: /Search messages for “quorum” in the chat/ }).click();
  await expect(field(page)).toHaveValue("quorum");
  await expect(page).not.toHaveURL(/find=/);
});

// Opening the search changes nothing else's place: the header's buttons stay where they were, at every width the chat is full.
for (const width of [1280, 1600, 1920]) {
  test(`opening the search moves no button of the header at ${String(width)} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await inGames(page);
    const people = page.getByRole("button", { name: "Who's here" }).first();
    const before = await people.boundingBox();
    await shot(page, `8-still-${String(width)}-before`);
    await page.keyboard.press("Control+Shift+F");
    await expect(field(page)).toBeFocused();
    await shot(page, `8-still-${String(width)}-after`);
    expect(await people.boundingBox()).toEqual(before);
  });
}

test("the panel has one cross, Escape clears then closes, and a failed search offers a Try again as wide as its words", async ({
  page,
}) => {
  await inGames(page);
  await page.route("**/api/search?*", (route) =>
    route.fulfill({ status: 400, contentType: "application/json", body: "{}" }),
  );
  await page.keyboard.press("Control+Shift+F");
  await field(page).fill("quorum");
  const again = panel(page).getByRole("button", { name: "Try again" });
  await expect(panel(page).getByText("The search is out of reach.")).toBeVisible();
  const box = await again.boundingBox();
  expect(box?.width ?? Infinity).toBeLessThan(160);
  await shot(page, "9-error");
  // The browser's own cancel mark of a search field is left out (the crop shows the one cross).
  await shot(page, "10-one-cross");
  await field(page).press("Escape");
  await expect(field(page)).toHaveValue("");
  await expect(panel(page)).toBeVisible();
  await field(page).press("Escape");
  await expect(panel(page)).toBeHidden();
});
