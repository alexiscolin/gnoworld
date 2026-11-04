// Whether an account has a name on the mainnet (D43, D92), for its quota: one vm/qeval of r/sys/users through the
// mainnet's RPC, the one way out (net.ts), with its timeout and its answer capped. A failed read means none, the lower
// quota, never the higher. The answers are kept 10,000 accounts at most: a name an hour, none ten minutes, a failure a minute.
import { QueryAnswer, type Address } from "@gnoworld/schemas";
import { readJson, send as netSend, type Send } from "../net.ts";
import { remember } from "../remember.ts";

interface Options {
  // The mainnet's RPC, a bare https origin (config.ts).
  rpc: string;
  now: () => number;
  send?: Send;
  max?: number;
}

const MINUTE = 60_000;
const TIMEOUT_MS = 3000;
// A good answer is under 1 KiB.
const MAX_BYTES = 64 * 1024;

// What r/sys/users said: a name, none, or no answer of that shape (no JSON, the chain's refusal, another value).
function answerOf(json: unknown): boolean | undefined {
  const { Error: refused = null, Data: data = null } =
    QueryAnswer.safeParse(json).data?.result?.response.ResponseBase ?? {};
  const said = refused === null && data !== null ? Buffer.from(data, "base64").toString("utf8").trimEnd() : "";
  if (said === "(false bool)") return true;
  return said === "(true bool)" ? false : undefined;
}

/** Whether an account has a name on the mainnet: its record in r/sys/users, missing or deleted, by that realm's own nil
 * check (users.gno, store.gno, read on gnoland-1), through the RPC's vm/qeval; undefined when the read fails. One read
 * and nothing else, for the chain-read package to take as it is (decision of 2026-11-04, 12:35). */
async function readName(rpc: string, account: Address, send: Send): Promise<boolean | undefined> {
  const expression = `gno.land/r/sys/users.ResolveAddress("${account}").IsDeleted()`;
  const url = `${rpc}/abci_query?path=%22vm/qeval%22&data=0x${Buffer.from(expression).toString("hex")}`;
  try {
    const response = await send(url, { method: "GET", headers: { accept: "application/json" } }, TIMEOUT_MS);
    return answerOf(response.ok ? await readJson(response, MAX_BYTES) : undefined);
  } catch {
    // A timeout or a refused connection: the read failed, and the quota is the lower one.
    return undefined;
  }
}

// How long an answer is kept: a name an hour, none ten minutes, so a name just taken counts soon, a failure a minute.
function keptFor(named: boolean | undefined): number {
  if (named === undefined) return MINUTE;
  return named ? 60 * MINUTE : 10 * MINUTE;
}

export function makeNames({ rpc, now, send = netSend, max = 10_000 }: Options): (account: Address) => Promise<boolean> {
  // The Map's first account is the one read longest ago: an account is set again at each read.
  const known = new Map<string, { named: boolean; until: number }>();
  return async (account) => {
    const at = now();
    const kept = known.get(account);
    if (kept !== undefined && kept.until > at) return kept.named;
    const named = await readName(rpc, account, send);
    remember(known, [account, { named: named === true, until: now() + keptFor(named) }], max);
    return named === true;
  };
}
