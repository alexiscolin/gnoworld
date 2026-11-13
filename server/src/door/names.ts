// Whether an account has a name on the mainnet (D43, D92), for its quota: one vm/qeval of r/sys/users through the chain
// package, on a node whose status names the mainnet's chain (D120), the server's one way out (net.ts) its transport, with
// its timeout and its answer capped. A failed read means none, the lower quota, never the higher. The answers are kept
// 10,000 accounts at most: a name an hour, none ten minutes, a failure a minute.
import { readEvaluated } from "@gnoworld/chain/node";
import type { FailureKind } from "@gnoworld/chain/read";
import { requestInit } from "@gnoworld/chain/transport";
import type { Address } from "@gnoworld/schemas";
import type { Log } from "@gnoworld/service/log";
import { send as netSend, type Send } from "@gnoworld/service/net";
import { remember } from "../remember.ts";

interface Options {
  // The mainnet's RPC, a bare https origin, and its chain's id (config.ts).
  rpc: string;
  chainId: string;
  now: () => number;
  log: Log;
  send?: Send;
  max?: number;
}

// The mainnet's node, and when it was last seen on its chain: its status is read once a minute (10h's review, V7).
interface Node {
  rpc: string;
  chainId: string;
  send: Send;
  now: () => number;
  seen: Map<string, number>;
}

const MINUTE = 60_000;
const TIMEOUT_MS = 3000;
// A good answer is under 1 KiB.
const MAX_BYTES = 64 * 1024;

/** Whether an account has a name on the mainnet: its record in r/sys/users, missing or deleted, by that realm's own nil
 * check (users.gno, store.gno, read on gnoland-1), through the RPC's vm/qeval; undefined when the read fails, the node
 * being another chain's included. The expression is a fixed one over a parsed address (D114). */
async function readName(node: Node, account: Address): Promise<boolean | FailureKind> {
  const expression = `gno.land/r/sys/users.ResolveAddress("${account}").IsDeleted()`;
  const read = await readEvaluated(node.rpc, expression, {
    chainId: node.chainId,
    seen: node.seen,
    now: () => new Date(node.now()),
    timeoutMs: TIMEOUT_MS,
    maxBytes: MAX_BYTES,
    fetch: (url, init) => node.send(url, requestInit(init), TIMEOUT_MS),
  });
  if (!read.ok) return read.failure.kind;
  const said = read.value.trimEnd();
  if (said === "(false bool)") return true;
  return said === "(true bool)" ? false : "wrong-shape";
}

// How long an answer is kept: a name an hour, none ten minutes, so a name just taken counts soon, a failure a minute.
function keptFor(named: boolean | FailureKind): number {
  if (typeof named === "string") return MINUTE;
  return named ? 60 * MINUTE : 10 * MINUTE;
}

export function makeNames({
  rpc,
  chainId,
  now,
  log,
  send = netSend,
  max = 10_000,
}: Options): (account: Address) => Promise<boolean> {
  // The Map's first account is the one read longest ago: an account is set again at each read.
  const known = new Map<string, { named: boolean; until: number }>();
  const node: Node = { rpc, chainId, send, now, seen: new Map() };
  // A failed read is logged a minute at most, its kind alone, so a node of another chain is seen (10h's review, V9).
  let quietUntil = -Infinity;
  return async (account) => {
    const at = now();
    const kept = known.get(account);
    if (kept !== undefined && kept.until > at) return kept.named;
    const named = await readName(node, account);
    if (typeof named === "string" && now() >= quietUntil) {
      quietUntil = now() + MINUTE;
      log("name_failed", { error: named.replaceAll("-", "_") });
    }
    remember(known, [account, { named: named === true, until: now() + keptFor(named) }], max);
    return named === true;
  };
}
