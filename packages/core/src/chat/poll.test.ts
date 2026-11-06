import { describe, expect, it } from "vitest";
import { pollAsked, pollOf, pollText, POLL_KEYS, revote, votesOn, type Poll } from "./poll.ts";
import type { Reaction } from "./reactions.ts";

// core/chat/poll (slice 8's 8d): a poll is a line any client reads, its votes the keycap reactions on it.

const poll: Poll = { question: "Lunch?", answers: ["Pizza", "Sushi", "Soup"] };
const vote = (who: string, emoji: string, over: Partial<Reaction> = {}): Reaction => ({
  id: `${who}-${emoji}-${over.time ?? "t1"}`,
  time: "2026-01-01T00:00:01Z",
  to: "line",
  emoji,
  who,
  on: true,
  ...over,
});
const tally = (reactions: Reaction[], me?: string, lineOf?: (id: string) => string) =>
  votesOn(reactions, { to: "line", answers: 3, me, ...(lineOf === undefined ? {} : { lineOf }) });

describe("a poll's text", () => {
  it("is read back as the poll that was sent", () => {
    expect(pollOf(pollText(poll))).toEqual(poll);
  });

  it("puts the chart mark, then each answer after its keycap, a line each", () => {
    expect(pollText(poll).split("\n")).toEqual([
      "📊 Lunch?",
      ...poll.answers.map((a, i) => `${POLL_KEYS[i] ?? ""} ${a}`),
    ]);
  });

  it("sends a keycap-less line for a tenth answer, which a reader then refuses", () => {
    const ten = { question: "Q", answers: Array.from({ length: 10 }, () => "a") };
    expect(pollOf(pollText(ten))).toBeUndefined();
  });

  it("is refused when it does not start with the mark and a space", () => {
    expect(pollOf("📊Lunch?\n1️⃣ a\n2️⃣ b")).toBeUndefined();
    expect(pollOf("Lunch?\n1️⃣ a\n2️⃣ b")).toBeUndefined();
    expect(pollOf("")).toBeUndefined();
  });

  it("is refused with an empty question", () => {
    expect(pollOf("📊  \n1️⃣ a\n2️⃣ b")).toBeUndefined();
  });

  it("is refused with fewer than two answers", () => {
    expect(pollOf("📊 Q\n1️⃣ a")).toBeUndefined();
    expect(pollOf("📊 Q")).toBeUndefined();
  });

  it("is refused with more than nine answers", () => {
    const ten = Array.from({ length: 10 }, (_, at) => `${POLL_KEYS[at] ?? "🔟"} a`);
    expect(pollOf(["📊 Q", ...ten].join("\n"))).toBeUndefined();
  });

  it("holds nine answers", () => {
    const nine = POLL_KEYS.map((key) => `${key} a`);
    expect(pollOf(["📊 Q", ...nine].join("\n"))?.answers).toHaveLength(9);
  });

  it("is refused when an answer is empty, or lacks its own keycap, or has them out of order", () => {
    expect(pollOf("📊 Q\n1️⃣ a\n2️⃣ ")).toBeUndefined();
    expect(pollOf("📊 Q\n1️⃣ a\n- b")).toBeUndefined();
    expect(pollOf("📊 Q\n2️⃣ a\n1️⃣ b")).toBeUndefined();
  });
});

describe("a poll asked with /poll", () => {
  it("is a question and its answers, whitespace squeezed", () => {
    expect(pollAsked("  Lunch?  |  Pizza   pie | Sushi ")).toEqual({
      question: "Lunch?",
      answers: ["Pizza pie", "Sushi"],
    });
  });

  it("is none for fewer than two answers, more than nine, or an empty part", () => {
    expect(pollAsked("Q | a")).toBeUndefined();
    expect(pollAsked(`Q | ${Array.from({ length: 10 }, () => "a").join(" | ")}`)).toBeUndefined();
    expect(pollAsked(" | a | b")).toBeUndefined();
    expect(pollAsked("Q | a | ")).toBeUndefined();
    expect(pollAsked("")).toBeUndefined();
  });
});

