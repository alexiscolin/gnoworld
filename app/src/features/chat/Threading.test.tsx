import { Address } from "@gnoworld/schemas";
import type { Line } from "@gnoworld/core";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { beforeAll, describe, expect, it } from "vitest";
import type { Dms } from "./Dms.tsx";
import { RoomView } from "./RoomView.tsx";
import { roomActs } from "./roomActs.ts";
import { shownOf, type Shown } from "./shown.tsx";
import { useThreads } from "./Threading.tsx";

// 4d's threads, G1: a direct message never offers a thread, whatever the page does to give its lines a bar (4d-dm-bar
// gives them the message bar). The one place that decides it is what the page hands the view: `useThreads` hands a
// direct message none, so its lines can show no chip and its bar no Open thread item, however they are drawn.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
// A root with two replies, a minute apart.
const LINES: Line[] = [{ id: "root" }, { id: "a", reply: "root" }, { id: "b", reply: "root" }].map((each, minute) => ({
  time: `2026-10-25T10:0${String(minute)}:00.000Z`,
  from: ALICE,
  account: ALICE,
  text: each.id,
  kind: "message",
  ...each,
}));
const acts = roomActs({ current: undefined }, "", () => undefined);
const SESSION = { kind: "in", address: ALICE } as const;
const dms = (partner: string | undefined): Dms => ({
  partner,
  nav: undefined,
  lines: LINES,
  empty: "",
  refused: undefined,
  problem: undefined,
});
const PEOPLE = <p>who is here</p>;

// The conversation in view as the page gives it, its lines the thread's: what useThreads hands the view, drawn with it
// as Loaded.tsx does, and marked by what it handed (a handler for a line, how many props, whether anything stands beside).
function draw(shown: Shown | undefined) {
  function Page() {
    const { view, aside } = useThreads({
      shown,
      state: STATE,
      session: SESSION,
      rooms: [],
      acts,
      people: PEOPLE,
    });
    return (
      <div data-handler={typeof view.onThread} data-props={Object.keys(view).length} data-aside={aside !== undefined}>
        {shown === undefined ? null : <RoomView {...shown.view} {...view} aside={aside} chat="connected" me={ALICE} />}
      </div>
    );
  }
  return renderToStaticMarkup(<Page />);
}
const PAGE = { sayTo: () => true, focus: false, noteId: "note" };
const STATE = {
  lines: LINES,
  members: [ALICE],
  topic: undefined,
  refused: undefined,
  typing: undefined,
  read: undefined,
};
const room = shownOf(dms(undefined), { id: "#bubble/games", state: STATE, acts }, PAGE);
// The same room is in the store behind it, its lines answering one another as well.
const dm = shownOf(dms(BOB), { id: "#bubble/games", state: STATE, acts }, PAGE);
const chips = (html: string) => html.match(/\b\d+ repl(?:y|ies)\b/g) ?? [];

beforeAll(async () => {
  // The lines view is a lazy chunk: asked once, so the drawings below hold its lines.
  for (const shown of [room, dm]) {
    if (shown !== undefined)
      await prerender(<RoomView {...shown.view} chat="connected" onDelete={() => false} onDismiss={() => undefined} />);
  }
});

describe("useThreads: what a conversation's page opens", () => {
  it("opens threads in a room: a handler for its lines, Who's here beside them, a chip on the root", () => {
    const html = draw(room);
    expect(html).toContain('data-handler="function"');
    expect(html).toContain('data-aside="true"');
    expect(html).toContain("who is here");
    expect(chips(html)).toEqual(["2 replies"]);
  });

  it("opens none in a direct message, whose lines answer one another: no handler, nothing beside, no chip", () => {
    expect(dm?.kind).toBe("dm");
    const html = draw(dm);
    expect(html).toContain('data-handler="undefined"');
    expect(html).toContain('data-props="0"');
    expect(html).toContain('data-aside="false"');
    expect(html).not.toContain("who is here");
    expect(html).toContain(">root<");
    expect(chips(html)).toEqual([]);
    expect(html).not.toContain("Open thread");
  });

  it("opens none for a conversation not in view", () => {
    const html = draw(undefined);
    expect(html).toContain('data-handler="undefined"');
    expect(html).toContain('data-props="0"');
    expect(html).toContain('data-aside="false"');
  });
});
