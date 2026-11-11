// What a field of the composer's editor needs from React: the editor's behaviours, its changes told as Markdown, a draft set from
// outside put in it, and where the caret is (which says whether a list of suggestions may open).
import { createEmptyHistoryState, registerHistory } from "@lexical/history";
import { registerList } from "@lexical/list";
import { $generateNodesFromMarkdownString, registerMarkdownShortcuts } from "@lexical/markdown";
import { registerRichText } from "@lexical/rich-text";
import { mergeRegister } from "@lexical/utils";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  CLEAR_HISTORY_COMMAND,
  COMMAND_PRIORITY_HIGH,
  PASTE_COMMAND,
  type LexicalEditor,
} from "lexical";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { caretAtEnd, caretInCode } from "./commands.ts";
import { getMarkdown, setMarkdown, TRANSFORMERS } from "./markdownEditor.ts";
import { setMentionNames } from "./mentions.ts";

// The text a paste of plain words lands as: its Markdown, as its form. A paste with markup keeps the editor's own way, which
// reads it as the nodes the composer knows and drops the rest (an image, a table).
function $pasteMarkdown(event: ClipboardEvent | InputEvent | KeyboardEvent): boolean {
  const data = "clipboardData" in event ? event.clipboardData : null;
  if (data === null || data.types.includes("text/html") || data.types.includes("application/x-lexical-editor"))
    return false;
  const text = data.getData("text/plain");
  const selection = $getSelection();
  if (text === "" || !$isRangeSelection(selection)) return false;
  event.preventDefault();
  selection.insertNodes($generateNodesFromMarkdownString(text, TRANSFORMERS, true));
  return true;
}

/** The editor at work for `value`, which `onChange` is told the changes of as Markdown; where the caret is. */
export function useEditorField(
  editor: LexicalEditor,
  {
    value,
    onChange,
    names,
  }: { value: string; onChange: (markdown: string) => void; names: ReadonlyMap<string, string> },
) {
  // What the editor held as it started, serialised once: a render serialises nothing.
  const [started] = useState(() => getMarkdown(editor));
  const heldRef = useRef(started);
  const [caret, setCaret] = useState({ end: false, code: false });

  useEffect(() => {
    setMentionNames(editor, names);
  }, [editor, names]);

  useEffect(
    () =>
      mergeRegister(
        registerRichText(editor),
        registerList(editor),
        registerHistory(editor, createEmptyHistoryState(), 300),
        registerMarkdownShortcuts(editor, TRANSFORMERS),
        editor.registerCommand(PASTE_COMMAND, $pasteMarkdown, COMMAND_PRIORITY_HIGH),
      ),
    [editor],
  );

  // The editor's changes, told as Markdown once they change what the draft is.
  useEffect(
    () =>
      editor.registerUpdateListener(() => {
        const markdown = getMarkdown(editor);
        if (markdown !== heldRef.current) {
          heldRef.current = markdown;
          onChange(markdown);
        }
        const end = caretAtEnd(editor);
        const code = caretInCode(editor);
        setCaret((was) => (was.end === end && was.code === code ? was : { end, code }));
      }),
    [editor, onChange],
  );

  // A draft set from outside (a line sent, a refusal's words put back) replaces the editor's, the caret at its end.
  useEffect(() => {
    if (value === heldRef.current) return;
    heldRef.current = value;
    setMarkdown(editor, value);
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
    if (editor.getRootElement()?.contains(document.activeElement) === true) {
      editor.update(() => {
        $getRoot().selectEnd();
      });
    }
  }, [editor, value]);

  return caret;
}

/** The editor's root, set once for its element: a ref new at each render gave Lexical a new root each time, the caret back at the start. */
export function useRoot(editor: LexicalEditor) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    editor.setRootElement(ref.current);
    return () => {
      editor.setRootElement(null);
    };
  }, [editor]);
  return ref;
}
