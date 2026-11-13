// What the bar and the suggestions do to the field, each telling the composer that the draft was worked on (`edited`).
import type { LexicalEditor } from "lexical";
import { JARVIS_MENTION } from "../jarvisLine.ts";
import { lastWord } from "../complete.ts";
import { applyLink, formatSelection, replaceWordBeforeCaret, startWith } from "./commands.ts";
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
    // The Jarvis button: its mention starts the draft, once.
    mention: (prefix: string) => {
      if (draft.startsWith(prefix)) editor.focus();
      else startWith(editor, prefix, draft);
      edited();
    },
    // A suggestion taken: the word being typed becomes it, and a space; an example for Jarvis becomes the whole draft, its caret at its end.
    take: (item: { value: string }) => {
      if (item.value.startsWith(JARVIS_MENTION)) replaceWordBeforeCaret(editor, draft.length, item.value);
      else replaceWordBeforeCaret(editor, lastWord(draft).word.length, `${item.value} `);
      edited();
    },
  };
}
