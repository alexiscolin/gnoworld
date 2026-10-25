import { describe, expect, it } from "vitest";
import { StreamEvent } from "./stream.ts";

describe("StreamEvent", () => {
  it.each([["checked"], ["hidden"]])("takes a %s message's id, room and state", (state) => {
    const event = { msgid: "m".repeat(128), room: "#".padEnd(64, "b"), state };
    expect(StreamEvent.parse(event)).toEqual(event);
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
