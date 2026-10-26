import { describe, expect, test } from "vitest";
import type { Line } from "./room.ts";
import { shownLines } from "./shown.ts";

const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const at = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, "0")}:00.000Z`;
const line = (id: string, minute: number, text: string): Line => ({
  id,
  time: at(minute),
  from: ALICE,
  account: ALICE,
  text,
  kind: "message",
});
// A guest's line, which no account vouches for.
const guest = (id: string, minute: number, text: string): Line => ({
  id,
  time: at(minute),
  from: "guest-ab12cd",
  text,
  kind: "message",
});
const texts = (lines: readonly Line[]) => lines.map(({ id, text }) => `${id}:${text}`);

// 4d: an edit names the line it corrects (+gnoworld/edit); the room shows the correction in its line's place, marked
// edited, when the same account wrote both, the edit after its line, in the same room (F664); any other stays a line of
// its own. A line no edit corrects is shown as it is held.
describe("shownLines: a room's lines as shown, each edit in its line's place", () => {
  test("shows an edit by the line's own account in its place, marked edited, and not as a line of its own", () => {
    const lines = [line("a", 0, "helo"), line("b", 1, "next"), { ...line("e", 2, "hello"), ...{ edits: "a" } }];
    const shown = shownLines(lines);
    expect(texts(shown)).toEqual(["a:hello", "b:next"]);
    expect(shown[0]?.edited).toBe(true);
    expect(shown[1]).toBe(lines[1]);
  });

  test("keeps the line's id, time, author and the line it answers, not the edit's own", () => {
    const [shown] = shownLines([
      { ...line("a", 0, "helo"), ...{ reply: "z" } },
      { ...line("e", 2, "hello"), ...{ edits: "a", reply: "y" } },
    ]);
    expect(shown).toEqual({ ...{ ...line("a", 0, "hello"), ...{ reply: "z" } }, edited: true });
  });

  test("shows the newest of several edits", () => {
    const lines = [
      line("a", 0, "one"),
      { ...line("e1", 1, "two"), ...{ edits: "a" } },
      { ...line("e2", 2, "three"), ...{ edits: "a" } },
    ];
    expect(texts(shownLines(lines))).toEqual(["a:three"]);
  });

  test("shows an edit's kind with its text: an action corrected into a message", () => {
    const [shown] = shownLines([
      { ...line("a", 0, "waves"), ...{ kind: "action" } },
      { ...line("e", 1, "hi"), ...{ edits: "a" } },
    ]);
    expect(shown?.kind).toBe("message");
  });

  test("folds an edit of an edit into neither: the chain's last is a line of its own", () => {
    const lines = [
      line("a", 0, "one"),
      { ...line("e1", 1, "two"), ...{ edits: "a" } },
      { ...line("e2", 2, "three"), ...{ edits: "e1" } },
    ];
    expect(texts(shownLines(lines))).toEqual(["a:two", "e2:three"]);
  });

  test.each([
    [
      "another account's edit",
      [line("a", 0, "mine"), { ...line("e", 1, "theirs"), ...{ edits: "a", from: BOB, account: BOB } }],
    ],
    [
      "an edit by a guest, whom no account vouches for, of a guest's line under the same nick",
      [guest("a", 0, "mine"), { ...guest("e", 1, "theirs"), edits: "a" }],
    ],
    [
      "an edit of a line this room does not hold: another room's, or one older than its window",
      [{ ...line("e", 1, "fixed"), ...{ edits: "zz" } }],
    ],
    ["an edit of itself", [{ ...line("e", 1, "fixed"), ...{ edits: "e" } }]],
    ["an edit older than its line", [{ ...line("e", 0, "early"), ...{ edits: "a" } }, line("a", 1, "late")]],
    [
      "an edit of the same time as its line, sorted before it by its msgid",
      [{ ...line("0", 1, "early"), ...{ edits: "a" } }, line("a", 1, "late")],
    ],
  ])("keeps %s a line of its own, marked as no edit, and the line it names as it was", (_, lines) => {
    const shown = shownLines(lines);
    expect(shown).toBe(lines);
  });

  test("folds an edit of the same time as its line when sorted after it", () => {
    expect(texts(shownLines([line("a", 1, "helo"), { ...line("e", 1, "hello"), ...{ edits: "a" } }]))).toEqual([
      "a:hello",
    ]);
  });

  test("reads any msgid as a line's, an object's own names included", () => {
    const lines = [
      line("__proto__", 0, "one"),
      line("constructor", 1, "two"),
      { ...line("e1", 2, "uno"), ...{ edits: "__proto__" } },
      { ...line("e2", 3, "dos"), ...{ edits: "constructor" } },
      { ...line("e3", 4, "tres"), ...{ edits: "toString" } },
    ];
    expect(texts(shownLines(lines))).toEqual(["__proto__:uno", "constructor:dos", "e3:tres"]);
  });

  test("gives back the room's lines themselves when no line is corrected", () => {
    const lines = [line("a", 0, "one"), line("b", 1, "two")];
    expect(shownLines(lines)).toBe(lines);
  });
});
