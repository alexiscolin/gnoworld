// @vitest-environment jsdom
import { mentions, markdown } from "@gnoworld/core";
import { $getRoot } from "lexical";
import { describe, expect, it } from "vitest";
import { createComposerEditor, getMarkdown, setMarkdown } from "./markdownEditor.ts";
import { $createParagraphNode } from "lexical";
import { $isMentionNode, MentionNode, setMentionNames } from "./mentions.ts";

const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

// What the field draws: each piece of text, the chips (token text with the chip's style) apart.
const pieces = (draft: string, names?: Map<string, string>) => {
  const editor = createComposerEditor();
  if (names !== undefined) setMentionNames(editor, names);
  setMarkdown(editor, draft);
  return {
    editor,
    drawn: editor.getEditorState().read(() =>
      $getRoot()
        .getAllTextNodes()
        .map((node) => ($isMentionNode(node) ? `[${node.getTextContent()}]` : node.getTextContent())),
    ),
  };
};

describe("a mention in the field", () => {
  it("is drawn as a chip, by the member's name when the field knows it, else by the short address", () => {
    expect(pieces(`hi @${ALICE} and @${BOB}!`, new Map([[ALICE, "alice"]])).drawn).toEqual([
      "hi ",
      "[@alice]",
      " and ",
      "[@g1jg8m…vsqf5]",
      "!",
    ]);
  });

  it("is sent as the address, the Markdown the room reads, whatever the chip says", () => {
    const draft = `hi @${ALICE} and @${BOB}!`;
    const { editor } = pieces(draft, new Map([[ALICE, "alice"]]));
    expect(getMarkdown(editor)).toBe(draft);
    expect(mentions(markdown(getMarkdown(editor)))).toEqual([ALICE, BOB]);
  });

  it("is no chip inside a word, in code, nor for an address that is not whole", () => {
    expect(pieces(`mail@${ALICE}`).drawn).toEqual([`mail@${ALICE}`]);
    expect(pieces(`\`@${ALICE}\``).drawn).toEqual([`@${ALICE}`]);
    expect(pieces(`@${ALICE}x`).drawn).toEqual([`@${ALICE}x`]);
    expect(pieces("@g1short").drawn).toEqual(["@g1short"]);
  });

  it("carries data-mention and the address in its title in the page, the design system's look", () => {
    const editor = createComposerEditor();
    const root = document.createElement("div");
    editor.setRootElement(root);
    setMarkdown(editor, `hi @${ALICE}`);
    const chip = root.querySelector("[data-mention]");
    expect(chip?.getAttribute("title")).toBe(ALICE);
    expect(chip?.hasAttribute("style")).toBe(false);
  });

  it("goes whole at one Backspace, as a chip does", () => {
    const { editor } = pieces(`@${ALICE}`);
    expect(editor.getEditorState().read(() => $getRoot().getAllTextNodes()[0]?.getMode())).toBe("token");
  });

  // A forged clipboard of the editor's own (application/x-lexical-editor) carries any state a node has.
  it("is a chip for a whole address alone: any other text in its state is sent as the words shown", () => {
    const editor = createComposerEditor();
    editor.update(
      () => {
        const forged = new MentionNode("@Alice").setAddress("x [Click](https://evil.example/) @g1abc");
        $getRoot().clear().append($createParagraphNode().append(forged));
      },
      { discrete: true },
    );
    expect(getMarkdown(editor)).toBe("@Alice");
  });

  it("says the member of its address and no other: a name over another's address is rewritten", () => {
    const editor = createComposerEditor();
    setMentionNames(editor, new Map([[ALICE, "alice"]]));
    editor.update(
      () => {
        const forged = new MentionNode("@bob").setAddress(ALICE);
        $getRoot().clear().append($createParagraphNode().append(forged));
      },
      { discrete: true },
    );
    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe("@alice");
    expect(getMarkdown(editor)).toBe(`@${ALICE}`);
  });
});
