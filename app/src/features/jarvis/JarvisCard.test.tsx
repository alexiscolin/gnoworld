// @vitest-environment jsdom
import type { JarvisAnswer, JarvisQuestion } from "@gnoworld/schemas";
import { act } from "react";
import { MemoryRouter } from "react-router";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { JarvisItem } from "../../jarvisHere.ts";
import type { Result } from "../../lib/api/http.ts";
import { StoreProvider } from "../../storeContext.tsx";
import { SignedIn } from "../../../tests/grabStore.tsx";
import { all, button, click, modals, mount, one } from "../../../tests/mount.tsx";
import { CHAIN, listing } from "../../../tests/callFixtures.ts";
import { drawing } from "../chat/index.ts";
import { drawerOf } from "./drawer.ts";
import { JarvisCard, type JarvisCardContext } from "./JarvisCard.tsx";
import type { DrawMarkdown } from "./AnswerCard.tsx";

// 10u-a: Jarvis's cards in the chat column: the introduction (fixed asks that send no words, a field of 500 code points, a guest's way in),
// then each ask as a card: the answer, or one plain line for a guard, with the forms that need no model where Jarvis cannot answer.
type Answer = Result<JarvisAnswer>;
const ROOM = "#bubble";
const OWN = "https://gnoworld.test";
const ANSWERED: JarvisAnswer = { status: "answered", markdown: "You can **vote** here.", buttons: [] };
const ok = (value: JarvisAnswer): Answer => ({ ok: true, value });

let drawn: DrawMarkdown;
beforeAll(async () => {
  modals();
  drawn = drawerOf(await drawing());
});

function context(over: Partial<JarvisCardContext> = {}): JarvisCardContext {
  return {
    room: ROOM,
    ask: vi.fn<(question: JarvisQuestion) => void>(),
    chain: CHAIN,
    options: { fetch: () => listing([]) },
    gnoweb: CHAIN.gnoweb,
    own: OWN,
    draw: drawn,
    onFly: () => undefined,
    forms: { search: vi.fn() },
    ...over,
  };
}
function draw(item: Partial<JarvisItem>, ctx: JarvisCardContext = context()) {
  const full: JarvisItem = { id: "c", room: ROOM, account: "g1me", at: "2026-11-11T10:00:00.000Z", ...item };
  const box = mount(
    <MemoryRouter>
      <StoreProvider>
        <SignedIn />
        <JarvisCard item={full} ctx={ctx} />
      </StoreProvider>
    </MemoryRouter>,
  );
  return { box, ctx };
}
const asked = (result: Answer | undefined, over: Partial<JarvisCardContext> = {}) =>
  draw({ ask: { ask: "here", room: ROOM }, ...(result === undefined ? {} : { result }) }, context(over));
const intro = (over: Partial<JarvisCardContext> = {}) => draw({}, context(over));
const field = (box: HTMLElement) => one(box, "textarea") as HTMLTextAreaElement;
const type = (box: HTMLElement, text: string) => {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(field(box), text);
    field(box).dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const enter = (box: HTMLElement, init: KeyboardEventInit = {}) => {
  act(() => {
    field(box).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init }));
  });
};
const shareButtons = (box: HTMLElement) => all(box, "button").filter((b) => /share|@jarvis/i.test(b.textContent));
const sent = (ctx: JarvisCardContext) => vi.mocked(ctx.ask).mock.calls.map(([question]) => question);

describe("Jarvis's introduction", () => {
  it("is Jarvis's card: AI concierge, may be wrong, its answers the asker's alone with no control to share them", () => {
    const { box } = intro();
    expect(box.textContent).toMatch(/ai concierge/i);
    expect(box.textContent).toContain("AI · may be wrong");
    expect(shareButtons(box)).toEqual([]);
  });

  it("sends What can I do here? and Catch up as the fixed asks of the room, with no words, even when the field holds text", () => {
    const { box, ctx } = intro();
    type(box, "my own words");
    click(button(box, "What can I do here?"));
    click(button(box, "Catch up"));
    expect(sent(ctx)).toEqual([
      { ask: "here", room: ROOM },
      { ask: "catch-up", room: ROOM },
    ]);
  });

  it("sends nothing at its first drawing", () => {
    expect(sent(intro().ctx)).toEqual([]);
  });

  it("sends the words as the room's question on Enter, and nothing for an empty or blank field", () => {
    const { box, ctx } = intro();
    enter(box);
    type(box, "   ");
    enter(box);
    expect(sent(ctx)).toEqual([]);
    type(box, "Who runs this realm?");
    enter(box);
    expect(sent(ctx)).toEqual([{ question: "Who runs this realm?", room: ROOM }]);
  });

  it("empties its field once its question is taken, and the count with it", () => {
    const { box, ctx } = intro();
    type(box, "Who runs this realm?");
    enter(box);
    expect(sent(ctx)).toEqual([{ question: "Who runs this realm?", room: ROOM }]);
    expect(field(box).value).toBe("");
    expect(box.textContent).toMatch(/(?<!\d)0\s*\/\s*500/);
  });

  it("does not send on Enter that confirms an input method's composition", () => {
    const { box, ctx } = intro();
    type(box, "こんにちは");
    enter(box, { isComposing: true });
    expect(sent(ctx)).toEqual([]);
  });

  it("shows its count out of 500, and sends 500 code points, an astral one counted as one", () => {
    const { box, ctx } = intro();
    type(box, "hello");
    expect(box.textContent).toMatch(/(?<!\d)5\s*\/\s*500/);
    type(box, "\u{1F600}".repeat(500));
    expect(field(box).value.length).toBe(1000);
    expect(box.textContent).toMatch(/(?<!\d)500\s*\/\s*500/);
    enter(box);
    expect(sent(ctx)).toHaveLength(1);
  });

  it("refuses 501 code points before sending: nothing is asked, the text is kept and the count says so", () => {
    const { box, ctx } = intro();
    type(box, "a".repeat(501));
    expect(box.textContent).toMatch(/501\s*\/\s*500/);
    enter(box);
    expect(sent(ctx)).toEqual([]);
    expect(field(box).value).toBe("a".repeat(501));
  });
});

