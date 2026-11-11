// The name of an account on one chain (9f), read live from r/sys/users with the block it was read at, and the name the page shows:
// mainnet's, else Onyx's, else the short address. The expressions are fixed ones over an address the schema proved (as
// server/src/door/names.ts does, D92), built by evalCall.ts's `userCall` (D283). `ResolveAddress` gives nil for a
// missing or deleted record, which `.Name()` would panic on, so `IsDeleted` is asked first (a nil receiver answers true).
import { isName } from "@gnoworld/core";
import { readHeight } from "@gnoworld/chain/node";
import { Address, shortAddress } from "@gnoworld/schemas";
import { failedRead, sourceOf, type ChainRead, type ReadOptions } from "@gnoworld/chain/read";
import { readUser } from "./rpc.ts";

export const MAINNET_CHAIN = "gnoland-1";
export const ONYX_CHAIN = "onyx-1";

export interface Named {
  chainId: string;
  /** The account's name, or null when the chain has none for it. */
  name: string | null;
  /** The chain's height just before the name was read: the name is as of this block or a later one (a vm query carries no height). */
  height: number;
}

// A name as r/sys/users keeps one (core's `isName`): legacy names such as `aeddi` pass, so `nym-` is not assumed. Text a node sent
// that is not of this form is never shown.

// The record is asked about first: a missing or deleted one has no name to ask for, and its `Name` would panic.
async function nameOf(rpc: string, account: string, options: ReadOptions): Promise<ChainRead<string | null>> {
  const deleted = await readUser(rpc, { account, call: "IsDeleted" }, options);
  if (!deleted.ok) return deleted;
  const said = deleted.value.trimEnd();
  if (said === "(true bool)") return { ok: true, value: null, source: deleted.source };
  if (said !== "(false bool)") return failedRead("wrong-shape", deleted.source);
  const read = await readUser(rpc, { account, call: "Name" }, options);
  if (!read.ok) return read;
  const name = /^\("(.*)" string\)$/s.exec(read.value.trimEnd())?.[1];
  return name !== undefined && isName(name)
    ? { ok: true, value: name, source: read.source }
    : failedRead("wrong-shape", read.source);
}

/** A chain and the node it is read on. */
export interface Chain {
  chainId: string;
  rpc: string;
}

/** The name of `account` on the chain `chainId` at `rpc`, or why it could not be read: a failure is never a no-name. A `height` given is
 * the block it is read at, and the node is not asked for one. */
export async function readName(
  rpc: string,
  { chainId, account, height }: { chainId: string; account: string; height?: number },
  options: ReadOptions = {},
): Promise<ChainRead<Named>> {
  // Nothing is asked for what is no address, and nothing of a node that is not the universe's chain (D118).
  if (!Address.safeParse(account).success) return failedRead("bad-name", sourceOf(rpc, options));
  const at = await blockOf(rpc, { chainId, given: height }, options);
  if (!at.ok) return at;
  const read = await nameOf(rpc, account, options);
  if (!read.ok) return read;
  return { ok: true, value: { chainId, name: read.value, height: at.value }, source: at.source ?? read.source };
}

// The block a name is read at: the one given by a caller reading many accounts of a chain (the composer's member names), else the
// node's own.
async function blockOf(
  rpc: string,
  { chainId, given }: { chainId: string; given: number | undefined },
  options: ReadOptions,
): Promise<
  { ok: true; value: number; source?: ChainRead<never>["source"] } | Extract<ChainRead<never>, { ok: false }>
> {
  if (given !== undefined) return { ok: true, value: given };
  const at = await readHeight(rpc, { ...options, chainId });
  return at.ok ? { ok: true, value: at.value.height, source: at.source } : at;
}

/** What the account control shows: a name with the chain and block it was read on, or the short address. */
export interface Shown {
  text: string;
  from: string;
  height: number | undefined;
}

/** Mainnet's name, else Onyx's, else the short address. A read of another chain in a slot is not that slot's: a name is taken only
 * from the chain it was read on. */
export function shownName(
  account: string,
  { mainnet, onyx }: { mainnet?: Named | undefined; onyx?: Named | undefined },
): Shown {
  const found = [
    [mainnet, MAINNET_CHAIN],
    [onyx, ONYX_CHAIN],
  ] as const;
  for (const [read, chain] of found)
    if (read?.chainId === chain && read.name !== null) return { text: read.name, from: chain, height: read.height };
  return { text: shortAddress(account), from: "address", height: undefined };
}
