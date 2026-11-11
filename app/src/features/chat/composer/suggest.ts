// What the field suggests as one types (D13904): the commands at its start, the rooms after `#`, the members after `@`, each
// narrowed by the letters typed. The word is complete.ts's (the draft's last); a member goes by name when it has one.
import { shortAddress } from "@gnoworld/schemas";
import { lastWord, SHOWN, type Choices } from "../complete.ts";

/** One line of the list: what the word becomes, what it is called, and a word more on it. */
export interface Suggestion {
  value: string;
  label: string;
  hint?: string;
}

const USES: Readonly<Record<string, string>> = {
  "/me": "Send an action: /me waves",
  "/poll": "Ask a poll: /poll Question? | answer | answer",
  "/market": "Show the prices here: /market gnot, atone or btc",
};

/** The members' names by address, for those who have one. */
type Names = ReadonlyMap<string, string>;

const plain = (value: string, hint?: string): Suggestion => ({
  value,
  label: value,
  ...(hint === undefined ? {} : { hint }),
});

function person(address: string, names: Names): Suggestion {
  const name = names.get(address);
  const short = shortAddress(address);
  return name === undefined
    ? { value: `@${address}`, label: short }
    : { value: `@${address}`, label: name, hint: short };
}

// The members whose name or address the word begins; @room first after a letter, in a room that has one.
function members(word: string, { people, group, names }: Choices & { names: Names }): Suggestion[] {
  const found = people
    .filter(
      (address) => `@${address}`.startsWith(word) || `@${names.get(address) ?? ""}`.toLowerCase().startsWith(word),
    )
    .map((address) => person(address, names));
  return group === true && word.length > 1 && "@room".startsWith(word)
    ? [plain("@room", "Everyone here"), ...found]
    : found;
}

/** What the word at the draft's end may become, five at most; none when it is already one of them. */
export function suggestions(draft: string, choices: Choices & { names?: Names | undefined }): Suggestion[] {
  const { start, word: typed } = lastWord(draft);
  const word = typed.toLowerCase();
  const leading = draft.slice(0, start).trim() === "";
  let found: Suggestion[] = [];
  if (word.startsWith("/") && leading) {
    found = choices.commands
      .filter((command) => command.startsWith(word))
      .map((command) => plain(command, USES[command]));
  } else if (word.startsWith("#")) {
    found = choices.rooms.filter((room) => room.toLowerCase().startsWith(word)).map((room) => plain(room));
  } else if (word.startsWith("@")) {
    found = members(word, { ...choices, names: choices.names ?? new Map() });
  }
  const list = found.slice(0, SHOWN);
  return list.length === 1 && list[0]?.value.toLowerCase() === word ? [] : list;
}
