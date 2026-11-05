import { realmType } from "@gnoworld/core";
import { queryEnvelope, rpcErrorEnvelope, statusEnvelope } from "@gnoworld/chain/testing/envelopes";
import { indexer } from "../chain/indexerRoute.ts";
import recording from "../../recording/adena-recording.json" with { type: "json" };
import { expect, hydrated, type Page } from "./fixtures.ts";

// The call card's journeys' world (9d): Adena's stand-in (adena.ts) given the calls a signature needs, with the recorded
// answers (app/recording/adena-recording.json, onyx-1), and the chain's RPC answering as a browser would get it.
export const REALM = "gno.land/r/gnoland/wugnot";
export const HASH = "785c189e582beca7c3bccb26afa9ed679bc2a1efc97072dd744d29ce2f83d058";
const RPC = "https://rpc.onyx.testnets.gno.land/**";
const INDEXER = "https://indexer.onyx.testnets.gno.land/**";
const CORS = { "access-control-allow-origin": "*", "content-type": "application/json" };
// The transaction's hash as the node writes it, base64 of the 32 bytes.
const BASE64_HASH = "eFwYnlgr7KfDvMsmr6ntZ5vCoe/JcHLddE0pzi+D0Fg=";
const CUR = { Name: "cur", Type: realmType(), Value: "" };
const field = (Name: string, Type: string) => ({ Name, Type, Value: "" });
// NOT recorded: written in the shape of vm/qfuncs.
const WRITES = [
  { FuncName: "SetBio", Params: [CUR, field("bio", "string")], Results: null },
  { FuncName: "SetProfile", Params: [CUR, field("name", "string"), field("times", "int64")], Results: null },
  {
    FuncName: "SetThree",
    Params: [CUR, field("a", "string"), field("b", "string"), field("c", "string")],
    Results: null,
  },
];

export interface Wallet {
  /** Whether a switch to onyx-1 moves Adena there; `setNetwork(page, id)` puts it on another chain. */
  moves?: boolean;
  /** DoContract answers the recorded refusal. */
  declines?: boolean;
  /** DoContract waits for `signNow(page)`, the person's click in Adena's popup. */
  hold?: boolean;
}

/** Answers the DoContract that waits (the person signs in Adena's popup). */
export const signNow = (page: Page) =>
  page.evaluate(() => {
    (Reflect.get(window, "__signNow") as () => void)();
  });

/** Puts the page's Adena on another chain, as the person does in its popup. */
export const setNetwork = (page: Page, id: string) =>
  page.evaluate((chain) => {
    (Reflect.get(window, "__setNetwork") as (id: string) => void)(chain);
  }, id);

/** Gives the page's Adena (installed first by adena.ts) the methods of a call; what DoContract was given is `__done`. */
export async function callWallet(page: Page, wallet: Wallet = {}): Promise<void> {
  const signed = (recording[3]?.answer ?? {}) as Record<string, unknown>;
  const refused = (recording[5]?.answer ?? {}) as Record<string, unknown>;
  await page.addInitScript(
    ([{ moves = true, declines = false, hold = false }, signedAnswer, refusedAnswer]) => {
      const done: unknown[] = [];
      let on = "onyx-1";
      const answer = (type: string, data: unknown) => ({ code: 0, status: "success", type, message: "", data });
      const adena = Reflect.get(window, "adena") as Record<string, unknown>;
      const gate = Promise.withResolvers<undefined>();
      Object.assign(window, {
        __done: done,
        __setNetwork: (id: string) => {
          on = id;
        },
        __signNow: () => {
          gate.resolve(undefined);
        },
      });
      Object.assign(adena, {
        GetNetwork: () => Promise.resolve(answer("GET_NETWORK", { chainId: on, networkName: on })),
        SwitchNetwork: (id: string) => {
          if (moves) on = id;
          return Promise.resolve(answer("SWITCH_NETWORK_SUCCESS", { chainId: id }));
        },
        DoContract: (transaction: unknown) => {
          done.push(transaction);
          const reply = declines ? refusedAnswer : signedAnswer;
          return hold ? gate.promise.then(() => reply) : Promise.resolve(reply);
        },
      });
    },
    [wallet, signed, refused] as const,
  );
}

export const done = (page: Page) => page.evaluate(() => (Reflect.get(window, "__done") as unknown[]).length);

