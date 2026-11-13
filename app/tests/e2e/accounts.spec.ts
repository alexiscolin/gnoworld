import { shortAddress } from "@gnoworld/schemas";
import { word } from "./chat.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import type { Locator } from "@playwright/test";
import { openSettings } from "./account.ts";
import { adena } from "./adena.ts";
import { logIn } from "./irc.ts";

// Linked accounts and the release of a command-line key, walked in Settings with the server's /api/links answered by the page's own
// routes (the server's own logic is its tests'): the list, the link dialog's two tabs, an unlink that asks first, a session too old
// that signs in again, and a guest's release.
const COMPUTER = { width: 1280, height: 900 };
const CODE = "AAAAAAAAAAAAAAAAAAAAAA";
const FILE = '{"msg":[],"fee":{},"signatures":[{"pub_key":{},"signature":"x"}],"memo":""}';
const json = { "content-type": "application/json" };

interface Held {
  members: { address: string; kind: "adena" | "cli"; linkedAt: number }[];
  /** The answer a call gets instead of its own, by path; a 401's is given once. */
  refuse: Record<string, { status: number; error: string } | undefined>;
  calls: string[];
}
interface Asked {
  address: string;
  kind: string;
  proof?: unknown;
}
type Answer = (asked: Asked, held: Held) => unknown;

const expiresAt = () => new Date(Date.now() + 600_000).toISOString();
const addresses = (held: Held) => ({ members: held.members.map(({ address }) => address) });
const challenge = ({ address }: Asked) => ({
  nonce: CODE,
  memo: "gnoworld",
  block: `gnokey sign --key KEY # ${address}`,
  expiresAt: expiresAt(),
});
const ANSWERS: Record<string, Answer> = {
  "/api/links": (_, held) => ({
    members: held.members.length > 1 ? held.members : [],
    worlds: ["bubble"],
    linked: held.members.length > 1,
  }),
  "/api/links/challenge": (asked) =>
    asked.kind === "adena"
      ? { nonce: CODE, text: `Link ${asked.address} to gnoworld`, expiresAt: expiresAt(), chainId: "onyx-1" }
      : challenge(asked),
  "/api/links/release/challenge": challenge,
  "/api/links/verify": (asked, held) => {
    held.members.push({
      address: asked.address,
      kind: asked.proof === undefined ? "cli" : "adena",
      linkedAt: Date.now(),
    });
    return addresses(held);
  },
  "/api/links/release/verify": () => ({ ok: true }),
  "/api/links/unlink": (asked, held) => {
    held.members = held.members.filter(({ address }) => address !== asked.address);
    return addresses(held);
  },
};

// The server's side of /api/links for one account: it keeps its members, links and unlinks them, refuses where told.
async function links(page: Page, me: string): Promise<Held> {
  const held: Held = { members: [{ address: me, kind: "adena", linkedAt: Date.now() }], refuse: {}, calls: [] };
  await page.route("**/api/links**", async (route) => {
    const { pathname } = new URL(route.request().url());
    const posted = route.request().postData();
    const asked = (posted === null ? {} : JSON.parse(posted)) as Asked;
    held.calls.push(pathname);
    const refused = held.refuse[pathname];
    const answer = ANSWERS[pathname];
    if (refused?.status === 401) held.refuse[pathname] = undefined;
    const [status, body] =
      refused !== undefined
        ? [refused.status, { error: refused.error }]
        : answer === undefined
          ? [404, { error: "not_found" }]
          : [200, answer(asked, held)];
    await route.fulfill({ status, headers: json, body: JSON.stringify(body) });
  });
  return held;
}

// The paragraph a dialog speaks in; the page also keeps hidden live regions of its own.
const said = (within: Locator) => within.locator("p[role=status]");

const walletOf = async (page: Page, as: string): Promise<string> =>
  ((await (await page.request.get(`/__wallet?as=${as}`)).json()) as { address: string }).address;

// Another account linked from the Adena wallet, Settings reloaded open on it: its address, the dialog and its row.
async function linkedOther(page: Page, held: Held) {
  const other = await walletOf(page, word("other"));
  held.members.push({ address: other, kind: "adena", linkedAt: Date.now() });
  await page.reload();
  await hydrated(page);
  // The address keeps Settings open across the reload.
  const settings = page.getByRole("dialog", { name: "Settings" });
  return { other, settings, row: settings.getByRole("listitem").filter({ hasText: shortAddress(other) }) };
}

// A logged-in account with its server answered, Settings open on its Accounts.
async function inSettings(page: Page) {
  await page.setViewportSize(COMPUTER);
  const as = word("own");
  const me = await logIn(page, as);
  const held = await links(page, me);
  const settings = await openSettings(page);
  return { me, as, held, settings, accounts: settings.locator("section", { hasText: "Only you see this list" }) };
}

