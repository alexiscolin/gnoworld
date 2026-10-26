// A line's reactions (slice 4's 4d): a TAGMSG naming the line it answers, +draft/react to add and +draft/unreact to
// take back (IRCv3 draft/react), which Ergo relays, stores and replays. Anyone in a room may send one, so each part is
// checked here by hand (docs/decisions.md, 2026-10-26): one emoji of Unicode's RGI set, a msgid of one word, an
// account Ergo vouches for.
import type { IrcMessage } from "../irc/irc.ts";
import { redactAfter, sameRoom, stamp } from "./room.ts";

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
const EMOJI = /^\p{RGI_Emoji}$/v;
// A msgid a tag carries back: one word of 64 characters at most, no leading colon, nothing a tag escapes.
const MSGID = /^[^\s,:;\\][^\s,;\\]{0,63}$/u;
// The line a reaction answers: +reply, ratified, before its draft name.
const REPLY = ["+reply", "+draft/reply"];

// The first of these tags whose value holds what `fits` wants, or none.
function first(tags: IrcMessage["tags"], names: readonly string[], fits: RegExp): string | undefined {
  return names.map((name) => tags.get(name) ?? "").find((value) => fits.test(value));
}

/** A reaction the page asks for: on a line, by its msgid, one emoji, added or taken back. */
export type Reacting = Pick<Reaction, "to" | "emoji" | "on">;

/** The labelled TAGMSG that adds or takes back a reaction in a room; none for an emoji not one of RGI's set or a msgid
 * a tag cannot carry, whatever else they hold (a tag's separator, a space, a CR LF). */
export function reactionLine({ to, emoji, on }: Reacting, room: string, label: string): string | undefined {
  if (!EMOJI.test(emoji) || !MSGID.test(to)) return undefined;
  return `@label=${label};+draft/${on ? "react" : "unreact"}=${emoji};+reply=${to} TAGMSG ${room}`;
}

// The emoji added (+draft/react, else +react) or taken back (+draft/unreact), not both, or none.
function changeOf(tags: IrcMessage["tags"]): Pick<Reaction, "emoji" | "on"> | undefined {
  const [added, taken] = [first(tags, ["+draft/react", "+react"], EMOJI), first(tags, ["+draft/unreact"], EMOJI)];
  if (added !== undefined && taken !== undefined) return undefined;
  if (added !== undefined) return { emoji: added, on: true };
  return taken === undefined ? undefined : { emoji: taken, on: false };
}

/** The reaction a message carries to this room, or none: a TAGMSG with an id, a time, an account, the line it
 * answers (+reply, else +draft/reply) and one emoji added or taken back. */
export function reactionOf(message: IrcMessage, room: string): Reaction | undefined {
  const { command, params, tags } = message;
  if (command !== "TAGMSG" || !sameRoom(params[0] ?? "", room)) return undefined;
  const [marks, change, to, who] = [stamp(tags), changeOf(tags), first(tags, REPLY, MSGID), tags.get("account") ?? ""];
  if (marks === undefined || change === undefined || to === undefined || who === "") return undefined;
  return { ...marks, to, who, ...change };
}

const compare = (one: string, other: string): number => (one < other ? -1 : one > other ? 1 : 0);
const byTimeThenId = (one: Reaction, other: Reaction): number =>
  compare(one.time, other.time) || compare(one.id, other.id);
const keyOf = ({ who, to, emoji }: Reaction): string => `${who}\n${to}\n${emoji}`;

/** The room's reactions with these added: the newest of an account to a line with an emoji, a take-back included, so
 * an account repeating itself evicts no one else's; then in time order, then by id, the newest `cap` kept. */
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
  const kept = [...newest.values()].sort(byTimeThenId).slice(-cap);
  return kept.length === held.length && kept.every((reaction, at) => reaction === held[at]) ? held : kept;
}

/** The room's reactions without the one Ergo's REDACT hides, as its lines (room.ts). */
export const redactReactions = (held: readonly Reaction[], message: IrcMessage, room: string): readonly Reaction[] =>
  redactAfter(held, message, room);

/** What each line shows, by its msgid: each emoji added and not taken back, in the order first reacted, counted once
 * an account, mine said. */
export function reactionsOn(
  reactions: readonly Reaction[],
  me: string | undefined,
): ReadonlyMap<string, readonly Shown[]> {
  const lines = new Map<string, Map<string, Shown>>();
  for (const { to, emoji, who, on } of reactions) {
    if (!on) continue;
    const line = lines.get(to) ?? new Map<string, Shown>();
    const was = line.get(emoji);
    line.set(emoji, { emoji, count: (was?.count ?? 0) + 1, mine: (was?.mine ?? false) || who === me });
    lines.set(to, line);
  }
  return new Map([...lines].map(([to, line]) => [to, [...line.values()]]));
}
