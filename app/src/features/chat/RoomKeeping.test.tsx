import type { Line } from "@gnoworld/core";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { beforeAll, describe, expect, it } from "vitest";
import { StoreProvider } from "../../storeContext.tsx";
import { useRoomKeeping } from "./RoomKeeping.ts";
import { RoomView, type RoomViewProps } from "./RoomView.tsx";

// 4d's marks on a room's lines (slice 4's 4d), apart from RoomView.test.tsx: a line saved or pinned says so in a word,
// and a line marked unread takes the New mark. `keeping` is what the room is told of the reader's device and the room's
// pins; a guest, and a direct message, are given none.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const T = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, "0")}:00.000Z`;
const line = (id: string, minute: number, over: Partial<Line> = {}): Line => ({
  id,
  time: T(minute),
  from: ALICE,
  account: ALICE,
  text: `text ${id}`,
  kind: "message",
  ...over,
});
const LINES = [line("a", 0), line("b", 1), line("c", 2), line("d", 3)];
// The places that leave line b, and line c, unread: the millisecond before each, as Ergo writes a time (4d's R18).
const BEFORE_B = "2026-10-25T10:00:59.999Z";
const BEFORE_C = "2026-10-25T10:01:59.999Z";
const none = () => undefined;
const keeping = (over: Partial<NonNullable<RoomViewProps["keeping"]>> = {}): NonNullable<RoomViewProps["keeping"]> => ({
  unread: undefined,
  saved: new Set(),
  pinned: new Set(),
  onSave: none,
  onUnsave: none,
  onMarkUnread: none,
  onReadThrough: none,
  ...over,
});
const room = (state: Partial<NonNullable<RoomViewProps["state"]>> = {}) => ({
  lines: LINES,
  members: [ALICE],
  read: T(3),
  paged: true as const,
  ...state,
});
const view = (over: Partial<RoomViewProps> = {}) =>
  renderToStaticMarkup(
    <RoomView
      room="#bubble/games"
      title="#games"
      state={room()}
      chat="connected"
      me={BOB}
      onDelete={() => false}
      onDismiss={() => undefined}
      {...over}
    />,
  );
