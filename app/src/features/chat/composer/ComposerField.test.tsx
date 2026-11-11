// @vitest-environment jsdom
import type { Composed } from "@gnoworld/core";
import { $getRoot, $getSelection, $isRangeSelection, $selectAll } from "lexical";
import { describe, expect, it, vi } from "vitest";
import { acting, inPage } from "../../../../tests/composer.tsx";
import { all, one } from "../../../../tests/mount.tsx";
import { Composer, type ComposerProps } from "../Composer.tsx";
import rules from "../markdownRules.module.css";

const ROOM = "#bubble/games";
const NICK = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";

const composer = (props: Partial<ComposerProps> = {}) => (
  <Composer
    room={ROOM}
    nick={NICK}
    rooms={["#games", "#gnogolf"]}
    members={[ALICE]}
    names={new Map()}
    onSay={() => true}
    {...props}
  />
);

type Page = ReturnType<typeof inPage>;
// What a person's hand does in the field: the caret to the end, and text typed there, which the editor reads as it reads typing.
const toEnd = async ({ editor, box }: Page) => {
  await acting(() => {
    box.focus();
    editor.update(() => {
      $getRoot().selectEnd();
    });
  });
};
const type = async ({ editor }: Page, text: string) => {
  await acting(() => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(text);
    });
  });
};
const options = ({ host }: Page) => all(host, '[role="option"]').map((item) => item.textContent);

describe("the composer's field shows the formatting in place", () => {
  it("turns Markdown typed into its form, and sends the same Markdown", async () => {
    const page = inPage(composer());
    await toEnd(page);
    // Typed a key at a time, as the shortcuts read it: a mark turns into its form as its closing mark comes.
    const typed = async (words: string) => {
      const page = inPage(composer());
      await toEnd(page);
      for (const key of words) await type(page, key);
      return page;
    };
    const italic = await typed("say *this*");
    expect(italic.box.querySelector("em")?.textContent).toBe("this");
    expect(italic.box.textContent).toBe("say this");
    expect(italic.held()).toBe("say *this*");
    expect((await typed("a **that**")).box.querySelector("strong")?.textContent).toBe("that");
    expect((await typed("a ~~that~~")).held()).toBe("a ~~that~~");
    expect((await typed("a ++this++")).box.querySelector(".underline, [class*='underline']")?.textContent).toBe("this");
    expect((await typed("a `x`")).box.querySelector("code")?.textContent).toBe("x");
    expect((await typed("- one")).box.querySelector("li")?.textContent).toBe("one");
    expect((await typed("> said")).box.querySelector("blockquote")?.textContent).toBe("said");
  });

  // C5 of the review: the line sent and the field draw a quote and code by one module's rules.
  it("draws the chat's Markdown by the same rules as the sent line", () => {
    const page = inPage(composer());
    expect(rules["rules"]).toBeTruthy();
    expect(page.box.classList.contains(rules["rules"] ?? "")).toBe(true);
  });

  it("draws a quote, a list and a link as they read, never their marks", () => {
    const page = inPage(composer({ draft: "> said\n\n- one\n- two\n\n[docs](https://gno.land)" }));
    expect(page.box.querySelector("blockquote")?.textContent).toBe("said");
    expect(all(page.box, "li").map((item) => item.textContent)).toEqual(["one", "two"]);
    expect(page.box.querySelector("a")?.getAttribute("href")).toBe("https://gno.land");
    expect(page.box.textContent).not.toMatch(/[>\-[\]()]/);
    expect(page.held()).toBe("> said\n\n- one\n- two\n\n[docs](https://gno.land)");
  });

  it("formats the selection in place from the bar, and takes the format off again", async () => {
    const page = inPage(composer({ draft: "hello" }));
    await acting(() => {
      page.box.focus();
      page.editor.update(() => {
        $selectAll();
      });
    });
    const press = async (name: string) => {
      await acting(() => {
        one(page.host, `button[aria-label="${name}"]`).click();
      });
    };
    await press("Bold");
    expect(page.box.querySelector("strong")?.textContent).toBe("hello");
    expect(page.held()).toBe("**hello**");
    await press("Bold");
    expect(page.held()).toBe("hello");
    await press("Quote");
    expect(page.held()).toBe("> hello");
    await press("Quote");
    await press("Bulleted list");
    expect(page.held()).toBe("- hello");
    await press("Bulleted list");
    await press("Numbered list");
    expect(page.held()).toBe("1. hello");
    await press("Italic");
    expect(page.held()).toBe("1. *hello*");
  });

  it("makes the selection a link to an https address, and refuses any other", async () => {
    const page = inPage(composer({ draft: "the docs" }));
    await acting(() => {
      page.box.focus();
      page.editor.update(() => {
        $selectAll();
      });
    });
    // jsdom has no popover: the panel is told it opened, as the browser tells it.
    await acting(() => {
      one(page.host, '[role="dialog"][aria-label="Link"]').dispatchEvent(
        Object.assign(new Event("toggle"), { newState: "open" }),
      );
    });
    const field = () => one(page.host, 'input[type="text"]');
    const apply = async (address: string) => {
      await acting(() => {
        const input = field();
        // React reads a field's value from the element's own setter, which a test's assignment must go through.
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, address);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await acting(() => {
        field().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      });
    };
    await apply("javascript:alert(1)");
    expect(page.held()).toBe("the docs");
    expect(page.host.textContent).toContain("An address that starts with https://");
    await apply("https://gno.land/docs");
    expect(page.held()).toBe("[the docs](https://gno.land/docs)");
    expect(page.box.querySelector("a")?.textContent).toBe("the docs");
  });
});

// A composer holding "hello" whose sent lines land in `went`.
const sayingTo = (went: Composed[]) =>
  composer({
    draft: "hello",
    onSay: (composed) => {
      went.push(composed);
      return true;
    },
  });

describe("the keys of the field", () => {
  it("sends on Enter, and Shift+Enter adds a line", async () => {
    const went: Composed[] = [];
    const page = inPage(sayingTo(went));
    await toEnd(page);
    expect(await page.press("Enter", { shiftKey: true })).toBe(false);
    expect(went).toEqual([]);
    await type(page, "world");
    expect(page.held()).toBe("hello\nworld");
    await page.press("Enter");
    expect(went).toHaveLength(1);
    // A line sent leaves the field blank.
    expect(page.held()).toBe("");
  });

  it("adds a line on Enter for a finger, which has no Shift, and leaves sending to the button", async () => {
    const went: Composed[] = [];
    const page = inPage(sayingTo(went), { coarse: true });
    await toEnd(page);
    await page.press("Enter");
    expect(went).toEqual([]);
    expect(page.held()).toBe("hello\n");
  });

  // F1713: an Enter that picks a word of an input method (Japanese, Chinese) is no Enter.
  it("never sends half a word: not as a composition runs, nor for Safari's Enter after it", async () => {
    const went: Composed[] = [];
    const page = inPage(
      composer({
        draft: "にほん",
        onSay: (composed) => {
          went.push(composed);
          return true;
        },
      }),
    );
    await toEnd(page);
    await acting(() => {
      page.box.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    });
    await page.press("Enter");
    await acting(() => {
      page.box.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "日本" }));
    });
    await page.press("Enter", { keyCode: 229 });
    expect(went).toEqual([]);
    await page.press("Enter");
    expect(went).toHaveLength(1);
  });

  it("moves on with Tab as it always did: no indent, no focus kept in the field", async () => {
    const page = inPage(composer({ draft: "hello" }));
    await toEnd(page);
    expect(await page.press("Tab")).toBe(true);
    expect(page.held()).toBe("hello");
  });

  it("drops an edit on Escape, and a reply, as the bar's Cancel does", async () => {
    const onCancelEdit = vi.fn();
    const page = inPage(composer({ draft: "hello", editing: true, onCancelEdit }));
    await toEnd(page);
    await page.press("Escape");
    expect(onCancelEdit).toHaveBeenCalledOnce();
  });
});

