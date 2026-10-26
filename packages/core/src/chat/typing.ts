// Who is typing in a room (slice 4's 4f), from IRCv3's +typing client tag on a TAGMSG
// (ircv3.net/specs/client-tags/typing): a receiver keeps a nick typing 6 s after its active, 30 s after its paused,
// until its done, its line in the room, or its leaving. The times are the page's clock, never the line's time tag.
import type { IrcMessage } from "../irc/irc.ts";
import { nickOf, sameRoom, type Where } from "./room.ts";

/** How long a nick stays typing after its active, and after its paused (the spec's receiver rules). */
export const TYPING_ACTIVE_MS = 6_000;
export const TYPING_PAUSED_MS = 30_000;

/** Who is typing in a room: each nick, an own key, with the time its typing ends; none when nobody is. */
export type Typing = Readonly<Record<string, number>> | undefined;

const LASTS: Readonly<Record<string, number>> = { active: TYPING_ACTIVE_MS, paused: TYPING_PAUSED_MS };

// The nicks still typing at `now`, `nick` left out; none for nobody.
function kept(typing: Typing, now: number, nick?: string): Typing {
  const live = Object.entries(typing ?? {}).filter(([each, until]) => each !== nick && until > now);
  return live.length === 0 ? undefined : Object.fromEntries(live);
}

const holds = (typing: Typing, nick: string): boolean => typing !== undefined && Object.hasOwn(typing, nick);

/** The room I look at, my nick in it, and the page's clock (ms). */
export interface TypingAt extends Where {
  readonly now: number;
}

const LEAVINGS = ["QUIT", "NICK"];
const SAYINGS = ["PRIVMSG", "NOTICE", "PART"];

// Whose typing a message ends in this room: a line's or a leaving's nick there; a QUIT's or a NICK's anywhere.
function ended({ command, params, source }: IrcMessage, room: string): string | undefined {
  const [target = "", kicked] = params;
  if (LEAVINGS.includes(command)) return nickOf(source ?? "");
  if (!sameRoom(target, room)) return undefined;
  return command === "KICK" ? kicked : SAYINGS.includes(command) ? nickOf(source ?? "") : undefined;
}

// How long a +typing value keeps its nick typing; none for a done, or a value the spec has not.
const lastOf = (state: string): number | undefined => (Object.hasOwn(LASTS, state) ? LASTS[state] : undefined);

// A +typing TAGMSG to the room from another nick: its time set, or ended by its done.
function told(typing: Typing, message: IrcMessage, at: TypingAt): Typing {
  const nick = nickOf(message.source ?? "");
  const [target = ""] = message.params;
  if (!sameRoom(target, at.room) || nick === "" || nick === at.me) return typing;
  const state = message.tags.get("+typing") ?? "";
  if (state === "done") return holds(typing, nick) ? kept(typing, at.now, nick) : typing;
  const lasts = lastOf(state);
  return lasts === undefined ? typing : { ...kept(typing, at.now, nick), [nick]: at.now + lasts };
}

/** Who is typing in `at`'s room once this message is read at `at.now`: a nick's +typing sets or ends its time; its
 * line, PART, KICK, QUIT or NICK ends it; my PART or KICK ends all. A replay changes nothing; the same value comes back
 * when nothing changed, and the nicks whose time is past are dropped whenever it is written. */
export function typingAfter(typing: Typing, message: IrcMessage, at: TypingAt): Typing {
  if (message.tags.has("batch")) return typing;
  if (message.command === "TAGMSG") return told(typing, message, at);
  const gone = ended(message, at.room);
  if (gone === undefined) return typing;
  if (gone === at.me && (message.command === "PART" || message.command === "KICK")) return undefined;
  return holds(typing, gone) ? kept(typing, at.now, gone) : typing;
}

/** The nicks typing at `now`, in code-unit order. */
export function typingAt(typing: Typing, now: number): string[] {
  return Object.entries(typing ?? {})
    .filter(([, until]) => until > now)
    .map(([nick]) => nick)
    .sort((one, other) => (one < other ? -1 : one > other ? 1 : 0));
}
