import { describe, expect, it } from "vitest";
import { Expedition, Quests } from "./discovery.ts";

// The discovery's data files (slice 8; the plan's threat model, "quest data files": "a quest of 10,000 steps"): an expedition's stop names a
// hub or a named realm, never both; a quest holds two to eight steps, each of its kind's shape, and ends on a realm's call.
const stop = () => ({
  id: "start",
  universe: "onyx",
  realm: "gno.land/r/demo/start",
  name: "Start",
  why: "Begin here.",
});
const visit = (id: string) => ({ id, kind: "visit", title: "Go", hub: "bubble" });
const call = () => ({ id: "sign", kind: "call", title: "Sign", realm: "gno.land/r/demo/x", function: "Do" });
const quest = (steps: unknown[]) => ({
  id: "first",
  universe: "onyx",
  title: "First",
  description: "Say hello.",
  reward: "Hello",
  steps,
});
const takes = (schema: { safeParse: (data: unknown) => { success: boolean } }, row: unknown) =>
  schema.safeParse([row]).success;

describe("an expedition's stop", () => {
  it("names a realm with its name, or a hub without one", () => {
    expect(takes(Expedition, stop())).toBe(true);
    const bare = { id: "start", universe: "onyx", why: "Begin here." };
    expect(takes(Expedition, { ...bare, hub: "bubble" })).toBe(true);
    expect(takes(Expedition, { ...bare, hub: "bubble", live: true })).toBe(true);
  });

  it.each([
    ["a hub and a realm", () => ({ ...stop(), hub: "bubble" })],
    ["neither", () => ({ id: "x", universe: "onyx", why: "Why." })],
    ["a realm with no name", () => ({ id: "x", universe: "onyx", realm: "gno.land/r/demo/x", why: "Why." })],
    ["a hub with a name", () => ({ id: "x", universe: "onyx", hub: "bubble", name: "Bubble", why: "Why." })],
    ["a realm that is no realm's path", () => ({ ...stop(), realm: "gno.land/p/demo/x" })],
    ["live as text", () => ({ ...stop(), live: "yes" })],
  ])("is refused with %s", (_, row) => {
    expect(takes(Expedition, row())).toBe(false);
  });
});

describe("a quest's steps", () => {
  it("take two to eight steps, the last a call", () => {
    expect(takes(Quests, quest([visit("a"), call()]))).toBe(true);
    const eight = [...Array.from({ length: 7 }, (_, i) => visit(`v${String(i)}`)), call()];
    expect(takes(Quests, quest(eight))).toBe(true);
  });

  it("refuse one step, nine steps, and ten thousand", () => {
    expect(takes(Quests, quest([call()]))).toBe(false);
    const nine = [...Array.from({ length: 8 }, (_, i) => visit(`v${String(i)}`)), call()];
    expect(takes(Quests, quest(nine))).toBe(false);
    const many = [...Array.from({ length: 9_999 }, (_, i) => visit(`v${String(i)}`)), call()];
    expect(takes(Quests, quest(many))).toBe(false);
  });

  it("refuse a quest that does not end on a call, and two steps of one id", () => {
    expect(takes(Quests, quest([call(), visit("a")]))).toBe(false);
    expect(takes(Quests, quest([visit("a"), visit("a"), call()]))).toBe(false);
  });

  it.each([
    ["a visit naming a hub and a realm", () => ({ ...visit("a"), realm: "gno.land/r/demo/x" })],
    ["a visit naming nothing", () => ({ id: "a", kind: "visit", title: "Go" })],
    ["a visit with a function", () => ({ ...visit("a"), function: "Do" })],
    ["a talk naming a realm", () => ({ id: "a", kind: "talk", title: "Say", realm: "gno.land/r/demo/x" })],
    ["a talk naming no hub", () => ({ id: "a", kind: "talk", title: "Say" })],
    ["a talk with a function", () => ({ id: "a", kind: "talk", title: "Say", hub: "bubble", function: "Do" })],
    ["a call with no function", () => ({ id: "a", kind: "call", title: "Do", realm: "gno.land/r/demo/x" })],
    ["a call naming a hub", () => ({ ...call(), id: "a", hub: "bubble" })],
    ["a call whose function is not exported", () => ({ ...call(), id: "a", function: "do" })],
    ["a kind it does not know", () => ({ ...visit("a"), kind: "swap" })],
  ])("refuse %s", (_, step) => {
    expect(takes(Quests, quest([step(), call()]))).toBe(false);
  });

  it("take a talk in a hub and a visit to a realm", () => {
    const talk = { id: "t", kind: "talk", title: "Say hello", hub: "bubble" };
    const realm = { id: "r", kind: "visit", title: "Go", realm: "gno.land/r/demo/x" };
    expect(takes(Quests, quest([talk, realm, call()]))).toBe(true);
  });
});
