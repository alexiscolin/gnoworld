// What the format bar and a completion do to the editor, in place: the selection formatted as what it is, never wrapped in marks.
import { $createLinkNode, $toggleLink } from "@lexical/link";
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListNode,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { $createQuoteNode, $isQuoteNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { $getNearestNodeOfType } from "@lexical/utils";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  FORMAT_TEXT_COMMAND,
  type LexicalEditor,
  type TextFormatType,
} from "lexical";
import { isAddress, type Format } from "./kinds.ts";

const MARKS: Partial<Record<Format, TextFormatType>> = {
  bold: "bold",
  italic: "italic",
  underline: "underline",
  strike: "strikethrough",
  code: "code",
};

/** The list the caret is in, if any, as its type. */
function listAt(editor: LexicalEditor): "bullet" | "number" | undefined {
  return editor.getEditorState().read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return undefined;
    const list = $getNearestNodeOfType(selection.anchor.getNode(), ListNode);
    const type = $isListNode(list) ? list.getListType() : undefined;
    return type === "bullet" || type === "number" ? type : undefined;
  });
}

/** Applies a format of the bar to the selection: a mark, a quote or a list, each taken off when it is already there. The
 * link is the bar's popover's (applyLink). */
export function formatSelection(editor: LexicalEditor, format: Format): void {
  editor.focus();
  const mark = MARKS[format];
  if (mark !== undefined) {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, mark);
  } else if (format === "quote") {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const quoted = $isQuoteNode(selection.anchor.getNode().getTopLevelElement());
      $setBlocksType(selection, () => (quoted ? $createParagraphNode() : $createQuoteNode()));
    });
  } else if (format === "bulleted" || format === "numbered") {
    const type = format === "bulleted" ? "bullet" : "number";
    const insert = format === "bulleted" ? INSERT_UNORDERED_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND;
    editor.dispatchCommand(listAt(editor) === type ? REMOVE_LIST_COMMAND : insert, undefined);
  }
}

/** Makes the selection a link to `address`; a caret in none makes the address itself the link. */
export function applyLink(editor: LexicalEditor, address: string): void {
  editor.focus();
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !isAddress(address)) return;
    if (selection.isCollapsed()) {
      const link = $createLinkNode(address);
      link.append($createTextNode(address));
      selection.insertNodes([link]);
    } else {
      $toggleLink(address);
    }
  });
}

/** Whether the caret ends the draft: collapsed after the last character. */
export function caretAtEnd(editor: LexicalEditor): boolean {
  return editor.getEditorState().read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
    const last = $getRoot().getLastDescendant();
    if (last === null) return true;
    const { anchor } = selection;
    const node = anchor.getNode();
    if ($isTextNode(node)) return node.is(last) && anchor.offset === node.getTextContentSize();
    return $isElementNode(node) && anchor.offset === node.getChildrenSize() && (node.is(last) || node.isParentOf(last));
  });
}

/** Whether the caret is in code: an inline span or a block, where `@` and `/` are text. */
export function caretInCode(editor: LexicalEditor): boolean {
  return editor.getEditorState().read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return false;
    return selection.hasFormat("code") || selection.anchor.getNode().getTopLevelElement()?.getType() === "code";
  });
}

/** Replaces the `length` characters before the caret (the word being typed) with `text`. */
export function replaceWordBeforeCaret(editor: LexicalEditor, length: number, text: string): void {
  editor.focus();
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
    const { anchor } = selection;
    const node = anchor.getNode();
    if (!$isTextNode(node)) return;
    const from = anchor.offset - length;
    if (from < 0) return;
    node.spliceText(from, length, text, true);
  });
}
