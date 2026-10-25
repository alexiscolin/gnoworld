import { describe, expect, it } from "vitest";
import { ActivityRooms } from "./activity.ts";

describe("ActivityRooms", () => {
  it("is each room's world, name and messages a minute", () => {
    const rooms = { rooms: [{ world: "bubble", room: "#bubble", perMinute: 0.2 }] };
    expect(ActivityRooms.parse(rooms)).toEqual(rooms);
  });

  it.each([
    ["a negative rate", { rooms: [{ world: "bubble", room: "#bubble", perMinute: -0.2 }] }],
    ["a room missing", { rooms: [{ world: "bubble", perMinute: 0 }] }],
    ["a rate as text", { rooms: [{ world: "bubble", room: "#bubble", perMinute: "1" }] }],
    ["no list", {}],
  ])("refuses %s", (_, value) => {
    expect(ActivityRooms.safeParse(value).success).toBe(false);
  });
});
