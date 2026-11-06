// One transaction row of the indexer's answer (slice 9g) read into the events a room shows. Outside data: every row through Zod with
// caps; the filter the server asks for lets other messages through, so each message's realm and function are checked again here;
// what a transaction's args or memo hold never leaves this file.
import { ChainEvent } from "@gnoworld/schemas/indexer";
import { z } from "zod";

/** A watched realm's world, and the functions the world's filter asks for (none: every function). */
export interface Watched {
  world: string;
  funcs?: ReadonlySet<string>;
}

export interface ChainContext {
  universe: string;
  /** The realms a universe watches, by path. */
  watch: ReadonlyMap<string, Watched>;
  log: (what: "chain_message_bad") => void;
}

/** What one row told: the events for the rooms and the transaction's hash, or (made by the poll) a block's height and time, a transaction having none. */
export interface ChainRead {
  events: ChainEvent[];
  hash?: string;
  block?: { height: number; time: string };
  /** The chain's newest height, read by a poll round. */
  tip?: number;
}

const MAX_MESSAGES = 1000;
const NOTHING: ChainRead = { events: [] };

// What a transaction holds, each part as the indexer gives it; Zod's own object drops the fields not named.
function schemas() {
  const whole = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
  return {
    tx: z.object({
      hash: z.string().max(128),
      block_height: whole,
      success: z.boolean(),
      messages: z.array(z.unknown()).max(MAX_MESSAGES),
    }),
    message: z.object({ value: z.object({ __typename: z.string() }).loose() }),
    call: z.object({ caller: z.string(), pkg_path: z.string(), func: z.string() }),
    add: z.object({ creator: z.string(), package: z.object({ path: z.string() }) }),
  };
}

type Schemas = ReturnType<typeof schemas>;

// The event a message would be, unchecked: a call to a watched realm (and a function the world asks for), or a deploy of a realm
// (a pure package, /p/, is no realm: nothing, and no fault). `undefined` is nothing; `null` is a message of a kind that fails.
function eventOf(
  value: { __typename: string },
  context: ChainContext,
  parts: Schemas,
): Record<string, unknown> | null | undefined {
  const base = { universe: context.universe };
  if (value.__typename === "MsgCall") {
    const call = parts.call.safeParse(value);
    if (!call.success) return null;
    const watched = context.watch.get(call.data.pkg_path);
    if (watched === undefined || (watched.funcs && !watched.funcs.has(call.data.func))) return undefined;
    const { caller: actor, pkg_path: realm, func } = call.data;
    return { ...base, kind: "call", world: watched.world, realm, func, actor };
  }
  if (value.__typename !== "MsgAddPackage") return undefined;
  const add = parts.add.safeParse(value);
  if (!add.success) return null;
  if (add.data.package.path.startsWith("gno.land/p/")) return undefined;
  return { ...base, kind: "deploy", realm: add.data.package.path, actor: add.data.creator };
}

// The events of a transaction's messages, in order: a message of no kind the rooms show is no event, one that is of a kind
// and fails its schema is said.
function eventsOf(tx: z.infer<Schemas["tx"]>, context: ChainContext, parts: Schemas): ChainEvent[] {
  if (!tx.success) return [];
  const events: ChainEvent[] = [];
  for (const [at, each] of tx.messages.entries()) {
    const message = parts.message.safeParse(each);
    const event = message.success ? eventOf(message.data.value, context, parts) : null;
    if (event === undefined) continue;
    const checked = ChainEvent.safeParse({ id: `${tx.hash}:${String(at)}`, ...event, height: tx.block_height });
    if (checked.success) events.push(checked.data);
    else context.log("chain_message_bad");
  }
  return events;
}

/** One row read; a row that fails its schema is dropped and said, one that is no business of a room is silent. */
export function readChainRow(row: unknown, context: ChainContext): ChainRead {
  const parts = schemas();
  const tx = parts.tx.safeParse(row);
  if (!tx.success) {
    context.log("chain_message_bad");
    return NOTHING;
  }
  return { events: eventsOf(tx.data, context, parts), hash: tx.data.hash };
}
