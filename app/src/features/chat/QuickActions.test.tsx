// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { all, button, click, mount, one } from "../../../tests/mount.tsx";
import { QuickActions } from "./QuickActions.tsx";

// 5q: the row of quick actions over the composer (frame 23.58.01, bottom). Only what works today: Who's here, and the calendar (slice 8).
// The video's Quiz and Poll wait for their features.
describe("the quick actions", () => {
  it("is a toolbar named Quick actions holding Who's here, which acts", () => {
    const onWhoIsHere = vi.fn();
    const box = mount(<QuickActions onWhoIsHere={onWhoIsHere} world="bubble" />);
    expect(one(box, '[role="toolbar"]').getAttribute("aria-label")).toBe("Quick actions");
    click(button(box, "Who's here"));
    expect(onWhoIsHere).toHaveBeenCalledTimes(1);
  });

  it("has the calendar, and no Quiz or Poll button before there is something behind them", () => {
    const box = mount(<QuickActions onWhoIsHere={() => undefined} world="bubble" />);
    expect(all(box, "button").map((each) => each.textContent)).toEqual(["Who's here", "Events"]);
  });
});
