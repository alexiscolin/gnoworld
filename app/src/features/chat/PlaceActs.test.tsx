// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { all, mount } from "../../../tests/mount.tsx";
import { ActsRoomContext, actsShown, PlaceActs, placeActs } from "./PlaceActs.tsx";

const none = () => undefined;
const acts = placeActs({ label: "Search messages", icon: "search-messages", onSelect: none }, none);
const grid = { size: 32, gap: 8 };

describe("the place's buttons in the chat's header", () => {
  it("holds all four where the room does, none where it holds fewer than one with the menu", () => {
    expect(actsShown({ room: 4 * 32 + 3 * 8, ...grid }, 4)).toBe(4);
    expect(actsShown({ room: 3 * 32 + 2 * 8, ...grid }, 4)).toBe(2);
    expect(actsShown({ room: 0, ...grid }, 4)).toBe(0);
  });

  it("sends the video call and the events first, then who is here, then the search, into More", () => {
    const labels = (room: number) =>
      all(
        mount(
          <ActsRoomContext value={{ room, ...grid }}>
            <PlaceActs acts={acts} />
          </ActsRoomContext>,
        ),
        "button:not([role='menuitem'])",
      ).map((each) => each.getAttribute("aria-label"));
    expect(labels(1000)).toEqual(["Search messages", "Who's here", "Events, coming soon", "Video call, coming soon"]);
    expect(labels(3 * 32 + 2 * 8)).toEqual(["Search messages", "Who's here", "More"]);
    expect(labels(2 * 32 + 8)).toEqual(["Search messages", "More"]);
    expect(labels(32)).toEqual(["More"]);
  });

  it("leaves the focus on More as the search is chosen from its menu, where the search's panel gives it back", () => {
    // jsdom has no popover API to hide the menu with.
    Object.assign(HTMLElement.prototype, { hidePopover: () => undefined });
    const box = mount(
      <ActsRoomContext value={{ room: 0, ...grid }}>
        <PlaceActs acts={acts} />
      </ActsRoomContext>,
    );
    const item = Array.from(all(box, "[role='menuitem']")).find((each) => each.textContent.includes("Search messages"));
    item?.click();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("More");
  });
});
