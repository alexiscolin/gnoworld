import type { TranslationEvent } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { translationFeed } from "./translationFeed.ts";

const EVENT: TranslationEvent = { room: "#bubble", msgid: "m1", language: "fr", status: "translated", text: "Bonjour" };

const feed = () => {
  const heard: TranslationEvent[][] = [];
  const logs: string[] = [];
  const on = translationFeed(
    (events) => heard.push([...events]),
    (what) => logs.push(what),
  );
  return { on, heard, logs };
};

// The stream's `translation` events come unread; the page reads each through its schema here.
describe("the translations' feed", () => {
  it("hands on each event in the order it came, an original among them", () => {
    const t = feed();
    t.on(JSON.stringify(EVENT));
    t.on(JSON.stringify({ room: "#bubble", msgid: "m2", language: "fr", status: "original" }));
    expect(t.heard).toEqual([[EVENT], [{ room: "#bubble", msgid: "m2", language: "fr", status: "original" }]]);
  });

  it.each([
    ["not JSON", "{"],
    ["not a string", { room: "#bubble" }],
    ["a language off the list", JSON.stringify({ ...EVENT, language: "xx" })],
    ["a field it does not know", JSON.stringify({ ...EVENT, url: "https://evil.example/" })],
  ])("drops %s, and says so once", (_what, data) => {
    const t = feed();
    t.on(data);
    t.on(data);
    expect(t.heard).toEqual([]);
    expect(t.logs).toEqual(["translation_unknown"]);
  });
});
