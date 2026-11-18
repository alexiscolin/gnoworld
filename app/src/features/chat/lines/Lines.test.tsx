// The lines view as the build compiles it, counting what a render recomputes: a room at its window, 200 lines each answering the one before, one edit folded, 1,000 reactions.
import type * as core from "@gnoworld/core";
import { excerpt, foldEdits, reactionsOn, threadsOf, type Line, type Reaction } from "@gnoworld/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { noMedia } from "../../../../tests/mount.tsx";
import type { ChainHeard } from "../../../store/chain.ts";
import { ChainCallsContext, ChainPlaceContext } from "./chainThread.ts";
import { Lines, type LinesProps } from "./Lines.tsx";
import { Reactions } from "./Reactions.tsx";
import type * as reactionsModule from "./Reactions.tsx";
import { ThreadChip } from "./ThreadChip.tsx";
import type * as threadChipModule from "./ThreadChip.tsx";

vi.mock("@gnoworld/core", async (importOriginal) => {
  const real = await importOriginal<typeof core>();
  return {
    ...real,
    excerpt: vi.fn(real.excerpt),
    foldEdits: vi.fn(real.foldEdits),
    reactionsOn: vi.fn(real.reactionsOn),
    threadsOf: vi.fn(real.threadsOf),
  };
});
// A card line's card, without its chunk or its read: the element the list looks for, empty while its code comes, busy while
// its data does (`card.reading`), then filled (`card.filled`).
const card = vi.hoisted(() => ({ filled: false, reading: false }));
vi.mock("./SharedCard.tsx", () => ({
  SharedCard: () => (
    <div data-shared-card="trending">
      {card.reading ? <div aria-busy="true">Reading the ranking</div> : null}
      {card.filled ? "Boards 12 calls" : null}
    </div>
  ),
}));
vi.mock("./ThreadChip.tsx", async (importOriginal) => {
  const real = await importOriginal<typeof threadChipModule>();
  return { ...real, ThreadChip: vi.fn(real.ThreadChip) };
});
vi.mock("./Reactions.tsx", async (importOriginal) => {
  const real = await importOriginal<typeof reactionsModule>();
  return { ...real, Reactions: vi.fn(real.Reactions) };
});

const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const T0 = Date.parse("2026-10-25T10:00:00.000Z");
const LINES = 200;
const EMOJI = ["👍", "❤️", "😂", "🎉", "🔥"];
const at = (n: number) => new Date(T0 + n * 60_000).toISOString();
const line = (n: number, over: Partial<Line> = {}): Line => ({
  id: `m${String(n)}`,
  time: at(n),
  from: ALICE,
  account: ALICE,
  text: `**gnogolf** at nine, rules at https://gno.land/r/demo/golf, @${ALICE} and @${BOB} number ${String(n)}`,
  kind: "message",
  ...over,
});
// Each line answers the one before; the last is an author's own edit of the second, folded into it.
const ROOM: readonly Line[] = [
  ...Array.from({ length: LINES }, (_, n) => line(n, n === 0 ? {} : { reply: `m${String(n - 1)}` })),
  line(LINES, { edits: "m1", text: "edited" }),
];
// Five accounts each react with their own emoji to every line.
const REACTIONS: readonly Reaction[] = EMOJI.flatMap((emoji, who) =>
  Array.from({ length: LINES }, (_, n) => ({
    id: `r${String(who)}-${String(n)}`,
    time: at(n),
    to: `m${String(n)}`,
    emoji,
    who: `account${String(who)}`,
    on: true,
  })),
);
const PROPS: LinesProps = {
  room: "#bubble/games",
  lines: ROOM,
  members: [ALICE, BOB],
  me: BOB,
  connected: true,
  reactions: REACTIONS,
  onReact: () => true,
};

