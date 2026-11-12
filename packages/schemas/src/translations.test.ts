import { describe, expect, it } from "vitest";
import { TRANSLATION_CAPS } from "./jarvis.ts";
import { LineTranslations, TRANSLATIONS_ASKED, TranslationEvent } from "./translations.ts";

// What the stream tells and GET /api/translations answers of a line's stored translation: strict, the room and the line's id as the
// stream's, the text within the translation's own cap.
const EVENT = {
  room: "#bubble",
  msgid: "m1",
  language: "fr",
  status: "translated",
  text: "Bonjour",
  from: "en",
} as const;

describe("TranslationEvent", () => {
  it("takes a translation with or without its source language, and an original kept as such", () => {
    expect(TranslationEvent.parse(EVENT)).toEqual(EVENT);
    const bare = { ...EVENT, from: undefined };
    expect(TranslationEvent.safeParse(bare).success).toBe(true);
    const original = { room: "#bubble", msgid: "m1", language: "fr", status: "original" };
    expect(TranslationEvent.parse(original)).toEqual(original);
  });

  it.each([
    ["a field it does not know", { ...EVENT, url: "https://evil.example/" }],
    ["a language off the list", { ...EVENT, language: "xx" }],
    ["a source language off the list", { ...EVENT, from: "xx" }],
    ["no room", { ...EVENT, room: undefined }],
    ["a room as the stream refuses it", { ...EVENT, room: "b" }],
    ["an empty line id", { ...EVENT, msgid: "" }],
    ["a line id past 128 characters", { ...EVENT, msgid: "m".repeat(129) }],
    ["an empty text", { ...EVENT, text: "" }],
    ["a status of jarvis that is never stored", { room: "#bubble", msgid: "m1", language: "fr", status: "spent" }],
    [
      "an original that carries a text",
      { room: "#bubble", msgid: "m1", language: "fr", status: "original", text: "x" },
    ],
  ])("refuses %s", (_what, value) => {
    expect(TranslationEvent.safeParse(value).success).toBe(false);
  });

  it("takes a text at the translation's cap and refuses one past", () => {
    expect(TranslationEvent.safeParse({ ...EVENT, text: "a".repeat(TRANSLATION_CAPS.text) }).success).toBe(true);
    expect(TranslationEvent.safeParse({ ...EVENT, text: "a".repeat(TRANSLATION_CAPS.text + 1) }).success).toBe(false);
  });
});

const ANSWER = {
  room: "#bubble",
  language: "fr",
  translations: [
    { msgid: "m1", status: "translated", text: "Bonjour" },
    { msgid: "m2", status: "original" },
  ],
  pending: ["m3"],
} as const;

describe("LineTranslations", () => {
  it("takes the answer with its pending lines, and a halt when the budget is spent or Jarvis is off", () => {
    expect(LineTranslations.parse(ANSWER)).toEqual(ANSWER);
    expect(LineTranslations.safeParse({ ...ANSWER, halt: "spent" }).success).toBe(true);
    expect(LineTranslations.safeParse({ ...ANSWER, halt: "off" }).success).toBe(true);
    expect(LineTranslations.safeParse({ ...ANSWER, halt: "later" }).success).toBe(false);
  });

  it("holds the lines of one request at most", () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, at) => ({ msgid: `m${String(at)}`, status: "original" as const }));
    expect(TRANSLATIONS_ASKED).toBe(30);
    expect(LineTranslations.safeParse({ ...ANSWER, translations: many(TRANSLATIONS_ASKED) }).success).toBe(true);
    expect(LineTranslations.safeParse({ ...ANSWER, translations: many(TRANSLATIONS_ASKED + 1) }).success).toBe(false);
  });

  it("refuses a field it does not know and an entry that carries a room", () => {
    expect(LineTranslations.safeParse({ ...ANSWER, more: 1 }).success).toBe(false);
    expect(
      LineTranslations.safeParse({
        ...ANSWER,
        translations: [{ msgid: "m1", status: "original", room: "#x" }],
      }).success,
    ).toBe(false);
  });
});
