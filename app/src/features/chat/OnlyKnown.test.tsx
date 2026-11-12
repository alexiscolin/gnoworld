// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { button, click, mount } from "../../../tests/mount.tsx";
import { OnlyKnown } from "./OnlyKnown.tsx";

const dms = { onlyKnown: false, onOnlyKnown: () => undefined };

describe("the choice to hear from those the account wrote to alone", () => {
  // Both sides are named, as two chips (the ping-pong's batch, f7a31433), so the one in force shows pressed.
  it("names both sides, the one in force pressed, and changes the choice", () => {
    const onOnlyKnown = vi.fn();
    const box = mount(<OnlyKnown {...dms} onlyKnown onOnlyKnown={onOnlyKnown} />);
    expect(button(box, "People I wrote to")?.getAttribute("aria-pressed")).toBe("true");
    expect(button(box, "Anyone")?.getAttribute("aria-pressed")).toBe("false");
    click(button(box, "Anyone"));
    expect(onOnlyKnown).toHaveBeenCalledWith(false);
    click(button(box, "People I wrote to"));
    expect(onOnlyKnown).toHaveBeenLastCalledWith(true);
  });
});
