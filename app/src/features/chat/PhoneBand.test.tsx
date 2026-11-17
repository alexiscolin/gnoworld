// @vitest-environment jsdom
import { EARTH } from "@gnoworld/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { all, button, click, mount, one, settled } from "../../../tests/mount.tsx";
import type { ChatPlace } from "./ChatScreen.tsx";
import { PhoneBand } from "./PhoneBand.tsx";

// The engine, and its gate on gpuCanDraw (MiniSpace.tsx, which makes no context on a device that cannot draw), are MiniSpace's own: here it is a
// marker that says which world it was given.
vi.mock("../../MiniSpace.tsx", () => ({ default: ({ world }: { world: string }) => <canvas data-world={world} /> }));

// The gate (planetGate.ts, tested on its own): here its answer is set by each test, and the page is idle and the band in view at once.
const gate = vi.hoisted(() => ({ allows: true }));
vi.mock("../../planetGate.ts", () => ({
  whenIdleAndSeen: () => Promise.resolve(),
  askPlanet: () => (gate.allows ? Promise.resolve() : undefined),
}));
beforeEach(() => {
  gate.allows = true;
});

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
const draw = (props: Partial<Parameters<typeof PhoneBand>[0]> = {}) =>
  mount(
    <PhoneBand
      place={place()}
      title="#games"
      talking={3}
      present={7}
      folded={false}
      onInfo={() => undefined}
      {...props}
    >
      <nav aria-label="Rooms row">row B</nav>
    </PhoneBand>,
  );

describe("a phone's place band", () => {
  it("says the place's kind, its name and its counts, and leaves the description to the Info sheet", () => {
    const text = one(draw(), "section").textContent;
    expect(text).toContain("Onyx · World");
    expect(text).toContain("Golf");
    expect(text).not.toContain("A world for golfers.");
  });

  it("says how many talk now and how many are here, a warm dot only while someone talks", () => {
    const talking = one(draw(), "section");
    expect(talking.textContent).toContain("3 talking now · 7 here");
    expect(talking.querySelector(".dot")).not.toBeNull();
    const quiet = one(draw({ talking: 0 }), "section");
    expect(quiet.textContent).toContain("Quiet · 7 here");
    expect(quiet.querySelector(".dot")).toBeNull();
    expect(one(draw({ talking: undefined, present: undefined }), "section").textContent).not.toMatch(
      /talking|here|Quiet/,
    );
  });

  it("is a region named by the place, the world's own plate, folded by its flag", () => {
    const section = one(draw(), "section");
    expect(section.getAttribute("aria-label")).toBe("Golf");
    expect(section.hasAttribute("data-world")).toBe(true);
    expect(section.hasAttribute("data-folded")).toBe(false);
    expect(one(draw({ folded: true }), "section").hasAttribute("data-folded")).toBe(true);
  });

  it("is tinted by the Earth's colour on the Earth alone", () => {
    expect(one(draw(), "section").hasAttribute("data-earth")).toBe(true);
    expect(one(draw({ place: place({ earth: undefined }) }), "section").hasAttribute("data-earth")).toBe(false);
  });

  it("has the room as the page's one heading, and the place's name once more for the eye, by the folded row", () => {
    expect(one(draw(), "h1").textContent).toBe("#games");
  });

  it("opens Info from one button, named for the place, whose description is the counts", () => {
    const onInfo = vi.fn();
    const box = draw({ onInfo });
    const press = button(box, "Golf: info and its page");
    click(press);
    expect(onInfo).toHaveBeenCalledTimes(1);
    const meta = document.getElementById(press?.getAttribute("aria-describedby") ?? "");
    expect(meta?.textContent).toContain("3 talking now");
    expect(button(box, "Its page")).toBeUndefined();
  });

  it("draws the planet of the place's world lazily, over its still, which stays where the engine does not draw", async () => {
    const box = draw();
    expect(one(box, "section").querySelector("[data-size]")).not.toBeNull();
    await settled(() => all(box, "canvas").length === 1);
    expect(one(box, "canvas").getAttribute("data-world")).toBe(EARTH);
  });

  it("draws no engine, only the still, where the gate says never (save-data, 2g, a weak GPU)", async () => {
    gate.allows = false;
    const box = draw();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(all(box, "canvas")).toHaveLength(0);
    expect(one(box, "section").querySelector("[data-size]")).not.toBeNull();
  });

  it("keeps a mark (a direct message's trust word) in view, and holds the rooms' row last", () => {
    const box = draw({ mark: <span data-mark="">Not encrypted</span> });
    expect(one(box, "[data-mark]").textContent).toBe("Not encrypted");
    expect(one(box, "section").lastElementChild?.textContent).toBe("row B");
  });
});
