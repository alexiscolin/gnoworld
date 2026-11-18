// @vitest-environment jsdom
import type { RoomList } from "@gnoworld/schemas";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drawer } from "../../../tests/mount.tsx";
import type { useAppStore } from "../../storeContext.tsx";
import { usePanelLink } from "./usePanelLink.ts";

// The page's link, a stand-in that writes down what it is told, in order.
const told = vi.hoisted(() => [] as string[]);
vi.mock("./connection/pageLink.ts", () => ({
  takeLink: () => ({
    follow: (rooms: readonly string[]) => told.push(`follow ${rooms.join(",")}`),
    show: (room: string | undefined) => told.push(`show ${String(room)}`),
  }),
  dropLink: () => undefined,
}));

const store = {} as ReturnType<typeof useAppStore>;
const sections: RoomList["sections"] = [
  {
    name: null,
    rooms: [
      { room: "#bubble", type: "open" },
      { room: "#bubble/games", type: "open" },
    ],
  },
];

// A room's lines read the room in view to the link in their own effects (roomActs' read): they must find it told already.
function Lines({ room }: { room: string | undefined }) {
  useEffect(() => {
    told.push(`lines read ${String(room)}`);
  }, [room]);
  return null;
}
function Panel({ room }: { room: string | undefined }) {
  usePanelLink(store, sections, room);
  return <Lines room={room} />;
}

beforeEach(() => {
  told.length = 0;
});

describe("the panel's link", () => {
  it("is told the rooms, then the room in view, as it is taken", () => {
    drawer()(<Panel room="#bubble" />);
    expect(told.slice(0, 2)).toEqual(["follow #bubble,#bubble/games", "show #bubble"]);
  });

  it("is told a new room in view before the room's lines read it", () => {
    const draw = drawer();
    draw(<Panel room="#bubble" />);
    told.length = 0;
    draw(<Panel room="#bubble/games" />);
    expect(told.indexOf("show #bubble/games")).toBeGreaterThanOrEqual(0);
    expect(told.indexOf("show #bubble/games")).toBeLessThan(told.indexOf("lines read #bubble/games"));
  });
});
