// What the bar and the suggestions do to the field, each telling the composer that the draft was worked on (`edited`).
import type { LexicalEditor } from "lexical";
import { lastWord } from "../complete.ts";
import { applyLink, formatSelection, replaceWordBeforeCaret } from "./commands.ts";
import type { Format } from "./kinds.ts";

export function actsOf(editor: LexicalEditor, draft: string, edited: () => void) {
  return {
    format: (kind: Format) => {
      formatSelection(editor, kind);
      edited();
    },
    link: (address: string) => {
      applyLink(editor, address);
      edited();
    },
    // A suggestion taken: the word being typed becomes it, and a space.
    take: (item: { value: string }) => {
      replaceWordBeforeCaret(editor, lastWord(draft).word.length, `${item.value} `);
      edited();
    },
  };
}
