import { lines } from "./chat.ts";
import { expect, test, type Page } from "./fixtures.ts";
import { MEMBER } from "./scripted.ts";
import { asAccount } from "./talk.ts";

// A person's card, opened from their name on a line: Message and Follow for an account that is not the reader's, then what /api/people
// knows of them (balance and calls in the row, the calls and their last 30 days, system and tokens in their tabs), and each way that read fails.
const REALM = "gno.land/r/demo/boards";
const today = () => new Date().toISOString().slice(0, 10);
const DATA = {
  balance: { state: "ok", ugnot: "275250000" },
  system: { worlds: [{ world: "bubble", title: "Bubble", realm: REALM }], more: 2 },
  calls: { total: 1234, realms: 7, days: [{ day: today(), calls: 5 }] },
  latest: [
    { realm: REALM, func: "CreatePost", success: true, time: new Date().toISOString() },
    { realm: REALM, func: "Reply", success: false, time: null },
  ],
  tokens: [{ realm: "gno.land/r/demo/foo20", symbol: "FOO", decimals: 2, amount: "123456" }],
};

async function open(page: Page, answer: { status: number; body: unknown }) {
  await page.route("**/api/people/*", (route) =>
    route.fulfill({
      status: answer.status,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(answer.body),
    }),
  );
  await asAccount(page);
  await lines(page).first().locator("[data-author] > button").click();
  const card = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Close" }) });
  await expect(card).toBeVisible();
  return card;
}

test("a person's card shows their balance, system, tokens, calls and 30 days, with Message and Follow", async ({
  page,
}) => {
  const card = await open(page, { status: 200, body: DATA });
  await expect(card.getByRole("button", { name: "Message" })).toBeVisible();
  await expect(card).toContainText("275");
  await expect(card).toContainText("GNOT");
  await expect(card).toContainText("Calls, last 30 days");
  await expect(card).toContainText("1,234");
  await expect(card).toContainText("realms called");
  const chart = card.getByRole("table", { name: "Calls a day, last 30 days" });
  await expect(chart.locator("tbody tr")).toHaveCount(30);
  await expect(chart.locator("tbody tr").last().locator("td")).toHaveText("5");
  await expect(card).toContainText("Latest calls");
  await expect(card).toContainText("CreatePost");
  await expect(card.getByText("Failed", { exact: true })).toBeVisible();
  await card.getByRole("tab", { name: "Worlds" }).click();
  await expect(card).toContainText("Their system");
  await expect(card).toContainText("Bubble");
  await expect(card).toContainText("2 more");
  await card.getByRole("tab", { name: "Tokens" }).click();
  await expect(card).toContainText("Tokens held");
  await expect(card.getByText("FOO", { exact: true })).toBeVisible();
  await expect(card).toContainText("1,234.56");
});

test("Message opens the conversation with them", async ({ page }) => {
  const card = await open(page, { status: 200, body: DATA });
  await card.getByRole("button", { name: "Message" }).click();
  await expect(page).toHaveURL(new RegExp(MEMBER));
});

test("a card whose balance is unavailable says so and keeps the other blocks", async ({ page }) => {
  const card = await open(page, { status: 200, body: { ...DATA, balance: { state: "unavailable" } } });
  await expect(card).toContainText("Balance unavailable");
  await expect(card).toContainText("Latest calls");
});

test("a card with nothing to show says each section is empty and keeps its zeros", async ({ page }) => {
  const card = await open(page, {
    status: 200,
    body: { balance: { state: "none" }, system: { worlds: [], more: 0 }, calls: null, latest: [], tokens: [] },
  });
  await expect(card.getByRole("button", { name: "Message" })).toBeVisible();
  for (const line of ["No calls to worlds yet.", "No calls yet."]) await expect(card).toContainText(line);
  await card.getByRole("tab", { name: "Worlds" }).click();
  await expect(card).toContainText("No realms deployed yet.");
  await card.getByRole("tab", { name: "Tokens" }).click();
  await expect(card).toContainText("No tokens held.");
  await expect(card.locator("[data-value='0']")).toHaveCount(2);
  await expect(card).not.toContainText("GNOT");
});

for (const status of [404, 500])
  test(`a card whose read answers ${String(status)} keeps the face and the buttons, with one line to try again`, async ({
    page,
  }) => {
    const card = await open(page, { status, body: { error: "not_ready" } });
    await expect(card.getByRole("button", { name: /try again/i })).toBeVisible();
    await expect(card.getByRole("button", { name: "Message" })).toBeVisible();
    await expect(card).not.toContainText("Balance");
  });
