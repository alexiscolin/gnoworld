// @vitest-environment jsdom
import type { RoomList } from "@gnoworld/schemas";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { all, mount as draw, one } from "../../../tests/mount.tsx";
import { rememberRealms } from "../../lib/roomRealms.ts";
import { RoomChips } from "./RoomChips.tsx";

// The reader's session, which the store holds: signed in or out as each test says.
const session = vi.hoisted((): { kind: "out" | "in" } => ({ kind: "out" }));
vi.mock("../../storeContext.tsx", () => ({
  useApp: (select: (state: unknown) => unknown) => select({ login: { session } }),
}));

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
  it("is a navigation of one link to each room, the room in view first then the list's order, it marked", () => {
    const nav = one(
      mount(<RoomChips sections={SECTIONS} current="#bubble/games" />),
      'nav[aria-label="Room shortcuts"]',
    );
    const links = all(nav, "a");
    expect(links.map((link) => link.textContent)).toEqual(["#games", "#bubble", "#lounge"]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/w/bubble?room=games",
      "/w/bubble",
      "/w/bubble?room=lounge",
    ]);
    expect(links.map((link) => link.getAttribute("aria-current"))).toEqual(["true", null, null]);
  });

  it("names two realms alike apart, the later version by its version", () => {
    const rooms = [
      { room: "#nym-x-golf-0123456789/golf-aaaaaaaaaa", realm: "gno.land/r/nym/golf" },
      { room: "#nym-x-golf-0123456789/golf-bbbbbbbbbb", realm: "gno.land/r/nym/golf/v2" },
      { room: "#nym-x-golf-0123456789/other-cccccccccc", realm: "gno.land/r/nym/other" },
    ].map((each) => ({ ...each, type: "open" as const }));
    const sections: RoomList["sections"] = [{ name: null, rooms }];
    rememberRealms(sections);
    const links = all(mount(<RoomChips sections={sections} current={rooms[0]?.room} />), "a");
    expect(links.map((link) => link.textContent)).toEqual(["#golf", "#golf v2", "#other"]);
  });

  it("says what a room holds unseen, in words for assistive technology and as a count", () => {
    const box = mount(<RoomChips sections={SECTIONS} current="#bubble" badges={{ "#bubble/games": 3 }} />);
    const games = all(box, "li").find((item) => item.textContent.includes("#games"));
    expect(games?.textContent).toContain("3");
    expect(games?.querySelector("a")?.getAttribute("aria-label")).toBe("#games, 3 unread");
  });

  it("ends a crowded row with a +N chip that says it opens a dialog", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(100);
    const wide = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(60);
    try {
      const more = one(mount(<RoomChips sections={SECTIONS} current="#bubble" />), "[data-more] button");
      expect(more.getAttribute("aria-haspopup")).toBe("dialog");
    } finally {
      width.mockRestore();
      wide.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("draws nothing for no room", () => {
    expect(
      mount(<RoomChips sections={[{ name: null, rooms: [] }]} current={undefined} />).querySelector("nav"),
    ).toBeNull();
  });

  // D13935: a "+" at the row's end, the full chat's own dialog, for an account on the Earth.
  const EARTH: RoomList["sections"] = [
    {
      name: null,
      rooms: [
        { room: "#earth", type: "open" as const },
        { room: "#earth/games", type: "open" as const },
      ],
    },
  ];
  const plus = (sections: RoomList["sections"]) =>
    all(mount(<RoomChips sections={sections} current="#earth" />), "li")
      .at(-1)
      ?.querySelector('button[aria-label="New room"]') ?? null;

  it("ends with a New room button for an account on the Earth, and for no guest or other world", () => {
    session.kind = "in";
    expect(plus(EARTH)).not.toBeNull();
    expect(plus(SECTIONS)).toBeNull();
    session.kind = "out";
    expect(plus(EARTH)).toBeNull();
  });

  it("opens the same New room dialog the full chat's button opens", () => {
    session.kind = "in";
    const box = mount(<RoomChips sections={EARTH} current="#earth" />);
    one(box, 'button[aria-label="New room"]').click();
    expect(one(box, "dialog").textContent).toContain("Make the room");
    session.kind = "out";
  });
});