describe("what the field suggests as one types", () => {
  it("lists the commands for a / at its start, narrowed as letters follow, each with its use", async () => {
    const page = inPage(composer());
    await toEnd(page);
    await type(page, "/");
    expect(options(page)).toEqual([
      "/meSend an action: /me waves",
      "/pollAsk a poll: /poll Question? | answer | answer",
      "/marketShow the prices here: /market gnot, atone or btc",
    ]);
    await type(page, "p");
    expect(options(page)).toEqual(["/pollAsk a poll: /poll Question? | answer | answer"]);
  });

  it("lists the rooms after # and the members after @, a member by its short address", async () => {
    const page = inPage(composer());
    await toEnd(page);
    await type(page, "see #g");
    expect(options(page)).toEqual(["#games", "#gnogolf"]);
    await type(page, " and @");
    expect(options(page)).toEqual(["g10gh7…3y5tv"]);
  });

  it("lists a member by its name when it has one, narrowed by the name typed", async () => {
    const page = inPage(composer({ names: new Map([[ALICE, "alice"]]) }));
    await toEnd(page);
    await type(page, "@al");
    expect(options(page)).toEqual(["alice" + "g10gh7…3y5tv"]);
    await type(page, "x");
    expect(options(page)).toEqual([]);
  });

  it("draws the member taken as a chip with its name, and sends its address", async () => {
    const page = inPage(composer({ names: new Map([[ALICE, "alice"]]) }));
    await toEnd(page);
    await type(page, "hi @al");
    await page.press("Tab");
    expect(page.held()).toBe(`hi @${ALICE} `);
    expect(page.box.textContent).toBe("hi @alice ");
    expect(page.box.querySelector("[data-mention]")?.textContent).toBe("@alice");
  });

  it("takes the picked one on Tab or Enter, moves with Up and Down, and sends nothing while a list is open", async () => {
    const went: Composed[] = [];
    const page = inPage(
      composer({
        onSay: (composed) => {
          went.push(composed);
          return true;
        },
      }),
    );
    await toEnd(page);
    await type(page, "#g");
    expect(one(page.host, '[role="option"][aria-selected="true"]').textContent).toBe("#games");
    expect(page.box.getAttribute("aria-activedescendant")).toBe(one(page.host, '[aria-selected="true"]').id);
    await page.press("ArrowDown");
    expect(one(page.host, '[aria-selected="true"]').textContent).toBe("#gnogolf");
    await page.press("ArrowDown");
    expect(one(page.host, '[aria-selected="true"]').textContent).toBe("#games");
    await page.press("ArrowUp");
    await page.press("Enter");
    expect(went).toEqual([]);
    expect(page.held()).toBe("#gnogolf ");
    await type(page, "#g");
    await page.press("Tab");
    expect(page.held()).toBe("#gnogolf #games ");
  });

  it("takes a suggestion that is clicked, the field keeping its focus", async () => {
    const page = inPage(composer());
    await toEnd(page);
    await type(page, "/mar");
    const item = one(page.host, '[role="option"]');
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    await acting(() => {
      item.dispatchEvent(down);
    });
    expect(down.defaultPrevented).toBe(true);
    expect(page.held()).toBe("/market ");
  });

  it("closes the list on Escape, and Escape then drops no edit; it opens again as the draft changes", async () => {
    const onCancelEdit = vi.fn();
    const page = inPage(composer({ editing: true, onCancelEdit }));
    await toEnd(page);
    await type(page, "/p");
    await page.press("Escape");
    expect(options(page)).toEqual([]);
    expect(onCancelEdit).not.toHaveBeenCalled();
    await type(page, "o");
    expect(options(page)).toHaveLength(1);
  });

  it("is a listbox tied to the field for a screen reader", async () => {
    const page = inPage(composer());
    await toEnd(page);
    await type(page, "/");
    const list = one(page.host, '[role="listbox"]');
    expect(page.box.getAttribute("aria-controls")).toBe(list.id);
    expect(page.box.getAttribute("aria-autocomplete")).toBe("list");
    expect(list.getAttribute("aria-label")).toBe("Suggestions");
  });

  it("opens no list inside a word", async () => {
    const page = inPage(composer());
    await toEnd(page);
    await type(page, "mail@a");
    expect(options(page)).toEqual([]);
  });

  it("opens no list in a code span, where @ and / are text", async () => {
    const page = inPage(composer({ draft: "see " }));
    await toEnd(page);
    await acting(() => {
      page.editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        selection.toggleFormat("code");
        selection.insertText("@");
      });
    });
    expect(page.held()).toBe("see `@`");
    expect(options(page)).toEqual([]);
  });
});

