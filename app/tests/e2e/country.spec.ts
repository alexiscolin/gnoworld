import AxeBuilder from "@axe-core/playwright";
import { closeMenu, lineOf, lines, menu, word } from "./chat.ts";
import { expect, test, type Page } from "./fixtures.ts";
import { opened } from "./scripted.ts";
import { asAccount, field, GUEST, HISTORY, ROOM, tagged, twoInGames } from "./talk.ts";

// 7j: the country tag, from the person's choice to another reader's screen (ADR-0001 §7): declared, never detected; off until chosen; the
// time zone only suggests; never finer than a country. Most journeys run on a scripted Ergo, so the bytes the page sends are read; the last
// runs two accounts on the real one, which alone says that a client's tag crosses it, and comes back from its history.
const TAG = "+gnoworld/country=JP";

async function say(page: Page, text: string) {
  await field(page).fill(text);
  await field(page).press("Enter");
}

// Asks for the choice, and takes what the time zone suggests.
async function takeSuggestion(page: Page) {
  const panel = await menu(page);
  await panel.getByRole("button", { name: "Choose a country" }).click();
  await panel.getByRole("button", { name: "Use Japan" }).click();
  await expect(panel.getByRole("combobox", { name: "Your country" })).toHaveValue("JP");
  await closeMenu(page);
}

test.describe("the country tag", () => {
  test.use({ timezoneId: "Asia/Tokyo", locale: "en-GB" });

  test("sends none while the time zone only suggests: asked, and not confirmed, nothing changes", async ({ page }) => {
    const { said } = await asAccount(page);
    await say(page, "before");
    await expect.poll(() => said()).toEqual([`PRIVMSG ${ROOM} :before`]);
    const panel = await menu(page);
    await panel.getByRole("button", { name: "Choose a country" }).click();
    await expect(panel.getByRole("button", { name: "Use Japan" })).toBeVisible();
    await closeMenu(page);
    await say(page, "still nothing");
    await expect.poll(() => said().at(-1)).toBe(`PRIVMSG ${ROOM} :still nothing`);
  });

  test("rides on a person's lines once they confirm, and stays after a reload", async ({ page }) => {
    const { said } = await asAccount(page);
    await takeSuggestion(page);
    await say(page, "after");
    await expect.poll(() => said().at(-1)).toBe(`@${TAG} PRIVMSG ${ROOM} :after`);
    await expect(lineOf(page, "after").getByTitle("Japan")).toBeVisible();

    await page.reload();
    await expect((await menu(page)).getByRole("combobox", { name: "Your country" })).toHaveValue("JP");
  });

  test("takes it back: the next line says nothing", async ({ page }) => {
    const { said } = await asAccount(page);
    await takeSuggestion(page);
    await (await menu(page)).getByRole("combobox", { name: "Your country" }).selectOption("");
    await closeMenu(page);
    await say(page, "gone");
    await expect.poll(() => said().at(-1)).toBe(`PRIVMSG ${ROOM} :gone`);
  });

  test("takes any country from the list, whatever the time zone says", async ({ page }) => {
    const { said } = await asAccount(page);
    const panel = await menu(page);
    await panel.getByRole("button", { name: "Choose a country" }).click();
    await panel.getByRole("combobox", { name: "Your country" }).selectOption({ label: "France" });
    await closeMenu(page);
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
    await takeSuggestion(page);
    await say(page, "between us");
    await expect.poll(() => said().at(-1)).toBe(`PRIVMSG ${ROOM} :between us`);
  });

  test("offers a visitor no choice: a guest speaks from nowhere", async ({ page }) => {
    await opened(page, GUEST, { history: HISTORY });
    await expect(lines(page)).toHaveCount(2);
    await expect((await menu(page)).getByText("Your country")).toHaveCount(0);
  });

  test("shows what a line declares, and nothing for a line that declares none or what is no country", async ({
    page,
  }) => {
    await opened(page, GUEST, {
      history: HISTORY,
      replayed: [
        tagged("c1", "from Tokyo", { at: 2, tags: TAG }),
        tagged("c2", "from nowhere", { at: 3, tags: "+gnoworld/country=FU" }),
        tagged("c3", "from markup", { at: 4, tags: "+gnoworld/country=<b>" }),
        tagged("c4", "from a server", { at: 5, tags: "country=JP" }),
        tagged("c5", "from no region", { at: 6, tags: "+gnoworld/country=ZZ" }),
        tagged("c6", "from a union", { at: 7, tags: "+gnoworld/country=EU" }),
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
      await opened(page, GUEST, { history: HISTORY, replayed: [tagged("c1", "from Tokyo", { at: 2, tags: TAG })] });
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
      const panel = await menu(page);
      await panel.getByRole("button", { name: "Choose a country" }).click();
      await expect(panel.getByRole("button", { name: "Use Japan" })).toBeVisible();
      expect((await new AxeBuilder({ page }).include("dialog[open]").analyze()).violations).toEqual([]);
      await expect(panel).toHaveScreenshot(`country-choice-${screen}.png`);
      await panel.getByRole("button", { name: "Use Japan" }).click();
      await expect(panel.getByRole("combobox", { name: "Your country" })).toHaveValue("JP");
      expect((await new AxeBuilder({ page }).include("dialog[open]").analyze()).violations).toEqual([]);
      await expect(panel).toHaveScreenshot(`country-chosen-${screen}.png`);
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
    await say(page, plain);
    await expect(lineOf(bob.page, plain)).toHaveCount(1);
    await expect(lineOf(bob.page, plain).locator("[data-line-country]")).toHaveCount(0);

    await takeSuggestion(page);
    const one = word("tagged");
    await say(page, one);
    await expect(lineOf(bob.page, one).getByTitle("Japan")).toBeVisible();

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
