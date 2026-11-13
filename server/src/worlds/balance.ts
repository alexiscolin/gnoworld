// A person's balance (the card's first line): one `auth/accounts/<address>` read of the node, a store read and no eval, kept 60 s per address,
// asked at most ten a second across every visitor (as many as the card lets in), a request in flight shared, the answer cut at 4 KB. What it cannot say it does not guess:
// past the bucket or with the node down the balance is `unavailable`, never 0.
import { accountAsk } from "@gnoworld/chain/asks";
import { Ugnot } from "@gnoworld/schemas/indexer";
import { z } from "zod";
import { keptFlights } from "../flights.ts";
import { abciQuery, Failure, type Send } from "./remote.ts";

export type Balance = { state: "ok"; ugnot: string } | { state: "none" } | { state: "unavailable" };

const KEPT_MS = 60_000;
const READ = { ms: 5000, maxBytes: 4096 } as const;
const KEPT_MOST = 10_000;
const UNAVAILABLE: Balance = { state: "unavailable" };

// The chain's denom is `[a-z/][a-z0-9_.:/-]{2,127}`, so a realm's coins (`/gno.land/r/demo/foo:bar`) are accepted.
const DENOM = "[a-z/][a-z0-9_.:/-]{2,127}";

// The ugnot of a coins text, `275208694ugnot,5foo`: 0 when the account holds none; any other shape is a fault.
function ugnotOf(coins: unknown): string {
  if (coins === "" || coins === undefined || coins === null) return "0";
  if (typeof coins !== "string" || !new RegExp(`^\\d{1,20}${DENOM}(,\\d{1,20}${DENOM}){0,15}$`).test(coins))
    throw new Failure("shape");
  const own = coins.split(",").find((coin) => coin.endsWith("ugnot") && /^\d+ugnot$/.test(coin));
  const parsed = Ugnot.safeParse(own === undefined ? "0" : own.slice(0, -5));
  if (!parsed.success) throw new Failure("shape");
  return parsed.data;
}

const Coins = z.optional(z.nullable(z.string()));
const Envelope = z.union([z.null(), z.object({ BaseAccount: z.object({ coins: Coins }) }), z.object({ coins: Coins })]);

/** The node's answer text as a balance: no account is `null` or an empty answer; the account is `{BaseAccount: {coins}}` or `{coins}`. */
export function balanceOf(text: string): Balance {
  if (text.trim() === "") return { state: "none" };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Failure("shape");
  }
  const parsed = Envelope.safeParse(json);
  if (!parsed.success) throw new Failure("shape");
  if (parsed.data === null) return { state: "none" };
  const account = "BaseAccount" in parsed.data ? parsed.data.BaseAccount : parsed.data;
  return { state: "ok", ugnot: ugnotOf(account.coins) };
}

export type BalanceReader = (address: string) => Promise<Balance>;

/** The reader of `rpc`: cached, bucketed, never throwing; the address must be one the caller checked. */
export function balanceReader({
  send,
  rpc,
  now,
  perSecond = 10,
}: {
  send: Send;
  rpc: string;
  now: () => number;
  perSecond?: number;
}): BalanceReader {
  // A balance read is kept a minute; one the node could not give is not.
  const kept = keptFlights<Balance>({
    now,
    perSecond,
    most: KEPT_MOST,
    until: (balance) => (balance.state === "unavailable" ? undefined : now() + KEPT_MS),
  });
  const read = async (address: string): Promise<Balance> => {
    try {
      return balanceOf(await abciQuery({ send, rpc }, accountAsk(address), READ));
    } catch {
      return UNAVAILABLE;
    }
  };
  return (address) => {
    const asked = kept(address, () => read(address));
    return asked === "limit" ? Promise.resolve(UNAVAILABLE) : asked;
  };
}
