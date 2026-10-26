import AxeBuilder from "@axe-core/playwright";
import { inGames, lines, whoIsHere, word } from "./chat.ts";
import type { PlaywrightWorkerArgs, PlaywrightWorkerOptions } from "@playwright/test";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { logIn, login, talk, ticketOf, type Step } from "./irc.ts";

// 4e (docs/plans/slice-4.md §1, §7): direct messages between accounts, through the real Ergo. The page's account
// reads and writes them; another account, logged in by a page of a context of its own (a session of its own),
// writes over a raw socket: its login, then its message.
const NOT_ENCRYPTED = "Not encrypted: the server can read these.";
const dmsNav = (page: Page) => page.getByRole("navigation", { name: "Rooms" });

// Another account, in a browser of its own (the sandbox's Chromium runs one process, one context): its address, and
// its page to talk from.
type Launcher = Pick<PlaywrightWorkerArgs, "playwright"> & Pick<PlaywrightWorkerOptions, "launchOptions">;
async function another({ playwright, launchOptions }: Launcher, as: string) {
  const { baseURL } = test.info().project.use;
  if (baseURL === undefined) throw new Error("no baseURL");
  const browser = await playwright.chromium.launch(launchOptions);
  const second = await (await browser.newContext({ baseURL })).newPage();
  return { address: await logIn(second, as), page: second, close: () => browser.close() };
}

