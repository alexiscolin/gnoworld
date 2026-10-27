// The lines view as the build compiles it, counting what a render recomputes (the complexity review of 4d's
// reactions): a room at its window, 200 lines each answering the one before, one edit folded, 1,000 reactions.
import type * as core from "@gnoworld/core";
import { excerpt, foldEdits, reactionsOn, type Line, type Reaction } from "@gnoworld/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Lines, type LinesProps } from "./Lines.tsx";
import { Reactions } from "./Reactions.tsx";
import type * as reactionsModule from "./Reactions.tsx";

vi.mock("@gnoworld/core", async (importOriginal) => {
  const real = await importOriginal<typeof core>();
  return {
    ...real,
    excerpt: vi.fn(real.excerpt),
    foldEdits: vi.fn(real.foldEdits),
    reactionsOn: vi.fn(real.reactionsOn),
  };
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

  it("shows the bar of the line the pointer enters, and of that one alone", () => {
    draw();
    expect(host.querySelectorAll("[role='toolbar']")).toHaveLength(0);
    point(5);
    const bars = host.querySelectorAll("[role='toolbar']");
    expect(bars).toHaveLength(1);
    expect(bars[0]?.closest("li")).toBe(host.querySelectorAll("ol > li")[5]);
  });

  // A new message made each reply line quote its line again: two Markdown parses and a grapheme cut, 200 times (F1220).
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
  // list to its end, forcing a layout, whatever the pointer had moved (F1221).
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

  // Every line with chips drew its chips again for each reaction and each line that came: 200 lines, 1,000 chips (F1222).
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
