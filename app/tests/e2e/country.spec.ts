import AxeBuilder from "@axe-core/playwright";
import { accountPill, connectButton, openSettings } from "./account.ts";
import { lineOf, lines, word } from "./chat.ts";
import { expect, test, type Page } from "./fixtures.ts";
import { opened } from "./scripted.ts";
import { asAccount, field, GUEST, HISTORY, OTHER, ROOM, tagged, twoInGames } from "./talk.ts";

// The country tag, from the person's choice in Settings (Privacy) to another reader's screen, never finer than a country. Most journeys run
// on a scripted Ergo, so the bytes the page sends are read; the last runs two accounts on the real one, which alone shows a client's tag
// crossing it and coming back from its history.
const TAG = "+gnoworld/country=JP";

async function say(page: Page, text: string) {
  await field(page).fill(text);
  await field(page).press("Enter");
}

// The country list of the Settings dialog.
const countryList = (dialog: ReturnType<Page["locator"]>) => dialog.getByRole("combobox", { name: "Your country" });

async function choose(page: Page, country: { label: string } | string) {
  const dialog = await openSettings(page);
  await countryList(dialog).selectOption(country);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
}

test.describe("the country tag", () => {
  test.use({ timezoneId: "Asia/Tokyo", locale: "en-GB" });

  test("rides on an account's lines by default, from its time zone, and stays after a reload", async ({ page }) => {
    const { said } = await asAccount(page);
    await say(page, "after");
    await expect.poll(() => said().at(-1)).toBe(`@${TAG} PRIVMSG ${ROOM} :after`);
    await expect(lineOf(page, "after").getByTitle("Japan")).toBeVisible();
    await page.reload();
    await expect(countryList(await openSettings(page))).toHaveValue("JP");
  });

  test("takes it back: the next line says nothing, and the choice stays after a reload", async ({ page }) => {
    const { said } = await asAccount(page);
    await choose(page, "");
    await say(page, "gone");
    await expect.poll(() => said().at(-1)).toBe(`PRIVMSG ${ROOM} :gone`);
    await page.reload();
    await expect(countryList(await openSettings(page))).toHaveValue("");
  });

  test("takes any country from the list, whatever the time zone says", async ({ page }) => {
    const { said } = await asAccount(page);
    await choose(page, { label: "France" });
    await say(page, "bonjour");
    await expect.poll(() => said().at(-1)).toBe(`@+gnoworld/country=FR PRIVMSG ${ROOM} :bonjour`);
  });

  test("carries none in a room not everyone may read", async ({ page }) => {
    await page.route("**/api/rooms*", async (route) => {
      const answer = await route.fetch();
      const body = JSON.stringify(await answer.json()).replaceAll('"type":"open"', '"type":"members"');
      await route.fulfill({ response: answer, body });
    });
    const { said } = await asAccount(page);
    await say(page, "between us");
    await expect.poll(() => said().at(-1)).toBe(`PRIVMSG ${ROOM} :between us`);
  });

  test("offers a visitor no choice: a guest speaks from nowhere", async ({ page }) => {
    await opened(page, GUEST, { history: HISTORY });
    await expect(lines(page)).toHaveCount(2);
    await expect(connectButton(page)).toBeVisible();
    await expect(accountPill(page)).toHaveCount(0);
    await expect(page.getByText("Your country")).toHaveCount(0);
  });

  test("shows what a line declares, and nothing for a line that declares none or what is no country", async ({
    page,
  }) => {
    await opened(page, GUEST, {
      history: HISTORY,
      replayed: [
        tagged("c1", "from Tokyo", { at: 2, tags: TAG, who: OTHER }),
        tagged("c2", "from nowhere", { at: 3, tags: "+gnoworld/country=FU", who: "ann" }),
        tagged("c3", "from markup", { at: 4, tags: "+gnoworld/country=<b>", who: "bo" }),
        tagged("c4", "from a server", { at: 5, tags: "country=JP", who: "cy" }),
        tagged("c5", "from no region", { at: 6, tags: "+gnoworld/country=ZZ", who: "dee" }),
        tagged("c6", "from a union", { at: 7, tags: "+gnoworld/country=EU", who: "eli" }),
      ],
    });
    await expect(lines(page)).toHaveCount(8);
    await expect(lineOf(page, "from Tokyo").getByTitle("Japan")).toHaveText("JPJapan");
    for (const text of [
      "the first line",
      "from nowhere",
      "from markup",
      "from a server",
      "from no region",
      "from a union",
    ])
      await expect(lineOf(page, text).locator("[data-line-country]")).toHaveCount(0);
  });

  for (const [screen, width, height] of [
    ["phone", 390, 844],
    ["computer", 1280, 900],
  ] as const) {
    test(`a line's code stands between the face and the name, as frame 60 draws it, on a ${screen}'s screen, with no violation`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await opened(page, GUEST, {
        history: HISTORY,
        replayed: [tagged("c1", "from Tokyo", { at: 2, tags: TAG, who: OTHER })],
      });
      await expect(lines(page)).toHaveCount(3);
      const head = lineOf(page, "from Tokyo").locator("[data-line-head]");
      const [face, code, name] = await Promise.all(
        ["[data-kind='person']", "[data-line-country]", "[title^='g1']"].map(async (found) => {
          const box = await head.locator(found).boundingBox();
          if (box === null) throw new Error(`${found} is not drawn`);
          return box;
        }),
      );
      if (face === undefined || code === undefined || name === undefined) throw new Error("three boxes");
      expect(code.x).toBeGreaterThanOrEqual(face.x + face.width);
      expect(name.x).toBeGreaterThanOrEqual(code.x + code.width);
      expect(Math.round(code.y - face.y)).toBe(4);
      expect(Math.round(code.width)).toBe(22);
      expect(Math.round(code.height)).toBe(15);
      expect((await new AxeBuilder({ page }).include("ol[aria-label='Messages']").analyze()).violations).toEqual([]);
      await expect(head).toHaveScreenshot(`country-line-${screen}.png`, { mask: [head.locator("time")] });
    });

    test(`the choice, on a ${screen}'s screen, with no violation`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await asAccount(page);
      const dialog = await openSettings(page);
      await expect(countryList(dialog)).toHaveValue("JP");
      expect((await new AxeBuilder({ page }).include("#settings-privacy").analyze()).violations).toEqual([]);
    });
  }
});

