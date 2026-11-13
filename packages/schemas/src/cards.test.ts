import { describe, expect, it } from "vitest";
import { CardEvent, CardRemove, LineCards, LinkCard, ReaderCard } from "./cards.ts";

// L2 (docs/plans/link-previews.md §4 "Malicious text in og fields", §7): each schema takes what sits at each bound and refuses one past.
const KEY = "a".repeat(64);
// Base64 of FF D8 FF E0 00 10 4A 46 49 46 00 01; and of a JPEG's first three bytes then `bytes - 3` zeros, for the cap's two sides.
const JPEG = "/9j/4AAQSkZJRgAB";
const reader = (over: Record<string, unknown> = {}) => ({
  title: "A title",
  description: "A description",
  site: "Example",
  picture: { width: 160, height: 90, jpeg: JPEG },
  ...over,
});
const withPicture = (over: Record<string, unknown>) =>
  reader({ picture: { width: 160, height: 90, jpeg: JPEG, ...over } });
const jpegOf = (bytes: number): string =>
  `/9j/${"AAAA".repeat(Math.floor((bytes - 3) / 3))}${["", "AA==", "AAA="][(bytes - 3) % 3] ?? ""}`;

describe("ReaderCard, the reader's answer (untrusted)", () => {
  it("takes a card with its picture, or with none", () => {
    expect(ReaderCard.parse(reader())).toEqual(reader());
    expect(ReaderCard.parse(reader({ picture: null })).picture).toBeNull();
  });

  it("takes each text at its cap and refuses one character past", () => {
    for (const [field, cap] of [
      ["title", 200],
      ["description", 500],
      ["site", 100],
    ] as const) {
      expect(ReaderCard.safeParse(reader({ [field]: "a".repeat(cap) })).success, `${field} at the cap`).toBe(true);
      expect(ReaderCard.safeParse(reader({ [field]: "a".repeat(cap + 1) })).success, `${field} past the cap`).toBe(
        false,
      );
    }
  });

  it("takes an empty description and an empty site: a page may have none", () => {
    expect(ReaderCard.safeParse(reader({ description: "", site: "" })).success).toBe(true);
  });

  it("refuses base64 with a line break or URL-safe letters, which no canonical encoder writes", () => {
    const wrapped = `${JPEG.slice(0, 8)}\n${JPEG.slice(8)}`;
    expect(ReaderCard.safeParse(withPicture({ jpeg: wrapped })).success).toBe(false);
    expect(ReaderCard.safeParse(withPicture({ jpeg: "/9j_" + JPEG.slice(4) })).success).toBe(false);
  });

  it("refuses a card with no title, since a card with nothing to say is no card", () => {
    expect(ReaderCard.safeParse(reader({ title: "" })).success).toBe(false);
    expect(ReaderCard.safeParse({ ...reader(), title: undefined }).success).toBe(false);
  });

  it.each(["\u202e", "\u200b", "\u{e0041}", "\u001b", "\n"])("refuses a hidden character in any text: %j", (c) => {
    for (const field of ["title", "description", "site"]) {
      expect(ReaderCard.safeParse(reader({ [field]: `a${c}b` })).success, field).toBe(false);
    }
  });

  it("refuses a lone surrogate, which no text holds", () => {
    expect(ReaderCard.safeParse(reader({ title: "a\ud800" })).success).toBe(false);
  });

  it("holds markup as text: it takes it whole, never reads it", () => {
    const text = "<img src=x onerror=alert(1)> &amp;";
    expect(ReaderCard.parse(reader({ title: text })).title).toBe(text);
  });

  it("refuses a field it does not know, so the reader cannot add one", () => {
    expect(ReaderCard.safeParse({ ...reader(), url: "https://evil.example/" }).success).toBe(false);
    expect(ReaderCard.safeParse(withPicture({ extra: 1 })).success).toBe(false);
  });

  it("takes a picture side of 1 to 160 whole pixels and refuses 0, 161, a fraction", () => {
    for (const side of [1, 160])
      expect(ReaderCard.safeParse(withPicture({ width: side, height: side })).success).toBe(true);
    for (const side of [0, -1, 161, 1.5]) {
      expect(ReaderCard.safeParse(withPicture({ width: side })).success, `width ${String(side)}`).toBe(false);
      expect(ReaderCard.safeParse(withPicture({ height: side })).success, `height ${String(side)}`).toBe(false);
    }
  });

  it("takes picture bytes up to the cap and refuses one past, counted decoded", () => {
    expect(ReaderCard.safeParse(withPicture({ jpeg: jpegOf(16_384) })).success).toBe(true);
    expect(ReaderCard.safeParse(withPicture({ jpeg: jpegOf(16_384 + 1) })).success).toBe(false);
  });

  it("refuses bytes that are not a JPEG by their magic, and text that is not base64", () => {
    expect(ReaderCard.safeParse(withPicture({ jpeg: "PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+" })).success).toBe(false);
    expect(ReaderCard.safeParse(withPicture({ jpeg: "iVBORw0KGgo=" })).success).toBe(false);
    expect(ReaderCard.safeParse(withPicture({ jpeg: "not base64 !!" })).success).toBe(false);
    expect(ReaderCard.safeParse(withPicture({ jpeg: "" })).success).toBe(false);
  });
});

