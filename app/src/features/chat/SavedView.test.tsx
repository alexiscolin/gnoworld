import { Address } from "@gnoworld/schemas";
import type { SavedLine } from "../../lib/keep/keep.ts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SavedView, type SavedViewProps } from "./SavedView.tsx";

// The saved messages' list (slice 4's 4d; ADR-0002: "Saved messages ... Device", a view shown as a dialog over the
// current place): each line with its author, its room and its words, a way back to the room and a way to remove it,
// and a word that they are kept on this device alone. A guest has none: it is given no way to open it.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const BOB = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const saved = (id: string, over: Partial<SavedLine> = {}): SavedLine => ({
  room: "#bubble/games",
  id,
  time: "2026-10-25T10:00:00.000Z",
  from: ALICE,
  account: ALICE,
  text: `text ${id}`,
  ...over,
});
const view = (over: Partial<SavedViewProps> = {}) =>
  renderToStaticMarkup(
    <SavedView saved={[saved("m1")]} open onClose={() => undefined} onRemove={() => undefined} {...over} />,
  );
const said = (html: string) =>
  html
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
const rows = (html: string) => [...html.matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map((found) => found[1] ?? "");

describe("the saved messages' list", () => {
  it("is a dialog titled Saved messages, saying they are kept on this device alone", () => {
    const html = view();
    expect(html).toMatch(/<dialog[^>]*>/);
    expect(html).toContain(">Saved messages</h2>");
    expect(said(html)).toContain("Saved on this device only.");
  });

  it("says how to save one, and nothing else, when none is saved", () => {
    const html = view({ saved: [] });
    expect(said(html)).toContain("Nothing saved yet. Open More on a message, then Save message.");
    expect(rows(html)).toEqual([]);
  });

  it("lists each saved line in the order given, with its author, its room and its words", () => {
    const html = view({ saved: [saved("m2", { room: "#bubble", account: BOB, from: BOB }), saved("m1")] });
    const [first = "", second = ""] = rows(html).map(said);
    expect(first).toContain("g1jg8m…vsqf5");
    expect(first).toContain("#bubble");
    expect(first).toContain("text m2");
    expect(second).toContain("g10gh7…3y5tv");
    expect(second).toContain("#games");
    expect(second).toContain("text m1");
  });

  it("says a guest's line was a guest's, by its nick", () => {
    const html = view({ saved: [saved("m1", { from: "guest-ab12cd", account: undefined })] });
    expect(said(html)).toContain("guest-ab12cd (guest)");
  });

  it("says no account's line was a guest's, its address shortened and whole in a title", () => {
    const html = view({ saved: [saved("m1")] });
    expect(said(html)).not.toContain("(guest)");
    expect(html).toContain(`title="${ALICE}"`);
  });

  it("links each line to its room's page, in its world", () => {
    const html = view({ saved: [saved("m2", { room: "#bubble" }), saved("m1"), saved("e1", { room: "#earth/chat" })] });
    expect([...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((found) => found[1])).toEqual([
      "/w/bubble",
      "/w/bubble?room=games",
      "/w/earth?room=chat",
    ]);
    expect(said(html)).toContain("Open in room");
  });

  it("offers a Remove of each, named for whose message it is", () => {
    const html = view({ saved: [saved("m2", { account: BOB, from: BOB }), saved("m1")] });
    // React writes an apostrophe in an attribute as &#x27;: the name a browser reads is with it as it is.
    const names = [...html.matchAll(/<button[^>]*aria-label="(Remove[^"]*)"/g)].map((found) =>
      found[1]?.replaceAll("&#x27;", "'"),
    );
    expect(names).toEqual(["Remove g1jg8m…vsqf5's saved message", "Remove g10gh7…3y5tv's saved message"]);
  });

  // What was saved is anyone's words, kept on a device: drawn as text, never as HTML, a link never a way out.
  it("draws a saved line's words as text, a hostile one included", () => {
    const html = view({
      saved: [saved("m1", { text: "<img src=x onerror=alert(1)> <script>alert(1)</script> [x](javascript:alert(1))" })],
    });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/href="javascript/i);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("warns, once, that the device could not keep them, when it could not", () => {
    expect(said(view({ notKept: true }))).toContain("This device could not keep your saved messages.");
    expect(said(view())).not.toContain("could not keep");
  });
});
