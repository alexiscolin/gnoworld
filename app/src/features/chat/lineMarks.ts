// What a room's lines show beyond their words (8d): a poll's votes (core's poll.ts) and an account's first words, the video's
// "new here" (frame 56). Apart from Lines.tsx, which draws them.
import { POLL_KEYS, pollOf, votesOn, type Reaction, type Shown, type ShownLine } from "@gnoworld/core";
import { LINES_KEPT } from "../../store/chat.ts";
import { votesString } from "./PollView.tsx";
import { chipsOf } from "./Reactions.tsx";

interface Room {
  lines: readonly ShownLine[];
  reactions: readonly Reaction[];
  me: string | undefined;
  lineOf: (id: string) => string;
}

/** Each poll line's votes as votesString writes them, by msgid.
 * ponytail: one pass over the reactions a poll, a room's window holding 200 lines and 1,000 reactions at most. */
export function votesOf({ lines, reactions, me, lineOf }: Room): ReadonlyMap<string, string> {
  const votes = new Map<string, string>();
  for (const line of lines) {
    const poll = pollOf(line.text);
    if (poll !== undefined)
      votes.set(line.id, votesString(votesOn(reactions, { to: line.id, answers: poll.answers.length, me, lineOf })));
  }
  return votes;
}

const NO_FIRSTS: ReadonlySet<string> = new Set();

/** The lines that are an account's first words in the room: only once its history page came and the window holds fewer lines
 * than it keeps, so an older line of theirs cannot be out of view (Ergo's ring permitting). */
export function firstWordsOf(
  lines: readonly ShownLine[],
  { room, paged }: { room: string | undefined; paged: boolean },
) {
  if (room === undefined || !paged || lines.length >= LINES_KEPT) return NO_FIRSTS;
  const seen = new Set<string>();
  const firsts = new Set<string>();
  for (const { id, account, kind } of lines) {
    if (account === undefined || kind === "notice" || seen.has(account)) continue;
    seen.add(account);
    firsts.add(id);
  }
  return firsts;
}

/** Each line's chips as a string a line compares by value (F1222); a poll's keycaps are its bars, never chips too. */
export const chipsOn = (
  shown: ReadonlyMap<string, readonly Shown[]>,
  votes: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> =>
  new Map(
    [...shown].map(([id, each]) => [
      id,
      chipsOf(votes.has(id) ? each.filter(({ emoji }) => !POLL_KEYS.includes(emoji)) : each),
    ]),
  );
