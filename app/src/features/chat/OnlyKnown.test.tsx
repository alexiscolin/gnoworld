// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { button, click, mount } from "../../../tests/mount.tsx";
import { OnlyKnown } from "./OnlyKnown.tsx";

const dms = { onlyKnown: false, onOnlyKnown: () => undefined };

describe("the choice to hear from those the account wrote to alone", () => {
  it("is a pressed button that says so, and changes the choice", () => {
    const onOnlyKnown = vi.fn();
    const box = mount(<OnlyKnown {...dms} onlyKnown onOnlyKnown={onOnlyKnown} />);
    expect(button(box, "Only people I wrote to")?.getAttribute("aria-pressed")).toBe("true");
    click(button(box, "Only people I wrote to"));
    expect(onOnlyKnown).toHaveBeenCalledWith(false);
  });
});
