import { describe, expect, it } from "vitest";
import { ApiError } from "./index.ts";
import { PinList, PinnedLine, PinRequest, PINS_MAX } from "./pins.ts";

// Slice 4's 4d: a room's pins, GET /api/pins's answer and POST /api/pins's body (docs/plans/slice-4.md §7). A pin is
// the line as Ergo held it when a moderator pinned it: its id, time, author's account and text.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const pin = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  time: "2026-10-25T10:00:00.000Z",
  account: ALICE,
  text: "Welcome. Be kind.",
  ...over,
});

describe("PinnedLine", () => {
  it("takes a line's id, Ergo's time, its author's account and its text", () => {
    expect(PinnedLine.parse(pin())).toEqual(pin());
  });

  it("takes the longest line a message holds, 510 characters, and an id of 128", () => {
    expect(PinnedLine.safeParse(pin({ text: "x".repeat(510), id: "m".repeat(128) })).success).toBe(true);
  });

  it.each([
    ["an empty text", { text: "" }],
    ["a text of 511 characters", { text: "x".repeat(511) }],
    ["an empty id", { id: "" }],
    ["an id of 129 characters", { id: "m".repeat(129) }],
    ["an id with a space", { id: "m 1" }],
    ["an id with a comma", { id: "m,1" }],
    ["an id with a line break, which would start another command", { id: "m1\r\nQUIT" }],
    ["an id with a control character", { id: "m\u00011" }],
    ["a time in another form", { time: "2026-10-25T10:00:00Z" }],
    ["a day that is not one", { time: "2026-02-30T10:00:00.000Z" }],
    ["an author that is no address", { account: "alice" }],
    ["no author", { account: undefined }],
    ["a nick beside the account", { from: "alice" }],
    ["who pinned it", { by: ALICE }],
  ])("refuses %s", (_, over) => {
    expect(PinnedLine.safeParse(pin(over)).success).toBe(false);
  });
});

describe("PinList", () => {
  const list = (pins: unknown[], over: Record<string, unknown> = {}) => ({
    room: "#bubble/games",
    may: false,
    pins,
    ...over,
  });

  it(`takes a room, whether the reader may pin, and up to ${String(PINS_MAX)} pins`, () => {
    const pins = Array.from({ length: PINS_MAX }, (_, n) => pin({ id: `m${String(n)}` }));
    expect(PinList.parse(list(pins, { may: true })).pins).toHaveLength(PINS_MAX);
    expect(PinList.parse(list([]))).toEqual(list([]));
  });

  it.each([
    ["one pin too many", list(Array.from({ length: PINS_MAX + 1 }, (_, n) => pin({ id: `m${String(n)}` })))],
    ["no room", { may: false, pins: [] }],
    ["a room that is no room's", list([], { room: "bubble" })],
    ["no word on the right to pin", { room: "#bubble", pins: [] }],
    ["a right that is no boolean", list([], { may: "yes" })],
    ["a pin with a field it does not know", list([pin({ kind: "message" })])],
    ["a field beside the pins", list([], { total: 0 })],
  ])("refuses %s", (_, answer) => {
    expect(PinList.safeParse(answer).success).toBe(false);
  });
});

// A request names a room and a line, and nothing of the line: the server reads its text from Ergo, never from the page.
describe("PinRequest", () => {
  it("takes a room and a msgid alone", () => {
    expect(PinRequest.parse({ room: "#bubble/games", msgid: "m1" })).toEqual({ room: "#bubble/games", msgid: "m1" });
  });

  it.each([
    ["a text of the page's own", { room: "#bubble", msgid: "m1", text: "forged" }],
    ["an author of the page's own", { room: "#bubble", msgid: "m1", account: ALICE }],
    ["no msgid", { room: "#bubble" }],
    ["no room", { msgid: "m1" }],
    ["an empty msgid", { room: "#bubble", msgid: "" }],
    ["a msgid with a comma", { room: "#bubble", msgid: "a,b" }],
    ["a msgid with a line break and a command", { room: "#bubble", msgid: "m1\nQUIT" }],
    ["a room with a space", { room: "#bub ble", msgid: "m1" }],
    ["a room past Ergo's 64 characters", { room: `#${"a".repeat(64)}`, msgid: "m1" }],
  ])("refuses %s", (_, body) => {
    expect(PinRequest.safeParse(body).success).toBe(false);
  });
});

// A room holding its most is not a limit on the reader's requests: the page words them apart (4d's R8).
describe("the cap's own error code", () => {
  it("is one the server answers, beside too_many", () => {
    expect(ApiError.safeParse({ error: "full" }).success).toBe(true);
    expect(ApiError.safeParse({ error: "too_many" }).success).toBe(true);
  });
});
