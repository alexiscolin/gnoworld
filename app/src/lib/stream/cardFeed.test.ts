import type { CardEvent } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { cardFeed } from "./cardFeed.ts";

const KEY = "a".repeat(64);
const EVENT: CardEvent = { room: "#bubble", msgid: "m1", key: KEY };

const feed = () => {
  const heard: CardEvent[][] = [];
  const logs: string[] = [];
  const on = cardFeed(
    (events) => heard.push([...events]),
    (what) => logs.push(what),
  );
  return { on, heard, logs };
};

// The stream's `card` events come unread; the page reads each through its schema here, in a chunk a page loads on the first.
describe("the cards' feed", () => {
  it("hands on each event in the order it came, a removal (no key) among them", () => {
    const t = feed();
    t.on(JSON.stringify(EVENT));
    t.on(JSON.stringify({ ...EVENT, key: null }));
    expect(t.heard).toEqual([[EVENT], [{ ...EVENT, key: null }]]);
  });

  it.each([
    ["not JSON", "{"],
    ["not a string", { room: "#bubble" }],
    ["a key that is not 64 hex", JSON.stringify({ ...EVENT, key: "../x" })],
    ["a field it does not know", JSON.stringify({ ...EVENT, url: "https://evil.example/" })],
    ["no room", JSON.stringify({ msgid: "m1", key: KEY })],
  ])("drops %s, and says so once", (_what, data) => {
    const t = feed();
    t.on(data);
    t.on(data);
    expect(t.heard).toEqual([]);
    expect(t.logs).toEqual(["card_unknown"]);
  });
});