let root: Root;
let host: HTMLElement;
const draw = (over: Partial<LinesProps> = {}) => {
  act(() => {
    root.render(<Lines {...PROPS} {...over} />);
  });
};
// The pointer entering a line, as the browser moves it.
const point = (n: number) => {
  const item = host.querySelectorAll("ol > li")[n];
  if (item === undefined) throw new Error(`no line ${String(n)}`);
  act(() => {
    item.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
  });
};

beforeEach(() => {
  // A chain card's heading level asks the window for a phone.
  noMedia();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  // jsdom has no popover: a bar's tooltip toggles nothing.
  Object.assign(HTMLElement.prototype, { togglePopover: () => true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("the lines view, compiled", () => {
  it("draws the room: its lines, their quotes, their chips", () => {
    draw();
    expect(host.querySelectorAll("ol > li")).toHaveLength(LINES);
    expect(host.querySelectorAll("p[class]").length).toBeGreaterThan(0);
    expect(host.querySelectorAll("[role='group'][aria-label='Reactions']")).toHaveLength(LINES);
    expect(vi.mocked(excerpt)).toHaveBeenCalled();
    expect(vi.mocked(foldEdits)).toHaveBeenCalled();
    expect(vi.mocked(reactionsOn)).toHaveBeenCalled();
    expect(vi.mocked(Reactions)).toHaveBeenCalled();
  });

  // In a direct message the partner's tag +gnoworld/edit naming my line corrects nothing of mine.
  it("leaves my words alone when the partner's line is tagged as a correction of my line", () => {
    draw({
      room: undefined,
      partner: ALICE,
      reactions: [],
      lines: [
        line(1, { id: "m1", from: BOB, account: BOB, text: "my words" }),
        line(2, { id: "p2", edits: "m1", text: "their words" }),
      ],
    });
    const texts = [...host.querySelectorAll("ol > li")].map((item) => item.textContent);
    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain("my words");
    expect(texts[0]).not.toContain("their words");
    expect(texts[1]).toContain("their words");
  });

  it("shows the bar of the line the pointer enters, and of that one alone", () => {
    draw();
    expect(host.querySelectorAll("[role='toolbar']")).toHaveLength(0);
    point(5);
    const bars = host.querySelectorAll("[role='toolbar']");
    expect(bars).toHaveLength(1);
    expect(bars[0]?.closest("li")).toBe(host.querySelectorAll("ol > li")[5]);
  });

  // A new message made each reply line quote its line again: two Markdown parses and a grapheme cut, 200 times.
  it("quotes again the reply that came, never the room's others, when a line comes", () => {
    draw();
    vi.mocked(excerpt).mockClear();
    draw({ lines: [...ROOM, line(LINES + 1, { reply: `m${String(LINES - 1)}` })] });
    expect(vi.mocked(excerpt)).toHaveBeenCalledTimes(1);
  });

  it("quotes nothing again when a member comes", () => {
    draw();
    vi.mocked(excerpt).mockClear();
    draw({ members: [ALICE, BOB, "guest-ab12cd"] });
    expect(vi.mocked(excerpt)).not.toHaveBeenCalled();
  });

  // Each render ran the edit fold and the reactions' fold again, and with an edit folded the fold's new array moved the
  // list to its end, forcing a layout, whatever the pointer had moved.
  it("folds nothing again, and lays nothing out, when the pointer moves over lines", () => {
    draw();
    const layout = vi.spyOn(Element.prototype, "scrollHeight", "get");
    vi.clearAllMocks();
    point(5);
    point(9);
    expect([
      vi.mocked(foldEdits).mock.calls.length,
      vi.mocked(reactionsOn).mock.calls.length,
      layout.mock.calls.length,
    ]).toEqual([0, 0, 0]);
  });

  it("draws no line again when the pointer moves over lines", () => {
    draw();
    vi.clearAllMocks();
    point(5);
    point(9);
    expect([vi.mocked(excerpt).mock.calls.length, vi.mocked(Reactions).mock.calls.length]).toEqual([0, 0]);
  });

  // Every line with chips drew its chips again for each reaction and each line that came: 200 lines, 1,000 chips.
  it("draws again the chips of the line a reaction came to, and no other", () => {
    draw();
    vi.clearAllMocks();
    draw({
      reactions: [...REACTIONS, { id: "extra", time: at(LINES), to: "m5", emoji: "👏", who: "account9", on: true }],
    });
    expect(vi.mocked(Reactions)).toHaveBeenCalledTimes(1);
    expect(host.querySelectorAll("ol > li")[5]?.querySelectorAll("[role='group'] button")).toHaveLength(6);
  });

  it("draws no chips again when a line comes", () => {
    draw();
    vi.clearAllMocks();
    draw({ lines: [...ROOM, line(LINES + 1, { reply: `m${String(LINES - 1)}` })] });
    expect(vi.mocked(Reactions)).not.toHaveBeenCalled();
  });
});

// The list opens at its end by CSS alone (its scroll origin is its foot): what is left to script is a reader's own place, which
// WebKit would not keep (it anchors no scroll, and the list's anchoring is off in every engine). jsdom lays nothing out: the
// geometry is told, `scrollTop` counting from the foot (0 there, below 0 above it).
describe("the list's reader kept in place", () => {
  const BOX_TOP = 100;
  const BOX = 400;
  let top: number;
  let resized: (() => void)[];
  // Each line's top, by its place in the list; every line is 20 px high.
  let tops: number[];
  const lines = () => [...host.querySelectorAll("ol > li")];
  const scroller = () => {
    const box = host.querySelector("ol")?.parentElement;
    if (box === null || box === undefined) throw new Error("no scrolling box");
    return box;
  };
  // What grew under the lines the reader sees: every line pushed up by as much, in the engine's own layout.
  const pushed = (by: number) => {
    tops = tops.map((at) => at - by);
    for (const tell of resized) tell();
  };
  // The reader scrolls up to `to`, and the browser tells it.
  const scrolledTo = (to: number) => {
    top = to;
    act(() => {
      scroller().dispatchEvent(new Event("scroll"));
    });
  };
  beforeEach(() => {
    top = 0;
    resized = [];
    tops = Array.from({ length: LINES + 20 }, (_, n) => BOX_TOP + n * 20 - 3000);
    vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(BOX);
    vi.spyOn(Element.prototype, "scrollTop", "get").mockImplementation(() => top);
    vi.spyOn(Element.prototype, "scrollTop", "set").mockImplementation((to: number) => {
      top = Math.min(0, to);
    });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.matches("li[data-new]")) return new DOMRect(0, newTop, 0, 20);
      const at = tops[lines().indexOf(this)];
      return at === undefined ? new DOMRect(0, BOX_TOP, 0, BOX) : new DOMRect(0, at, 0, 20);
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(tell: () => void) {
          resized.push(tell);
        }
        observe = () => undefined;
        disconnect = () => undefined;
      },
    );
  });
  let newTop = BOX_TOP;
  afterEach(() => {
    newTop = BOX_TOP;
    vi.restoreAllMocks();
  });

  it("moves nothing for a reader at the end, whatever grows: the foot holds them", () => {
    draw();
    pushed(300);
    expect(top).toBe(0);
  });

  it("keeps the lines a reader scrolled up reads still as something grows under them", () => {
    draw();
    scrolledTo(-500);
    pushed(300);
    expect(top).toBe(-800);
  });

  it("leaves a reader alone when something grows above what they read", () => {
    draw();
    scrolledTo(-500);
    for (const tell of resized) tell();
    expect(top).toBe(-500);
  });

  it("opens a room with news on its New line: its top at the list's", () => {
    newTop = BOX_TOP - 600;
    draw({ paged: true, read: at(99) });
    expect(host.querySelectorAll("ol > li[data-new]")).toHaveLength(1);
    expect(top).toBe(-600);
  });

  describe("a room whose lines hold a card", () => {
    const CARD = "💹 Market prices";
    const CAP = 400;
    const waiting = () => host.querySelector("[data-awaiting]") !== null;
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("keeps the list faded out while a card reads its data, then in, at the cap at latest", () => {
      card.reading = true;
      draw({ paged: true, lines: [...ROOM, line(LINES + 1, { text: CARD })] });
      card.reading = false;
      expect(waiting()).toBe(true);
      vi.advanceTimersByTime(CAP - 1);
      expect(waiting()).toBe(true);
      vi.advanceTimersByTime(1);
      expect(waiting()).toBe(false);
    });

    it("shows it as the card fills, before the cap", async () => {
      card.reading = true;
      draw({ paged: true, lines: [...ROOM, line(LINES + 1, { text: CARD })] });
      card.reading = false;
      card.filled = true;
      draw({ paged: true, lines: [...ROOM, line(LINES + 1, { text: CARD })] });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      card.filled = false;
      expect(waiting()).toBe(false);
    });

    it("waits for nothing when no card is unfilled, or none is among the lines", () => {
      draw({ paged: true });
      expect(waiting()).toBe(false);
      card.filled = true;
      draw({ paged: true, lines: [...ROOM, line(LINES + 1, { text: CARD })] });
      card.filled = false;
      expect(waiting()).toBe(false);
    });
  });
});

// The device's place forgotten when the room is read through, once: a mark another tab sets after it is the reader's,
// and the next line this tab reads must not erase it.
describe("reading a room through", () => {
  // jsdom lays nothing out, and a list with no height is a hidden one, read by no one: the list has one.
  beforeEach(() => {
    vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(400);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const reading = (unread: string | undefined, onReadThrough: () => void): LinesProps["keeping"] => ({
    unread,
    saved: new Set(),
    pinned: new Set(),
    onSave: () => "saved",
    onUnsave: () => undefined,
    onMarkUnread: () => undefined,
    onReadThrough,
  });

  it("forgets the place when the room opened with one is read to the end", () => {
    const forget = vi.fn();
    draw({ paged: true, onRead: () => undefined, keeping: reading(at(0), forget) });
    expect(forget).toHaveBeenCalledTimes(1);
  });

  it("forgets nothing when a line comes and the room holds no place", () => {
    const forget = vi.fn();
    draw({ paged: true, onRead: () => undefined, keeping: reading(at(0), forget) });
    draw({ paged: true, onRead: () => undefined, keeping: reading(undefined, forget) });
    forget.mockClear();
    draw({
      paged: true,
      onRead: () => undefined,
      keeping: reading(undefined, forget),
      lines: [...ROOM, line(LINES + 1)],
    });
    expect(forget).not.toHaveBeenCalled();
  });
});

// The root of this room's chain carries a 199-reply chip, so a chip that is a new object each
// render, or a thread read once a line, would draw the 200 lines again for each live line.
describe("the lines view, compiled: threads' chips", () => {
  const asked = { onThread: () => undefined };
  const reply = (n: number, to: number) => line(n, { reply: `m${String(to)}` });

  it("draws the chain's one chip, on its root, the thread read once", () => {
    draw(asked);
    expect(vi.mocked(threadsOf)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ThreadChip)).toHaveBeenCalledTimes(1);
    const chips = [...host.querySelectorAll("button")].filter((button) => /\d+ repl/.test(button.textContent));
    expect(chips).toHaveLength(1);
    expect(host.querySelectorAll("ol > li")[0]?.textContent).toContain("199 replies");
  });

  it("reads the threads once for a line that comes, and draws no chip again for a line that answers none", () => {
    draw(asked);
    vi.clearAllMocks();
    draw({ ...asked, lines: [...ROOM, line(LINES + 1, { text: "no one's reply" })] });
    expect(vi.mocked(threadsOf)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ThreadChip)).not.toHaveBeenCalled();
  });

  it("draws again the root's chip alone for a reply that comes", () => {
    draw(asked);
    vi.clearAllMocks();
    draw({ ...asked, lines: [...ROOM, reply(LINES + 1, 150)] });
    expect(vi.mocked(threadsOf)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ThreadChip)).toHaveBeenCalledTimes(1);
    expect(host.querySelectorAll("ol > li")[0]?.textContent).toContain("200 replies");
  });

  // A direct message's lines root no thread, so reading its chains each render is work for nothing.
  it("reads no thread of a direct message's lines, which root none", () => {
    draw({ ...asked, room: undefined });
    expect(vi.mocked(threadsOf)).not.toHaveBeenCalled();
    expect(vi.mocked(ThreadChip)).not.toHaveBeenCalled();
    expect(host.querySelectorAll("ol > li")).toHaveLength(LINES);
  });

  it("reads and draws no thread again when the pointer moves over lines", () => {
    draw(asked);
    vi.clearAllMocks();
    point(5);
    point(9);
    expect([vi.mocked(threadsOf).mock.calls.length, vi.mocked(ThreadChip).mock.calls.length]).toEqual([0, 0]);
  });

  it("draws again no line when a member comes", () => {
    draw(asked);
    vi.clearAllMocks();
    draw({ ...asked, members: [ALICE, BOB, "guest-ab12cd"] });
    expect(vi.mocked(ThreadChip)).not.toHaveBeenCalled();
  });
});

