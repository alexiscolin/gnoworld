// The composer's completion (slice 4's 4c): the word being typed at the draft's end, a command when it leads the
// draft, a room after `#`, an account after `@`, and what it may become; Tab takes the first, a space after it.
import type { Edit } from "./format.ts";

/** What a word may complete to: the commands, the world's rooms by label, the room's accounts by address. */
export interface Choices {
  commands: readonly string[];
  rooms: readonly string[];
  people: readonly string[];
  /** Whether `@room` is offered, first of the accounts: a room's composer, not a direct message's (4f-n). */
  group?: boolean;
}

/** The word at the draft's end, from `start`, and what it may become, five at most. */
export interface Completion {
  start: number;
  options: string[];
}

const SHOWN = 5;
const SPACE = /\s/u;

// What a word led by its mark may become, one by one: a command leads the draft, spaces alone before it, as compose
// reads it.
function* candidates(word: string, leading: boolean, choices: Choices): Generator<string> {
  if (word.startsWith("/")) {
    if (leading) yield* choices.commands;
  } else if (word.startsWith("#")) {
    yield* choices.rooms;
  } else if (word.startsWith("@")) {
    // After a letter: a bare @ lists the accounts alone.
    if (choices.group === true && word.length > 1) yield "@room";
    for (const person of choices.people) yield `@${person}`;
  }
}

/** What the word at the draft's end completes to, unless nothing, or itself alone. */
export function completions(text: string, choices: Choices): Completion | undefined {
  let start = text.length;
  while (start > 0 && !SPACE.test(text.charAt(start - 1))) start -= 1;
  const word = text.slice(start).toLowerCase();
  const options: string[] = [];
  for (const option of candidates(word, text.slice(0, start).trim() === "", choices)) {
    if (options.length === SHOWN) break;
    if (option.toLowerCase().startsWith(word)) options.push(option);
  }
  if (options.length === 0 || (options.length === 1 && options[0]?.toLowerCase() === word)) return undefined;
  return { start, options };
}

/** The draft, its word replaced by the first option and a space, the caret after them. */
export function completed(text: string, { start, options }: Completion): Edit {
  const result = `${text.slice(0, start)}${options[0] ?? ""} `;
  return { text: result, start: result.length, end: result.length };
}