const said = (html: string) =>
  html
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
const items = (html: string) => {
  const list = /<ol[^>]*aria-label="Messages"[^>]*>(.*)<\/ol>/s.exec(html)?.[1] ?? "";
  return [...list.matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map((m) => said(m[1] ?? ""));
};

// The lines view loads lazily (docs/decisions.md, 2026-10-26): drawn once and waited for, every view below draws it at once.
beforeAll(async () => {
  await prerender(
    <RoomView
      room="#bubble/games"
      title="#games"
      state={room()}
      chat="connected"
      onDelete={() => false}
      onDismiss={() => undefined}
    />,
  );
});

describe("the marks of a saved and a pinned line", () => {
  it("say Saved, in a word before the time, on the saved lines alone", () => {
    const rows = items(view({ keeping: keeping({ saved: new Set(["b", "d"]) }) }));
    expect(rows.map((row) => /^Saved \d{2}:\d{2} /.test(row))).toEqual([false, true, false, true]);
    expect(view({ keeping: keeping({ saved: new Set(["b"]) }) })).toContain('data-icon="bookmark"');
  });

  it("say Pinned, in a word before the time, on the pinned lines alone, to every reader", () => {
    const html = view({ keeping: keeping({ pinned: new Set(["c"]) }) });
    expect(items(html).map((row) => /^Pinned \d{2}:\d{2} /.test(row))).toEqual([false, false, true, false]);
    expect(html).toContain('data-icon="pin"');
    // A guest has no keeping, and reads the pin's word all the same, from the room's own pins.
    expect(items(view({ me: undefined, keeping: keeping({ pinned: new Set(["c"]) }) }))[2]).toMatch(/^Pinned /);
  });

  it("say both on a line that is saved and pinned, and neither on a room given none", () => {
    expect(items(view({ keeping: keeping({ saved: new Set(["a"]), pinned: new Set(["a"]) }) }))[0]).toMatch(
      /^(Saved Pinned|Pinned Saved) /,
    );
    const plain = items(view());
    expect(plain.join(" ")).not.toMatch(/Saved|Pinned/);
  });

  // A line's own words are the sender's: a line that says "Saved" is no saved line.
  it("never mistake a line's own words for the mark", () => {
    const rows = items(view({ state: room({ lines: [line("a", 0, { text: "Saved Pinned" })] }) }));
    expect(rows[0]).toMatch(/^\d{2}:\d{2} /);
  });
});

describe("a line marked unread", () => {
  it("takes the New mark, though Ergo's place is at the end of the room", () => {
    expect(items(view()).filter((row) => row.startsWith("New "))).toEqual([]);
    const rows = items(view({ keeping: keeping({ unread: BEFORE_B }) }));
    expect(rows.map((row) => row.startsWith("New "))).toEqual([false, true, false, false]);
    expect(rows[1]).toMatch(/^New from here \d{2}:\d{2} /);
  });

  it("is the earlier of the two places: Ergo's place behind the device's wins, and the device's behind Ergo's", () => {
    const behind = view({ state: room({ read: T(0) }), keeping: keeping({ unread: BEFORE_C }) });
    expect(items(behind).map((row) => row.startsWith("New "))).toEqual([false, true, false, false]);
    const ahead = view({ state: room({ read: T(2) }), keeping: keeping({ unread: BEFORE_B }) });
    expect(items(ahead).map((row) => row.startsWith("New "))).toEqual([false, true, false, false]);
  });

  it("takes the New mark where Ergo knows no place for the room", () => {
    const rows = items(view({ state: room({ read: undefined }), keeping: keeping({ unread: BEFORE_C }) }));
    expect(rows.map((row) => row.startsWith("New "))).toEqual([false, false, true, false]);
  });

  it("waits for the room's history, as Ergo's place does: no New mark before it came", () => {
    const html = view({ state: room({ paged: undefined }), keeping: keeping({ unread: BEFORE_B }) });
    expect(items(html).filter((row) => row.startsWith("New "))).toEqual([]);
  });

  it("marks one line New only, and marks none for a reader given no keeping", () => {
    const html = view({ keeping: keeping({ unread: BEFORE_B }) });
    expect(html.match(/data-new=""/g)).toHaveLength(1);
    expect(view({ me: undefined })).not.toContain("data-new");
  });
});

// What the page hands the room in view, from the store: nothing for a room that is none (a direct message), and for a room
// the device's places and lines, the pins, and Pin only where the server said the reader may.
const NO_PINNING = {
  pin: () => Promise.resolve({ ok: true as const }),
  unpin: () => Promise.resolve({ ok: true as const }),
};
function Probe({ room }: { room: string | undefined }) {
  const { keeping, pins } = useRoomKeeping(room, NO_PINNING);
  return (
    <p>
      {JSON.stringify({
        keeping:
          keeping === undefined
            ? null
            : { saved: [...keeping.saved], pinned: [...keeping.pinned], pin: keeping.pin !== undefined },
        pins: pins ?? null,
      })}
    </p>
  );
}
const probed = (room: string | undefined) =>
  renderToStaticMarkup(
    <StoreProvider>
      <Probe room={room} />
    </StoreProvider>,
  );

describe("the room in view's keeping, from the store", () => {
  it("is none for no room, a direct message's, which has neither", () => {
    expect(probed(undefined)).toBe("<p>{&quot;keeping&quot;:null,&quot;pins&quot;:null}</p>");
  });

  it("holds nothing saved or pinned and offers no Pin before the server has answered for the room", () => {
    expect(probed("#bubble")).toBe(
      "<p>{&quot;keeping&quot;:{&quot;saved&quot;:[],&quot;pinned&quot;:[],&quot;pin&quot;:false},&quot;pins&quot;:null}</p>",
    );
  });
});
