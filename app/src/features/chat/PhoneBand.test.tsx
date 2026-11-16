// @vitest-environment jsdom
import { EARTH } from "@gnoworld/core";
import { describe, expect, it, vi } from "vitest";
import { all, button, click, mount, one, settled } from "../../../tests/mount.tsx";
import type { ChatPlace } from "./ChatScreen.tsx";
import { PhoneBand } from "./PhoneBand.tsx";
import { PlacePageProvider } from "./placePage.ts";

// The engine, and its gate on gpuCanDraw (MiniSpace.tsx, which makes no context on a device that cannot draw), are MiniSpace's own: here it is a
// marker that says which world it was given.
vi.mock("../../MiniSpace.tsx", () => ({ default: ({ world }: { world: string }) => <canvas data-world={world} /> }));

const place = (more: Partial<ChatPlace> = {}): ChatPlace => ({
  slug: "x",
  name: "Golf",
  description: "A world for golfers.\nSecond line, left to the Info sheet.",
  kicker: "Onyx · World",
  home: "/",
  worlds: [],
  universe: { id: "onyx", isDefault: false, gnoweb: undefined },
  earth: true,
  ...more,
});
const draw = (props: Partial<Parameters<typeof PhoneBand>[0]> = {}, page = false) =>
  mount(
    <PlacePageProvider value={page ? <p>plate</p> : null}>
      <PhoneBand place={place()} talking={3} present={7} folded={false} onPage={() => undefined} {...props} />
    </PlacePageProvider>,
  );

describe("a phone's place band", () => {
  it("says the place's kind, its name and the first line of what it says of itself, no more", () => {
    const text = one(draw(), "section").textContent;
    expect(text).toContain("Onyx · World");
    expect(text).toContain("Golf");
    expect(text).toContain("A world for golfers.");
    expect(text).not.toContain("Second line");
  });

  it("says how many talk now and how many are here, only what it is told", () => {
    expect(one(draw(), "section").textContent).toMatch(/3 talking now/);
    expect(one(draw(), "section").textContent).toMatch(/7 here now/);
    const quiet = one(draw({ talking: undefined, present: undefined }), "section").textContent;
    expect(quiet).not.toMatch(/talking now|here now/);
  });

  it("is a region named by the place, folded by its flag", () => {
    expect(one(draw(), "section").getAttribute("aria-label")).toBe("Golf");
    expect(one(draw(), "section").hasAttribute("data-folded")).toBe(false);
    expect(one(draw({ folded: true }), "section").hasAttribute("data-folded")).toBe(true);
  });

  it("draws the planet of the place's world lazily", async () => {
    const box = draw();
    await settled(() => all(box, "canvas").length === 1);
    expect(one(box, "canvas").getAttribute("data-world")).toBe(EARTH);
  });

  it("shows the planet's still beside the engine's, for a device that cannot draw", () => {
    expect(one(draw(), "section").querySelector("[data-size]")).not.toBeNull();
  });

  it("opens the place's page from Its page, which a place with no page does not draw", () => {
    const onPage = vi.fn();
    click(button(draw({ onPage }, true), "Its page"));
    expect(onPage).toHaveBeenCalledTimes(1);
    expect(button(draw({}, false), "Its page")).toBeUndefined();
  });
});
