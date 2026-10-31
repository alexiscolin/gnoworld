// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { all, mount, nth, one } from "../../../tests/mount.tsx";
import { PlaceInfo } from "./PlaceInfo.tsx";

// 5q: the full-screen chat's info panel (frame 23.58.01, right): the place's kicker and name, what it says of itself, then
// Here now. The pins stay where the frames put them, above the conversation (PinBar). Never the video's sample figures (184
// talking, 31 countries): only what the page holds, how many are talking here now once it knows.
describe("the info panel", () => {
  it("is a complementary region named by the place, its name a heading and its words a paragraph", () => {
    const box = mount(
      <PlaceInfo kicker="Home · The general chat" name="Earth" description="Where people speak from." />,
    );
    const panel = one(box, "aside");
    expect(panel.getAttribute("aria-label")).toBe("Earth");
    expect(one(panel, "h2").textContent).toBe("Earth");
    expect(all(panel, "p").map((p) => p.textContent)).toEqual(["Home · The general chat", "Where people speak from."]);
  });

  it("holds Here now as a section of its own, named by its heading, with what it is given inside", () => {
    const box = mount(<PlaceInfo kicker="Home" name="Earth" description="d" here={<ul data-slot="people" />} />);
    const sections = all(box, "section");
    expect(sections.map((section) => one(section, "h3").textContent)).toEqual(["Here now"]);
    expect(all(nth(sections, 0), "[data-slot='people']")).toHaveLength(1);
  });

  it("leaves out Here now when it is given nothing, and never fills the panel with sample figures", () => {
    const box = mount(<PlaceInfo kicker="Home" name="Earth" description="d" />);
    expect(all(box, "section")).toHaveLength(0);
    expect(one(box, "aside").textContent).not.toMatch(/\d{3}|talking|countries/i);
  });

  it("shows how many are talking here now between two rules, when it is told, a figure a screen reader reads whole", () => {
    const box = mount(<PlaceInfo kicker="Home" name="Earth" description="d" talking={12} />);
    const figure = one(box, "[data-value]");
    expect(figure.getAttribute("data-value")).toBe("12");
    expect(box.textContent).toContain("Talking now");
    expect(box.textContent).toContain("12");
  });

  it("shows no figure while it is not told, not even a zero", () => {
    const box = mount(<PlaceInfo kicker="Home" name="Earth" description="d" />);
    expect(all(box, "[data-value]")).toHaveLength(0);
    expect(
      all(mount(<PlaceInfo kicker="Home" name="Earth" description="d" talking={0} />), "[data-value]"),
    ).toHaveLength(1);
  });

  it("can be given the focus by code, for Who's here to move the reader to the list, and never by the Tab key", () => {
    const box = mount(<PlaceInfo kicker="Home" name="Earth" description="d" />);
    expect(one(box, "aside").getAttribute("tabindex")).toBe("-1");
  });
});
