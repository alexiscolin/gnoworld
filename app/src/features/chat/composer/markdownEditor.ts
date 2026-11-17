// The composer's editor, headless: the nodes it knows, the Markdown it reads and writes (the chat's subset, packages/core's
// markdown/), and the two calls that cross between a draft as a string and the editor's state. Underline is `++`, the chat's own.
import { CodeNode } from "@lexical/code-core";
import { $createLinkNode, $isLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  CODE,
  INLINE_CODE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  ORDERED_LIST,
  QUOTE,
  STRIKETHROUGH,
  UNORDERED_LIST,
  type ElementTransformer,
  type TextFormatTransformer,
  type TextMatchTransformer,
  type Transformer,
} from "@lexical/markdown";
import { QuoteNode } from "@lexical/rich-text";
import { isAddress } from "./kinds.ts";
import { MENTION, MentionNode, mentionize } from "./mentions.ts";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isParagraphNode,
  $isTextNode,
  TextNode,
  createEditor,
  type EditorThemeClasses,
  type LexicalEditor,
} from "lexical";

// The chat's reader links `https://` addresses alone, with no title: anything else a link's brackets hold stays text.
const ADDRESS = "https://[^\\s()<>\\\\]+";
const LINK: TextMatchTransformer = {
  type: "text-match",
  dependencies: [LinkNode],
  // Only an https address goes out, and never a title: a pasted link's attributes are the page's, not the writer's.
  export: (node, children) =>
    $isLinkNode(node) && isAddress(node.getURL()) ? `[${children(node)}](${node.getURL()})` : null,
  importRegExp: new RegExp(`\\[([^\\[\\]]+)\\]\\((${ADDRESS})\\)`),
  regExp: new RegExp(`\\[([^\\[\\]]+)\\]\\((${ADDRESS})\\)$`),
  trigger: ")",
  replace: (textNode, match) => {
    if (textNode.getParents().some($isLinkNode)) return;
    const link = $createLinkNode(match[2] ?? "");
    const label = $createTextNode(match[1] ?? "").setFormat(textNode.getFormat());
    link.append(label);
    textNode.replace(link);
    return label;
  },
};

// The text no format touches goes out as typed but for the marks the reader could take: an `_` between two letters, which
// the reader leaves text, goes without its backslash (`gno_call`), and so does a `*` between spaces (`2 * 3`, a quoted list's). Text after a formatted node is the editor's, which closes its tags.
const isolated = (text: string, at: number): boolean =>
  /\s|^$/.test(text[at - 1] ?? "") && /\s|^$/.test(text[at + 1] ?? "");
const INTRAWORD = /(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu;
const PLAIN: TextMatchTransformer = {
  type: "text-match",
  dependencies: [],
  regExp: /(?!)/,
  importRegExp: /(?!)/,
  export: (node) => {
    if (!$isTextNode(node) || node.getFormat() !== 0) return null;
    const before = node.getPreviousSibling();
    if ($isTextNode(before) && before.getFormat() !== 0) return null;
    // A `*` that starts a paragraph keeps its backslash: bare, with a space after it, it opens a list (a quote's or an item's
    // first `*` is the reader's text either way).
    const lineStart = before === null && $isParagraphNode(node.getParent());
    return node
      .getTextContent()
      .replaceAll(/[*~`]/g, (mark: string, at: number, text: string) =>
        mark === "*" && isolated(text, at) && !(lineStart && at === 0) ? mark : `\\${mark}`,
      )
      .replaceAll(INTRAWORD, "\\_");
  },
};

// The reader takes an empty `1. ` for words, but the editor numbers its list items by place: two of them would come back as `1.`
// and `2.`. A draft's empty ordered item stays the words typed (a typed `1. ` still opens a list).
const ORDERED: ElementTransformer = {
  ...ORDERED_LIST,
  replace: (...args: Parameters<ElementTransformer["replace"]>) => {
    const [, children, match, isImport] = args;
    const [only] = children;
    if (isImport && children.length === 1 && $isTextNode(only) && only.getTextContent().trim() === "") {
      only.setTextContent(match[0] ?? "");
      return false;
    }
    return ORDERED_LIST.replace(...args);
  },
};

const UNDERLINE: TextFormatTransformer = { type: "text-format", format: ["underline"], tag: "++" };

/** The marks the chat's reader knows, in the order the editor tries them (the first of a format is the one it writes). */
export const TRANSFORMERS: Transformer[] = [
  QUOTE,
  UNORDERED_LIST,
  ORDERED,
  CODE,
  INLINE_CODE,
  BOLD_ITALIC_STAR,
  BOLD_STAR,
  ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_UNDERSCORE,
  ITALIC_UNDERSCORE,
  UNDERLINE,
  STRIKETHROUGH,
  LINK,
  MENTION,
  PLAIN,
];

/** An editor of the composer's nodes, which holds `markdown` to start. */
export function createComposerEditor(markdown = "", theme: EditorThemeClasses = {}): LexicalEditor {
  const editor = createEditor({
    namespace: "composer",
    theme,
    nodes: [QuoteNode, ListNode, ListItemNode, LinkNode, CodeNode, MentionNode],
    onError: (error) => {
      throw error;
    },
  });
  editor.registerNodeTransform(TextNode, mentionize(editor));
  editor.registerNodeTransform(MentionNode, mentionize(editor));
  setMarkdown(editor, markdown);
  return editor;
}

/** The editor's words as the Markdown the room reads; each paragraph a line. */
export function getMarkdown(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => $convertToMarkdownString(TRANSFORMERS, undefined, true));
}

// The reader opens nothing from a tilde run of 3 or more, but the editor's `~~` would strike inside it: such a run is escaped (the
// editor unescapes `\~` on import) outside a fence, so what the editor reads is what the room reads. An escape is read first and
// left alone: `\~~~a~~` has no run.
const ESCAPE_FENCE_OR_TILDES = /\\[\s\S]|```[\s\S]*?```|~{3,}/g;
const readAsTheRoomDoes = (markdown: string): string =>
  markdown.replaceAll(ESCAPE_FENCE_OR_TILDES, (found) =>
    found.startsWith("~") ? found.replaceAll("~", "\\~") : found,
  );

/** Puts `markdown` in the editor, its marks drawn as what they mean; no history entry and no selection taken. */
export function setMarkdown(editor: LexicalEditor, markdown: string): void {
  editor.update(
    () => {
      $convertFromMarkdownString(readAsTheRoomDoes(markdown), TRANSFORMERS, undefined, true);
      // The field always holds a paragraph to type in.
      if ($getRoot().isEmpty()) $getRoot().append($createParagraphNode());
    },
    { discrete: true, tag: ["history-merge"] },
  );
}
