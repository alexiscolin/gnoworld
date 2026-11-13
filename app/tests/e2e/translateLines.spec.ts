import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Route } from "@playwright/test";
import { lines } from "./chat.ts";
import { expect, test, type Page } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { opened, type HistoryLine } from "./scripted.ts";

// A room's lines translated as they come on screen, on a scripted Ergo, Jarvis's state and the stored translations stubbed: the lines on
// screen asked in one batch, each once; the original kept and its translation under it; folded from the More menu; nothing
// for a line already in English; one muted line in the room when the budget is spent; none asked when the switch is off.
const SHOTS = join(tmpdir(), "translate-shots");
const T = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, "0")}:00.000Z`;
const SHORT = "bonjour tout le monde";
const LONG =
  "Je viens de lire la nouvelle proposition de GovDAO et je pense qu'elle change beaucoup de choses pour les petits projets, surtout la partie sur les frais de stockage, qui me semble trop élevée pour ce que nous faisons ici tous les jours";
const RICH = "voici la liste: pomme, poire, **important** à lire";
const ENGLISH = "this one is English already";
const STORED: Record<string, object> = {
  s1: { status: "translated", text: "hello everyone", from: "fr" },
  s2: {
    status: "translated",
    text: "I just read the new GovDAO proposal and I think it changes a lot for small projects, especially the storage fee part, which seems too high for what we do here every day",
    from: "fr",
  },
  s3: { status: "translated", text: "here is the list:\n\n- apple\n- pear\n- **important** to read", from: "fr" },
  s4: { status: "original" },
};
interface Asked {
  room: string;
  language: string;
  ids: string[];
}
// The server's answer to a batch: the lines it stores, the rest of the ask left out.
const stored = ({ room, language, ids }: Asked) => ({
  room,
  language,
  translations: ids.flatMap((msgid) => (STORED[msgid] === undefined ? [] : [{ msgid, ...STORED[msgid] }])),
  pending: [],
});
const json =
  (body: unknown, status = 200) =>
  (route: Route) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

// The room as an account sees it: four lines of another's, one of its own, and the two routes; the batches the page asked, and any ask of
// the door's old route, one line a request.
async function room(page: Page, answer: (asked: Asked) => unknown = stored) {
  const address = await logIn(page, `tr${crypto.randomUUID().slice(0, 6)}`);
  await page.route("**/api/jarvis/state", json({ on: true }));
  const asked: Asked[] = [];
  const old: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/jarvis/translate") old.push(request.url());
  });
  await page.route(
    (url) => url.pathname === "/api/translations",
    async (route) => {
      const query = new URL(route.request().url()).searchParams;
      const one = {
        room: query.get("room") ?? "",
        language: query.get("language") ?? "",
        ids: (query.get("ids") ?? "").split(","),
      };
      asked.push(one);
      await json(answer(one))(route);
    },
  );
  const history: HistoryLine[] = [
    ["s1", T(0), SHORT],
    ["s2", T(1), LONG],
    ["s3", T(2), RICH],
    ["s4", T(3), ENGLISH],
    ["mine", T(4), "ma propre ligne", address],
  ];
  await opened(page, address, { history });
  await expect(lines(page)).toHaveCount(history.length);
  return { asked, old, history };
}
const blocks = (page: Page) => page.locator("[data-translation]");
// Another's lines, each asked once whatever the order: the observers that see them on screen call back in an order of their own.
const OTHERS = ["s1", "s2", "s3", "s4"];

for (const [name, size] of [
  ["1440", { width: 1440, height: 900 }],
  ["390", { width: 390, height: 1400 }],
] as const)
  test.describe(`translated lines at ${name}`, () => {
    test.use({ viewport: size });

    test("asks the lines on screen in one batch, each once, never the reader's own, and draws the original with its translation under it", async ({
      page,
    }) => {
      test.setTimeout(60_000);
      const { asked, old } = await room(page);
      await expect.poll(() => asked.length, { timeout: 30_000 }).toBe(1);
      expect(asked[0]?.room).toBe("#bubble/games");
      expect(asked[0]?.ids.toSorted()).toEqual(OTHERS);
      await expect(blocks(page)).toHaveCount(3);
      const first = lines(page).nth(0);
      await expect(first).toContainText(SHORT);
      await expect(first.locator("[data-translation]")).toContainText("Translated from French");
      await expect(first.locator("[data-translation]")).toContainText("hello everyone");
      await expect(lines(page).nth(3).locator("[data-translation]")).toHaveCount(0);
      await expect(lines(page).nth(4).locator("[data-translation]")).toHaveCount(0);
      await expect(lines(page).nth(2).locator("[data-translation] li")).toHaveCount(3);
      await expect(lines(page).nth(2).locator("[data-translation] strong")).toHaveText("important");
      await page.screenshot({ path: `${SHOTS}/lines-${name}.png` });
      await lines(page)
        .nth(1)
        .screenshot({ path: `${SHOTS}/long-${name}.png` });
      await lines(page)
        .nth(2)
        .screenshot({ path: `${SHOTS}/rich-${name}.png` });
      // Each line is asked once a visit: the translations are the server's, and a reload draws them again from one more batch.
      await page.waitForTimeout(3000);
      expect(asked).toHaveLength(1);
      await page.reload();
      await expect(blocks(page)).toHaveCount(3);
      await page.waitForTimeout(3000);
      expect(asked.map(({ ids }) => ids.toSorted())).toEqual([OTHERS, OTHERS]);
      expect(old).toEqual([]);
    });

    test("folds a translation from the More menu, the original never hidden", async ({ page }) => {
      test.setTimeout(60_000);
      await room(page);
      await expect(blocks(page)).toHaveCount(3, { timeout: 30_000 });
      const line = lines(page).nth(0);
      await line.hover();
      await line.getByRole("button", { name: "More actions" }).click();
      await page.getByRole("menuitem", { name: "Hide translation" }).click();
      await expect(line.locator("[data-translation]")).toHaveCount(0);
      await expect(line).toContainText(SHORT);
      await line.hover();
      await line.getByRole("button", { name: "More actions" }).click();
      await expect(page.getByRole("menuitem", { name: "Show translation" })).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/menu-${name}.png` });
    });
  });

test("stops asking when the day's budget is spent, with one muted line in the room", async ({ page }) => {
  test.setTimeout(30_000);
  const { asked } = await room(page, ({ room: id, language }) => ({
    room: id,
    language,
    translations: [],
    pending: [],
    halt: "spent",
  }));
  await expect(page.getByRole("status").filter({ hasText: "Translations are used up for today" })).toHaveCount(1);
  await page.waitForTimeout(3500);
  expect(asked).toHaveLength(1);
  await expect(blocks(page)).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/spent-1440.png` });
});

test("asks nothing once the switch is off", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("gnoworld:device:settings", JSON.stringify({ autoTranslate: false }));
  });
  const { asked } = await room(page);
  await page.waitForTimeout(3500);
  expect(asked).toHaveLength(0);
});
