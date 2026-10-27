import { describe, expect, test } from "vitest";
import { parseLine, type IrcMessage } from "../irc/irc.ts";
import type { Line } from "./room.ts";
import { canEdit, editsFolded, foldEdits, redactedLines, shownLines } from "./shown.ts";

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

  // The code review (CR5): what a plain client answers or reacts to by the edit's own msgid reaches the line.
  test("names each folded edit's line by the edit's msgid, and no edit kept a line of its own", () => {
    const lines = [
      line("a", 0, "helo"),
      { ...line("e", 1, "hello"), ...{ edits: "a" } },
      { ...line("f", 2, "hello!"), ...{ edits: "a" } },
      { ...line("x", 3, "theirs"), ...{ edits: "a", account: BOB, from: BOB } },
    ];
    expect([...editsFolded(lines)]).toEqual([
      ["e", "a"],
      ["f", "a"],
    ]);
  });

  test("gives back the room's lines themselves when no line is corrected", () => {
    const lines = [line("a", 0, "one"), line("b", 1, "two")];
    expect(shownLines(lines)).toBe(lines);
  });
});

// F1181 (the simplify pass's A2): the room's lines as shown and each folded edit's line come from one fold, which the
// room's lines view and its reply lookup each ask once.
describe("foldEdits: the shown lines and the folded edits together", () => {
  const lines = [line("a", 0, "helo"), line("b", 1, "next"), { ...line("e", 2, "hello"), ...{ edits: "a" } }];

  test("gives what shownLines and editsFolded give", () => {
    const { shown, folded } = foldEdits(lines);
    expect(shown).toEqual(shownLines(lines));
    expect(folded).toEqual(editsFolded(lines));
    expect(texts(shown)).toEqual(["a:hello", "b:next"]);
    expect(folded.get("e")).toBe("a");
  });

  test("gives the lines themselves, folded nothing, when no edit folds", () => {
    const plain = [line("a", 0, "one"), line("b", 1, "two")];
    expect(foldEdits(plain).shown).toBe(plain);
    expect(foldEdits(plain).folded.size).toBe(0);
  });
});

// slice-4-room-edit, security: a corrected line shows its newest edit's words under its own msgid, and what is checked of
// a line (the moderation's verdict) is checked by msgid: the reader needs the edit's msgid, to wait on the edit's verdict.
describe("foldEdits: the newest edit each corrected line shows", () => {
  test("names, by the line's msgid, the newest edit folded into it", () => {
    const lines = [
      line("a", 0, "one"),
      line("b", 1, "other"),
      { ...line("e1", 2, "two"), ...{ edits: "a" } },
      { ...line("e2", 3, "three"), ...{ edits: "a" } },
      { ...line("e3", 4, "other, fixed"), ...{ edits: "b" } },
    ];
    expect(foldEdits(lines).newest).toEqual(
      new Map([
        ["a", "e2"],
        ["b", "e3"],
      ]),
    );
  });

  test("names none for a line no edit is folded into: another account's edit, an orphan, no edit at all", () => {
    expect(foldEdits([line("a", 0, "one")]).newest.size).toBe(0);
    expect(
      foldEdits([line("a", 0, "mine"), { ...line("e", 1, "theirs"), ...{ edits: "a", from: BOB, account: BOB } }])
        .newest.size,
    ).toBe(0);
    expect(foldEdits([{ ...line("e", 1, "orphan"), ...{ edits: "gone" } }]).newest.size).toBe(0);
  });
});

