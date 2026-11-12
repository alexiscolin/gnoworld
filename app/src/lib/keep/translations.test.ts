// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { pageTranslations, TRANSLATIONS_KEPT } from "./translations.ts";

const KEY = "gnoworld:translations";

beforeEach(() => {
  localStorage.clear();
});

describe("the translations this device keeps", () => {
  it("keeps a line's translation, or that it was already in the reader's language, by room, line and language", () => {
    expect(pageTranslations().add("#bubble|a1|fr", { text: "Bonjour", from: "en" })).toBe(true);
    expect(pageTranslations().add("#bubble|a2|fr", { original: true })).toBe(true);
    expect(pageTranslations().get()).toEqual({
      "#bubble|a1|fr": { text: "Bonjour", from: "en" },
      "#bubble|a2|fr": { original: true },
    });
  });

  it("drops an entry that is none and keeps the good ones, and forgets a key that is no record", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ "#b|a|fr": { text: "ok" }, "#b|b|fr": { text: 3 }, "#b|c|fr": { text: "x", from: "xx" } }),
    );
    expect(pageTranslations().get()).toEqual({ "#b|a|fr": { text: "ok" } });
    localStorage.setItem(KEY, "[1]");
    expect(pageTranslations().get()).toEqual({});
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("keeps the newest few, the oldest leaving first", () => {
    const device = pageTranslations();
    for (let at = 0; at <= TRANSLATIONS_KEPT; at += 1) device.add(`#b|l${String(at)}|fr`, { text: "x" });
    const kept = Object.keys(pageTranslations().get());
    expect(kept).toHaveLength(TRANSLATIONS_KEPT);
    expect(kept).not.toContain("#b|l0|fr");
    expect(kept).toContain(`#b|l${String(TRANSLATIONS_KEPT)}|fr`);
  });

  it("says no when the device refuses", () => {
    const refusing = {
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(pageTranslations(() => refusing).add("#b|a|fr", { text: "x" })).toBe(false);
  });
});
