// A line's reactions (slice 4's 4d): a TAGMSG naming the line it answers, +draft/react to add and +draft/unreact to
// take back (IRCv3 draft/react), which Ergo relays, stores and replays. Anyone in a room may send one, so each part is
// checked here by hand (docs/decisions.md, 2026-10-26): one emoji of Unicode's RGI set, a msgid of one word, an
// account Ergo vouches for.
import type { IrcMessage } from "../irc/irc.ts";
import { first, isTagMsgid, redactAfter, REPLY, sameName, stamp } from "./room.ts";

/** One account's reaction to a line, added or taken back, as Ergo marked it. */
export interface Reaction {
  /** The TAGMSG's own msgid: what a page brought again dedupes on, and what a REDACT names. */
  readonly id: string;
  readonly time: string;
  /** The msgid of the line it answers. */
  readonly to: string;
  readonly emoji: string;
  /** The account Ergo vouches for: a guest's reaction is none. */
  readonly who: string;
  /** Added, or taken back. */
  readonly on: boolean;
}

/** What a line shows of one emoji: how many accounts reacted with it, and whether I am one. */
export interface Shown {
  readonly emoji: string;
  readonly count: number;
  readonly mine: boolean;
}

// One emoji of RGI's set, whole: a sequence (a skin tone, a ZWJ family, a flag, a keycap) is one.
const isEmoji = (value: string): boolean => /^\p{RGI_Emoji}$/v.test(value);

/** A reaction the page asks for: on a line, by its msgid, one emoji, added or taken back. */
export type Reacting = Pick<Reaction, "to" | "emoji" | "on">;

/** The labelled TAGMSG that adds or takes back a reaction in a room; none for an emoji not one of RGI's set or a msgid
 * a tag cannot carry, whatever else they hold (a tag's separator, a space, a CR LF). */
export function reactionLine({ to, emoji, on }: Reacting, room: string, label: string): string | undefined {
  if (!isEmoji(emoji) || !isTagMsgid(to)) return undefined;
  return `@label=${label};+draft/${on ? "react" : "unreact"}=${emoji};+reply=${to} TAGMSG ${room}`;
}

// The emoji added (+draft/react, else +react) or taken back (+draft/unreact), not both, or none.
function changeOf(tags: IrcMessage["tags"]): Pick<Reaction, "emoji" | "on"> | undefined {
  const [added, taken] = [first(tags, ["+draft/react", "+react"], isEmoji), first(tags, ["+draft/unreact"], isEmoji)];
  if (added !== undefined && taken !== undefined) return undefined;
  if (added !== undefined) return { emoji: added, on: true };
  return taken === undefined ? undefined : { emoji: taken, on: false };
}

/** The reaction a message carries to this room, or none: a TAGMSG with an id, a time, an account, the line it
 * answers (+reply, else +draft/reply) and one emoji added or taken back. */
export function reactionOf(message: IrcMessage, room: string): Reaction | undefined {
  const { command, params, tags } = message;
  if (command !== "TAGMSG" || !sameName(params[0] ?? "", room)) return undefined;
  const [marks, change, to, who] = [
    stamp(tags),
    changeOf(tags),
    first(tags, REPLY, isTagMsgid),
    tags.get("account") ?? "",
  ];
  if (marks === undefined || change === undefined || to === undefined || who === "") return undefined;
  return { ...marks, to, who, ...change };
}

const compare = (one: string, other: string): number => (one < other ? -1 : one > other ? 1 : 0);
const byTimeThenId = (one: Reaction, other: Reaction): number =>
  compare(one.time, other.time) || compare(one.id, other.id);
const keyOf = ({ who, to, emoji }: Reaction): string => `${who}\n${to}\n${emoji}`;

// The newest `share` of each account's reactions, in time order: one account's flood keeps its own place alone.
function sharesOf(reactions: readonly Reaction[], share: number): readonly Reaction[] {
  const counts = new Map<string, number>();
  const kept: Reaction[] = [];
  for (const reaction of reactions.toReversed()) {
    const count = counts.get(reaction.who) ?? 0;
    if (count >= share) continue;
    counts.set(reaction.who, count + 1);
    kept.push(reaction);
  }
  return kept.reverse();
}

/** How much of a room's window one account's reactions fill at most: a fifth, so five accounts each reacting to all of
 * a window's 200 lines are kept (R2), and one account's reactions to lines no one sees fill no one else's place (the
 * security review's S3). */
const SHARE = 5;

/** The room's reactions with these added: the newest of an account to a line with an emoji, a take-back included, so
 * an account repeating itself evicts no one else's; each account's newest fifth of `cap` (SHARE); then in time order,
 * then by id, the newest `cap` kept. */
export function addReactions(
  held: readonly Reaction[],
  incoming: readonly Reaction[],
  cap: number,
): readonly Reaction[] {
  if (!Number.isInteger(cap) || cap < 1) throw new RangeError("addReactions: the cap is a whole number, 1 or more");
  const ids = new Set(held.map(({ id }) => id));
  const newest = new Map(held.map((reaction) => [keyOf(reaction), reaction]));
  let changed = false;
  for (const reaction of incoming) {
    const was = newest.get(keyOf(reaction));
    if (ids.has(reaction.id) || (was !== undefined && byTimeThenId(was, reaction) >= 0)) continue;
    newest.set(keyOf(reaction), reaction);
    ids.add(reaction.id);
    changed = true;
  }
  if (!changed) return held;
  const kept = sharesOf([...newest.values()].sort(byTimeThenId), Math.ceil(cap / SHARE)).slice(-cap);
  return kept.length === held.length && kept.every((reaction, at) => reaction === held[at]) ? held : kept;
}

/** The room's reactions without the one Ergo's REDACT hides, as its lines (room.ts). */
export const redactReactions = (held: readonly Reaction[], message: IrcMessage, room: string): readonly Reaction[] =>
  redactAfter(held, message, room);

// One more account with `emoji` on a line, the emoji mine once any of them is.
function tally(line: Map<string, Shown>, emoji: string, mine: boolean): void {
  const was = line.get(emoji);
  line.set(emoji, { emoji, count: (was?.count ?? 0) + 1, mine: (was?.mine ?? false) || mine });
}

/** What each line shows, by its msgid: each emoji added and not taken back, counted once an account, mine said; the
 * most reacted first, then in the order first reacted (the security review's S4: one account's lone emoji put no
 * shared one out of sight). `lineOf` names the line a reaction's msgid belongs to, a folded edit's own to its line. */
export function reactionsOn(
  reactions: readonly Reaction[],
  me: string | undefined,
  lineOf: (id: string) => string = (id) => id,
): ReadonlyMap<string, readonly Shown[]> {
  const lines = new Map<string, Map<string, Shown>>();
  // Once an account on a line with an emoji, whichever msgid of the line it named (a folded edit's, CR5).
  const counted = new Set<string>();
  for (const { to: named, emoji, who, on } of reactions) {
    const to = lineOf(named);
    const key = `${to}\n${emoji}\n${who}`;
    if (!on || counted.has(key)) continue;
    counted.add(key);
    const line = lines.get(to) ?? new Map<string, Shown>();
    tally(line, emoji, who === me);
    lines.set(to, line);
  }
  return new Map(
    [...lines].map(([to, line]) => [to, [...line.values()].sort((one, other) => other.count - one.count)]),
  );
}
