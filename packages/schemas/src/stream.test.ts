import { describe, expect, it } from "vitest";
import { LineVerdicts, StreamEvent, VERDICTS_ASKED } from "./stream.ts";

describe("StreamEvent", () => {
  it.each([["checked"], ["hidden"]])("takes a %s message's id, room and state", (state) => {
    const event = { msgid: "m".repeat(128), room: "#".padEnd(64, "b"), state };
    expect(StreamEvent.parse(event)).toEqual(event);
  });

  it.each(["#b", "#bubble"])("takes the room %s, 2 characters or more", (room) => {
    expect(StreamEvent.parse({ msgid: "m1", room, state: "checked" }).room).toBe(room);
  });

  it.each([
    ["an empty id", { msgid: "", room: "#bubble", state: "checked" }],
    ["an id of 129 characters", { msgid: "m".repeat(129), room: "#bubble", state: "checked" }],
    ["a room of 1 character", { msgid: "m1", room: "#", state: "checked" }],
    ["a room of 65 characters", { msgid: "m1", room: "#".padEnd(65, "b"), state: "checked" }],
    ["another state", { msgid: "m1", room: "#bubble", state: "pending" }],
    ["a text beside it", { msgid: "m1", room: "#bubble", state: "checked", text: "hello" }],
  ])("refuses %s", (_, event) => {
    expect(StreamEvent.safeParse(event).success).toBe(false);
  });
});

// 4g: GET /api/verdicts's answer, the lines asked that hold a verdict, for a history older than the stream's replay.
describe("LineVerdicts", () => {
  const verdict = (msgid: string, state = "checked") => ({ msgid, state });

  it(`takes a room and up to ${String(VERDICTS_ASKED)} lines' verdicts, none included`, () => {
    const many = Array.from({ length: VERDICTS_ASKED }, (_, n) =>
      verdict(`m${String(n)}`, n % 2 ? "hidden" : "checked"),
    );
    expect(LineVerdicts.parse({ room: "#bubble", verdicts: many }).verdicts).toHaveLength(VERDICTS_ASKED);
    expect(LineVerdicts.parse({ room: "#bubble", verdicts: [] })).toEqual({ room: "#bubble", verdicts: [] });
  });

  it.each([
    [
      "one line too many",
      { room: "#bubble", verdicts: Array.from({ length: VERDICTS_ASKED + 1 }, (_, n) => verdict(`m${String(n)}`)) },
    ],
    ["a state it does not know", { room: "#bubble", verdicts: [verdict("m1", "pending")] }],
    ["a line's room beside it", { room: "#bubble", verdicts: [{ ...verdict("m1"), room: "#bubble" }] }],
    ["a text beside the room", { room: "#bubble", verdicts: [], text: "x" }],
    ["no room", { verdicts: [] }],
    ["an empty id", { room: "#bubble", verdicts: [verdict("")] }],
  ])("refuses %s", (_, answer) => {
    expect(LineVerdicts.safeParse(answer).success).toBe(false);
  });
});
