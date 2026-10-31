// @vitest-environment jsdom
import type { RoomList } from "@gnoworld/schemas";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { all, mount as draw, one } from "../../../tests/mount.tsx";
import { RoomChips } from "./RoomChips.tsx";

// 5q2 (frame f0026): the dock's rooms as a row of chips under the header, each a link to its room, the one in view marked.
const SECTIONS: RoomList["sections"] = [
  {
    name: null,
    rooms: [
      { room: "#bubble", type: "open" as const },
      { room: "#bubble/games", type: "open" as const },
    ],
  },
  { name: "Voice", rooms: [{ room: "#bubble/lounge", type: "open" as const }] },
  { name: "Empty", rooms: [] },
];
const mount = (element: React.ReactElement) => draw(<MemoryRouter>{element}</MemoryRouter>);

describe("RoomChips", () => {
  it("is a navigation of one link to each room, in the sections' order, the room in view marked", () => {
    const nav = one(
      mount(<RoomChips sections={SECTIONS} current="#bubble/games" />),
      'nav[aria-label="Room shortcuts"]',
    );
    const links = all(nav, "a");
    expect(links.map((link) => link.textContent)).toEqual(["#bubble", "#games", "#lounge"]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/w/bubble",
      "/w/bubble?room=games",
      "/w/bubble?room=lounge",
    ]);
    expect(links.map((link) => link.getAttribute("aria-current"))).toEqual([null, "true", null]);
  });

  it("says what a room holds unseen, in words for assistive technology and as a count", () => {
    const box = mount(<RoomChips sections={SECTIONS} current="#bubble" badges={{ "#bubble/games": 3 }} />);
    const games = all(box, "li").find((item) => item.textContent.includes("#games"));
    expect(games?.textContent).toContain("3");
    expect(games?.querySelector(".visually-hidden")?.textContent).toBe("3 unread");
    expect(all(box, ".visually-hidden")).toHaveLength(1);
  });

  it("draws nothing for no room", () => {
    expect(
      mount(<RoomChips sections={[{ name: null, rooms: [] }]} current={undefined} />).querySelector("nav"),
    ).toBeNull();
  });
});