describe("CardEvent, what the stream tells", () => {
  it("takes a line's card by its 64 hex key, or its removal as a null key", () => {
    expect(CardEvent.parse({ msgid: "m1", room: "#bubble", key: KEY })).toEqual({
      msgid: "m1",
      room: "#bubble",
      key: KEY,
    });
    expect(CardEvent.parse({ msgid: "m1", room: "#bubble", key: null }).key).toBeNull();
  });

  it("refuses a key that is not 64 lower-case hex characters, a missing one, and a field it does not know", () => {
    for (const key of ["a".repeat(63), "a".repeat(65), "A".repeat(64), "g".repeat(64), "", undefined]) {
      expect(CardEvent.safeParse({ msgid: "m1", room: "#bubble", key }).success, String(key)).toBe(false);
    }
    expect(CardEvent.safeParse({ msgid: "m1", room: "#bubble", key: KEY, text: "x" }).success).toBe(false);
  });

  it("takes the msgid and the room at the stream's bounds: 128 and 64 characters, 1 and 2 at least", () => {
    const at = (msgid: string, room: string) => CardEvent.safeParse({ msgid, room, key: KEY }).success;
    expect(at("m".repeat(128), "#" + "r".repeat(63))).toBe(true);
    expect(at("m".repeat(129), "#bubble")).toBe(false);
    expect(at("m", "#" + "r".repeat(64))).toBe(false);
    expect(at("", "#bubble")).toBe(false);
    expect(at("m1", "#")).toBe(false);
  });
});

describe("LineCards, GET /api/cards's answer", () => {
  it("takes up to 100 lines, as the verdicts' route asks, and refuses 101", () => {
    const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ msgid: `m${String(i)}`, key: KEY }));
    expect(LineCards.safeParse({ room: "#bubble", cards: cards(100) }).success).toBe(true);
    expect(LineCards.safeParse({ room: "#bubble", cards: cards(101) }).success).toBe(false);
    expect(LineCards.safeParse({ room: "#bubble", cards: [{ msgid: "m1", key: "short" }] }).success).toBe(false);
  });
});

describe("LinkCard, GET /api/cards/<key>'s answer", () => {
  const card = (over: Record<string, unknown> = {}) => ({
    host: "example.com",
    site: "Example",
    title: "A title",
    description: "A description",
    picture: { width: 160, height: 90 },
    ...over,
  });

  it("takes the host, the texts at their caps and a picture's size, or none; the picture's bytes are never in it", () => {
    expect(LinkCard.parse(card())).toEqual(card());
    expect(LinkCard.parse(card({ picture: null })).picture).toBeNull();
    expect(LinkCard.safeParse(card({ title: "a".repeat(200 + 1) })).success).toBe(false);
    expect(LinkCard.safeParse(card({ description: "a".repeat(500 + 1) })).success).toBe(false);
    expect(LinkCard.safeParse(card({ site: "a".repeat(100 + 1) })).success).toBe(false);
    expect(LinkCard.safeParse(card({ host: "a".repeat(253) })).success).toBe(true);
    expect(LinkCard.safeParse(card({ picture: { width: 160, height: 90, jpeg: JPEG } })).success).toBe(false);
  });

  it("carries no link of its own: the card links to the line's URL, never an og:url", () => {
    expect(LinkCard.safeParse(card({ url: "https://evil.example/" })).success).toBe(false);
    expect(LinkCard.safeParse(card({ href: "https://evil.example/" })).success).toBe(false);
  });

  it("refuses a host that is not a bare lower-case name, and a hidden character in a text", () => {
    for (const host of [
      "",
      "Example.com",
      "example.com/path",
      "user@example.com",
      "https://example.com",
      "a".repeat(254),
    ]) {
      expect(LinkCard.safeParse(card({ host })).success, host).toBe(false);
    }
    expect(LinkCard.safeParse(card({ title: "a\u202eb" })).success).toBe(false);
  });
});

describe("CardRemove, what a page sends to remove a card", () => {
  it("takes a room and a line's id alone", () => {
    expect(CardRemove.parse({ room: "#bubble", msgid: "m1" })).toEqual({ room: "#bubble", msgid: "m1" });
    expect(CardRemove.safeParse({ room: "#bubble", msgid: "m1", key: KEY }).success).toBe(false);
    expect(CardRemove.safeParse({ room: "#bubble" }).success).toBe(false);
    expect(CardRemove.safeParse({ room: "#bubble", msgid: "m 1" }).success).toBe(false);
    expect(CardRemove.safeParse({ room: "#bubble", msgid: "m,1" }).success).toBe(false);
    expect(CardRemove.safeParse({ room: "#bubble", msgid: "m".repeat(129) }).success).toBe(false);
  });
});