// A direct message from that account, over its own socket with a ticket of its own (one a connection), once it is
// registered; every line Ergo answered.
async function dmFrom(sender: { address: string; page: Page }, to: string, text: string): Promise<string[]> {
  const steps: Step[] = [
    ...login(sender.address, await ticketOf(sender.page)),
    ["\\s903\\s", `NICK ${sender.address}`],
    ["\\s903\\s", "USER u 0 * :u"],
    ["\\s903\\s", "CAP END"],
    ["\\s001\\s", `PRIVMSG ${to} :${text}`],
    ["\\s001\\s", "PING :sent"],
  ];
  return talk(sender.page, steps, "PONG.*sent");
}
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-5)}`;

test.describe("direct messages", () => {
  test("show an account's message to the page's account under Direct messages, its page saying it is not encrypted", async ({
    page,
    playwright,
    launchOptions,
  }) => {
    const me = await inGames(page);
    const bob = await another({ playwright, launchOptions }, word("bob"));
    const text = word("hello");
    await dmFrom(bob, me, text);
    const link = dmsNav(page).getByRole("link", { name: short(bob.address) });
    await expect(link).toBeVisible();
    // U6: the row says it is not encrypted; U7: the page says it is a direct message, the address whole in its title.
    await expect(link).toHaveAccessibleName(`${short(bob.address)} Not encrypted`);
    await link.click();
    const heading = page.getByRole("heading", { name: `Direct message with ${short(bob.address)}` });
    await expect(heading).toBeVisible();
    await expect(heading.getByTitle(bob.address)).toHaveText(short(bob.address));
    await expect(page.getByRole("form", { name: `Write to ${short(bob.address)}` })).toHaveAccessibleDescription(
      `${NOT_ENCRYPTED} Kept only while this page is open.`,
    );
    await expect(page.getByText(NOT_ENCRYPTED)).toBeVisible();
    // Decision C (U2): Ergo keeps no direct message; the page says so beside "Not encrypted".
    await expect(page.getByText("Kept only while this page is open.")).toBeVisible();
    await expect(lines(page).filter({ hasText: text })).toHaveCount(1);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await bob.close();
  });

  test("open from who is here, write, and see the line as Ergo echoes it", async ({
    page,
    playwright,
    launchOptions,
  }) => {
    const me = await inGames(page);
    const bob = await another({ playwright, launchOptions }, word("bob"));
    // Bob in the room, so who is here lists him: his own page joins #games.
    await bob.page.goto("/w/bubble?room=games");
    await expect(whoIsHere(page).getByTitle(bob.address)).toBeVisible();
    await whoIsHere(page)
      .getByRole("button", { name: `Message ${short(bob.address)}` })
      .click();
    await expect(page.getByText(NOT_ENCRYPTED)).toBeVisible();
    const field = page.getByRole("textbox", { name: `Message ${short(bob.address)}` });
    // U12: the button goes with who is here; the field takes the focus, not the page.
    await expect(field).toBeFocused();
    const text = word("reply");
    await field.fill(text);
    await field.press("Enter");
    await expect(lines(page).filter({ hasText: text })).toHaveCount(1);
    await expect(page).toHaveURL(new RegExp(`dm=${bob.address}`));
    // Mine, and delivered: Bob's page lists the conversation with me (T10: the journey compared two setup values).
    await expect(lines(page).filter({ hasText: text }).getByTitle(me)).toBeVisible();
    await expect(dmsNav(bob.page).getByRole("link", { name: short(me) })).toBeVisible();
    await bob.close();
  });

  // 4e's UX review (U1): Ergo refuses a line to an account not connected (401); the page emptied the box all the same.
  test("keep the draft of a message to an account not connected, and say it was not sent", async ({
    page,
    playwright,
    launchOptions,
  }) => {
    await inGames(page);
    // Bob logged in, his page on no world: not connected to Ergo.
    const bob = await another({ playwright, launchOptions }, word("bob"));
    await page.goto(`/w/bubble?dm=${bob.address}`);
    await hydrated(page);
    const field = page.getByRole("textbox", { name: `Message ${short(bob.address)}` });
    await expect(field).toBeVisible();
    await expect(page.getByText("Connecting to the chat…")).toHaveCount(0);
    const text = word("lost");
    await field.fill(text);
    await field.press("Enter");
    await expect(field).toHaveAccessibleDescription(`Not sent: ${short(bob.address)} is not online.`);
    await expect(field).toHaveValue(text);
    await expect(lines(page)).toHaveCount(0);
    await bob.close();
  });

  test("refuse a stranger's message once the account asks for those it wrote to alone, and keep the others'", async ({
    page,
    playwright,
    launchOptions,
  }) => {
    const me = await inGames(page);
    const bob = await another({ playwright, launchOptions }, word("bob"));
    const carol = await another({ playwright, launchOptions }, word("carol"));
    // Bob connected, so Ergo delivers my line to him (it answers 401 to one for an account not connected): his own
    // page joins #games.
    await bob.page.goto("/w/bubble?room=games");
    await expect(whoIsHere(page).getByTitle(bob.address)).toBeVisible();
    await dmFrom(bob, me, word("first"));
    await dmsNav(page)
      .getByRole("link", { name: short(bob.address) })
      .click();
    const field = page.getByRole("textbox", { name: `Message ${short(bob.address)}` });
    await field.fill("hi bob");
    await field.press("Enter");
    await expect(lines(page).filter({ hasText: "hi bob" })).toHaveCount(1);
    await dmsNav(page).getByRole("button", { name: "Only people I wrote to" }).click();
    await expect(dmsNav(page).getByRole("button", { name: "Only people I wrote to" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await dmFrom(carol, me, word("stranger"));
    await dmFrom(bob, me, word("known"));
    await expect(lines(page).filter({ hasText: "known" })).toHaveCount(1);
    await expect(dmsNav(page).getByRole("link", { name: short(carol.address) })).toHaveCount(0);
    // Refused means discarded (decision B): hearing everyone again shows nothing that came while it was on.
    await dmsNav(page).getByRole("button", { name: "Only people I wrote to" }).click();
    await expect(dmsNav(page).getByRole("button", { name: "Only people I wrote to" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(dmsNav(page).getByRole("link", { name: short(carol.address) })).toHaveCount(0);
    await Promise.all([bob.close(), carol.close()]);
  });

  // 4e's UX review (U15): Alt+Down in a conversation went to the room after the one hidden behind it.
  test("stay in a conversation on Alt+Up and Alt+Down, which move between rooms", async ({ page }) => {
    await inGames(page);
    const partner = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
    await page.goto(`/w/bubble?dm=${partner}`);
    await hydrated(page);
    await expect(page.getByRole("heading", { name: short(partner) })).toBeVisible();
    await page.keyboard.press("Alt+ArrowDown");
    await page.keyboard.press("Alt+ArrowUp");
    // Two frames: the router has drawn whatever the keys asked.
    await page.evaluate(
      () =>
        new Promise((done) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(done);
          });
        }),
    );
    await expect(page).toHaveURL(new RegExp(`dm=${partner}`));
    await expect(page.getByRole("heading", { name: short(partner) })).toBeVisible();
  });

  // 4e's UX review (U9): ?dm= a page cannot show said nothing, the main room in its place.
  test("say why a ?dm= shows no conversation: a guest's, or an address that is none", async ({ page }) => {
    const partner = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
    await page.goto(`/w/bubble?dm=${partner}`);
    await hydrated(page);
    await expect(page.getByRole("status").filter({ hasText: "Log in to read direct messages." })).toBeVisible();
    await inGames(page);
    await page.goto("/w/bubble?dm=g1nope");
    await hydrated(page);
    await expect(page.getByRole("status").filter({ hasText: "That is not an account's address." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "#bubble" })).toHaveCount(0);
  });

  test("never reach the page's account from a guest: Ergo refuses it", async ({ page }) => {
    const me = await inGames(page);
    const guest = `guest-${crypto.randomUUID().slice(0, 6)}`;
    const said = await talk(
      page,
      [
        ["", "CAP LS 302"],
        ["", "CAP REQ :message-tags"],
        ["", `NICK ${guest}`],
        ["", "USER guest 0 * :guest"],
        ["", "CAP END"],
        ["\\s001\\s", `PRIVMSG ${me} :hello`],
      ],
      "\\s477\\s",
    );
    expect(said.some((line) => line.includes(` 477 ${guest} ${me} `))).toBe(true);
  });
});
