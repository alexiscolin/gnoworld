// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount, one } from "../../../tests/mount.tsx";
import { NoticeModes } from "./NoticeModes.tsx";
import { hasNote, RoomMenu, visitorMenu } from "./RoomMenu.tsx";

// 5q: what the room's name opens (the video's chevron): what once stood above the lines and in the rooms' column.

describe("the room's menu", () => {
  it("says the room's note under the id the composer points at (a direct message's, 4e's U6)", () => {
    const box = mount(<RoomMenu note="Not encrypted." noteId="n1" />);
    expect(one(box, "p#n1").textContent).toBe("Not encrypted.");
  });

  it("shows a note as text, never as markup", () => {
    const box = mount(<RoomMenu note="<b>bold</b>" />);
    expect(box.querySelector("b")).toBeNull();
    expect(box.textContent).toBe("<b>bold</b>");
  });

  it("draws what an account adds below the note: its notification modes", () => {
    const box = mount(
      <RoomMenu note="Bubbles here">
        <NoticeModes room="#bubble/games" mode="mentions" onMode={() => undefined} />
      </RoomMenu>,
    );
    expect(one(box, '[role="group"]').getAttribute("aria-label")).toBe("Notifications for #games");
    const text = box.textContent;
    expect(text.indexOf("Bubbles here")).toBeLessThan(text.indexOf("Notify me about"));
  });

  it("says whether the room says anything of itself: a visitor's menu with no note is not offered", () => {
    expect(hasNote(undefined)).toBe(false);
    expect(hasNote("")).toBe(false);
    expect(hasNote("Games")).toBe(true);
    expect(visitorMenu(undefined)).toBeUndefined();
    expect(visitorMenu("Games")?.label).toBe("Room");
  });
});
