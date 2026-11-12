// @vitest-environment jsdom
import type { Line } from "@gnoworld/core";
import type { JarvisTranslateRequest, JarvisTranslation } from "@gnoworld/schemas";
import { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { all, click, mount, one } from "../../../tests/mount.tsx";
import { tellJarvisHere, type JarvisHere } from "../../jarvisHere.ts";
import type { Result } from "../../lib/api/http.ts";
import { wantTranslation } from "../../translating.ts";
import { LineActions } from "./LineActions.tsx";
import { BARE_ROW, LineView, type LineViewProps } from "./LineView.tsx";
import { TranslationHalt } from "./TranslationHalt.tsx";

// A line's translation, as the room draws it: asked as the row comes on screen, the original always kept and the translation under it,
// folded from the More menu; nothing for a line already in the reader's language; one muted line in the room when asking stops.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const ROOM = "#bubble/games";
const LINE: Line = {
  id: "AB12",
  time: "2026-10-25T10:00:00.000Z",
  from: ALICE,
  account: ALICE,
  text: "hello there",
  kind: "message",
};
const here = (over: Partial<JarvisHere> = {}): JarvisHere => ({
  room: ROOM,
  universe: { id: "onyx", isDefault: true },
  account: BOB,
  language: "fr",
  ...over,
});
const tell = (next: JarvisHere | undefined) => {
  act(() => {
    tellJarvisHere(next);
  });
};
type Ask = (request: JarvisTranslateRequest) => Promise<Result<JarvisTranslation>>;
const ok = (value: JarvisTranslation): Result<JarvisTranslation> => ({ ok: true, value });
const view = (over: Partial<LineViewProps> = {}) =>
  mount(
    <ol>
      <LineView line={{ ...LINE }} room={ROOM} me={BOB} members={new Set()} {...BARE_ROW} {...over} />
    </ol>,
  );
let n = 0;
// A line id no other test has asked for: the page's memory of translations outlives a test.
const fresh = (): Line => ({ ...LINE, id: `T${String((n += 1))}` });
const translate = async (line: Line, answer: Result<JarvisTranslation>) => {
  const ask = vi.fn<Ask>(() => Promise.resolve(answer));
  wantTranslation({ room: ROOM, id: line.id, language: "fr" }, ask);
  await act(() => vi.advanceTimersByTimeAsync(200));
  return ask;
};
const text = (box: HTMLElement) => one(box, "[data-line-text]").textContent;
const items = (box: HTMLElement) => all(box, "[role='menuitem']").map((each) => each.textContent);

beforeAll(() => {
  // jsdom has no popover API: an item closes its menu with it.
  Object.assign(HTMLElement.prototype, { hidePopover: () => undefined });
});
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  tell(undefined);
});
afterEach(async () => {
  // The page's queue outlives a test: let its pending wait run out.
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
});

describe("a translated line", () => {
  it("keeps the original and draws the translation under it, over one label naming the original's language", async () => {
    const line = fresh();
    tell(here());
    const box = view({ line: line });
    await translate(line, ok({ status: "translated", text: "bonjour là", from: "en" }));
    expect(text(box)).toBe("hello there");
    const block = one(box, "[data-translation]");
    expect(block.textContent).toBe("Translated from Englishbonjour là");
    expect(one(block, ".meta").textContent).toBe("Translated from English");
  });

  it("says only Translated when the answer names no language, and keeps a list's markup in the translation", async () => {
    const line = fresh();
    tell(here());
    const box = view({ line: line });
    await translate(line, ok({ status: "translated", text: "- un\n- deux" }));
    const block = one(box, "[data-translation]");
    expect(one(block, ".meta").textContent).toBe("Translated");
    expect(all(block, "li")).toHaveLength(2);
  });

  it("draws nothing under a line already in the reader's language, nor while it is asked, nor after a failure", async () => {
    const [same, asking, failed] = [fresh(), fresh(), fresh()];
    tell(here());
    const boxes = [same, asking, failed].map((line) => view({ line: line }));
    await translate(same, ok({ status: "original" }));
    let answer: (result: Result<JarvisTranslation>) => void = () => undefined;
    wantTranslation({ room: ROOM, id: asking.id, language: "fr" }, () => new Promise((resolve) => (answer = resolve)));
    await act(() => vi.advanceTimersByTimeAsync(3000));
    for (const box of boxes) expect(all(box, "[data-translation]")).toHaveLength(0);
    answer({ ok: false, reason: "unavailable" });
    await act(() => vi.advanceTimersByTimeAsync(3000));
    await translate(failed, { ok: false, reason: "unavailable" });
    for (const box of boxes) expect(all(box, "[data-translation]")).toHaveLength(0);
  });

  it("draws no translation for a line of no room, and none to a reader Jarvis is not here for", async () => {
    const line = fresh();
    tell(here());
    const box = view({ line: line, room: undefined });
    await translate(line, ok({ status: "translated", text: "salut" }));
    expect(all(box, "[data-translation]")).toHaveLength(0);
    tell(undefined);
    expect(all(view({ line: line }), "[data-translation]")).toHaveLength(0);
  });
});

