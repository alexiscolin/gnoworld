// The conversation a direct message's reaction or delete belongs to, and what one does to it (4d's DM bar): a TAGMSG or a
// REDACT to a nick, which dmOf, reading lines, does not take. Ergo names the target as the sender wrote it, so the line
// of mine echoed names my partner and the partner's names me.
import {
  addLines,
  addReactions,
  dmOf,
  nickOf,
  reactionOf,
  redactAfter,
  redactReactions,
  type IrcMessage,
  type Line,
  type Reaction,
} from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";

// Ergo folds A to Z alone, as core's sameName does (not exported there): a partner may write my nick in capitals (CR8).
const same = (one: string, other: string) => one.toLowerCase() === other.toLowerCase();

/** The account the other side of `message` is, or none: a room's, a guest's, one between two others or to oneself. */
export function withOf(message: IrcMessage, me: string): string | undefined {
  const { command, params, source = "" } = message;
  if (command !== "TAGMSG" && command !== "REDACT") return undefined;
  const [target = ""] = params;
  const from = nickOf(source);
  const mine = same(from, me);
  const partner = mine ? target : from;
  if (mine === same(target, me) || !Address.safeParse(me).success) return undefined;
  return Address.safeParse(partner).success ? partner : undefined;
}

/** A conversation's lines and reactions. */
export interface Held {
  lines: readonly Line[];
  reactions: readonly Reaction[] | undefined;
}

// Whether the msgid `message` names (a REDACT's) is one of a line or reaction its sender did not write: a conversation has
// no moderators, so a partner's REDACT naming one of mine changes nothing here (Ergo refuses it as well).
function forbiddenBy(message: IrcMessage) {
  const [, id = ""] = message.params;
  const sender = nickOf(message.source ?? "");
  return (each: { id: string; from?: string; who?: string }) => each.id === id && (each.from ?? each.who) !== sender;
}

/** `held` once `message` is read as a room's are, the target being the room: the same object when it changes nothing. */
export function afterAct(held: Held, message: IrcMessage, cap: number): Held {
  const target = message.params[0] ?? "";
  const forbidden = forbiddenBy(message);
  const lines = held.lines.some(forbidden) ? held.lines : redactAfter(held.lines, message, target);
  const reacted = reactionOf(message, target);
  const added = reacted === undefined ? held.reactions : addReactions(held.reactions ?? [], [reacted], cap);
  const reactions = added === undefined || added.some(forbidden) ? added : redactReactions(added, message, target);
  return lines === held.lines && reactions === held.reactions ? held : { lines, reactions };
}

/** The reactions of the conversations still held. */
export function keptWith<T>(reactions: Readonly<Record<string, T>>, held: Readonly<Record<string, unknown>>) {
  return Object.keys(reactions).every((each) => Object.hasOwn(held, each))
    ? reactions
    : Object.fromEntries(Object.entries(reactions).filter(([each]) => Object.hasOwn(held, each)));
}

/** The direct message `message` is, `me` an account and its partner one too; none otherwise. */
export function dmFor(message: IrcMessage, me: string) {
  const dm = dmOf(message, me);
  return dm !== undefined && Address.safeParse(me).success && Address.safeParse(dm.partner).success ? dm : undefined;
}

/** The conversations with the line added to its partner's, which goes last, each of the newest `lines`, the oldest heard
 * going first past `kept` conversations; none when the line is held already. */
export function afterLine(
  dms: Readonly<Record<string, readonly Line[]>>,
  { partner, line }: { partner: string; line: Line },
  { lines, kept }: { lines: number; kept: number },
) {
  const { [partner]: held = [], ...others } = dms;
  const added = addLines(held, [line], lines);
  return added === held
    ? undefined
    : { ...Object.fromEntries(Object.entries(others).slice(1 - kept)), [partner]: added };
}
