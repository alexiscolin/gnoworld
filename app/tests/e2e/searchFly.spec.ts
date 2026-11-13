import { Worlds } from "@gnoworld/schemas/indexer";
import { inGames, lineOf, word } from "./chat.ts";
import { RECORDED_FILE } from "./deployed.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { answerSearchFrom } from "./searchServer.mjs";

// The palette to a place and to a realm, and from the palette to the chat's search: a world's preview and its three buttons, a room's,
// a command's (no Chat, no link), Discover's Fly there and Chat, a realm found by a function name typed whole, a missing worlds' file, the
// words handed to the chat's search, and `from:@me` with no words.
const control = (page: Page) => page.getByRole("button", { name: /^Search/ });
const field = (page: Page) => page.getByRole("combobox", { name: "Search places" });
const choices = (page: Page, name?: RegExp) =>
  page.getByRole("listbox", { name: "Places" }).getByRole("option", name === undefined ? {} : { name });
const preview = (page: Page) => page.getByRole("region", { name: "Preview" });
const panel = (page: Page) => page.getByRole("complementary", { name: "Search results" });
const chatField = (page: Page) => page.getByRole("searchbox", { name: /^Search messages in/ });

// The recorded worlds' file, one realm of it given the functions a realm's file lists.
const RECORDED = Worlds.parse(JSON.parse(RECORDED_FILE));
const REALM = "gnoland/boards2/v0";
const FILE = JSON.stringify({
  ...RECORDED,
  worlds: RECORDED.worlds.map((world) => ({
    ...world,
    realms: world.realms.map((realm) =>
      realm.path === `gno.land/r/${REALM}`
        ? { ...realm, functions: ["MustVoteOnProposal", "CreateBoard"], calls: 120, callers: 9 }
        : realm,
    ),
  })),
});