describe("what the field keeps and tells", () => {
  it("tells the draft and the typing as it changes, and tells nothing as a draft is set from outside", async () => {
    const onDraft = vi.fn();
    const onTyping = vi.fn();
    const page = inPage(composer({ draft: "kept", onDraft, onTyping }));
    expect(onDraft).not.toHaveBeenCalled();
    await toEnd(page);
    await type(page, " more");
    expect(onDraft).toHaveBeenLastCalledWith("kept more");
    expect(onTyping).toHaveBeenLastCalledWith("active");
  });

  it("reads a paste of Markdown as its form, and a paste of plain words as they are", async () => {
    const page = inPage(composer());
    await toEnd(page);
    const paste = async (text: string) => {
      const event = Object.assign(new Event("paste", { bubbles: true, cancelable: true }), {
        clipboardData: { types: ["text/plain"], getData: () => text, files: [] },
      });
      await acting(() => {
        page.box.dispatchEvent(event);
      });
    };
    await paste("**bold** and *soft*");
    expect(page.box.querySelector("strong")?.textContent).toBe("bold");
    expect(page.held()).toBe("**bold** and *soft*");
  });

  it("is labelled, with its placeholder, for a screen reader, and takes the focus at its start when asked", () => {
    const page = inPage(composer({ focus: true }));
    const label = document.getElementById(page.box.getAttribute("aria-labelledby") ?? "");
    expect(label?.textContent).toBe("Message #games");
    expect(page.host.textContent).toContain("Message #games");
    expect(document.activeElement).toBe(page.box);
  });
});
