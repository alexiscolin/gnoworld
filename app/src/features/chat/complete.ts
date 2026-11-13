// The composer's word being typed (slice 4's 4c): the draft's last word, and the choices it may become, which the field suggests
// (composer/suggest.ts): a command when it leads the draft, a room after `#`, an account after `@`.

/** What a word may become: the commands, the world's rooms by label, the room's accounts by address. */
export interface Choices {
  commands: readonly string[];
  rooms: readonly string[];
  people: readonly string[];
  /** Whether `@room` is offered, first of the accounts: a room's composer, not a direct message's (4f-n). */
  group?: boolean;
  /** Whether `@jarvis` is offered, first of the accounts: where Jarvis can answer the account. */
  jarvis?: boolean;
  /** The questions offered once the draft is `@jarvis `, where Jarvis can answer. */
  examples?: readonly string[] | undefined;
}

/** How many suggestions are listed, at most. */
export const SHOWN = 5;
const SPACE = /\s/u;

/** The word at the text's end, and where it starts. */
export function lastWord(text: string): { start: number; word: string } {
  let start = text.length;
  while (start > 0 && !SPACE.test(text.charAt(start - 1))) start -= 1;
  return { start, word: text.slice(start) };
}
