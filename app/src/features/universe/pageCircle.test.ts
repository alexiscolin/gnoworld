// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { circleOf, plateOf } from "./pageCircle.ts";

afterEach(() => {
  document.body.replaceChildren();
});

// A plate as a page draws it, with its own fill unless `fill` is false (under 1280 px it draws none), and `box` its box.
function plateWith(box: DOMRect, fill = true): HTMLElement {
  const plate = document.createElement("section");
  plate.dataset["look"] = "plate";
  plate.style.setProperty("--plate-fade", "64px");
  const shade = document.createElement("span");
  shade.dataset["fill"] = "";
  if (!fill) shade.style.display = "none";
  const content = document.createElement("div");
  content.dataset["content"] = "";
  content.style.paddingInlineEnd = "88px";
  plate.append(shade, content);
  plate.getBoundingClientRect = () => box;
  document.body.append(plate);
  return plate;
}

// The scene's fill fades where the plate's own does, --plate-fade short of its right edge, past the content's air (D14002): never at the
// content's end padding, which the air widens.
it("tells the scene the plate's fade starts --plate-fade short of its right edge, whatever the content's padding", () => {
  plateWith(DOMRect.fromRect({ x: 24, y: 98, width: 832, height: 900 }));
  expect(plateOf()?.fade).toBe(24 + 832 - 64);
});

// Under 1280 px the plate draws no fill of its own, so no fade: the scene's lights keep off its box alone.
it("tells the scene no fade where the plate draws no fill of its own", () => {
  plateWith(DOMRect.fromRect({ x: 16, y: 600, width: 868, height: 900 }), false);
  expect(plateOf()?.fade).toBe(16 + 868);
});

it("tells none where the page has no plate", () => {
  expect(plateOf()).toBeUndefined();
});

// At 1280 px the plate (632 with its air) and the dock (380) leave 220 px between them, enough for the Map's system (D14002).
it("keeps the room beside the plate at 1280 px, its air counted", () => {
  plateWith(DOMRect.fromRect({ x: 24, y: 98, width: 632, height: 900 }));
  const dock = document.createElement("aside");
  dock.dataset["dock"] = "";
  dock.getBoundingClientRect = () => DOMRect.fromRect({ x: 1280 - 24 - 380, y: 98, width: 380, height: 900 });
  const globe = document.createElement("div");
  globe.getBoundingClientRect = () => DOMRect.fromRect({ x: 700, y: 200, width: 400, height: 400 });
  document.body.append(dock, globe);
  expect(circleOf(globe)?.free).toEqual({ left: 656, right: 876 });
});
