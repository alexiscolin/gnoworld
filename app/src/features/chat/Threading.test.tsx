// @vitest-environment jsdom
import { getNearestEditorFromDOMNode } from "lexical";
import { getMarkdown, setMarkdown } from "./composer/markdownEditor.ts";
import { acting, rangesHaveNoGeometry } from "../../../tests/composer.tsx";
import { Address } from "@gnoworld/schemas";
import type { Line } from "@gnoworld/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "./Composer.tsx";
import type { Dms } from "./Dms.tsx";
import { RoomView } from "./RoomView.tsx";
import { roomActs } from "./roomActs.ts";
import { shownOf, type Shown } from "./shown.tsx";
import "./Thread.tsx";
import { useThreads } from "./Threading.tsx";

// 4d's threads, G1: a direct message never offers a thread, whatever the page does to give its lines a bar (4d-dm-bar
// gives them the message bar). The one place that decides it is what the page hands the view: `useThreads` hands a
// direct message none, so its lines can show no chip and its bar no Open thread item, however they are drawn.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
// A root with two replies, a minute apart.
const LINES: Line[] = [{ id: "root" }, { id: "a", reply: "root" }, { id: "b", reply: "root" }].map((each, minute) => ({
  time: `2026-10-25T10:0${String(minute)}:00.000Z`,
  from: ALICE,
  account: ALICE,
  text: each.id,
  kind: "message",
  ...each,
}));
const acts = roomActs({ current: undefined }, "", () => undefined);
const SESSION = { kind: "in", address: ALICE } as const;
const dms = (partner: string | undefined): Dms => ({
  partner,
  nav: undefined,
  lines: LINES,
  empty: "",
  refused: undefined,
  problem: undefined,
});

// The conversation in view as the page gives it, its lines the thread's: what useThreads hands the view, drawn with it
// as Loaded.tsx does, and marked by what it handed (a handler for a line, how many props, whether anything stands beside).
function draw(shown: Shown | undefined) {
  function Page() {
    const { view, aside } = useThreads({
      shown,
      state: STATE,
      session: SESSION,
      rooms: [],
      acts,
    });
    // Loaded keeps `threaded` for the layout, whose info panel the thread takes; RoomView reads only the props it names.
    return (
      <div data-handler={typeof view.onThread} data-props={Object.keys(view).length} data-aside={aside !== undefined}>
        {shown === undefined ? null : <RoomView {...shown.view} {...view} chat="connected" me={ALICE} />}
        {aside}
      </div>
    );
  }
  return renderToStaticMarkup(<Page />);
}
const PAGE = { sayTo: () => true, focus: false, noteId: "note" };
const STATE = {
  lines: LINES,
  members: [ALICE],
  topic: undefined,
  refused: undefined,
  typing: undefined,
  read: undefined,
};
const room = shownOf(dms(undefined), { id: "#bubble/games", state: STATE, acts }, PAGE);
// The same room is in the store behind it, its lines answering one another as well.
const dm = shownOf(dms(BOB), { id: "#bubble/games", state: STATE, acts }, PAGE);
const chips = (html: string) => [...html.matchAll(/>(\d+ repl(?:y|ies))</g)].map((found) => found[1] ?? "");

beforeAll(async () => {
  // The lines view is a lazy chunk: asked once, so the drawings below hold its lines.
  for (const shown of [room, dm]) {
    if (shown !== undefined)
      await prerender(<RoomView {...shown.view} chat="connected" onDelete={() => false} onDismiss={() => undefined} />);
  }
});

describe("useThreads: what a conversation's page opens", () => {
  it("opens threads in a room: a handler for its lines, nothing beside them until one opens, a chip on the root", () => {
    const html = draw(room);
    expect(html).toContain('data-handler="function"');
    expect(html).toContain('data-aside="false"');
    expect(chips(html)).toEqual(["2 replies"]);
  });

  it("opens none in a direct message, whose lines answer one another: no handler, nothing beside, no chip", () => {
    expect(dm?.kind).toBe("dm");
    const html = draw(dm);
    expect(html).toContain('data-handler="undefined"');
    expect(html).toContain('data-props="0"');
    expect(html).toContain('data-aside="false"');
    expect(html).toContain(">root<");
    expect(chips(html)).toEqual([]);
    expect(html).not.toContain("Open thread");
  });

  it("opens none for a conversation not in view", () => {
    const html = draw(undefined);
    expect(html).toContain('data-handler="undefined"');
    expect(html).toContain('data-props="0"');
    expect(html).toContain('data-aside="false"');
  });
});

