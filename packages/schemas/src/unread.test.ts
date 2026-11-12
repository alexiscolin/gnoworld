import { describe, expect, it } from "vitest";
import { Unread, UnreadPlaces } from "./unread.ts";

const place = (n: number) => ({ room: `#room${String(n)}`, time: "2026-11-13T10:00:00.000Z" });

describe("UnreadPlaces, the places a page forwards", () => {
  it("takes up to 100 places, each a room and an ISO time", () => {
    expect(UnreadPlaces.safeParse({ places: [place(0)] }).success).toBe(true);
    expect(UnreadPlaces.safeParse({ places: Array.from({ length: 100 }, (_, n) => place(n)) }).success).toBe(true);
  });

  it("refuses 101 places, none, a room that is no room, a time that is no time and a word naming an account", () => {
    expect(UnreadPlaces.safeParse({ places: Array.from({ length: 101 }, (_, n) => place(n)) }).success).toBe(false);
    expect(UnreadPlaces.safeParse({ places: [] }).success).toBe(false);
    expect(UnreadPlaces.safeParse({ places: [{ ...place(0), room: "bubble" }] }).success).toBe(false);
    expect(UnreadPlaces.safeParse({ places: [{ ...place(0), time: "yesterday" }] }).success).toBe(false);
    expect(UnreadPlaces.safeParse({ places: [place(0)], account: "g1x" }).success).toBe(false);
    expect(UnreadPlaces.safeParse({ places: [{ ...place(0), account: "g1x" }] }).success).toBe(false);
  });
});

describe("Unread, a count by world", () => {
  it("takes a slug to a count from 0 to 100", () => {
    expect(Unread.safeParse({ worlds: { bubble: 0, govdao: 100 } }).success).toBe(true);
  });

  it("refuses a count past 100, a negative one, a fraction and a key that is no slug", () => {
    expect(Unread.safeParse({ worlds: { bubble: 101 } }).success).toBe(false);
    expect(Unread.safeParse({ worlds: { bubble: -1 } }).success).toBe(false);
    expect(Unread.safeParse({ worlds: { bubble: 1.5 } }).success).toBe(false);
    expect(Unread.safeParse({ worlds: { "Not A Slug": 1 } }).success).toBe(false);
  });
});