// Adena, switched to another account's wallet once logged in (the stand-in's account is fixed when the page starts).
async function adenaOn(page: Page, name: string, address: string): Promise<void> {
  await page.evaluate(
    ([who, at]) => {
      const answer = (type: string, data: unknown) => ({ code: 0, status: "success", type, message: "", data });
      const wallet = Reflect.get(window, "adena") as Record<string, unknown>;
      wallet["GetAccount"] = () =>
        Promise.resolve(answer("GET_ACCOUNT", { address: at, chainId: "onyx-1", status: "ACTIVE" }));
      wallet["SignArbitrary"] = async (params: { signer: string; data: string }) =>
        answer(
          "SIGN_ARBITRARY",
          await (
            await fetch(`/__sign?as=${encodeURIComponent(who ?? "")}`, {
              method: "POST",
              body: JSON.stringify({ chainId: "onyx-1", ...params }),
            })
          ).json(),
        );
    },
    [name, address],
  );
}

test.describe("linked accounts", () => {
  test("lists the identity with its ways, Main, the worlds it owns and the day, for one account and for two", async ({
    page,
  }) => {
    const { me, held, settings, accounts } = await inSettings(page);
    await expect(accounts.getByRole("heading", { name: "Accounts" })).toBeVisible();
    await expect(accounts).toContainText(shortAddress(me));
    await expect(accounts).toContainText("Logged in now");
    await expect(accounts).toContainText("Main");
    await expect(accounts).toContainText("Owner of 1 world on");
    // Alone, the account has no Unlink to press: nothing is linked.
    await expect(accounts.getByRole("button", { name: /^Unlink/ })).toHaveCount(0);
    // Another account, linked from a command line, is a second row with its way and its day.
    const other = await walletOf(page, word("other"));
    held.members.push({ address: other, kind: "cli", linkedAt: Date.now() });
    await settings.getByRole("button", { name: "Close" }).click();
    await page.reload();
    await hydrated(page);
    const again = await openSettings(page);
    const row = again.getByRole("listitem").filter({ hasText: shortAddress(other) });
    await expect(row).toContainText("Command line");
    await expect(row).toContainText(/Linked \d/);
    await expect(row.getByRole("button", { name: /^Unlink/ })).toBeVisible();
  });

  test("links an account with Adena: its text shown, signed, the list now holding it", async ({ page }) => {
    const { held, settings } = await inSettings(page);
    const name = word("other");
    const other = await walletOf(page, name);
    await adenaOn(page, name, other);
    await settings.getByRole("button", { name: "Link an account" }).click();
    const dialog = page.getByRole("dialog", { name: "Link an account" });
    await dialog.getByRole("button", { name: "Continue" }).click();
    await expect(dialog).toContainText(`Adena will sign this text, for ${shortAddress(other)}`);
    await expect(dialog.getByRole("blockquote")).toContainText(`Link ${other} to gnoworld`);
    await dialog.getByRole("button", { name: "Sign in Adena" }).click();
    await expect(said(dialog)).toContainText(`${shortAddress(other)} is linked.`);
    expect(held.members.map(({ address }) => address)).toContain(other);
    await page.keyboard.press("Escape");
    await expect(settings.getByRole("listitem").filter({ hasText: shortAddress(other) })).toBeVisible();
  });

  test("says Adena is on the same account, and a code another identity holds", async ({ page }) => {
    const { held, settings } = await inSettings(page);
    await settings.getByRole("button", { name: "Link an account" }).click();
    const dialog = page.getByRole("dialog", { name: "Link an account" });
    await dialog.getByRole("button", { name: "Continue" }).click();
    await expect(said(dialog)).toContainText("Adena is on the account you are logged in as.");
    const name = word("other");
    await adenaOn(page, name, await walletOf(page, name));
    held.refuse["/api/links/verify"] = { status: 403, error: "forbidden" };
    await dialog.getByRole("button", { name: "Continue" }).click();
    await dialog.getByRole("button", { name: "Sign in Adena" }).click();
    await expect(said(dialog)).toContainText("already linked to another gnoworld account");
  });

  test("links a command-line key by its block and the file pasted back, a bad paste kept apart and an expired code replaced", async ({
    page,
  }) => {
    const { held, settings } = await inSettings(page);
    const other = await walletOf(page, word("cli"));
    await settings.getByRole("button", { name: "Link an account" }).click();
    const dialog = page.getByRole("dialog", { name: "Link an account" });
    await dialog.getByRole("tab", { name: "Command line" }).click();
    const get = dialog.getByRole("button", { name: "Get a code" });
    await expect(get).toBeDisabled();
    await dialog.getByLabel("Address").fill("not an address");
    await expect(dialog).toContainText("This is not a gno address: it starts with g1.");
    await dialog.getByLabel("Address").fill(other);
    await get.click();
    await expect(dialog.locator("pre")).toContainText(`gnokey sign --key KEY # ${other}`);
    await expect(dialog).toContainText("The code works once, for");
    const link = dialog.getByRole("button", { name: "Link", exact: true });
    await expect(link).toBeDisabled();
    // A paste that is not the tool's file keeps the code and says what to paste.
    await dialog.getByLabel("Paste what it shows").fill("hello");
    await link.click();
    await expect(said(dialog)).toContainText("Paste only what `cat link.json` printed");
    // A refused file brings a new code at once.
    held.refuse["/api/links/verify"] = { status: 403, error: "refused" };
    await dialog.getByLabel("Paste what it shows").fill(FILE);
    await link.click();
    await expect(said(dialog)).toContainText(`This file is not signed by the key of ${shortAddress(other)}`);
    await expect(dialog.getByLabel("Paste what it shows")).toHaveValue("");
    held.refuse["/api/links/verify"] = undefined;
    await dialog.getByLabel("Paste what it shows").fill(FILE);
    await link.click();
    await expect(said(dialog)).toContainText(`${shortAddress(other)} is linked.`);
    expect(held.members.find(({ address }) => address === other)?.kind).toBe("cli");
  });

  test("asks before unlinking, keeps the account on Cancel, and unlinks on Unlink", async ({ page }) => {
    const { held } = await inSettings(page);
    const { other, row } = await linkedOther(page, held);
    await row.getByRole("button", { name: /^Unlink/ }).click();
    const ask = page.getByRole("dialog", { name: "Unlink this address?" });
    await expect(ask).toContainText("It stops moderating the worlds the other accounts own");
    await ask.getByRole("button", { name: "Cancel" }).click();
    await expect(row).toBeVisible();
    expect(held.calls).not.toContain("/api/links/unlink");
    await row.getByRole("button", { name: /^Unlink/ }).click();
    await page.getByRole("dialog", { name: "Unlink this address?" }).getByRole("button", { name: "Unlink" }).click();
    await expect(row).toHaveCount(0);
    expect(held.members.map(({ address }) => address)).not.toContain(other);
  });

  test("tells a session too old to change links and unlinks once signed in again", async ({ page }) => {
    const { held, me } = await inSettings(page);
    const { settings, row } = await linkedOther(page, held);
    held.refuse["/api/links/unlink"] = { status: 401, error: "unauthenticated" };
    await row.getByRole("button", { name: /^Unlink/ }).click();
    await page.getByRole("dialog", { name: "Unlink this address?" }).getByRole("button", { name: "Unlink" }).click();
    await expect(said(settings).filter({ hasText: "too old to change links" })).toBeVisible();
    await settings.getByRole("button", { name: "Sign in again to confirm" }).click();
    await expect(row).toHaveCount(0);
    expect(held.members.map(({ address }) => address)).toEqual([me]);
  });

  test("says the list could not be read, and reads it again", async ({ page }) => {
    await page.setViewportSize(COMPUTER);
    // The list is refused from the first read, which the page makes as the account logs in.
    const held = await links(page, "");
    held.refuse["/api/links"] = { status: 500, error: "internal" };
    const me = await logIn(page, word("own"));
    held.members = [{ address: me, kind: "adena", linkedAt: Date.now() }];
    const settings = await openSettings(page);
    await expect(settings.getByText("Could not read your accounts")).toBeVisible();
    held.refuse["/api/links"] = undefined;
    await settings.getByRole("button", { name: "Try again" }).click();
    await expect(settings.getByText("Could not read your accounts")).toHaveCount(0);
    await expect(settings).toContainText("Owner of 1 world");
  });
});