export interface Chain {
  /** The tx read: lands at once, never, or when `release` is called (it answers "not found" until then). */
  landing?: "now" | "never" | "later";
  /** The indexer's fee rows (the calls' median is 52,000 ugnot), or down. */
  fees?: "rows" | "down";
}

// NOT recorded, written in the shape of getTransactions: three good calls of SetBio, a failed one, a foreign message and a
// transaction of two messages, which the reader must not count.
const call = { pkg_path: REALM, func: "SetBio" };
const row = (amount: number, block_height: number, over: Record<string, unknown> = {}) => ({
  success: true,
  block_height,
  gas_fee: { amount, denom: "ugnot" },
  messages: [{ value: call }],
  ...over,
});
const FEE_ROWS = [
  row(48000, 100),
  row(1000000, 101),
  row(52000, 102),
  row(9_000_000, 103, { success: false }),
  row(7, 104, { messages: [{ value: {} }] }),
  row(8, 105, { messages: [{ value: {} }, { value: call }] }),
];

/** The chain as the card reads it: the write functions, the status, and the tx once it lands. */
export async function writeChain(
  page: Page,
  { landing = "now", fees = "rows" }: Chain = {},
): Promise<{ release: () => void; txReads: () => number }> {
  let landed = landing === "now";
  let reads = 0;
  await indexer(page);
  await page.route(INDEXER, (route) => {
    const asked = decodeURIComponent(route.request().url());
    // The fee read asks the tip first, then the calls above a window under it (F5724).
    if (fees === "rows" && asked.includes("latestBlockHeight") && !asked.includes("getTransactions"))
      return route.fulfill({ headers: CORS, body: JSON.stringify({ data: { latestBlockHeight: 110 } }) });
    if (!asked.includes("getTransactions")) return route.fallback();
    if (fees === "down") return route.fulfill({ status: 503, headers: CORS, body: "down" });
    return route.fulfill({ headers: CORS, body: JSON.stringify({ data: { getTransactions: FEE_ROWS } }) });
  });
  await page.route(RPC, async (route) => {
    const url = new URL(route.request().url());
    const headers = { "access-control-allow-origin": "*", "content-type": "application/json" };
    const send = (body: unknown) => route.fulfill({ headers, body: JSON.stringify(body) });
    if (url.pathname === "/status") return send(statusEnvelope(55420, "2026-11-05T05:00:00Z", "onyx-1"));
    if (url.pathname === "/tx") {
      reads += 1;
      if (!landed)
        return send(rpcErrorEnvelope("Internal error", `Could not find tx result for hash #${HASH.toUpperCase()}`));
      return send({
        jsonrpc: "2.0",
        id: "",
        result: {
          hash: BASE64_HASH,
          height: "55414",
          index: 0,
          tx_result: {
            ResponseBase: { Error: null, Data: btoa("(42 int)"), Events: null, Log: "ok", Info: "" },
            GasWanted: "10000000",
            GasUsed: "29710664",
          },
          tx: "AA==",
        },
      });
    }
    return send(queryEnvelope({ data: JSON.stringify(WRITES) }));
  });
  return {
    release: () => {
      landed = true;
    },
    txReads: () => reads,
  };
}

export const calls = (page: Page) => page.getByRole("region", { name: "Write functions" });

/** Opens the realm's page logged in by cookie (the session of a login made first, the page loaded again). */
export async function openRealm(page: Page, logIn: () => Promise<void>): Promise<void> {
  await logIn();
  await page.goto(`/r/${REALM.slice("gno.land/r/".length)}`);
  await hydrated(page);
  await expect(calls(page).getByRole("button", { name: "Call SetBio" })).toBeVisible();
}

/** Logs in with the page's Adena on a computer's screen: the page's session is the cookie the server sets. */
export async function connect(page: Page): Promise<void> {
  await page.goto("/");
  await hydrated(page);
  await page.getByRole("button", { name: "Connect Adena" }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
}

/** Opens SetBio's card and clicks its "Sign in Adena". */
export async function callAndSign(page: Page): Promise<void> {
  await calls(page).getByRole("button", { name: "Call SetBio" }).click();
  await calls(page).getByRole("article").getByRole("button", { name: "Sign in Adena" }).click();
}