// Frames 20 to 35: the calls the chain told stand among the world's main room's messages, as cards, by the time each was
// heard; the keys of the list move among the messages and skip the cards.
describe("the lines view with the chain's calls", () => {
  const call = (height: number, atMs: number): ChainHeard => ({
    id: `h${String(height)}:0`,
    kind: "call",
    universe: "onyx",
    world: "govdao",
    realm: "gno.land/r/gov/dao",
    func: "MustVoteOnProposal",
    actor: "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv" as ChainHeard["actor"],
    height,
    at: new Date(T0 + atMs).toISOString(),
  });
  const room = {
    room: "#govdao",
    reactions: [],
    lines: [line(1, { id: "a", text: "first" }), line(3, { id: "b", text: "second" })],
  };
  const drawWith = (calls: readonly ChainHeard[], over: Partial<LinesProps> = {}) => {
    act(() => {
      root.render(
        <ChainPlaceContext value={{ slug: "govdao", universe: "onyx" }}>
          <ChainCallsContext value={calls}>
            <Lines {...PROPS} {...room} {...over} />
          </ChainCallsContext>
        </ChainPlaceContext>,
      );
    });
  };

  it("draws a card between the messages around the time it was heard, and none in another room", () => {
    drawWith([call(900030, 2 * 60_000)]);
    const items = [...host.querySelectorAll("ol > li")];
    expect(items.map((item) => item.hasAttribute("data-chain"))).toEqual([false, true, false]);
    expect(items[0]?.textContent).toContain("first");
    expect(items[1]?.textContent).toContain("called MustVoteOnProposal");
    expect(items[1]?.textContent).toContain("block 900030");
    expect(items[2]?.textContent).toContain("second");
    drawWith([call(900030, 2 * 60_000)], { room: "#govdao/crew" });
    expect(host.querySelectorAll("[data-chain]")).toHaveLength(0);
  });

  it("moves the arrow keys among the messages and over the cards, and gives a card no bar", () => {
    // jsdom lays nothing out: a focused line's bar scrolls into view nowhere.
    Object.assign(HTMLElement.prototype, { scrollIntoView: () => undefined });
    drawWith([call(900030, 2 * 60_000)]);
    const [first, , second] = [...host.querySelectorAll<HTMLElement>("ol > li")];
    act(() => {
      first?.focus();
      first?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    expect(document.activeElement).toBe(second);
    expect(host.querySelectorAll("[data-chain] [role='toolbar']")).toHaveLength(0);
  });
});
