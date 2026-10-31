// @vitest-environment jsdom
import type { ShownLine } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import { all, faceOf, follows, mount, one } from "../../../tests/mount.tsx";
import { LineView, type LineViewProps } from "./LineView.tsx";

// 5q: a message as the video shows it (frame 23.58.01): the person's nebula, the name,
// the time at the right edge, the text below. "Translated" waits for slice 10.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const bare = {
  id: "a",
  time: "2026-10-25T15:31:00.000Z",
  from: ALICE,
  text: "Lagos builders, we have a room now",
  kind: "message",
} as const;
const line = (over: Partial<ShownLine> = {}): ShownLine => ({ ...bare, account: ALICE, ...over });
// A guest's line: Ergo tags no account to it.
const guestLine = (): ShownLine => ({ ...bare, from: "guest-ab12cd" });
const props = (over: Partial<LineViewProps> = {}): LineViewProps => ({
  line: line(),
  me: BOB,
  members: new Set([ALICE, BOB]),
  stop: false,
  actions: null,
  fresh: false,
  verdict: undefined,
  players: false,
  saved: false,
  pinned: false,
  chips: undefined,
  react: undefined,
  answers: undefined,
  ...over,
});
const drawn = (over: Partial<LineViewProps> = {}) => {
  const box = mount(
    <ol>
      <LineView {...props(over)} />
    </ol>,
  );
  return { box, row: one(box, "li") };
};

const textOf = (row: Element) => one(row, "[data-line-text]");

describe("a line's look", () => {
  it("opens with the author's nebula, drawn from their address, beside the name and not saying it twice", () => {
    const { row } = drawn();
    const face = one(row, "[data-kind='person']");
    expect(face.getAttribute("aria-hidden")).toBe("true");
    expect(all(face, "svg circle").length).toBeGreaterThan(0);
    expect(row.textContent).toContain("g10gh7…3y5tv");
  });

  it("draws the same address as the same face, two addresses as two, and a guest as the night disc alone", () => {
    const face = (over: Partial<LineViewProps>) => one(drawn(over).row, "[data-kind='person']");
    const alice = faceOf(face({}));
    expect(alice).not.toBe("");
    expect(faceOf(face({}))).toBe(alice);
    expect(faceOf(face({ line: line({ from: BOB, account: BOB }) }))).not.toBe(alice);
    const guest = drawn({ line: guestLine() }).row;
    expect(all(guest, "svg")).toHaveLength(1);
    expect(all(guest, "svg circle")).toHaveLength(0);
    expect(faceOf(one(guest, "[data-kind='person']"))).toBe("");
  });

  it("holds the head in this order: the face, the name, then the time; the text is under it", () => {
    const { row } = drawn();
    const head = one(row, "[data-line-head]");
    const order = [one(head, "[data-kind='person']"), one(head, `[title="${ALICE}"]`), one(head, "time")];
    for (let at = 1; at < order.length; at += 1)
      expect(follows(order[at - 1] as Element, order[at] as Element)).toBe(true);
    expect(one(head, "time").getAttribute("datetime")).toBe("2026-10-25T15:31:00.000Z");
    expect(head.textContent).not.toContain("Lagos builders");
    expect(head.contains(textOf(row))).toBe(false);
    expect(follows(head, textOf(row))).toBe(true);
    expect(textOf(row).textContent).toBe("Lagos builders, we have a room now");
  });

  it("keeps my own line's mark: my name and the word you, and no 'Translated' slot before slice 10", () => {
    const { row } = drawn({ line: line({ from: BOB, account: BOB }) });
    expect(row.getAttribute("data-mine")).toBe("");
    expect(one(row, "[data-line-head]").textContent).toContain("you");
    expect(row.textContent).not.toContain("Translated");
  });
});

describe("a line's marks in the new head", () => {
  const headOf = (over: Partial<LineViewProps> = {}) => one(drawn(over).row, "[data-line-head]").textContent;

  it("puts 'Mentions you' in the head, after the name and before the time, on a line that mentions the reader", () => {
    expect(headOf({ line: line({ text: `hi @${BOB}` }) })).toMatch(/^g10gh7…3y5tv Mentions you \d{2}:\d{2}$/);
  });

  it("puts 'Notice' in the head of a notice, as the mark of a line no sender's words stand in", () => {
    expect(headOf({ line: line({ kind: "notice" }) })).toMatch(/^g10gh7…3y5tv Notice \d{2}:\d{2}$/);
  });

  it("puts the Pinned and Saved marks in the head, Pinned first, each before the time", () => {
    expect(headOf({ pinned: true, saved: true })).toMatch(/^g10gh7…3y5tv Pinned Saved \d{2}:\d{2}$/);
  });

  it("puts 'Edited' in the head right before the time", () => {
    expect(headOf({ line: line({ edited: true }) })).toMatch(/^g10gh7…3y5tv Edited \d{2}:\d{2}$/);
  });

  it("opens an action's head with its star, so the line still reads '* name text'", () => {
    const { row } = drawn({ line: line({ kind: "action", text: "waves" }) });
    expect(one(row, "[data-line-head]").textContent).toMatch(/^\* g10gh7…3y5tv \d{2}:\d{2}$/);
    expect(textOf(row).textContent).toBe("waves");
  });

  it("puts the quote of a reply between the head and the text, naming whom it answers", () => {
    const { row } = drawn({
      line: line({ reply: "r1", text: "agreed" }),
      answers: {
        id: "r1",
        time: "2026-10-25T15:30:00.000Z",
        from: BOB,
        account: BOB,
        text: "shall we?",
        kind: "message",
      },
    });
    const quote = all(row, "p").find((each) => each.textContent.startsWith("Replying to")) as Element;
    expect(quote.textContent).toContain("shall we?");
    expect(follows(one(row, "[data-line-head]"), quote)).toBe(true);
    expect(follows(quote, textOf(row))).toBe(true);
  });

  it("puts the New divider on a row of its own, before the head", () => {
    const { row } = drawn({ fresh: true });
    expect(row.getAttribute("data-new")).toBe("");
    expect(follows(one(row, "[class*='divider']"), one(row, "[data-line-head]"))).toBe(true);
    expect(one(row, "[data-line-head]").textContent).not.toContain("New");
  });

  it("puts the reaction chips and the thread chip after the text", () => {
    const { row } = drawn({ chips: "1 👍", react: () => true, replies: 2, onThread: () => undefined });
    const chip = all(row, "button").at(-1) as Element;
    expect(follows(textOf(row), chip)).toBe(true);
  });
});
