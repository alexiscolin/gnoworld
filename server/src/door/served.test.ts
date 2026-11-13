import type { JarvisAnswer, JarvisQuestion } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { makeServed, SERVED_MAX, servedKey } from "./served.ts";

// D13985 point 2: an answer kept 10 minutes and served to anyone who asks the same at the same place; memory only, bounded.
const T0 = Date.parse("2026-11-11T12:00:00.000Z");
const ANSWER = (markdown = "It closes today."): JarvisAnswer => ({ status: "answered", markdown, buttons: [] });
const REALM = "gno.land/r/demo/boards";
const own = (question: string, room = "#bubble"): JarvisQuestion => ({ question, room });

describe("the key of an ask", () => {
  it("is one for a `here` by room, and another room another key", () => {
    expect(servedKey({ ask: "here", room: "#a" }, "m1", "anna")).toBe(
      servedKey({ ask: "here", room: "#a" }, "m9", "anna"),
    );
    expect(servedKey({ ask: "here", room: "#a" }, undefined, "anna")).not.toBe(
      servedKey({ ask: "here", room: "#b" }, undefined, "anna"),
    );
  });

  it("holds a `function` by room, realm and function", () => {
    const base = { ask: "function", room: "#a", realm: REALM, function: "Render" } as const;
    expect(servedKey(base, "m1", "anna")).toBe(servedKey(base, "m2", "anna"));
    expect(servedKey(base, "m1", "anna")).not.toBe(servedKey({ ...base, function: "Vote" }, "m1", "anna"));
    expect(servedKey(base, "m1", "anna")).not.toBe(
      servedKey({ ...base, realm: "gno.land/r/demo/users" }, "m1", "anna"),
    );
    expect(servedKey(base, "m1", "anna")).not.toBe(servedKey({ ...base, room: "#b" }, "m1", "anna"));
  });

  it("holds a `catch-up` by room and its last line's id", () => {
    const base = { ask: "catch-up", room: "#a" } as const;
    expect(servedKey(base, "m1", "anna")).toBe(servedKey(base, "m1", "anna"));
    expect(servedKey(base, "m1", "anna")).not.toBe(servedKey(base, "m2", "anna"));
    expect(servedKey(base, undefined, "anna")).not.toBe(servedKey(base, "m1", "anna"));
  });

  it("folds a question's case, spaces and ends, and keeps its room and last line", () => {
    expect(servedKey(own("  What   IS the poll? "), "m1", "anna")).toBe(
      servedKey(own("what is the poll?"), "m1", "anna"),
    );
    expect(servedKey(own("what is the poll?"), "m1", "anna")).not.toBe(
      servedKey(own("what is the poll?"), "m2", "anna"),
    );
    expect(servedKey(own("what is the poll?"), "m1", "anna")).not.toBe(
      servedKey(own("what is the poll?", "#b"), "m1", "anna"),
    );
    expect(servedKey(own("what is the poll?"), "m1", "anna")).not.toBe(servedKey(own("what is a poll?"), "m1", "anna"));
  });

  it("holds a person's own question for its account, and a fixed ask for none", () => {
    expect(servedKey(own("what is the poll?"), "m1", "anna")).not.toBe(
      servedKey(own("what is the poll?"), "m1", "ben"),
    );
    for (const ask of [
      { ask: "here", room: "#a" },
      { ask: "catch-up", room: "#a" },
    ] as const)
      expect(servedKey(ask, "m1", "anna")).toBe(servedKey(ask, "m1", "ben"));
  });

  it("keeps the case of the function and the realm: Vote is not vote", () => {
    const base = { ask: "function", room: "#a", realm: REALM, function: "Vote" } as const;
    expect(servedKey(base, "m1", "anna")).not.toBe(servedKey({ ...base, function: "vote" }, "m1", "anna"));
    expect(servedKey(base, "m1", "anna")).not.toBe(servedKey({ ...base, realm: REALM.toUpperCase() }, "m1", "anna"));
  });

  it("never mixes a person's question with a fixed ask that reads the same", () => {
    expect(servedKey(own("here"), undefined, "anna")).not.toBe(
      servedKey({ ask: "here", room: "#bubble" }, undefined, "anna"),
    );
  });
});

describe("the served answers", () => {
  it("keeps an answer 10 minutes, then forgets it", () => {
    const clock = { now: T0 };
    const served = makeServed({ now: () => clock.now });
    expect(served.get("k")).toBeUndefined();
    served.set("k", ANSWER(), { room: "#a", started: T0 });
    clock.now += 10 * 60_000 - 1;
    expect(served.get("k")).toEqual(ANSWER());
    clock.now += 1;
    expect(served.get("k")).toBeUndefined();
  });

  it("keeps only an answered answer: never a declined, a spent or an off", () => {
    const served = makeServed({ now: () => T0 });
    for (const status of ["declined", "spent", "off", "paused", "capped", "early", "busy"] as const) {
      served.set(status, { status }, { room: "#a", started: T0 });
      expect(served.get(status)).toBeUndefined();
    }
  });

  it("drops every answer kept for a room, and no other", () => {
    const served = makeServed({ now: () => T0 });
    served.set("a", ANSWER(), { room: "#a", started: T0 });
    served.set("b", ANSWER(), { room: "#b", started: T0 });
    served.drop("#a");
    expect([served.get("a"), served.get("b")]).toEqual([undefined, ANSWER()]);
  });

  it("keeps no answer whose call began before its room's last drop, or when it dropped", () => {
    const served = makeServed({ now: () => T0 });
    served.drop("#a");
    served.set("old", ANSWER(), { room: "#a", started: T0 - 1 });
    served.set("same", ANSWER(), { room: "#a", started: T0 });
    served.set("later", ANSWER(), { room: "#a", started: T0 + 1 });
    served.set("other", ANSWER(), { room: "#b", started: T0 - 1 });
    expect([served.get("old"), served.get("same"), served.get("later"), served.get("other")]).toEqual([
      undefined,
      undefined,
      ANSWER(),
      ANSWER(),
    ]);
  });

  it("is bounded: past its bound the oldest is forgotten first", () => {
    const served = makeServed({ now: () => T0 });
    for (let at = 0; at <= SERVED_MAX; at += 1) served.set(`k${String(at)}`, ANSWER(), { room: "#a", started: T0 });
    expect(served.get("k0")).toBeUndefined();
    expect(served.get("k1")).toEqual(ANSWER());
    expect(served.get(`k${String(SERVED_MAX)}`)).toEqual(ANSWER());
  });
});