describe("a line's row coming on screen", () => {
  function watching() {
    const seen: { watched: Element[] }[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        watched: Element[] = [];
        constructor() {
          seen.push(this);
        }
        observe = (row: Element) => this.watched.push(row);
        disconnect = () => undefined;
      },
    );
    return seen;
  }

  it("asks its translation once, for a reader's line in a room, the row watched being the line's own", () => {
    const seen = watching();
    tell(here());
    const box = view({ line: fresh() });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.watched[0]).toBe(one(box, "li"));
    vi.unstubAllGlobals();
  });

  it.each([
    ["the reader's own line", () => here(), { line: { ...LINE, account: BOB } }],
    ["a guest", () => here({ account: undefined }), {}],
    ["a reader who switched it off", () => here({ auto: false }), {}],
    ["a notice", () => here(), { line: { ...LINE, kind: "notice" as const } }],
    ["a line of no room", () => here(), { room: undefined }],
  ])("is not watched for %s", (_, told, over) => {
    const seen = watching();
    tell(told());
    view(over);
    expect(seen).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});

describe("a translation's fold in the More menu", () => {
  const bar = (line: Line) =>
    mount(
      <LineActions
        line={line}
        room={ROOM}
        me={BOB}
        onCopy={() => undefined}
        onDelete={() => true}
        onReact={() => true}
        onReply={() => undefined}
      />,
    );

  it("offers Hide translation where one is drawn, and Show translation once folded, and nothing where none is", async () => {
    const line = fresh();
    tell(here());
    const withNone = bar(line);
    expect(items(withNone).join()).not.toMatch(/translation/);
    const box = view({ line: line });
    await translate(line, ok({ status: "translated", text: "salut", from: "en" }));
    const menu = bar(line);
    expect(items(menu)).toContain("Hide translation");
    click(all(menu, "[role='menuitem']").find((each) => each.textContent === "Hide translation"));
    expect(all(box, "[data-translation]")).toHaveLength(0);
    expect(text(box)).toBe("hello there");
    expect(items(bar(line))).toContain("Show translation");
    click(all(bar(line), "[role='menuitem']").find((each) => each.textContent === "Show translation"));
    expect(all(box, "[data-translation]")).toHaveLength(1);
  });

  it("offers nothing for a line already in the reader's language", async () => {
    const line = fresh();
    tell(here());
    await translate(line, ok({ status: "original" }));
    expect(items(bar(line)).join()).not.toMatch(/translation/);
  });
});

describe("the room's line when asking stopped", () => {
  it("says the day's budget is spent, once, in the room", async () => {
    tell(here());
    const box = mount(<TranslationHalt />);
    expect(box.textContent).toBe("");
    await translate(fresh(), ok({ status: "spent" }));
    expect(box.textContent).toContain("Translations are used up for today");
    expect(all(box, "p")).toHaveLength(1);
  });
});
