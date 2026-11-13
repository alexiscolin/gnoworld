import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerOf, checkCard, readCard } from "./read.ts";
import type { Page } from "./store.ts";

// Slice 13, L3: the reader's answer held to its schema and to the picture's real size; a stored page back into the reader's shape.
// A JPEG header (SOI, a frame of 4 x 2 px) as base64: only its size is read.
const SMALL = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 2, 0, 4, 1, 1, 0x11, 0, 0xff, 0xd9]);
const card = (picture: { width: number; height: number; jpeg: string } | null) => ({
  title: "A title",
  description: "About it",
  site: "Example",
  picture,
});
const good = { width: 4, height: 2, jpeg: SMALL.toString("base64") };

describe("readCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives the card, and leaves no timer behind once the reader has answered", async () => {
    const wanted = card(good);
    expect(await readCard(() => Promise.resolve(wanted), "https://example.com/")).toEqual(wanted);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves no timer behind once the reader has failed", async () => {
    expect(await readCard(() => Promise.reject(new Error("x")), "https://example.com/")).toBe("down");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives a card with no picture as it is", async () => {
    expect(await readCard(() => Promise.resolve(card(null)), "https://example.com/")).toEqual(card(null));
  });

  it("gives shape for an answer no schema takes", async () => {
    expect(await readCard(() => Promise.resolve({ title: "" }), "https://example.com/")).toBe("shape");
  });

  it.each([
    ["a width its picture does not have", { ...good, width: 5 }],
    ["a height its picture does not have", { ...good, height: 3 }],
    ["both sides wrong", { ...good, width: 5, height: 3 }],
    [
      "a JPEG with no frame header",
      { width: 4, height: 2, jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 2, 0xff, 0xd9]).toString("base64") },
    ],
    ["bytes that are no JPEG", { width: 4, height: 2, jpeg: Buffer.from("not a jpeg at all").toString("base64") }],
  ])("gives shape for a picture claiming %s", async (_name, picture) => {
    expect(await readCard(() => Promise.resolve(card(picture)), "https://example.com/")).toBe("shape");
  });
});

const page = (over: Partial<Page> = {}): Page => ({
  state: "passed",
  at: 1,
  host: "example.com",
  site: "Example",
  title: "A title",
  description: "About it",
  width: 4,
  height: 2,
  picture: SMALL,
  ...over,
});

describe("answerOf", () => {
  it("gives the reader's answer back from a stored page", () => {
    expect(answerOf(page())).toEqual(card(good));
  });

  it("gives none for a page with no title: nothing was read", () => {
    expect(answerOf(page({ title: null }))).toBeUndefined();
  });

  it("gives an empty description and an empty site for none", () => {
    expect(answerOf(page({ description: null, site: null }))).toMatchObject({ description: "", site: "" });
  });

  it.each([
    ["no picture", { picture: null }],
    ["no width", { width: null }],
    ["no height", { height: null }],
  ])("gives no picture for a page with %s", (_name, over) => {
    expect(answerOf(page(over))?.picture).toBeNull();
  });
});

describe("checkCard", () => {
  it("is unchecked when the check rejects", async () => {
    expect(await checkCard(() => Promise.reject(new Error("down")), card(null))).toBe("unchecked");
  });

  it("sends the words, and the picture as a data URL", async () => {
    const check = vi.fn(() => Promise.resolve("unchecked" as const));
    await checkCard(check, card(good));
    expect(check).toHaveBeenCalledWith({
      text: "A title\nAbout it\nExample",
      image: `data:image/jpeg;base64,${good.jpeg}`,
    });
  });
});
