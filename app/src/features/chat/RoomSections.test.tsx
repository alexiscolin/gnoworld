import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoomSections, RoomsNav } from "./RoomSections.tsx";

// What a visitor's rooms list is (slice 4's 4b): the sections and their rooms, each a link, with no count after it unless
// the page gives one; RoomsView.test.tsx holds an account's, which wraps the same list.
const SECTIONS = [
  { name: "Talk", rooms: [{ room: "#bubble", type: "open" as const }] },
  { name: null, rooms: [{ room: "#bubble/games", type: "open" as const }] },
  { name: "Empty", rooms: [] },
];
const said = (html: string) =>
  html
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();

describe("RoomSections", () => {
  it("lists each section that has a room, its name over its links, as a visitor's page does: no count", () => {
    const html = renderToStaticMarkup(<RoomSections sections={SECTIONS} current="#bubble" />);
    expect([...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => m[1])).toEqual(["Talk", "Other rooms"]);
    expect([...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1])).toEqual([
      "/w/bubble",
      "/w/bubble?room=games",
    ]);
    expect(said(html)).not.toContain("unread");
  });

  it("names a lone section with no name Rooms, and marks the room shown", () => {
    const html = renderToStaticMarkup(<RoomSections sections={SECTIONS.slice(1, 2)} current="#bubble/games" />);
    expect(html).toContain(">Rooms</h2>");
    expect(html).toContain('aria-current="true"');
  });

  it("puts what the page gives after a room's link, and says so when there is no room", () => {
    const html = renderToStaticMarkup(
      <RoomSections sections={SECTIONS} current={undefined} trail={(room) => <i>{`after ${room}`}</i>} />,
    );
    expect(said(html)).toContain("after #bubble");
    expect(said(html)).toContain("after #bubble/games");
    expect(renderToStaticMarkup(<RoomSections sections={[]} current={undefined} />)).toBe("<p>No room here yet.</p>");
    expect(renderToStaticMarkup(<RoomSections sections={SECTIONS} current={undefined} failed={<b>failed</b>} />)).toBe(
      "<b>failed</b>",
    );
  });
});

describe("RoomsNav", () => {
  it("is a navigation named as it is told, reached by code and never by the tab key", () => {
    const html = renderToStaticMarkup(<RoomsNav label="Rooms">in it</RoomsNav>);
    expect(html).toMatch(/^<nav /);
    expect(html).toContain('aria-label="Rooms"');
    expect(html).toContain('tabindex="-1"');
    // The list scrolls, and the navigation has its own look: each class its stylesheet's.
    expect(html).toMatch(/class="_scrolls_\w+ _nav_\w+"/);
    expect(html).toContain(">in it</nav>");
  });
});