describe("a poll's votes", () => {
  it("counts one per answer and none for a poll without reactions", () => {
    expect(tally([], "me")).toEqual({ counts: [0, 0, 0], mine: undefined });
    const votes = tally([vote("a", "1️⃣"), vote("b", "1️⃣"), vote("c", "3️⃣")], "c");
    expect(votes).toEqual({ counts: [2, 0, 1], mine: 2 });
  });

  it("has no vote of mine for a reader that is not signed in", () => {
    expect(tally([vote("a", "1️⃣")]).mine).toBeUndefined();
  });

  it("counts one vote an account: its newest keycap", () => {
    const votes = tally([vote("a", "1️⃣"), vote("a", "2️⃣", { time: "2026-01-01T00:00:02Z" })], "a");
    expect(votes).toEqual({ counts: [0, 1, 0], mine: 1 });
  });

  it("orders two reactions of one time by msgid", () => {
    const [low, high] = [vote("a", "1️⃣", { id: "m1" }), vote("a", "2️⃣", { id: "m2" })];
    expect(tally([high, low]).counts).toEqual([0, 1, 0]);
    expect(tally([low, high]).counts).toEqual([0, 1, 0]);
  });

  it("takes a vote back when its keycap is turned off", () => {
    const off = vote("a", "1️⃣", { on: false, time: "2026-01-01T00:00:02Z" });
    expect(tally([vote("a", "1️⃣"), off], "a")).toEqual({ counts: [0, 0, 0], mine: undefined });
  });

  it("moves to the keycap still on when the newest one is taken back, from a client that voted on two", () => {
    const [one, two] = [vote("a", "1️⃣"), vote("a", "2️⃣", { time: "2026-01-01T00:00:02Z" })];
    const off = vote("a", "2️⃣", { on: false, time: "2026-01-01T00:00:03Z" });
    expect(tally([one, two], "a").counts).toEqual([0, 1, 0]);
    expect(tally([one, two, off], "a")).toEqual({ counts: [1, 0, 0], mine: 0 });
  });

  it("ignores other lines, other emoji and keycaps past the answers", () => {
    const votes = tally([vote("a", "1️⃣", { to: "other" }), vote("b", "👍"), vote("c", "4️⃣")], "a");
    expect(votes).toEqual({ counts: [0, 0, 0], mine: undefined });
  });

  it("reaches a folded edit's line through lineOf", () => {
    const onEdit = vote("a", "2️⃣", { to: "edit" });
    const lineOf = (id: string) => (id === "edit" ? "line" : id);
    expect(tally([onEdit], "a", lineOf)).toEqual({ counts: [0, 1, 0], mine: 1 });
    expect(tally([onEdit], "a").counts).toEqual([0, 0, 0]);
  });
});

describe("moving a vote", () => {
  it("adds the keycap alone for a reader without a vote", () => {
    expect(revote({ mine: undefined }, 1)).toEqual([{ emoji: POLL_KEYS[1], on: true }]);
  });

  it("takes the old keycap back, then adds the new", () => {
    expect(revote({ mine: 0 }, 2)).toEqual([
      { emoji: POLL_KEYS[0], on: false },
      { emoji: POLL_KEYS[2], on: true },
    ]);
  });

  it("takes the vote back alone on its own answer", () => {
    expect(revote({ mine: 1 }, 1)).toEqual([{ emoji: POLL_KEYS[1], on: false }]);
  });

  it("does nothing for an answer past the nine keycaps", () => {
    expect(revote({ mine: 0 }, 9)).toEqual([]);
  });

  it("adds the new keycap alone when the old index has no keycap", () => {
    expect(revote({ mine: 20 }, 1)).toEqual([{ emoji: POLL_KEYS[1], on: true }]);
  });
});
