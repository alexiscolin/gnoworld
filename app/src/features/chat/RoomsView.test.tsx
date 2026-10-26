import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoomsView, type RoomsViewProps } from "./RoomsView.tsx";

const SECTIONS: RoomsViewProps["sections"] = [
  {
    name: "Talk",
    rooms: [
      { room: "#bubble", type: "open" },
      { room: "#bubble/games", type: "open" },
    ],
  },
  { name: null, rooms: [{ room: "#bubble/news", type: "announcement" }] },
];
const view = (over: Partial<RoomsViewProps> = {}) =>
  renderToStaticMarkup(<RoomsView sections={SECTIONS} current="#bubble/games" {...over} />);
const said = (html: string) =>
  html
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
const links = (html: string) => [...html.matchAll(/<a [^>]*>(.*?)<\/a>/gs)].map((m) => said(m[1] ?? ""));
const hrefs = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1]);

describe("RoomsView", () => {
  it("lists the rooms by section, in the server's order, under a navigation named Rooms", () => {
    const html = view();
    expect(html).toMatch(/^<nav[^>]*aria-label="Rooms"/);
    // 4e's UX review (U16): an account's navigation holds its direct messages too, and says so.
    expect(
      view({
        dms: { world: "bubble", partners: [], current: undefined, onlyKnown: false, onOnlyKnown: () => undefined },
      }),
    ).toMatch(/^<nav[^>]*aria-label="Rooms and direct messages"/);
    expect([...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => m[1])).toEqual(["Talk", "Other rooms"]);
    expect(links(html)).toEqual(["#bubble", "#games", "#news"]);
    expect(hrefs(html)).toEqual(["/w/bubble", "/w/bubble?room=games", "/w/bubble?room=news"]);
  });

  it("names the section of the others Rooms when there is no other section", () => {
    const html = view({ sections: [{ name: null, rooms: [{ room: "#bubble", type: "open" }] }] });
    expect([...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => m[1])).toEqual(["Rooms"]);
  });

  it.each([
    ["#bubble/games", "#games"],
    ["#bubble", "#bubble"],
  ])("marks the room shown (%s), and it alone", (current, label) => {
    const html = view({ current });
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(new RegExp(`<a [^>]*aria-current="true"[^>]*>.*?${label}.*?</a>`, "s"));
  });

  it.each([undefined, "#bubble/gone"])("marks no room when the one shown (%s) is not listed", (current) => {
    expect(view({ current })).not.toContain("aria-current");
  });

  it("shows a section's name as text, never as markup", () => {
    const html = view({
      sections: [{ name: "<img src=x onerror=alert(1)>", rooms: [{ room: "#bubble", type: "open" }] }],
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it.each([
    ["no section", []],
    [
      "only empty sections",
      [
        { name: null, rooms: [] },
        { name: "Talk", rooms: [] },
      ],
    ],
  ])("says so when the world has no room a reader may see: %s", (_, sections) => {
    expect(said(view({ sections }))).toBe("No room here yet.");
  });

  it("leaves out a section with no room", () => {
    const html = view({ sections: [{ name: "Empty", rooms: [] }, ...SECTIONS] });
    expect(html).not.toContain("Empty");
  });

  it("lists 100 rooms, each a link of its own", () => {
    const rooms = Array.from({ length: 100 }, (_, n) => ({ room: `#bubble/r${String(n)}`, type: "open" as const }));
    expect(links(view({ sections: [{ name: null, rooms }] }))).toHaveLength(100);
  });
});

// 4e: an account's direct messages, under the rooms: each conversation a link to its page, the one shown marked;
// a choice to hear from those it talked with alone.
describe("RoomsView: direct messages", () => {
  const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
  const CAROL = "g1l6m6l6carqlqqqqqqqqqqqqqqqqqqqqqnkkanc";
  const dms = (over: Partial<NonNullable<RoomsViewProps["dms"]>> = {}) => ({
    world: "bubble",
    partners: [ALICE, CAROL],
    current: undefined,
    onlyKnown: false,
    onOnlyKnown: () => undefined,
    notKept: false,
    ...over,
  });

  it("lists each conversation by its partner's short address, a link to its page, after the rooms", () => {
    // A conversation in view: no room is.
    const html = view({ current: undefined, dms: dms({ current: CAROL }) });
    expect([...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => m[1])).toEqual([
      "Talk",
      "Other rooms",
      "Direct messages",
    ]);
    // 4e's UX review (U6): a conversation's row says it is not encrypted, by a lock and a word (DESIGN-SYSTEM.md).
    expect(links(html).slice(-2)).toEqual(["g10gh7…3y5tv Not encrypted", "g1l6m6…kkanc Not encrypted"]);
    expect(html.match(/data-icon="lock"/g)).toHaveLength(2);
    expect(hrefs(html).slice(-2)).toEqual([`/w/bubble?dm=${ALICE}`, `/w/bubble?dm=${CAROL}`]);
    expect(html).toMatch(new RegExp(`<a [^>]*href="/w/bubble\\?dm=${CAROL}"[^>]*aria-current="true"`));
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
  });

  it("says when there is none yet, and has no section for a guest", () => {
    // 4e's UX review (U4): the empty list says how to start one.
    expect(said(view({ dms: dms({ partners: [] }) })).replaceAll("&#x27;", "'")).toContain(
      "No direct message yet. Start one in Who's here.",
    );
    expect(view()).not.toContain("Direct messages");
  });

  // /code-review on 4e (CR5): a device that refused the choices said so to nobody.
  it("says beside the choice when the device does not keep it, and only then", () => {
    expect(said(view({ dms: dms({ notKept: true }) }))).toContain("Only people I wrote to Not kept on this device");
    expect(view({ dms: dms() })).not.toContain("Not kept on this device");
  });

  it("offers to hear from those the account talked with alone, a pressed toggle", () => {
    expect(view({ dms: dms() })).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Only people I wrote to<\/button>/);
    expect(view({ dms: dms({ onlyKnown: true }) })).toMatch(
      /<button[^>]*aria-pressed="true"[^>]*>Only people I wrote to<\/button>/,
    );
  });
});