test.describe("the country tag, between two accounts on the real Ergo", () => {
  test.use({ timezoneId: "Asia/Tokyo", locale: "en-GB" });

  test("reaches another reader on a line and on a message of several, and comes back from the room's history", async ({
    page,
    playwright,
    launchOptions,
  }) => {
    const bob = await twoInGames(page, { playwright, launchOptions });

    const plain = word("plain");
    await choose(page, "");
    await say(page, plain);
    await expect(lineOf(bob.page, plain)).toHaveCount(1);
    await expect(lineOf(bob.page, plain).locator("[data-line-country]")).toHaveCount(0);

    await choose(page, "JP");
    // A line goes on the group of the same author's before it, which draws no head: the other account speaks between.
    await say(bob.page, word("between"));
    const one = word("tagged");
    await say(page, one);
    await expect(lineOf(bob.page, one).getByTitle("Japan")).toBeVisible();

    await say(bob.page, word("again"));
    const first = word("first");
    await say(page, `${first}\nsecond`);
    await expect(lineOf(bob.page, first).getByTitle("Japan")).toBeVisible();

    await bob.page.reload();
    await expect(lineOf(bob.page, one).getByTitle("Japan")).toBeVisible();
    await expect(lineOf(bob.page, first).getByTitle("Japan")).toBeVisible();
    await expect(lineOf(bob.page, plain).locator("[data-line-country]")).toHaveCount(0);
    await bob.close();
  });
});