// A line said in #games and added to the search index the page is answered from.
async function sayIndexed(
  page: Page,
  index: Awaited<ReturnType<typeof answerSearchFrom>>,
  line: { found: string; text: string; account: string },
): Promise<void> {
  const { found, text, account } = line;
  await page.getByRole("textbox", { name: "Message #games" }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(lineOf(page, found)).toBeVisible();
  index.add({
    room: "#bubble/games",
    account,
    msgid: (await lineOf(page, found).getAttribute("data-line")) ?? "",
    text,
    time: new Date().toISOString(),
  });
}

async function worlds(page: Page, status = 200): Promise<void> {
  await page.route("**/worlds.json", (route) =>
    status === 200
      ? route.fulfill({ body: FILE, contentType: "application/json" })
      : route.fulfill({ status, body: "{}", contentType: "application/json" }),
  );
}

async function open(page: Page, path = "/earth"): Promise<void> {
  await page.goto(path);
  await hydrated(page);
  await control(page).click();
  await expect(field(page)).toBeFocused();
}

test.describe("the palette to a world", () => {
  test("previews the chosen world with its marks, then Go flies to it", async ({ page }) => {
    await open(page);
    await field(page).fill("bubb");
    await page.keyboard.press("ArrowDown");
    await expect(preview(page).getByRole("heading", { name: "Bubble" })).toBeVisible();
    await expect(preview(page)).toContainText("World");
    for (const name of ["Go", "Chat", "Copy link"])
      await expect(preview(page).getByRole("button", { name })).toBeVisible();
    await preview(page).getByRole("button", { name: "Go" }).click();
    await expect(page).toHaveURL(/\/w\/bubble$/);
    await expect(page.getByRole("dialog", { name: "Search" })).toBeHidden();
  });

  test("its Chat opens the world's chat, and Shift+Enter does the same", async ({ page }) => {
    await open(page);
    await field(page).fill("bubb");
    await page.keyboard.press("ArrowDown");
    await preview(page).getByRole("button", { name: "Chat" }).click();
    await expect(page).toHaveURL(/\/w\/bubble/);
    await control(page).click();
    await field(page).fill("bubb");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Shift+Enter");
    await expect(page).toHaveURL(/\/w\/bubble/);
    await expect(page.getByRole("dialog", { name: "Search" })).toBeHidden();
  });

  test("its Copy link says Copied and puts the world's address in the clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page);
    await field(page).fill("bubb");
    await page.keyboard.press("ArrowDown");
    await preview(page).getByRole("button", { name: "Copy link" }).click();
    await expect(preview(page).getByRole("button", { name: "Copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/w\/bubble$/);
    // A link copied leaves the palette open on the same place.
    await expect(field(page)).toHaveValue("bubb");
  });

  test("previews a room with its Open the room, and a command with no Chat and no link", async ({ page }) => {
    await open(page, "/w/bubble");
    await field(page).fill("#bubb");
    await choices(page, /#bubble · room/).hover();
    await expect(preview(page)).toContainText("Room");
    await expect(preview(page).getByRole("button", { name: "Open the room" })).toBeVisible();
    await field(page).fill("> earth");
    await page.keyboard.press("ArrowDown");
    await expect(preview(page)).toContainText("Command");
    await expect(preview(page).getByRole("button", { name: "Go" })).toBeVisible();
    await expect(preview(page).getByRole("button", { name: "Chat" })).toHaveCount(0);
    await expect(preview(page).getByRole("button", { name: "Copy link" })).toHaveCount(0);
  });

  test("says no place answers, and nothing opens on Go from the keys", async ({ page }) => {
    await open(page);
    await field(page).fill("zzzzqx");
    await expect(page.getByText(/no place answers/i)).toBeVisible();
    await expect(preview(page)).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/earth$/);
  });
});

test.describe("a realm", () => {
  test("is found by a function's name typed whole, shows the function, and Go opens its page", async ({ page }) => {
    await worlds(page);
    await open(page);
    // Discover's shelves need the file: the palette has read it once its realms are drawn.
    await expect(page.getByRole("listbox", { name: "Shelves" })).toBeVisible();
    await field(page).fill("mustvoteonproposal");
    const found = choices(page, new RegExp(REALM));
    await expect(found).toBeVisible();
    await expect(found).toContainText("MustVoteOnProposal");
    await field(page).fill("must vote on");
    await expect(found).toBeVisible();
    await field(page).fill("mustvoteonproposal");
    await page.keyboard.press("ArrowDown");
    await expect(preview(page).getByRole("heading", { name: REALM })).toBeVisible();
    await expect(preview(page)).toContainText("Realm");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/r/${REALM}$`));
  });

  test("is found by no function when the worlds' file did not come: its name alone", async ({ page }) => {
    await worlds(page, 500);
    await open(page);
    await field(page).fill("mustvoteonproposal");
    await expect(page.getByText(/no place answers/i)).toBeVisible();
    await field(page).fill("");
    await expect(page.getByRole("listbox", { name: "Shelves" })).toBeVisible();
  });

  test("chosen in Discover, shows its detail, and Fly there goes to its page; Chat opens its room", async ({
    page,
  }) => {
    await worlds(page);
    await open(page);
    const card = page.locator("[data-card]").first();
    await expect(card).toBeVisible();
    await card.click();
    const detail = page.getByRole("region", { name: "Realm detail" });
    await expect(detail).toBeVisible();
    for (const name of ["Fly there", "Chat"]) await expect(detail.getByRole("button", { name })).toBeVisible();
    await detail.getByRole("button", { name: "Close detail" }).click();
    await expect(detail).toBeHidden();
    await card.click();
    await detail.getByRole("button", { name: "Fly there" }).click();
    await expect(page.getByRole("dialog", { name: "Search" })).toBeHidden();
    await expect(page).not.toHaveURL(/\/earth$/);
  });
});

test.describe("from the palette to the chat's search", () => {
  test("hands the typed words over, a click opening the chat's search on them", async ({ page }) => {
    await inGames(page);
    const index = await answerSearchFrom(page);
    const found = `quorum${word("q").replaceAll("-", "")}`;
    const text = `I think the ${found} stays`;
    await sayIndexed(page, index, { found, text, account: "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5" });
    await page.keyboard.press("Control+k");
    await field(page).fill(found);
    const row = page.getByRole("button", { name: new RegExp(`Search messages for .${found}. in the chat`) });
    await expect(row).toBeVisible();
    // No option of the list: the arrows and Enter stay with the places.
    await expect(choices(page, /Search messages/)).toHaveCount(0);
    await row.click();
    await expect(page).toHaveURL(new RegExp(`find=${found}`));
    await expect(chatField(page)).toHaveValue(found);
    await expect(panel(page).getByRole("button", { name: /stays/ })).toBeVisible();
  });

  test("hands them over by ⌘⇧F, and for a mark, an address or one letter offers no hand-off", async ({ page }) => {
    await open(page);
    await field(page).fill("a");
    await expect(page.getByRole("button", { name: /Search messages for/ })).toHaveCount(0);
    for (const query of ["#bubble", "@gnoland", "/r/gnoland", "> earth"]) {
      await field(page).fill(query);
      await expect(page.getByRole("button", { name: /Search messages for/ })).toHaveCount(0);
    }
    await field(page).fill("treasury rules");
    await expect(page.getByRole("button", { name: /Search messages for/ })).toBeVisible();
    await page.keyboard.press("Control+Shift+F");
    await expect(page).toHaveURL(/find=treasury(%20|\+)rules/);
  });
});

test.describe("the chat's search by sender", () => {
  test("from:@me with no words lists the reader's lines; from: with no name is no filter; an unknown name finds nothing", async ({
    page,
  }) => {
    const me = await inGames(page);
    const index = await answerSearchFrom(page);
    const found = `sender${word("s").replaceAll("-", "")}`;
    const text = `the ${found} is mine`;
    await sayIndexed(page, index, { found, text, account: me });
    await page.keyboard.press("Control+Shift+F");
    await expect(chatField(page)).toBeFocused();
    // The chip starts the filter; no words are needed for the sender's lines.
    await panel(page).getByRole("button", { name: "from:@me" }).click();
    await expect(chatField(page)).toHaveValue("from:@me ");
    await expect(panel(page).getByRole("button", { name: /is mine/ })).toBeVisible();
    // A filter with no name is no filter: nothing is asked, the narrowing chips stand.
    await chatField(page).fill("from:");
    await expect(panel(page).getByText("Narrow it")).toBeVisible();
    await expect(panel(page).getByRole("button", { name: /is mine/ })).toHaveCount(0);
    // A name nobody here has is no wider search: nothing is asked either.
    await chatField(page).fill("from:@nobodyhere");
    await expect(panel(page).getByRole("button", { name: /is mine/ })).toHaveCount(0);
    // The reader's sender and words that no line of theirs holds say who and what.
    await chatField(page).fill("from:@me zzzzqx");
    await expect(panel(page).getByText(/No message says “zzzzqx” from you/)).toBeVisible();
    await panel(page).getByRole("button", { name: "Remove “from”" }).click();
    await expect(chatField(page)).toHaveValue("zzzzqx");
  });
});
