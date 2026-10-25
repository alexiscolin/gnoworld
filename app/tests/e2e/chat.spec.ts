import { Address, Ticket } from "@gnoworld/schemas";
import { z } from "zod";
import { adena } from "./adena.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { SITE } from "./sites.ts";

// The page's WebSocket to Ergo through the host's /ws (slice 4's 4b), under the site's CSP, as nginx hands it on
// in the stack. Only the browser's WebSocket speaks here: the chat client is the app's, tested apart.

// Each step is a line sent once a received line matches its pattern ("" waits for none).
type Step = readonly [after: string, line: string];

// One conversation over the page's own socket, until a received line matches `until`; every line it saw, then.
const talk = (page: Page, steps: readonly Step[], until: string): Promise<string[]> =>
  page.evaluate(
    ([script, done]) =>
      new Promise<string[]>((resolve, reject) => {
        const socket = new WebSocket(`ws://${location.host}/ws`, "text.ircv3.net");
        const seen: string[] = [];
        let sent = 0;
        const timer = setTimeout(() => {
          socket.close();
          reject(new Error(`no line matched ${done} in 8 s:\n${seen.join("\n")}`));
        }, 8000);
        const advance = (): void => {
          for (let step = script[sent]; step !== undefined; step = script[sent]) {
            if (step[0] !== "" && !seen.some((line) => new RegExp(step[0]).test(line))) return;
            socket.send(step[1]);
            sent += 1;
          }
        };
        socket.addEventListener("open", advance);
        socket.addEventListener("message", (event) => {
          seen.push(String(event.data));
          if (seen.some((line) => new RegExp(done).test(line))) {
            clearTimeout(timer);
            socket.close();
            resolve(seen);
          } else advance();
        });
        socket.addEventListener("close", () => {
          clearTimeout(timer);
          reject(new Error(`the socket closed before a line matched ${done}:\n${seen.join("\n")}`));
        });
      }),
    [steps, until] as const,
  );

// A guest's registration (the welcome, 001, ends it), and Ergo's account of it (WHOIS, which ends at 318).
const register = (nick: string): Step[] => [
  ["", "CAP LS 302"],
  ["", "CAP REQ :message-tags"],
  ["", `NICK ${nick}`],
  ["", "USER guest 0 * :guest"],
  ["", "CAP END"],
];
const registration = (nick: string): Step[] => [...register(nick), ["\\s001\\s", `WHOIS ${nick}`]];
const WHOIS_END = "\\s318\\s";

// A nick of its own for each test, so none meets another's, or its own retry's, on Ergo.
const guestNick = (): string => `guest-${crypto.randomUUID().slice(0, 6)}`;

// The host a WHOIS gives for a nick: Ergo's cloak of the address it believes the connection came from.
const hostOf = (lines: string[], nick: string): string | undefined =>
  lines.map((line) => line.split(" ")).find((words) => words[1] === "311" && words[2] === nick)?.[5];

// A SASL PLAIN login as the wire says it: the account, then the passphrase, after a NUL each.
const login = (account: string, passphrase: string): Step[] => [
  ["", "CAP LS 302"],
  ["", "CAP REQ :message-tags sasl"],
  ["CAP \\S+ ACK", "AUTHENTICATE PLAIN"],
  ["AUTHENTICATE \\+", `AUTHENTICATE ${btoa(`\0${account}\0${passphrase}`)}`],
];

// An account in a page that logged in with Adena's stand-in: its address, and a ticket the server minted for it.
async function loggedIn(page: Page): Promise<{ address: string; ticket: string }> {
  await adena(page);
  await page.goto("/");
  await hydrated(page);
  await page.getByRole("button", { name: "Log in with Adena" }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  const wallet = z.object({ address: Address }).parse(await (await page.request.get("/__wallet")).json());
  const minted: unknown = await page.evaluate(async () => {
    const answer = await fetch("/api/login/ticket", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const body: unknown = await answer.json();
    return body;
  });
  return { address: wallet.address, ticket: Ticket.parse(minted).ticket };
}

test.describe("the chat's WebSocket, as a guest", () => {
  test("registers a guest: its nick, then the welcome, and no account", async ({ page }) => {
    const nick = guestNick();
    await page.goto("/");
    await hydrated(page);
    const lines = await talk(page, registration(nick), WHOIS_END);
    expect(lines.some((line) => line.includes(` 001 ${nick} `))).toBe(true);
    expect(lines.some((line) => / CAP \S+ ACK :?message-tags$/.test(line))).toBe(true);
    // A guest is logged in to nothing: no 900 on the way in, no account (330) in its WHOIS.
    expect(lines.some((line) => / (900|330) /.test(line))).toBe(false);
  });

  test("gives each connection a visitor address of its own, which Ergo believes from the host", async ({ page }) => {
    const [first, second] = [guestNick(), guestNick()];
    await page.goto("/");
    await hydrated(page);
    const hosts = [hostOf(await talk(page, registration(first), WHOIS_END), first)];
    hosts.push(hostOf(await talk(page, registration(second), WHOIS_END), second));
    expect(hosts[0]).toBeDefined();
    expect(hosts[1]).toBeDefined();
    expect(hosts[0]).not.toBe(hosts[1]);
  });

  test("finds the server's bot in a room of its roles file, which a guest joins", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);
    const lines = await talk(page, [...register(guestNick()), ["\\s001\\s", "JOIN #bubble"]], "\\s366\\s");
    // The room's members, in no order of Ergo's: the bot is among them, an operator (@).
    const members = lines.flatMap((line) => / 353 \S+ \S+ #bubble :(.*)$/.exec(line)?.[1]?.split(" ") ?? []);
    expect(members).toContain("@gnoworld");
  });

  test("refuses a page of another origin than the host's own sites", async ({ page }) => {
    // The same host by another name: a page there sends an Origin Ergo was not told.
    await page.goto(`${SITE.replace("127.0.0.1", "localhost")}/`);
    await hydrated(page);
    await expect(talk(page, registration(guestNick()), WHOIS_END)).rejects.toThrow("the socket closed before");
  });
});

// The wallet is the host's one: both tests log the same account in, which Ergo creates at its first login, so
// they run one after the other.
test.describe("the chat's WebSocket, as an account", () => {
  test.describe.configure({ mode: "serial" });

  test("logs an account in by SASL PLAIN, its address the account and a ticket from the server the passphrase", async ({
    page,
  }) => {
    const { address, ticket } = await loggedIn(page);
    const lines = await talk(page, login(address, ticket), "\\s903\\s");
    expect(lines.some((line) => line.includes(" 900 * ") && line.includes(`You are now logged in as ${address}`))).toBe(
      true,
    );
  });

  test("refuses a ticket already spent", async ({ page }) => {
    const { address, ticket } = await loggedIn(page);
    await talk(page, login(address, ticket), "\\s903\\s");
    const lines = await talk(page, login(address, ticket), "\\s90[34]\\s");
    expect(lines.some((line) => line.includes(" 904 "))).toBe(true);
  });
});
