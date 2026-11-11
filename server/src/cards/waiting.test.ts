import { describe, expect, it } from "vitest";
import { Waiting } from "./waiting.ts";

// Slice 13, L3: the lines waiting on a page being read: 1,000 a page, 20,000 in all, the oldest going first.
const line = (msgid: string, room = "r1", author = "alice") => ({ room, msgid, author });

describe("Waiting", () => {
  it("holds a line once, whatever the times it is heard", () => {
    const waiting = new Waiting();
    waiting.add("k", line("m1"));
    waiting.add("k", line("m1"));
    expect(waiting.lines("k")).toHaveLength(1);
  });

  it("lets the oldest line of a page go at the 1,001st", () => {
    const waiting = new Waiting();
    for (let n = 0; n <= 1000; n += 1) waiting.add("k", line(`m${String(n)}`));
    expect(waiting.lines("k")).toHaveLength(1000);
    expect(waiting.lines("k")[0]?.msgid).toBe("m1");
  });

  it("lets the line of the page that has waited longest go at the 20,001st, even when that page's list is empty", () => {
    const waiting = new Waiting();
    waiting.add("empty", line("gone"));
    waiting.forget("r1", "gone");
    for (let page = 0; page < 20; page += 1) {
      for (let n = 0; n < 1000; n += 1) waiting.add(`p${String(page)}`, line(`m${String(page)}-${String(n)}`));
    }
    expect(waiting.size()).toBe(20_000);
    waiting.add("last", line("newest"));
    expect(waiting.size()).toBe(20_000);
    expect(waiting.lines("p0")[0]?.msgid).toBe("m0-1");
    expect(waiting.lines("p1")).toHaveLength(1000);
    expect(waiting.lines("last")).toEqual([line("newest")]);
  });

  it("does not drop anything below 20,000", () => {
    const waiting = new Waiting();
    for (let page = 0; page < 20; page += 1) {
      for (let n = 0; n < 1000; n += 1) waiting.add(`p${String(page)}`, line(`m${String(page)}-${String(n)}`));
    }
    expect(waiting.lines("p0")).toHaveLength(1000);
    expect(waiting.size()).toBe(20_000);
  });

  describe("forget", () => {
    const filled = (): Waiting => {
      const waiting = new Waiting();
      waiting.add("k", line("m1", "r1"));
      waiting.add("k", line("m2", "r1"));
      waiting.add("j", line("m1", "r2"));
      return waiting;
    };

    it("lets go of the line of that room and that id, and of no other", () => {
      const waiting = filled();
      waiting.forget("r1", "m1");
      expect(waiting.lines("k")).toEqual([line("m2", "r1")]);
      expect(waiting.lines("j")).toEqual([line("m1", "r2")]);
    });

    it("with an author, lets go of that author's line only", () => {
      const waiting = filled();
      waiting.forget("r1", "m1", "bob");
      expect(waiting.lines("k")).toHaveLength(2);
      waiting.forget("r1", "m1", "alice");
      expect(waiting.lines("k")).toHaveLength(1);
    });
  });

  it("gives nothing for a page nobody waits on", () => {
    const waiting = new Waiting();
    expect(waiting.take("none")).toEqual([]);
    expect(waiting.lines("none")).toEqual([]);
    expect(waiting.has("none")).toBe(false);
  });

  it("gives a page's lines once, and the page waits no more", () => {
    const waiting = new Waiting();
    waiting.add("k", line("m1"));
    expect(waiting.take("k")).toEqual([line("m1")]);
    expect(waiting.has("k")).toBe(false);
    expect(waiting.take("k")).toEqual([]);
  });
});
