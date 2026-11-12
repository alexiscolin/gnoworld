// @vitest-environment jsdom
import { jarvisExamples } from "@gnoworld/schemas";
import { $getRoot } from "lexical";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { takeJarvisQuestions, tellJarvisHere, type JarvisHere } from "../../jarvisHere.ts";
import { acting, inPage } from "../../../tests/composer.tsx";
import { Composer } from "./Composer.tsx";
import { jarvisQuestion } from "./jarvisLine.ts";
import { suggestions } from "./composer/suggest.ts";

const ROOM = "#bubble/games";
const NICK = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const here: JarvisHere = { room: ROOM, universe: { id: "onyx", isDefault: true }, account: NICK };
const tell = (next: JarvisHere | undefined) => {
  act(() => {
    tellJarvisHere(next);
  });
};
afterEach(() => {
  tell(undefined);
  takeJarvisQuestions();
});

const composer = (over: { quick?: boolean; draft?: string; onSay?: () => boolean } = {}) =>
  inPage(
    <Composer
      room={ROOM}
      nick={NICK}
      rooms={[]}
      members={[]}
      onSay={over.onSay ?? (() => true)}
      draft={over.draft}
      quick={over.quick === false ? undefined : <span>quick</span>}
    />,
  );
// "@jarvis what is new?" in the draft, the form submitted: how many times the room was told, and the page.
const sayJarvisDraft = async () => {
  let said = 0;
  const page = composer({
    draft: "@jarvis what is new?",
    onSay: () => {
      said += 1;
      return true;
    },
  });
  await acting(() => {
    page.host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  return { said, page };
};
// The button by the name it is read by: its words, "Jarvis", after a hidden "Ask ", and where it is greyed the reason.
const named = (host: HTMLElement, name: (text: string) => boolean) =>
  [...host.querySelectorAll<HTMLElement>("button")].find((each) => name(each.textContent));
const button = (host: HTMLElement) => named(host, (text) => text === "Ask Jarvis");

describe("the composer's Jarvis button", () => {
  it("is live where Jarvis can answer an account, and greyed with its reason elsewhere: before it is told, for a guest; none in a thread's box", async () => {
    const greyed = (host: HTMLElement) => named(host, (text) => text.startsWith("Ask Jarvis: "));
    expect(button(composer().host)).toBeUndefined();
    expect(greyed(composer().host)).toBeDefined();
    // Disabled, so that its dimmed ink is exempt from the contrast rule: the reason stays in its name.
    expect(greyed(composer().host)?.hasAttribute("disabled")).toBe(true);
    tell({ ...here, account: undefined });
    expect(button(composer().host)).toBeUndefined();
    expect(greyed(composer().host)).toBeDefined();
    const page = composer({ draft: "hi" });
    await acting(() => {
      greyed(page.host)?.click();
    });
    expect(page.held()).toBe("hi");
    tell(here);
    expect(button(composer().host)).toBeDefined();
    expect(greyed(composer().host)).toBeUndefined();
    expect(button(composer({ quick: false }).host)).toBeUndefined();
    expect(greyed(composer({ quick: false }).host)).toBeUndefined();
  });

  it("puts @jarvis and a space at the start of the draft on a click, once however many clicks", async () => {
    tell(here);
    const page = composer({ draft: "what is new?" });
    const click = async () => {
      await acting(() => {
        button(page.host)?.click();
      });
    };
    await click();
    expect(page.held()).toBe("@jarvis what is new?");
    await click();
    expect(page.held()).toBe("@jarvis what is new?");
  });
});

describe("a line that starts with @jarvis", () => {
  it("is asked of Jarvis with the rest as the question, and said to the room as any line, so the room sees the question", async () => {
    tell(here);
    const { said, page } = await sayJarvisDraft();
    expect(said).toBe(1);
    expect(takeJarvisQuestions()).toEqual(["what is new?"]);
    expect(page.held()).toBe("");
  });

  it("goes to the room as any line where Jarvis cannot answer", async () => {
    const { said } = await sayJarvisDraft();
    expect(said).toBe(1);
    expect(takeJarvisQuestions()).toEqual([]);
  });

  it("reads the question after @jarvis and a space only, and none from a bare @jarvis or another word", () => {
    expect(jarvisQuestion("@jarvis what now?")).toBe("what now?");
    expect(jarvisQuestion("@jarvis  two\nlines ")).toBe("two\nlines");
    expect(jarvisQuestion("@jarvis")).toBeUndefined();
    expect(jarvisQuestion("@jarvis ")).toBeUndefined();
    expect(jarvisQuestion("@jarvisx hi")).toBeUndefined();
    expect(jarvisQuestion("hi @jarvis there")).toBeUndefined();
  });
});

describe("the suggestions after @", () => {
  const choices = { commands: [], rooms: [], people: [] };
  it("offer @jarvis first where Jarvis can answer, and not elsewhere", () => {
    expect(suggestions("@ja", { ...choices, jarvis: true })[0]).toMatchObject({ value: "@jarvis" });
    expect(suggestions("@", { ...choices, jarvis: true })[0]).toMatchObject({ value: "@jarvis" });
    expect(suggestions("@ja", choices)).toEqual([]);
    expect(suggestions("@kai", { ...choices, jarvis: true })).toEqual([]);
  });
});

describe("the examples offered after @jarvis ", () => {
  const toEnd = async ({ editor, box }: ReturnType<typeof composer>) => {
    await acting(() => {
      box.focus();
      editor.update(() => {
        $getRoot().selectEnd();
      });
    });
  };
  const options = (host: HTMLElement) => [...host.querySelectorAll('[role="option"]')].map((each) => each.textContent);

  it("list the place's own first in a room, and pick one into the draft without sending it", async () => {
    let said = 0;
    tell({ ...here, room: "#earth" });
    const page = composer({
      draft: "@jarvis ",
      onSay: () => {
        said += 1;
        return true;
      },
    });
    await toEnd(page);
    expect(options(page.host).slice(0, 3)).toEqual(["what is gnoworld?", "what is a realm?", "what is gno.land?"]);
    await acting(() => {
      page.host
        .querySelectorAll<HTMLElement>('[role="option"]')[1]
        ?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });
    expect(page.held()).toBe("@jarvis what is a realm?");
    expect(said).toBe(0);
    expect(takeJarvisQuestions()).toEqual([]);
  });

  it("are a realm's world's, then any room's, and none where Jarvis cannot answer", async () => {
    tell({ ...here, room: "#govdao", realm: "gno.land/r/gov/dao" });
    const first = composer({ draft: "@jarvis " });
    await toEnd(first);
    expect(options(first.host)[0]).toBe("how do I vote on GovDAO?");
    tell(undefined);
    const off = composer({ draft: "@jarvis " });
    await toEnd(off);
    expect(options(off.host)).toEqual([]);
  });

  it("are the realm's and any room's in a world with one, in a fixed order", () => {
    expect(jarvisExamples("#earth", undefined)).toEqual([
      "what is gnoworld?",
      "what is a realm?",
      "what is gno.land?",
      "who is here?",
      "how do I send GNOT?",
      "how do I call a function?",
    ]);
    expect(jarvisExamples("#bubble/games", "gno.land/r/x").slice(0, 2)).toEqual([
      "what does this realm do?",
      "summarize this room",
    ]);
    expect(jarvisExamples("#bubble/games", undefined)).toHaveLength(3);
  });
});
