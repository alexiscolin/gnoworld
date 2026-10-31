// The bubbles' budget (docs/plans/slice-6.md §4): the pick runs when a message arrives and once a second, over the newest
// readLast messages alone, so 125, 500 and 2000 messages cost what the cap holds. The budgets are the plan's proposal,
// to be set from the first measure. Measured by scripts/bench.py in the full gate.
import { bench, describe } from "vitest";
import rules from "../../data/bubbles.json" with { type: "json" };
import { cutText } from "../../../packages/core/src/bubbles/cut.ts";
import { pickBubbles, type BubbleMessage, type Viewer } from "../../../packages/core/src/bubbles/pickBubbles.ts";

const NOW = Date.UTC(2026, 9, 31, 12, 0, 0);
const CODES = "JP FR DE US BR IN CA AU IT ES MX KR NL SE NO FI DK PL PT IE CH AT BE GR TR AR CL CO PE NZ".split(" ");
const VIEWER: Viewer = {
  account: "me",
  hub: "bubble",
  muted: ["acct7"],
  banned: ["acct9"],
  facing: { lat: 36, lon: 138 },
};
const crowd = (count: number): BubbleMessage[] =>
  Array.from({ length: count }, (_, n) => ({
    id: `m${String(n)}`,
    at: NOW - 1000 - n * 37,
    account: `acct${String(n % 400)}`,
    text: `hello from number ${String(n)} `.repeat(1 + (n % 5)),
    country: CODES[n % CODES.length] ?? "JP",
    visibility: n % 11 === 0 ? ("private" as const) : ("public" as const),
    joined: true,
    hub: n % 3 === 0 ? "bubble" : "other",
    mentions: n % 17 === 0 ? ["me"] : [],
  }));

/** One pick, with a state of a few bubbles on screen; throws when it shows nothing, so a broken bench has no sample. */
const timed = (messages: BubbleMessage[]) => () => {
  const first = pickBubbles(messages, NOW, VIEWER, rules, []);
  const out = pickBubbles(messages, NOW + 1000, VIEWER, rules, first.shown);
  if (out.bubbles.length === 0) throw new Error("the bench shows no bubble");
};

// Each name a literal, so scripts/bench.py sees a bench switched off.
describe("bubbles", () => {
  const small = crowd(125);
  const cap = crowd(500);
  const past = crowd(2000);
  bench("a pick over 125 messages [1 ms]", timed(small));
  bench("a pick over 500 messages [1 ms]", timed(cap));
  bench("a pick over 2000 messages, which reads 500 [1 ms]", timed(past));
  const megabyte = "ab​\n".repeat(256 * 1024);
  bench("the cut of a text of a megabyte [2 ms]", () => {
    if (cutText(megabyte, rules.maxChars).length === 0) throw new Error("the bench cuts to nothing");
  });
});
