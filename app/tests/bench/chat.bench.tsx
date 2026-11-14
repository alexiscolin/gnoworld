// The chat's budgets (docs/plans/slice-4.md §4), measured by scripts/bench.py, run by hand: each bench names its
// budget in brackets, and the mean of its runs must stay under it. Out of src, so coverage never counts them.
import { markdown, mentions, parseLine, type Line } from "@gnoworld/core";
import type { RoomList } from "@gnoworld/schemas";
import { Sidebar } from "@gnoworld/ui";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { bench, describe } from "vitest";
import { Composer } from "../../src/features/chat/Composer.tsx";
import { RoomsView } from "../../src/features/chat/RoomsView.tsx";
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

const lines: Line[] = Array.from({ length: 200 }, (_, n) => ({
  id: `m${String(n)}`,
  time: new Date(Date.parse("2026-10-25T10:00:00.000Z") + n * 60_000).toISOString(),
  from: ALICE,
  account: ALICE,
  text: `${TEXT.slice(0, 200)} ${String(n)}`,
  kind: "message",
}));
const members = [ALICE, BOB, ...Array.from({ length: 98 }, (_, n) => `guest-${String(n).padStart(6, "0")}`)];
const room = (
  <RoomView
    room="#bubble/games"
    state={{ lines, members }}
    chat="connected"
    me={BOB}
    onDelete={() => false}
    onDismiss={() => undefined}
  />
);
// The lines view loads lazily, once (RoomView.tsx): drawn and waited for here, a room switch then draws it at once.
await prerender(room);

describe("a room", () => {
  bench("RoomView alone, a room of 200 lines and 100 people drawn whole [100 ms]", () => {
    renderToStaticMarkup(room);
  });
  // Plan §4: "a room switch under 100 ms with 100 rooms". A switch draws what ChatPanel's Loaded draws for the new
  // room: the list of the world's 100 rooms, the room, and its composer with a mention in progress, which sorts the
  // members. Rendered to a string, so no commit and no effect: what a switch costs in React's render, not in the DOM.
  const rooms = Array.from({ length: 100 }, (_, n) => `#bubble/room-${String(n).padStart(3, "0")}`);
  const sections: RoomList["sections"] = Array.from({ length: 5 }, (_, s) => ({
    name: `Section ${String(s)}`,
    rooms: rooms.slice(s * 20, s * 20 + 20).map((room) => ({ room, type: "open" as const })),
  }));
  bench(
    "a room switch: 100 rooms listed, a room of 200 lines and 100 people, its composer, drawn whole [100 ms]",
    () => {
      renderToStaticMarkup(
        <Sidebar space="l">
          <RoomsView sections={sections} current={rooms[42]} />
          <RoomView
            room="#bubble/room-042"
            state={{ lines, members }}
            chat="connected"
            me={BOB}
            onDelete={() => false}
            onDismiss={() => undefined}
            composer={
              <Composer
                room="#bubble/room-042"
                nick={BOB}
                rooms={rooms.map((room) => room.replace("#bubble/", "#"))}
                members={members}
                draft="see @guest-00"
                onSay={() => true}
              />
            }
          />
        </Sidebar>,
      );
    },
  );
});
