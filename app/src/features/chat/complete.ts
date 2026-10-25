// The composer's completion (slice 4's 4c): the word being typed at the draft's end, a command when it leads the
// draft, a room after `#`, an account after `@`, and what it may become; Tab takes the first, a space after it.
import type { Edit } from "./format.ts";

/** What a word may complete to: the commands, the world's rooms by label, the room's accounts by address. */
export interface Choices {
  commands: readonly string[];
  rooms: readonly string[];
  people: readonly string[];
}

/** The word at the draft's end, from `start`, and what it may become, five at most. */
export interface Completion {
  start: number;
  options: string[];
}

const SHOWN = 5;

// What a word led by its mark may become: a command leads the draft, spaces alone before it, as compose reads it.
function candidates(word: string, leading: boolean, choices: Choices): readonly string[] {
  if (word.startsWith("/")) return leading ? choices.commands : [];
  if (word.startsWith("#")) return choices.rooms;
  if (word.startsWith("@")) return choices.people.map((person) => `@${person}`);
  return [];
}

/** What the word at the draft's end completes to, unless nothing, or itself alone. */
export function completions(text: string, choices: Choices): Completion | undefined {
  const start = text.search(/\S*$/);
  const word = text.slice(start).toLowerCase();
  const options = candidates(word, text.slice(0, start).trim() === "", choices)
    .filter((option) => option.toLowerCase().startsWith(word))
    .slice(0, SHOWN);
  if (word === "" || options.length === 0 || (options.length === 1 && options[0]?.toLowerCase() === word))
    return undefined;
  return { start, options };
}

/** The draft, its word replaced by the first option and a space, the caret after them. */
export function completed(text: string, { start, options }: Completion): Edit {
  const result = `${text.slice(0, start)}${options[0] ?? ""} `;
  return { text: result, start: result.length, end: result.length };
}
