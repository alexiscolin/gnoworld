// The journeys' talk with Ergo over a page's own WebSocket (slice 4's 4b): lines sent as the lines received
// say, and an account of the host's test wallet logged in to Ergo with a ticket the server minted.
import { Address, Ticket } from "@gnoworld/schemas";
import { z } from "zod";
import { adena } from "./adena.ts";
import type { PlaywrightWorkerArgs, PlaywrightWorkerOptions } from "@playwright/test";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { accountPill, connectButton } from "./account.ts";

// Each step is a line sent once a received line matches its pattern ("" waits for none).
export type Step = readonly [after: string, line: string];

// One conversation over the page's own socket, until a received line matches `until`; every line it saw, then.
export const talk = (page: Page, steps: readonly Step[], until: string): Promise<string[]> =>
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

// A SASL PLAIN login as the wire says it: the account, then the passphrase, after a NUL each.
export const login = (account: string, passphrase: string): Step[] => [
  ["", "CAP LS 302"],
  ["", "CAP REQ :message-tags sasl"],
  ["CAP \\S+ ACK", "AUTHENTICATE PLAIN"],
  ["AUTHENTICATE \\+", `AUTHENTICATE ${btoa(`\0${account}\0${passphrase}`)}`],
];

// An account in a page that logged in with Adena's stand-in, the test wallet of that name: its address.
export async function logIn(page: Page, as = ""): Promise<string> {
  await adena(page, "signs", as);
  await page.goto("/");
  await hydrated(page);
  await connectButton(page).click();
  await expect(accountPill(page)).toBeVisible();
  const named = `/__wallet?as=${encodeURIComponent(as)}`;
  const wallet = z.object({ address: Address }).parse(await (await page.request.get(named)).json());
  return wallet.address;
}

/** A ticket for one connection to Ergo, from a page whose session is logged in. */
export async function ticketOf(page: Page): Promise<string> {
  const minted: unknown = await page.evaluate(async () => {
    const answer = await fetch("/api/login/ticket", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const body: unknown = await answer.json();
    return body;
  });
  return Ticket.parse(minted).ticket;
}

// An account in a page that logged in with Adena's stand-in: its address, and a ticket the server minted for it.
export async function loggedIn(page: Page, as = ""): Promise<{ address: string; ticket: string }> {
  const address = await logIn(page, as);
  return { address, ticket: await ticketOf(page) };
}

export type Launcher = Pick<PlaywrightWorkerArgs, "playwright"> & Pick<PlaywrightWorkerOptions, "launchOptions">;

/** Another account, in a browser of its own (the sandbox's Chromium runs one process, one context): its address, and its
 * page to talk from. */
export async function another({ playwright, launchOptions }: Launcher, as: string) {
  const { baseURL } = test.info().project.use;
  if (baseURL === undefined) throw new Error("no baseURL");
  const browser = await playwright.chromium.launch(launchOptions);
  const second = await (await browser.newContext({ baseURL })).newPage();
  return { address: await logIn(second, as), page: second, close: () => browser.close() };
}
