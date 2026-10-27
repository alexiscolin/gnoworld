// The chat's budgets (docs/plans/slice-4.md §4), measured by scripts/bench.py in the full gate: each bench names its
// budget in brackets, and the mean of its runs must stay under it. Out of src, so coverage never counts them.
import { markdown, mentions, parseLine, type Line } from "@gnoworld/core";
import { renderToStaticMarkup } from "react-dom/server";
import { bench, describe } from "vitest";
import { RoomView } from "../../src/features/chat/RoomView.tsx";

const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
// A line as long as Ergo lets an account's be, 510 bytes after its tags (parseLine's BODY_MAX), its text 441: marks,
// code, a link, two mentions, words. One byte more and parseLine refuses it, which the bench below throws on (G1).
const WORDS = `**gnogolf** at nine, \`#games\`, rules at https://gno.land/r/demo/golf ~~maybe~~ _surely_, @${ALICE} and @${BOB}. `;
const TEXT = WORDS.repeat(4).slice(0, 441);
const RAW = `@msgid=AB12cd34;time=2026-10-25T10:00:00.000Z;account=${ALICE} :${ALICE}!u@h PRIVMSG #bubble/games :${TEXT}`;

describe("a line", () => {
  bench("parseLine, markdown and mentions of a 510-byte line [0.2 ms]", () => {
    const parsed = parseLine(RAW);
    // A line parseLine refuses would time the refusal alone, and leave markdown and mentions unmeasured (G1).
    if (!parsed.ok) throw new Error(`the bench's line is refused: ${parsed.error}`);
    mentions(markdown(parsed.message.params[1] ?? ""));
  });
});

describe("a room", () => {
  const lines: Line[] = Array.from({ length: 200 }, (_, n) => ({
    id: `m${String(n)}`,
    time: new Date(Date.parse("2026-10-25T10:00:00.000Z") + n * 60_000).toISOString(),
    from: ALICE,
    account: ALICE,
    text: `${TEXT.slice(0, 200)} ${String(n)}`,
    kind: "message",
  }));
  const members = [ALICE, BOB, ...Array.from({ length: 98 }, (_, n) => `guest-${String(n).padStart(6, "0")}`)];
  bench("a room of 200 lines and 100 people drawn whole, a room switch's render [100 ms]", () => {
    renderToStaticMarkup(
      <RoomView room="#bubble/games" state={{ lines, members, topic: "Games" }} chat="connected" me={BOB} />,
    );
  });
});
