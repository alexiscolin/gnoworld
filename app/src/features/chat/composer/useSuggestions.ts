// The list of suggestions and the keys of the field (D13904): it opens while the word being typed may become something, the caret
// ends the draft and is out of code; Up and Down move in it, Enter and Tab take the picked one, Escape closes it. With none open
// Enter sends (Shift+Enter, or Enter on a finger's keyboard, adds a line: a paragraph, as every line is one), Tab moves on and
// Escape leaves the field as it is, for the reply or the edit's own Escape.
import { composing } from "@gnoworld/ui";
import { mergeRegister } from "@lexical/utils";
import {
  COMMAND_PRIORITY_HIGH,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  type LexicalEditor,
} from "lexical";
import { useEffect, useState } from "react";
import type { Suggestion } from "./suggest.ts";

interface Wanted {
  value: string;
  suggestions: readonly Suggestion[];
  caret: { end: boolean; code: boolean };
  enterAddsLine: boolean;
  onTake: (item: Suggestion) => void;
}

export function useSuggestions(editor: LexicalEditor, { value, suggestions, caret, enterAddsLine, onTake }: Wanted) {
  const [dismissed, setDismissed] = useState<string>();
  const [pick, setPick] = useState({ of: "", at: 0 });
  // A list closed by Escape stays closed for that draft alone: the draft changes, and a word typed again is a new one.
  if (dismissed !== undefined && dismissed !== value) setDismissed(undefined);
  // The picked line is the first again as the draft or the list changes.
  const key = `${value}|${suggestions.map((item) => item.value).join(" ")}`;
  const active = pick.of === key ? pick.at : 0;
  const open = suggestions.length > 0 && caret.end && !caret.code && dismissed !== value;
  const picked = open ? suggestions[active] : undefined;
  const size = suggestions.length;

  useEffect(() => {
    const move = (step: number) => {
      setPick({ of: key, at: (active + step + size) % size });
    };
    return mergeRegister(
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (event === null) return false;
          event.preventDefault();
          if (composing(event)) return true;
          if (picked !== undefined) onTake(picked);
          else if (event.shiftKey || enterAddsLine) editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
          else editor.getRootElement()?.closest("form")?.requestSubmit();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => {
          if (picked === undefined || event.shiftKey) return true;
          event.preventDefault();
          onTake(picked);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event) => {
          if (!open) return true;
          setDismissed(value);
          // The list took it: a reply or an edit stays.
          event.stopPropagation();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (event) => {
          if (!open) return false;
          event.preventDefault();
          move(1);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event) => {
          if (!open) return false;
          event.preventDefault();
          move(-1);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor, enterAddsLine, open, picked, key, active, size, value, onTake]);
  return { open, active };
}
