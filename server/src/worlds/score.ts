// Trending's score (slice 7, 7t3; Alexis, 2026-11-04, "Score relatif, chaîne + chat"): the world whose activity rises most against its own 14
// days, its chain (the transactions to its realms in the job's window, the addresses that sent them) and its rooms (people here, messages an
// hour) read together, a hub with its realms as one. A signal counts once known, at the median active world's, its side's floor met; one
// address alone, one transaction or one person never trends.
import { middleOf, riseFrom } from "@gnoworld/core";
import type { Trend } from "@gnoworld/schemas/indexer";
import type { ChatWorld } from "./present.ts";
import type { Signal } from "./presence.ts";

/** The score (Alexis, 2026-11-04): the sum of rises a world needs to trend, one signal doubling; the fewest addresses and transactions before
 * its chain's signals count, and the fewest people before its rooms' do: one address alone, one transaction, one person never trend. */
export const SCORE = { least: 1, addresses: 2, transactions: 2, people: 2 } as const;

export interface Place {
  readonly title: string;
  readonly realm: string;
}
/** A chain's signal: its pace an hour now beside its usual one, which the score reads, and the window's own count, which the floor and the
 * ticker's words read. A window's length varies with the gather and a failed pass: its pace does not. */
export interface ChainSignal extends Signal {
  readonly count: number;
}
/** A world's chain over the window between the job's last two passes, each signal beside its usual window of 14 days. */
export interface ChainWorld {
  readonly world: string;
  /** Its title and first realm; none for a world only an address names, which counts in the universe's middle and never trends. */
  readonly place: Place | undefined;
  readonly transactions: ChainSignal;
  readonly addresses: ChainSignal;
  readonly since: string;
  readonly at: string;
}
// Whether a window may count: sent by two addresses in two transactions at least; one address alone, or one transaction, never.
export const chainClears = ({ transactions, addresses }: { transactions: number; addresses: number }): boolean =>
  transactions >= SCORE.transactions && addresses >= SCORE.addresses;

type SignalName = "transactions" | "addresses" | "here" | "messages";
type Placed = ChainWorld & { readonly place: Place };
// A world as the score reads it: its named chain's window, its rooms, or both for a hub and its realms; keyed by its id, or its rooms' slug.
interface Candidate {
  readonly key: string;
  readonly chain?: Placed;
  readonly chat?: ChatWorld;
}

// Each world once: a hub's rooms read with its realms' chain, by the world hubs.json gives it (core's hubWorldOf); rooms no hub lists, the
// Earth's among them, stand alone, never with a chain's world of the same name (F4550). A world only an address names is no candidate.
function candidatesOf(
  chain: readonly ChainWorld[],
  chat: readonly ChatWorld[],
  hubs: ReadonlyMap<string, string>,
): Candidate[] {
  const joined = new Map<string, Candidate>();
  for (const world of chain)
    if (world.place !== undefined)
      joined.set(world.world, { key: world.world, chain: { ...world, place: world.place } });
  const alone: Candidate[] = [];
  for (const rooms of chat) {
    const id = hubs.get(rooms.world);
    if (id === undefined) alone.push({ key: rooms.world, chat: rooms });
    else joined.set(id, { ...joined.get(id), key: id, chat: rooms });
  }
  return [...joined.values(), ...alone];
}

// A side's floor: a chain's window that clears it, rooms with two people.
const chainCounts = ({ transactions, addresses }: ChainWorld): boolean =>
  chainClears({ transactions: transactions.count, addresses: addresses.count });
const chatCounts = ({ here }: ChatWorld): boolean => here.now >= SCORE.people;

// Each signal's middle among the worlds whose side clears its floor and where it is more than none, named or not, its habit known or not: a
// quiet world, or a peer's one-call realms, is no measure of the universe's activity.
function middlesOf(chain: readonly ChainWorld[], chat: readonly ChatWorld[]): Record<SignalName, number> {
  const middle = (values: readonly number[]): number => middleOf(values.filter((value) => value > 0)) ?? 0;
  const [chainSide, chatSide] = [chain.filter(chainCounts), chat.filter(chatCounts)];
  return {
    transactions: middle(chainSide.map(({ transactions }) => transactions.now)),
    addresses: middle(chainSide.map(({ addresses }) => addresses.now)),
    here: middle(chatSide.map(({ here }) => here.now)),
    messages: middle(chatSide.map(({ messages }) => messages.now)),
  };
}

// A world's signals in the order that breaks a tie between two equal rises, each with its side's floor (a chain sent by two addresses in two
// transactions at least, rooms with two people) and the item that would say it.
interface Said {
  readonly name: SignalName;
  readonly signal: Signal;
  readonly floor: boolean;
  readonly item: (rise: number, at: number) => Trend;
}
function signalsOf({ chain, chat }: Candidate): Said[] {
  const chainSide = (["transactions", "addresses"] as const).flatMap((name): Said[] =>
    chain === undefined
      ? []
      : [
          {
            name,
            signal: chain[name],
            floor: chainCounts(chain),
            item: (rise) => ({
              kind: "trending",
              by: name,
              world: chain.world,
              ...chain.place,
              count: chain[name].count,
              rise,
              since: chain.since,
              at: chain.at,
            }),
          },
        ],
  );
  const chatSide = (["here", "messages"] as const).flatMap((name): Said[] =>
    chat === undefined
      ? []
      : [
          {
            name,
            signal: chat[name],
            floor: chatCounts(chat),
            item: (rise, at) => ({
              kind: "trending",
              by: name,
              world: chat.world,
              count: chat[name].now,
              rise,
              at: new Date(at).toISOString(),
            }),
          },
        ],
  );
  return [...chainSide, ...chatSide];
}

/** A world's score: the sum of the rises of its signals that count, each against its own usual, a fall as none, unweighted, for each rise is
 * already a share of the world's own habit and no signal's unit outweighs another's; and its strongest. A signal counts once its habit is
 * known, at the universe's middle at least, its side's floor met. */
function scoreOf(
  candidate: Candidate,
  middles: Record<SignalName, number>,
): { score: number; best?: { said: Said; rise: number } } {
  let score = 0;
  let best: { said: Said; rise: number } | undefined;
  for (const said of signalsOf(candidate)) {
    const { now, usual } = said.signal;
    if (usual === null || now < middles[said.name] || !said.floor) continue;
    const rise = riseFrom(now, usual);
    if (rise <= 0) continue;
    score += rise;
    if (best === undefined || rise > best.rise) best = { said, rise };
  }
  return best === undefined ? { score } : { score, best };
}

/** The world with the highest score from SCORE.least, the first by key among equals: its strongest signal's item, and its rooms' slug. */
export function trendingOf(
  {
    chain,
    chat,
    hubs,
  }: { chain: readonly ChainWorld[]; chat: readonly ChatWorld[]; hubs: ReadonlyMap<string, string> },
  at: number,
): { item: Trend; rooms: string | undefined } | undefined {
  const middles = middlesOf(chain, chat);
  let top: { candidate: Candidate; score: number; said: Said; rise: number } | undefined;
  for (const candidate of candidatesOf(chain, chat, hubs)) {
    const { score, best } = scoreOf(candidate, middles);
    if (best === undefined || score < SCORE.least) continue;
    if (top === undefined || score > top.score || (score === top.score && candidate.key < top.candidate.key))
      top = { candidate, score, ...best };
  }
  return top === undefined ? undefined : { item: top.said.item(top.rise, at), rooms: top.candidate.chat?.world };
}