describe("an ask's card", () => {
  it("says Jarvis is reading while the ask is in flight, and draws no answer", () => {
    const { box } = asked(undefined);
    expect(one(box, "[role='status']").textContent).toContain("reading");
    expect(all(box, "[data-jarvis-markdown], [data-jarvis-line]")).toEqual([]);
  });

  it("is the answer's card: its Markdown drawn, no control to share it", () => {
    const { box } = asked(ok(ANSWERED));
    expect(one(box, "[data-jarvis-markdown] strong").textContent).toBe("vote");
    expect(box.textContent).toContain("AI · may be wrong");
    expect(shareButtons(box)).toEqual([]);
  });

  it("goes through the answer card's drawing and warning: a hostile answer is inert, its external link behind the warning, its fly button flies", () => {
    const onFly = vi.fn<(place: string) => void>();
    const hostile: JarvisAnswer = {
      status: "answered",
      markdown:
        "![x](https://evil.example/a.png) [x](javascript:alert(1)) <img src=x onerror=1><script>1</script> @room [t](https://example.org)",
      buttons: [{ type: "fly", label: "Fly to Bubble", place: "/w/bubble" }],
    };
    const { box } = asked(ok(hostile), { onFly });
    expect(all(box, "[data-jarvis-markdown] :is(img, script, iframe, svg, [onerror], [data-mention], a)")).toEqual([]);
    expect(all(box, "dialog[open]")).toEqual([]);
    click(all(box, "[data-jarvis-markdown] button").find((b) => b.title === "https://example.org"));
    expect(one(box, "dialog[open]").textContent).toContain("example.org");
    click(button(box, "Fly to Bubble"));
    expect(onFly).toHaveBeenCalledExactlyOnceWith("/w/bubble");
  });
});

// One keyword a status, chosen before the code: the line says what that guard means and no other's.
const SAYS = {
  declined: /gno\.land/i,
  paused: /paused/i,
  capped: /share/i,
  early: /spoken/i,
  busy: /still answering your last question/i,
  spent: /budget/i,
  off: /switched off/i,
} as const;
const sentence = (line: string) =>
  line.trim().length > 20 && /[.!?]$/.test(line.trim()) && !/^[a-z]+$/.test(line.trim());
const GUARDS = ["declined", "paused", "capped", "early", "busy"] as const;

describe("a guard's answer", () => {
  it.each(GUARDS)("%s is one plain sentence that says its own meaning, no forms, no spinner", (status) => {
    const { box } = asked(ok({ status }));
    const [line, ...more] = all(box, "[data-jarvis-line]");
    expect(more).toEqual([]);
    const words = line?.textContent ?? "";
    expect(sentence(words)).toBe(true);
    expect(words).toMatch(SAYS[status]);
    for (const other of Object.keys(SAYS).filter((each) => each !== status))
      expect(words).not.toMatch(SAYS[other as keyof typeof SAYS]);
    expect(all(box, "[data-jarvis-markdown], [role='progressbar'], [aria-busy='true']")).toEqual([]);
    expect(button(box, "Search a place")).toBeUndefined();
  });

  it("the day's questions all asked (the door's 429 full) says the share is used, not to try again later", () => {
    const { box } = asked({ ok: false, reason: "full" });
    const words = all(box, "[data-jarvis-line]")[0]?.textContent ?? "";
    expect(words).toMatch(SAYS.capped);
    expect(words).not.toMatch(/could not answer/i);
    expect(button(box, "Search a place")).toBeUndefined();
  });
});

describe("where Jarvis cannot answer: spent, off, an error, a body off the schema, a 401 or a 403", () => {
  const FAILS: [string, Answer, RegExp][] = [
    ["spent", ok({ status: "spent" }), SAYS.spent],
    ["off", ok({ status: "off" }), SAYS.off],
    ["a 401", { ok: false, reason: "unauthenticated" }, /could not answer/i],
    ["a 403", { ok: false, reason: "forbidden" }, /could not answer/i],
    ["a body off the schema", { ok: false, reason: "malformed" }, /could not answer/i],
    ["a 500", { ok: false, reason: "unavailable" }, /could not answer/i],
    ["a timeout", { ok: false, reason: "network" }, /could not answer/i],
  ];
  it.each(FAILS)("gives its line and the forms that need no model after %s, and no spinner", (_, answer, says) => {
    const forms = { search: vi.fn(), functions: vi.fn() };
    const { box } = asked(answer, { forms });
    expect(all(box, "[role='progressbar'], [aria-busy='true'], [role='status']")).toEqual([]);
    const [line, ...more] = all(box, "[data-jarvis-line]");
    expect(more).toEqual([]);
    expect(sentence(line?.textContent ?? "")).toBe(true);
    expect(line?.textContent).toMatch(says);
    click(button(box, "Search a place"));
    click(button(box, "See the realm's functions"));
    expect([forms.search, forms.functions].map((f) => f.mock.calls.length)).toEqual([1, 1]);
    expect(button(box, "Jump to unread")).toBeUndefined();
  });

  it("gives only the forms the place has: no functions form without a realm", () => {
    const { box } = asked(ok({ status: "off" }));
    expect(button(box, "Search a place")).toBeDefined();
    expect(button(box, "See the realm's functions")).toBeUndefined();
  });
});