// The open panel as a page drives it, in jsdom: opened by the handler useThreads hands a line, the focus and the keys
// watched. The page here is a room's list (one stop), a button outside, and what stands beside.
describe("useThreads: the open panel's focus and keys", () => {
  const OUT = { kind: "out" } as const;
  const other = shownOf(dms(undefined), { id: "#bubble/other", state: STATE, acts }, PAGE);
  let root: Root;
  let opens: (id: string) => void = () => undefined;
  const OTHER = { kind: "in", address: Address.parse(BOB) } as const;
  type Reader = typeof SESSION | typeof OUT | typeof OTHER;
  function Page({ shown, session, lines }: { shown: Shown | undefined; session: Reader; lines: Line[] }) {
    const { view, aside } = useThreads({
      shown,
      state: { ...STATE, lines },
      session,
      rooms: [],
      acts,
    });
    opens = (id) => view.onThread?.(id);
    return (
      <div>
        <button type="button" id="outside">
          outside
        </button>
        <ol aria-label="Messages">
          <li tabIndex={0} data-line="root">
            root
          </li>
        </ol>
        {aside}
      </div>
    );
  }
  const draw = (shown: Shown | undefined, session: Reader = SESSION, lines: Line[] = LINES) => {
    act(() => {
      root.render(<Page shown={shown} session={session} lines={lines} />);
    });
  };
  const thread = () => document.querySelector("aside[aria-label='Thread']");
  const field = () => document.querySelector<HTMLElement>("aside [role='textbox']");
  // What the field holds as Markdown, and a draft put in it as a hand would.
  const editorOf = () => {
    const box = field();
    return box === null ? null : getNearestEditorFromDOMNode(box);
  };
  const held = () => {
    const editor = editorOf();
    return editor === null ? undefined : getMarkdown(editor);
  };
  const active = () => {
    const now = document.activeElement;
    return now?.id === "outside" ? "outside" : (now?.getAttribute("data-line") ?? "");
  };
  // The panel and its lazy code come, then the composer's.
  const loaded = async (guest = false) => {
    const ready = () => thread()?.querySelector("h2") !== null && (guest || field() !== null);
    for (let waits = 0; waits < 500 && !ready(); waits++)
      await act(async () => {
        await new Promise((done) => setTimeout(done, 10));
      });
  };
  const frame = () =>
    act(async () => {
      await new Promise((done) => {
        requestAnimationFrame(() => {
          done(undefined);
        });
      });
    });
  const press = (target: Element, over: KeyboardEventInit) => {
    act(() => {
      target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...over }));
    });
  };
  const outside = () => {
    const button = document.querySelector<HTMLElement>("#outside");
    if (button === null) throw new Error("no outside button");
    button.focus();
  };

  beforeEach(() => {
    rangesHaveNoGeometry();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    // jsdom has no popover: a close button's tooltip toggles nothing.
    Object.assign(HTMLElement.prototype, { togglePopover: () => true });
    // ... nor matchMedia, which the composer reads for a touch screen: a computer's pointer.
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    root = createRoot(document.body.appendChild(document.createElement("div")));
  });
  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  // R6: the panel that stands in for the one that comes has its Close, and Escape as well. First of this block: later
  // ones find the panel's code already come, with no stand-in to see.
  it("closes with an Escape while its code has not come", async () => {
    draw(room);
    act(() => {
      opens("root");
    });
    expect(thread()?.querySelector("h2")).toBeNull();
    // A tooltip shown on Close takes the first Escape, as it does in the panel's own: the second closes.
    const standing = thread();
    if (standing === null) throw new Error("no stand-in");
    press(standing, { key: "a" });
    expect(thread()).not.toBeNull();
    press(standing, { key: "Escape" });
    press(standing, { key: "Escape" });
    expect(thread()).toBeNull();
    // The code comes, to a page that no longer holds the panel.
    await act(async () => {
      await new Promise((done) => setTimeout(done, 20));
    });
  });

  // CR4 (F1764): the guest's focus goes to Close once, as the panel opens, never again as the session changes.
  it("leaves the focus where it is when the reader logs out with the panel open", async () => {
    draw(room);
    act(() => {
      opens("root");
    });
    await loaded();
    outside();
    draw(room, OUT);
    await frame();
    expect(active()).toBe("outside");
  });

  it("leaves the focus where it is when the reader logs in with the panel open", async () => {
    draw(room, OUT);
    act(() => {
      opens("root");
    });
    await loaded(true);
    outside();
    draw(room);
    await loaded();
    await frame();
    expect(active()).toBe("outside");
  });

  // CR5 (F1765): a room switch takes the panel away with the focus inside it; it goes to the new room's list, not the page.
  it("gives the focus to the room's list when a move to another room takes the panel and its focus away", async () => {
    draw(room);
    act(() => {
      opens("root");
    });
    await loaded();
    field()?.focus();
    expect(thread()?.contains(document.activeElement)).toBe(true);
    draw(other);
    await frame();
    expect(thread()).toBeNull();
    expect(active()).toBe("root");
  });

  it("takes no focus from outside the panel when a move to another room takes it away", async () => {
    draw(room);
    act(() => {
      opens("root");
    });
    await loaded();
    outside();
    draw(other);
    await frame();
    expect(active()).toBe("outside");
  });

  // CR7 (F1767): an Escape that ends an input method's composition belongs to the composition, whichever way the browser
  // marks it.
  it("stays open for an Escape that ends a composition, and closes for any other", async () => {
    draw(room);
    act(() => {
      opens("root");
    });
    await loaded();
    const box = field();
    if (box === null) throw new Error("no field");
    press(box, { key: "Escape", isComposing: true });
    expect(thread()).not.toBeNull();
    press(box, { key: "a" });
    expect(thread()).not.toBeNull();
    // Safari's: isComposing false, keyCode 229 (R5).
    press(box, { key: "Escape", keyCode: 229 });
    expect(thread()).not.toBeNull();
    press(box, { key: "Escape" });
    expect(thread()).toBeNull();
  });

  // R1 (redpass2-4th): the words typed in a thread are the page's memory, and a logout is a fresh start: they are neither
  // handed to the next account nor kept for the same one.
  const typeIn = async (words: string) => {
    const editor = editorOf();
    if (editor === null) throw new Error("no field");
    await acting(() => {
      setMarkdown(editor, words);
    });
  };
  const logOutIn = async (to: Reader) => {
    draw(room, OUT);
    await frame();
    draw(room, to);
    act(() => {
      opens("root");
    });
    await loaded();
  };
  it("hands a thread's unsent words to no one after a logout, and gives the same account none back", async () => {
    draw(room);
    act(() => {
      opens("root");
    });
    await loaded();
    await typeIn("for alice's eyes");
    expect(held()).toBe("for alice's eyes");
    await logOutIn(OTHER);
    expect(held()).toBe("");
    await logOutIn(SESSION);
    expect(held()).toBe("");
  });

  // R3: the words sit under the line that opened the thread, so a chain that grows (a new root) leaves them where they were.
  it("keeps the words typed while the chain was short, once the chain has grown and the panel is opened again", async () => {
    const at = (id: string, reply?: string): Line => ({
      id,
      ...(reply === undefined ? {} : { reply }),
      time: "2026-10-25T10:00:00.000Z",
      from: ALICE,
      account: ALICE,
      text: id,
      kind: "message",
    });
    draw(room, SESSION, [at("c", "b")]);
    act(() => {
      opens("c");
    });
    await loaded();
    await typeIn("half a thought");
    draw(room, SESSION, [at("a"), at("b", "a"), at("c", "b")]);
    await loaded();
    const box = field();
    if (box === null) throw new Error("no field");
    press(box, { key: "Escape" });
    expect(thread()).toBeNull();
    act(() => {
      opens("c");
    });
    await loaded();
    expect(held()).toBe("half a thought");
  });

  it("keeps each account's words apart when the reader changes with no logout between", async () => {
    draw(room);
    act(() => {
      opens("root");
    });
    await loaded();
    await typeIn("alice's");
    const box = field();
    if (box === null) throw new Error("no field");
    press(box, { key: "Escape" });
    draw(room, OTHER);
    act(() => {
      opens("root");
    });
    await loaded();
    expect(held()).toBe("");
  });
});