test.describe("a command-line key's release", () => {
  test("is offered to a guest, gets a code, and says nothing of whether the key was linked", async ({ page }) => {
    await page.setViewportSize(COMPUTER);
    await adena(page, "signs", word("guest"));
    await page.goto("/");
    await hydrated(page);
    const held = await links(page, "g1unused");
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("menuitem", { name: "Settings" }).click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings).toContainText("Log in to link accounts.");
    await settings.getByRole("button", { name: "Release a command-line key" }).click();
    const dialog = page.getByRole("dialog", { name: "Release a command-line key" });
    await expect(dialog).toContainText("You do not need to be logged in.");
    const key = await walletOf(page, word("key"));
    await dialog.getByLabel("Address").fill(key);
    await dialog.getByRole("button", { name: "Get a code" }).click();
    await expect(dialog.locator("pre")).toContainText(`# ${key}`);
    await dialog.getByLabel("Paste what it shows").fill(FILE);
    await dialog.getByRole("button", { name: "Link", exact: true }).click();
    await expect(said(dialog)).toContainText(
      `Done. If ${shortAddress(key)} was linked to a gnoworld account, it no longer is.`,
    );
    expect(held.calls).toContain("/api/links/release/verify");
    expect(held.calls).not.toContain("/api/links/unlink");
  });

  test("says to wait when the network asked too much, and a logged-in account has the same way out", async ({
    page,
  }) => {
    await page.setViewportSize(COMPUTER);
    const me = await logIn(page, word("own"));
    const held = await links(page, me);
    held.refuse["/api/links/release/challenge"] = { status: 429, error: "too_many" };
    const settings = await openSettings(page);
    await settings.getByRole("button", { name: "Release a command-line key" }).click();
    const dialog = page.getByRole("dialog", { name: "Release a command-line key" });
    await dialog.getByLabel("Address").fill(await walletOf(page, word("key")));
    await dialog.getByRole("button", { name: "Get a code" }).click();
    await expect(said(dialog)).toContainText("Too many tries from this network");
  });
});
