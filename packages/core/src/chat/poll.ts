// A poll in a room (slice 8's 8d; the video's frames 68 to 76): a line of text any IRC client reads, a question after the
// chart mark and one answer a line after its keycap, whose votes are the line's reactions with those keycaps (+draft/react,
// which Ergo relays, stores and replays: deploy/ergo/ircd.yaml.tmpl's tagmsg-storage). One vote an account: its newest
// keycap still on. Nothing new on the wire, so no server keeps a count: each page counts what its room's window holds.
import type { Reaction } from "./reactions.ts";

/** The mark a poll's first line starts with, its question after a space. */
const POLL_MARK = "📊";
/** The keycaps of a poll's answers, in order: nine at most. */
export const POLL_KEYS: readonly string[] = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
/** The fewest answers a poll offers. */
const POLL_LEAST = 2;

export interface Poll {
  readonly question: string;
  readonly answers: readonly string[];
}

/** The text a poll sends: its question after the mark, then each answer after its keycap, a line each. */
export const pollText = ({ question, answers }: Poll): string =>
  [`${POLL_MARK} ${question}`, ...answers.map((answer, at) => `${POLL_KEYS[at] ?? ""} ${answer}`)].join("\n");

/** What `/poll` was given, `Question? | an answer | another`, as a poll; none for fewer than two answers or more than nine,
 * an empty question or answer. */
export function pollAsked(given: string): Poll | undefined {
  const [question = "", ...answers] = given.split("|").map((part) => part.replaceAll(/\s+/gu, " ").trim());
  const fits = answers.length >= POLL_LEAST && answers.length <= POLL_KEYS.length;
  return question === "" || !fits || answers.includes("") ? undefined : { question, answers };
}

/** The poll a line's text is, or none: the mark and a question, then two to nine answers, each after its own keycap in order. */
export function pollOf(text: string): Poll | undefined {
  const [head = "", ...rest] = text.split("\n");
  if (!head.startsWith(`${POLL_MARK} `)) return undefined;
  const question = head.slice(POLL_MARK.length + 1).trim();
  if (question === "" || rest.length < POLL_LEAST || rest.length > POLL_KEYS.length) return undefined;
  const answers: string[] = [];
  for (const [at, line] of rest.entries()) {
    const key = `${POLL_KEYS[at] ?? ""} `;
    const answer = line.startsWith(key) ? line.slice(key.length).trim() : "";
    if (answer === "") return undefined;
    answers.push(answer);
  }
  return { question, answers };
}

/** A poll's votes: how many for each answer, in order, and the reader's answer by its index, none when it has not voted. */
export interface Votes {
  readonly counts: readonly number[];
  readonly mine: number | undefined;
}

// Whether `one` came after `other`: by Ergo's time, then by msgid, as the room orders its reactions.
const later = (one: Reaction, other: Reaction | undefined): boolean =>
  other === undefined || other.time < one.time || (other.time === one.time && other.id < one.id);

// The newest of `reactions` by `key`, each key once.
function newestBy(reactions: Iterable<Reaction>, key: (reaction: Reaction) => string): Map<string, Reaction> {
  const newest = new Map<string, Reaction>();
  for (const reaction of reactions) {
    if (later(reaction, newest.get(key(reaction)))) newest.set(key(reaction), reaction);
  }
  return newest;
}

/** The votes on the poll line `to` of `answers` answers: each account's newest keycap reaction still on, once; a reaction's
 * line named through `lineOf`, a folded edit's own msgid reaching its line. */
export function votesOn(
  reactions: readonly Reaction[],
  {
    to,
    answers,
    me,
    lineOf = (id) => id,
  }: { to: string; answers: number; me: string | undefined; lineOf?: (id: string) => string },
): Votes {
  const keys = POLL_KEYS.slice(0, answers);
  const mine = reactions.filter((reaction) => lineOf(reaction.to) === to && keys.includes(reaction.emoji));
  // Each account's newest with each keycap, then its newest still on: its vote.
  const each = newestBy(mine, ({ who, emoji }) => `${who}\n${emoji}`);
  const vote = newestBy(
    [...each.values()].filter(({ on }) => on),
    ({ who }) => who,
  );
  const counts = keys.map((key) => [...vote.values()].filter(({ emoji }) => emoji === key).length);
  const own = me === undefined ? undefined : vote.get(me);
  return { counts, mine: own === undefined ? undefined : keys.indexOf(own.emoji) };
}

/** The reactions that move the reader's vote to `answer`: its old keycap taken back first, the new one added; on its own
 * answer, the vote taken back alone. */
export function revote(
  { mine }: Pick<Votes, "mine">,
  answer: number,
): readonly { readonly emoji: string; readonly on: boolean }[] {
  const old = mine === undefined ? undefined : POLL_KEYS[mine];
  const next = POLL_KEYS[answer];
  if (next === undefined) return [];
  if (mine === answer) return [{ emoji: next, on: false }];
  return [...(old === undefined ? [] : [{ emoji: old, on: false }]), { emoji: next, on: true }];
}
