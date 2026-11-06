// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { all, mount, one } from "../../../tests/mount.tsx";
import type { FlightSaid } from "../../scene/flight/flights.ts";
import { FlightPanel } from "./FlightPanel.tsx";

// The flight panel (ADR-0002 §1, "Flight panel"; frames 18, 36, 88, 89, 101, 128, 142): what the flight is doing, its target and its
// instruments, and a bar for how far along it is. It repeats the scene for the eye alone: the page it flies to says where the reader is.
const GOVDAO: FlightSaid = {
  target: "GovDAO",
  phase: "transit",
  distance: 6.2913,
  speed: 1158.4,
  eta: 1.66,
  along: 0.32,
};

const values = (box: HTMLElement) => all(box, "dd").map((value) => value.textContent);

describe("the flight panel", () => {
  it("shows nothing when no flight is under way", () => {
    const box = mount(<FlightPanel flight={undefined} />);
    expect(box.childElementCount).toBe(0);
  });

  it("names its target and reads its instruments as frame 18 does", () => {
    const box = mount(<FlightPanel flight={GOVDAO} />);
    expect(all(box, "dt").map((label) => label.textContent)).toEqual(["Target", "Distance", "Speed", "ETA"]);
    expect(values(box)).toEqual(["GovDAO", "6.29 AU", "1,158 km/s", "1.7 s"]);
  });

  it.each([
    ["leaving", "Course plotted · leaving orbit"],
    ["transit", "In transit"],
    ["entering", "Entering orbit"],
  ] as const)("says it is %s as the frames do", (phase, words) => {
    const box = mount(<FlightPanel flight={{ ...GOVDAO, phase }} />);
    expect(one(box, "[data-phase]").textContent).toBe(words);
  });

  it("fills its bar as far as the flight has gone", () => {
    const box = mount(<FlightPanel flight={GOVDAO} />);
    expect(one(box, "[data-along]").style.getPropertyValue("--_along")).toBe("0.32");
  });

  it("reads 0.00 AU and the last tenth of a second as it enters orbit, as frame 89 does", () => {
    const box = mount(
      <FlightPanel flight={{ ...GOVDAO, phase: "entering", distance: 0.0013, speed: 29.2, eta: 0.08 }} />,
    );
    expect(values(box).slice(1)).toEqual(["0.00 AU", "29 km/s", "0.1 s"]);
  });

  it("is for the eye alone: readers hear the page it lands on", () => {
    const box = mount(<FlightPanel flight={GOVDAO} />);
    expect(one(box, "[data-flight]").getAttribute("aria-hidden")).toBe("true");
  });

  it("writes a name as text, whatever it holds: markup stays words", () => {
    const hostile = '<img src=x onerror="alert(1)">';
    const box = mount(<FlightPanel flight={{ ...GOVDAO, target: hostile }} />);
    expect(values(box)[0]).toBe(hostile);
    expect(all(box, "img")).toEqual([]);
  });

  it.each([
    [1.4, "1"],
    [-0.2, "0"],
    [Number.NaN, "0"],
  ])("keeps its bar inside its track for a progress of %f", (along, written) => {
    const box = mount(<FlightPanel flight={{ ...GOVDAO, along }} />);
    expect(one(box, "[data-along]").style.getPropertyValue("--_along")).toBe(written);
  });
});
