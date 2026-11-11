// A mention in the field: an account's address, which the room reads as one (core's mentions), drawn as a chip with the member's
// name, or the short address, and written back as the address. A chip is a text node of its own, whole (token mode), that carries
// its address and draws with `data-mention`, the design system's look (base.css); the editor turns each address typed, pasted or read
// from a draft into one.
import type { TextMatchTransformer } from "@lexical/markdown";
import { Address, shortAddress } from "@gnoworld/schemas";
import { TextNode, type EditorConfig, type LexicalEditor, type LexicalNode } from "lexical";

/** A text node that is an account's mention: its words are the chip's label, its address what is sent. */
export class MentionNode extends TextNode {
  __address = "";

  override $config() {
    return this.config("mention", { extends: TextNode });
  }

  override afterCloneFrom(prev: this): void {
    super.afterCloneFrom(prev);
    this.__address = prev.__address;
  }

  getAddress(): string {
    return this.getLatest().__address;
  }

  setAddress(address: string): this {
    this.getWritable().__address = address;
    return this.setMode("token");
  }

  override createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.setAttribute("data-mention", "");
    dom.title = this.__address;
    return dom;
  }

  override updateDOM(prev: this, dom: HTMLElement, config: EditorConfig): boolean {
    dom.title = this.__address;
    return super.updateDOM(prev, dom, config);
  }
}

export const $isMentionNode = (node: LexicalNode | null | undefined): node is MentionNode =>
  node instanceof MentionNode;

// `@` after what is no letter, digit or `_`, g1 and 38 of bech32's characters, a word whole (core's MENTION).
const ADDRESS = /(?<![\p{L}\p{N}_])@(g1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38})(?![\p{L}\p{N}_])/gu;

// What each editor's chips say of its members: names by address.
const named = new WeakMap<LexicalEditor, ReadonlyMap<string, string>>();

/** Tells the editor the members' names, which a chip made from now on says in place of the short address. */
export function setMentionNames(editor: LexicalEditor, names: ReadonlyMap<string, string>): void {
  named.set(editor, names);
}

// A chip's address is trusted only whole: a clipboard of the editor's own may carry any string.
const addressOf = (node: LexicalNode): string => {
  const held = $isMentionNode(node) ? node.getAddress() : "";
  return Address.safeParse(held).success ? held : "";
};

const labelOf = (account: string, editor: LexicalEditor): string =>
  `@${named.get(editor)?.get(account) ?? shortAddress(account)}`;

const chip = (account: string, editor: LexicalEditor): MentionNode =>
  new MentionNode(labelOf(account, editor)).setAddress(account);

/** The node transform: the plain text holding an address becomes text, a chip, text; a chip says its own address's member. */
export function mentionize(editor: LexicalEditor) {
  return (node: TextNode): void => {
    const own = addressOf(node);
    if (own !== "") {
      const label = labelOf(own, editor);
      if (node.getTextContent() !== label) node.setTextContent(label);
      return;
    }
    if ($isMentionNode(node) || node.hasFormat("code") || !node.isSimpleText()) return;
    const text = node.getTextContent();
    const found = [...text.matchAll(ADDRESS)];
    if (found.length === 0) return;
    const cuts = found
      .flatMap((each) => [each.index, each.index + each[0].length])
      .filter((at) => at > 0 && at < text.length);
    const accounts = new Map(found.map((each) => [each[0], each[1] ?? ""]));
    for (const part of cuts.length === 0 ? [node] : node.splitText(...cuts)) {
      const account = accounts.get(part.getTextContent());
      if (account !== undefined) part.replace(chip(account, editor));
    }
  };
}

/** Writes a chip as the address, and reads nothing: the chips come from the node transform. */
export const MENTION: TextMatchTransformer = {
  type: "text-match",
  dependencies: [MentionNode],
  regExp: /(?!)/,
  importRegExp: /(?!)/,
  export: (node) => (addressOf(node) === "" ? null : `@${addressOf(node)}`),
};