// The room edit's red pass (R1): a REDACT of a line takes with it the corrections shown in its place, and one of a
// correction alone is held back while its line is held.
describe("redactedLines: a REDACT of a line and of its corrections", () => {
  const read = (text: string): IrcMessage => {
    const parsed = parseLine(text);
    if (!parsed.ok) throw new Error(`the test's line does not parse: ${text}`);
    return parsed.message;
  };
  const edit = (id: string, minute: number, { of, who = ALICE }: { of: string; who?: string }): Line => ({
    ...line(id, minute, `edit ${id}`),
    ...{ from: who, account: who, edits: of },
  });
  const redact = (id: string, sender = ALICE, room = "#bubble") => read(`:${sender}!u@h REDACT ${room} ${id}`);
  const ids = (lines: readonly Line[]) => lines.map((each) => each.id);
  // Another account's line first, so a lookup that takes the first line finds no author.
  const first: Line = { ...line("z", 0, "first"), from: BOB, account: BOB };
  const held = [
    first,
    line("a", 0, "one"),
    edit("e1", 1, { of: "a" }),
    edit("e2", 2, { of: "a" }),
    line("b", 3, "two"),
  ];

  test("takes the line and every correction of its author's, whoever deletes it", () => {
    expect(ids(redactedLines(held, redact("a"), "#bubble"))).toEqual(["z", "b"]);
    expect(ids(redactedLines(held, redact("a", "gnoworld"), "#bubble"))).toEqual(["z", "b"]);
  });

  test("keeps another account's line naming it, and a correction of another line", () => {
    const lines = [...held, edit("p", 4, { of: "a", who: BOB }), edit("e3", 5, { of: "b" })];
    expect(ids(redactedLines(lines, redact("a", "gnoworld"), "#bubble"))).toEqual(["z", "b", "p", "e3"]);
  });

  test("takes the sender's own lines naming a line it no longer holds, as its own delete of it", () => {
    const lines = [edit("e1", 1, { of: "gone" }), edit("p", 2, { of: "gone", who: BOB })];
    expect(ids(redactedLines(lines, redact("gone"), "#bubble"))).toEqual(["p"]);
  });

  test("holds back its author's REDACT of a correction whose line is held, and takes one whose line is gone", () => {
    expect(redactedLines(held, redact("e1"), "#bubble")).toBe(held);
    expect(ids(redactedLines([edit("e1", 1, { of: "gone" })], redact("e1"), "#bubble"))).toEqual([]);
  });

  test("takes a moderator's REDACT of a correction, the line showing as it was", () => {
    expect(ids(redactedLines(held, redact("e2", "gnoworld"), "#bubble"))).toEqual(["z", "a", "e1", "b"]);
  });

  test.each([
    ["another room's REDACT", redact("a", ALICE, "#garden")],
    ["a REDACT of a line it does not hold", redact("zz")],
    ["a REDACT with no line", read(":gnoworld!u@h REDACT #bubble")],
    ["a REDACT with nothing", read(":gnoworld!u@h REDACT")],
    ["a message whose text is a line's id", read(`@msgid=x;time=${at(9)} :${ALICE}!u@h PRIVMSG #bubble a`)],
  ])("leaves the same array for %s", (_, message) => {
    expect(redactedLines(held, message, "#bubble")).toBe(held);
  });

  test("takes a REDACT with no source as one from nobody: the author's corrections go, no account-less line", () => {
    const lines = [...held, { ...guest("g", 4, "a guest"), edits: "a" }];
    expect(ids(redactedLines(lines, read("REDACT #bubble a"), "#bubble"))).toEqual(["z", "b", "g"]);
  });

  test("reads the REDACT's room whatever its case", () => {
    expect(ids(redactedLines(held, redact("a", ALICE, "#BUBBLE"), "#bubble"))).toEqual(["z", "b"]);
  });
});

// CR5 of the room edit: one rule for the menu's Edit and the composer's, which each held a part of it.
describe("canEdit", () => {
  const mine = line("a", 1, "mine");
  test("is true for a message of the reader's own", () => {
    expect(canEdit(mine, ALICE)).toBe(true);
  });
  test.each([
    ["another account's line", mine, BOB],
    ["a guest, which has no address", mine, undefined],
    ["a line no account vouches for", guest("g", 1, "hi"), "guest-ab12cd"],
    ["an action", { ...mine, kind: "action" as const }, ALICE],
    ["a notice", { ...mine, kind: "notice" as const }, ALICE],
    ["a correction, whose original may have left", { ...mine, edits: "z" }, ALICE],
  ])("is false for %s", (_, subject, me) => {
    expect(canEdit(subject, me)).toBe(false);
  });
});
