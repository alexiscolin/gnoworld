// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { all, button, click, mount, one } from "../../../tests/mount.tsx";
import { QuickActions } from "./QuickActions.tsx";

// 5q: the row of quick actions over the composer (frame 23.58.01, bottom); 8d: a place's own row, as the video draws each, what a
// later slice brings greyed.
describe("the quick actions", () => {
  it("is a toolbar named Quick actions holding Who's here, which acts", () => {
    const onWhoIsHere = vi.fn();
    const box = mount(<QuickActions onWhoIsHere={onWhoIsHere} world="bubble" pills="hub" writes={false} />);
    expect(one(box, '[role="toolbar"]').getAttribute("aria-label")).toBe("Quick actions");
    click(button(box, "Who's here"));
    expect(onWhoIsHere).toHaveBeenCalledTimes(1);
  });

  it("draws a world's row with Play and Catch up greyed, and no Poll for a reader who does not write", () => {
    const box = mount(<QuickActions onWhoIsHere={() => undefined} world="bubble" pills="hub" writes={false} />);
    expect(all(box, "button").map((each) => each.textContent)).toEqual(["Who's here", "Play", "Events", "Catch up"]);
    expect(all(box, '[aria-disabled="true"]').map((each) => each.getAttribute("aria-label"))).toEqual([
      "Play, coming soon",
      "Catch up, coming soon",
    ]);
  });
});
