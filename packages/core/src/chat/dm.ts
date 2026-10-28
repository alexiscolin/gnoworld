// Direct messages (slice 4's 4e): a PRIVMSG or a NOTICE to a nick, not a room, read as a room's line is (lineOf).
// One is an account's to me, or mine to an account, as Ergo echoes it (echo-message); its partner, the other account,
// keys the conversation. A guest has none: a line with no account tag naming its nick (force-nick-equals-account) is
// no account's, and the page never shows it.
import type { IrcMessage } from "../irc/irc.ts";
import { lineOf, nickOf, sameName as sameNick, type Line } from "./room.ts";

// A room's address, its ranks' prefixes before it (STATUSMSG, irc/modes/modes.go:162, v2.19.1): @#bubble is a room's.
const ROOM = /^[~&@%+]*#/u;

/** A direct message and the account it is with, or none: a room's line, a guest's, one between two others, or one
 * to oneself. */
export function dmOf(message: IrcMessage, me: string): { partner: string; line: Line } | undefined {
  const [target = ""] = message.params;
  const from = nickOf(message.source ?? "");
  const mine = sameNick(from, me);
  if (ROOM.test(target) || mine === sameNick(target, me)) return undefined;
  const line = lineOf(message, target);
  if (line?.account === undefined || !sameNick(line.account, from)) return undefined;
  return { partner: mine ? target : from, line };
}
