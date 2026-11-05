import { queryEnvelope, rpcErrorEnvelope, statusEnvelope } from "@gnoworld/chain/testing/envelopes";
import type { BrowserType, LaunchOptions } from "@playwright/test";
import { adena } from "./adena.ts";
import { callWallet, connect, phoneOf as touchPhone, type Wallet } from "./callCard.ts";
import { hydrated, type Page } from "./fixtures.ts";

// The name journeys' world (9f): both chains' RPC stood in as a browser gets them, and a login made on a computer then read at the
// size under test. NOT recorded: the shapes of vm/qeval and tx as the 9d journeys write them.
const CORS = { "access-control-allow-origin": "*", "content-type": "application/json" };
const BASE64_HASH = "eFwYnlgr7KfDvMsmr6ntZ5vCoe/JcHLddE0pzi+D0Fg=";
export const NAME = "nym-alexis042";
export const DOWN = "down";

export interface World {
  /** Mainnet's answer: a name, none, or `DOWN`, a node that is down. */
  mainnet?: string | null;
  /** The name Onyx gives before the registration; after it, always NAME. */
  onyx?: string | null;
}

// The call as `tx` gives it once it is in block 55414.
const LANDED = {
  jsonrpc: "2.0",
  id: "",
  result: {
    hash: BASE64_HASH,
    height: "55414",
    index: 0,
    tx_result: {
      ResponseBase: { Error: null, Data: null, Events: null, Log: "ok", Info: "" },
      GasWanted: "10000000",
      GasUsed: "29710664",
    },
    tx: "AA==",
  },
};

// What a node says to the one expression it is asked: `IsDeleted` and `Name` of r/sys/users, for an account with `name` or none.
function evaluated(url: URL, name: string | null) {
  const hex = /^0x([0-9a-f]*)$/.exec(url.searchParams.get("data") ?? "")?.[1] ?? "";
  const bytes = Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
  const expression = new TextDecoder().decode(bytes);
  if (expression.endsWith(".IsDeleted()")) return queryEnvelope({ data: `(${String(name === null)} bool)` });
  if (expression.endsWith(".Name()") && name !== null) return queryEnvelope({ data: `("${name}" string)` });
  return rpcErrorEnvelope("unexpected");
}

// Both chains' RPC, as a browser gets them. Onyx gives the name from the moment its `tx` read serves the landed call, as the chain does
// once the call is in a block.
async function chains(page: Page, { mainnet = null, onyx = null }: World = {}) {
  let registered = false;
  const serve = (chain: "gnoland-1" | "onyx-1", height: number, held: () => string | null) =>
    page.route(chain === "onyx-1" ? "https://rpc.onyx.testnets.gno.land/**" : "https://rpc.gno.land/**", (route) => {
      const url = new URL(route.request().url());
      const name = held();
      const answers: Record<string, () => unknown> = {
        "/status": () => statusEnvelope(height, "2026-11-06T05:00:00Z", chain),
        "/tx": () => {
          registered = registered || chain === "onyx-1";
          return LANDED;
        },
      };
      if (name === DOWN) return route.fulfill({ status: 503, headers: CORS, body: DOWN });
      const body = answers[url.pathname]?.() ?? evaluated(url, name);
      return route.fulfill({ headers: CORS, body: JSON.stringify(body) });
    });
  // The fee read of the dialog finds no call to go by: Adena sets the fee, and the line says so.
  await page.route("https://indexer.onyx.testnets.gno.land/**", (route) =>
    route.fulfill({ headers: CORS, body: JSON.stringify({ data: { latestBlockHeight: 0, getTransactions: [] } }) }),
  );
  await serve("gnoland-1", 1_325_774, () => mainnet);
  await serve("onyx-1", 55_420, () => (registered ? NAME : onyx));
}

/** A computer's login, the page then read at `size`. */
export async function logIn(
  page: Page,
  [width, height]: readonly [number, number],
  { wallet, ...world }: World & { wallet?: Wallet } = {},
) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await adena(page);
  await callWallet(page, wallet);
  await chains(page, world);
  await connect(page);
  await page.setViewportSize({ width, height });
  await page.reload();
  await hydrated(page);
}

interface Own {
  playwright: { chromium: BrowserType };
  launchOptions: LaunchOptions;
}

/** A phone for the name journeys: the session of a computer's login, handed to a touch browser of its own that has the world too. The
 * caller closes the browser. */
export async function phoneOf(page: Page, own: Own, world?: World) {
  await logIn(page, [1280, 900], world);
  const { phone, browser } = await touchPhone(page, own);
  await adena(phone);
  await callWallet(phone);
  await chains(phone, world);
  await phone.goto("/");
  await hydrated(phone);
  return { phone, browser };
}
